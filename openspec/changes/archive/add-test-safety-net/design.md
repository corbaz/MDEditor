# Design: add-test-safety-net

Technical design for adding a Vitest characterization-test safety net over the pure
helpers in `src/App.tsx`, before the planned `src/lib/` extraction. This document fixes
the HOW at the architectural level: where Vitest config lives, how test files get
type-checked without breaking the production build, the test environment strategy, how
tests tolerate the pdfjs side-effect, and where test files live.

Scope of this design matches the proposal: additive, zero-behavior-change. No `src/lib/`
extraction, no behavior refactor.

## Quick path

1. Inline a `test` block into `vite.config.ts` (no separate `vitest.config.ts`).
2. Keep `tsconfig.app.json` as the single include; add `vitest/globals` to its `types`.
3. Default `environment: 'node'`; override per-file to `jsdom` only for the `Blob`-using test.
4. Tolerate the pdfjs `workerSrc` side-effect by importing from `App.tsx` as-is (it does
   not throw in node/jsdom); document that future extraction to `src/lib/` removes it.
5. Co-locate tests under `src/__tests__/<concern>.test.ts`.

## Architecture context

This change adds a **test layer** alongside the existing single-module renderer. There is
no new runtime architecture — the shipped Electron app is untouched. The only structural
production edit is hoisting `normalizeFileName` to module scope (covered by the proposal,
verified by its own test).

```
                 +------------------------------+
  dev-only  -->  | vite.config.ts  (test block) |  inherits Prism define + ?url transform
                 +---------------+--------------+
                                 | drives
                                 v
   src/__tests__/*.test.ts  ---- import ---->  src/App.tsx (exported pure helpers)
        |                                            |
        | node env (default)                         | top-level side-effect:
        | jsdom env (getByteSize only)               | GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        v                                            v
   Vitest runner (v8 coverage)              tolerated, no worker spawned in test runtime
```

Boundary note: there is **no IPC / main<->renderer concern** in this change. Every targeted
helper is a pure renderer-side function. The Electron `main.cjs` / `preload.cjs` boundary is
not imported by any test and is out of scope.

## Decisions

### D1 — Vitest config location: inline into `vite.config.ts`

**Decision**: Add a `test` block inside the existing `defineConfig` in `vite.config.ts`.
Do NOT create a separate `vitest.config.ts`.

**Why**: `vite.config.ts` already carries two settings the tests depend on transitively:
- `define: { Prism: 'globalThis.Prism' }` — the Prism runtime workaround. A separate
  Vitest config would not inherit it and would risk re-introducing the crash class fixed in
  commit `8200225`.
- The `?url` import transform (`pdfjs-dist/.../pdf.worker.min.mjs?url`) used at `App.tsx:9`.
  Importing `App.tsx` requires this transform to resolve; inlining guarantees the same
  Vite pipeline handles both `vite build` and `vitest`.

A separate config would either duplicate these settings (drift risk) or use `mergeConfig`
(extra indirection for a one-block change). Inlining is the lowest-surface, lowest-drift choice.

**Exact `test` block** (apply-phase reference — confirm Vitest major vs vite 8 first; see R1):

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    Prism: 'globalThis.Prism',
  },
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/App.tsx'],
      reporter: ['text', 'html'],
    },
  },
})
```

Notes:
- `coverage.include: ['src/App.tsx']` scopes the report to the module under
  characterization, so the 2564-line component does not drown the signal with untested UI.
- The `/// <reference types="vitest/config" />` triple-slash directive lets `tsc -b` type
  the `test` property without changing `tsconfig.node.json` types (which already includes
  `vite.config.ts` via its `include`). This keeps the Vite-config typecheck clean.

### D2 — TypeScript visibility for test files: extend `tsconfig.app.json` types

**Decision**: Add `"vitest/globals"` to the `types` array in `tsconfig.app.json`. Do NOT
create a `tsconfig.test.json`, and do NOT exclude test files from the build tsconfig.

**Why this is safe**: `tsconfig.app.json` already uses `"include": ["src"]`, so
`src/__tests__/*.test.ts` are ALREADY in the build's type-check graph. They are not
currently excluded — the proposal's worry ("excludes test files") is inverted by the actual
config: the risk is the opposite, that `describe`/`it`/`expect` globals are UNDECLARED and
`tsc -b` fails on them. Adding `vitest/globals` to `types` declares those globals.

**The clean-build guarantee**: `vitest/globals` is a pure ambient type declaration
(`describe`, `it`, `expect`, `vi`, ...). It adds NO runtime code and NO new emit. Because
`noEmit: true` and the production bundle is produced by Vite (not tsc), the only effect is
that `tsc -b` recognizes the test globals. Production output is byte-identical.

```jsonc
// tsconfig.app.json — change is one array entry
"types": ["vite/client", "vitest/globals"],
```

**Alternatives rejected**:

| Option | Verdict | Reason |
|--------|---------|--------|
| `tsconfig.test.json` (separate project ref) | Rejected | Adds a third project to the `tsc -b` graph and a second `tsBuildInfoFile`; test files are already under `src`, so a separate include is redundant ceremony for one `types` entry. |
| Exclude `*.test.ts` from build tsconfig, rely on Vitest transform | Rejected | Vitest's esbuild transform does NOT type-check. Tests would ship type errors silently and `tsc -b` would no longer guard them. Loses the type-safety the suite is supposed to add. |
| Add `vitest/globals` to `tsconfig.app.json` types | **Chosen** | One-line, zero-emit, keeps tests inside the existing build graph and clean under `tsc -b`. |

**Apply-time guard**: after the edit, `bun run build` (which runs `tsc -b && vite build`)
MUST still pass. If `noUnusedLocals`/`noUnusedParameters` complain about test scaffolding,
fix the test code — do NOT loosen the production tsconfig.

### D3 — Test environment strategy: node default, jsdom only for `getByteSize`

**Decision**: Default `environment: 'node'`. Apply `// @vitest-environment jsdom` as a
per-file pragma ONLY to the test file that exercises `getByteSize` (which constructs a
`Blob`). All other helpers (markdown, pdf-text grouping, style, format) are pure string/number
logic and run under node.

**Why**: node is the lighter, faster runtime and matches the helpers' actual dependency
surface. Loading jsdom globally would slow every test for one `Blob` consumer.

**Apply-time check (R3)**: Node 20+ and Bun both expose `Blob` as a global. If the test
runtime exposes `Blob`, the jsdom override for `getByteSize` is UNNECESSARY and should be
dropped (keep that file on node too). The apply phase verifies by running the `getByteSize`
test under node first; only add the jsdom pragma if it fails for a missing-`Blob` reason.
This keeps the env footprint minimal and is a runtime fact to confirm, not assume.

### D4 — pdfjs side-effect tolerance: import as-is, document the future fix

**Decision**: Tests import the exported helpers directly from `src/App.tsx`. The top-level
`GlobalWorkerOptions.workerSrc = pdfWorkerUrl` (App.tsx:118) and the `?url` import
(App.tsx:9) execute on module load. We TOLERATE this: it is a string-property assignment, not
a worker spawn. No PDF is parsed at import time, so no worker thread starts in node/jsdom.

**Why tolerate rather than mock/stub**: this change is explicitly characterization-only and
must not alter `App.tsx` structure beyond the agreed exports + one hoist. Introducing a mock
for `GlobalWorkerOptions` would (a) add per-test setup coupling to pdfjs internals and
(b) risk masking a real import error. Tolerating keeps tests honest against the real module.

**Mechanics that make tolerance work**:
- The `?url` import resolves because Vitest runs through the same Vite transform pipeline
  (the reason for D1 inlining). Under node, `pdfWorkerUrl` resolves to a string path.
- `GlobalWorkerOptions.workerSrc = <string>` is a plain assignment; it does not touch the DOM
  or open a worker. Safe in both node and jsdom.

**Apply-time confirmation (R2)**: the apply phase must confirm importing `App.tsx` does not
throw in the test runtime (run any one trivial test first). If the `?url`/pdfjs import does
throw under node, the fallback is a Vitest `server.deps.inline` entry for `pdfjs-dist` or a
narrow `vi.mock`; the apply phase documents whichever is needed.

**Architectural signal (forward-looking)**: this side-effect is the STRONGEST argument that
the targeted helpers should move to `src/lib/` in the next change. Pure functions should not
drag a pdfjs worker-config side-effect into a test's import graph. For THIS change we tolerate;
the NEXT change (extraction) removes the coupling entirely by relocating helpers to
side-effect-free modules. This design records the debt explicitly so the follow-up inherits the
rationale.

### D5 — Test file organization: co-located by concern under `src/__tests__/`

**Decision**: Place test files in `src/__tests__/`, split by behavioral concern:

| File | Helpers covered |
|------|-----------------|
| `src/__tests__/markdown.test.ts` | `normalizeMarkdownForRichEditor`, `escapeRegExp`, `replaceSelectedTextInMarkdown` |
| `src/__tests__/pdf.test.ts` | `getItemFontSize`, `computeHeadingThresholds`, `groupItemsIntoLines`, `buildPageMarkdown`, `decodePdfDataUrl` |
| `src/__tests__/inline-style.test.ts` | `escapeHtml`, `sanitizeStyleValue`, `getStyleDeclaration`, `mergeStyle`, `getStyledMarkdown` |
| `src/__tests__/format.test.ts` | `formatFileSize`, `formatSavedAt`, `normalizeFileName`, `getByteSize` |

**Why co-located by concern**:
- `src/__tests__/` stays inside the `tsconfig.app.json` `"include": ["src"]` glob — no extra
  TS include needed (reinforces D2).
- The `include: ['src/**/*.test.ts']` glob in D1 picks them up automatically.
- Grouping by concern (not one-file-per-helper, not one mega-file) gives reviewers a stable
  map: a markdown behavior change touches `markdown.test.ts` only. It also pre-shapes the
  future `src/lib/` modules (markdown.ts, pdf.ts, inline-style.ts, format.ts), so the next
  extraction is a near-mechanical move.

**Alternatives rejected**:

| Option | Reason rejected |
|--------|-----------------|
| Co-located `App.<area>.test.ts` next to `App.tsx` in `src/` | Clutters the `src/` root; less obvious test/source separation. |
| Single `tests/` dir at repo root | Falls outside `"include": ["src"]`, forcing an extra tsconfig include and breaking D2's clean-build path. |
| One `App.test.ts` mega-file | 16 helpers in one file is a poor reviewer map and a poor template for the upcoming split. |

`getByteSize` lives in `format.test.ts`; if D3's apply-check requires jsdom, the pragma scopes
to that one file only (its other helpers are env-agnostic).

### D6 — devDependency versions (do NOT install here)

**Decision**: add three dev dependencies. Pin Vitest to the major that supports **Vite 8**.

| Package | Constraint strategy | Notes |
|---------|--------------------|-------|
| `vitest` | latest major compatible with `vite@^8` | The proposal wrote `^2`; Vitest 2 predates Vite 8. The apply phase MUST resolve the actual Vitest major whose peer range includes `vite@8` (likely Vitest 3.x) and pin `^<that-major>`. Do NOT hardcode `^2`. |
| `@vitest/coverage-v8` | EXACT same major/minor as the chosen `vitest` | Coverage package version MUST track the Vitest version lockstep, or the runner errors on mismatch. |
| `jsdom` | latest stable (`^25` or current) | Only needed IF D3's apply-check shows `Blob` is absent. If `Blob` is global, jsdom may be dropped entirely. Install it provisionally; remove if unused. |

**Version-strategy rationale**: vite is the pinned anchor (`^8.0.14`). Vitest peer-depends on
Vite, so Vitest's version is DERIVED from vite, not chosen independently. The apply phase
checks `vitest`'s `peerDependencies.vite` range against `8.x` before pinning. This is the one
hard compatibility gate (R1).

## Decision-rationale summary

| # | Decision | Chosen | Key reason |
|---|----------|--------|------------|
| D1 | Vitest config location | Inline into `vite.config.ts` | Inherits Prism `define` + `?url` transform; no drift |
| D2 | TS test visibility | `vitest/globals` in `tsconfig.app.json` types | Tests already under `src` include; zero-emit, clean `tsc -b` |
| D3 | Test environment | node default, jsdom per-file only for `getByteSize` | Lighter/faster; jsdom maybe unneeded if `Blob` is global |
| D4 | pdfjs side-effect | Tolerate (import as-is), document future fix | Honest import; keeps change additive; flags extraction debt |
| D5 | Test file layout | `src/__tests__/<concern>.test.ts` | Stays in include glob; reviewer map; pre-shapes `src/lib/` split |
| D6 | devDeps versions | vitest major tracking vite 8; coverage lockstep; jsdom provisional | Vite is the pinned anchor; Vitest version is derived |

## Checklist (design intent the apply phase must honor)

- [ ] `test` block inlined in `vite.config.ts` with node env, globals, `src/**/*.test.ts`, v8 coverage scoped to `src/App.tsx`.
- [ ] `vitest/globals` added to `tsconfig.app.json` `types`; no `tsconfig.test.json` created.
- [ ] `bun run build` (`tsc -b && vite build`) still passes after the types edit.
- [ ] Tests live in `src/__tests__/{markdown,pdf,inline-style,format}.test.ts`.
- [ ] Importing `App.tsx` does not throw in the chosen test runtime (R2 confirmed).
- [ ] `Blob` availability checked; jsdom pragma applied only if needed (R3 confirmed).
- [ ] Vitest major resolved against `vite@^8` peer range before pinning (R1 confirmed).
- [ ] No IPC / main-process file imported by any test.

## Risks

- **R1 (compatibility gate)**: Vitest 2 predates Vite 8. The apply phase MUST pick the
  Vitest major whose `peerDependencies.vite` includes 8.x (likely 3.x) and keep
  `@vitest/coverage-v8` in lockstep. Pinning `^2` blindly will fail peer resolution.
- **R2 (import side-effect)**: importing `App.tsx` runs the pdfjs `workerSrc` assignment and
  the `?url` import. Expected harmless; if it throws under node, fall back to
  `server.deps.inline` for `pdfjs-dist` or a narrow mock. Confirm before writing all tests.
- **R3 (Blob/jsdom)**: if Node 20+/Bun expose `Blob` globally, the jsdom override is dead
  weight and jsdom can be dropped. Verify by running `getByteSize` under node first.
- **R4 (characterization quirks)**: tests pin CURRENT behavior including quirks. A test that
  encodes a "wrong-looking" output is correct for this change; do not "fix" behavior here.
- **Assumption**: `tsconfig.app.json` `"include": ["src"]` already covers `src/__tests__`.
  Verified true from the current config — no extra include needed.

## Next step

Proceed to `sdd-tasks` once the spec is also ready. Tasks will sequence: exports + hoist,
config/types edits, devDep version resolution (R1), import smoke test (R2/R3), then the four
characterization test files.
