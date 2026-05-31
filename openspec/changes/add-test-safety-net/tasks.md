# Tasks: add-test-safety-net

- **Change**: `add-test-safety-net`
- **Project**: mdeditor
- **Phase**: tasks
- **Status**: ready
- **Delivery strategy**: ask-on-risk
- **Spec**: openspec/changes/add-test-safety-net/spec.md
- **Design**: openspec/changes/add-test-safety-net/design.md

---

## Dependency graph

```
Phase 1 (Setup)
    └── Phase 2 (Config)  [sequential after Phase 1]
            └── Phase 3 (Smoke test)  [sequential after Phase 2]
                    └── Phase 4 (Make testable)  [sequential after Phase 3]
                            └── Phase 5 (Characterization tests)  [Phase 4 tasks parallelisable after all exports are in]
                                    └── Phase 6 (Verify)  [sequential after all Phase 5 tasks pass]
```

Phases 1–4 are strictly sequential (each depends on the previous gate). Within Phase 5
the four test files can be written in parallel once Phase 4 is complete. Phase 6 is the
final gate.

---

## Phase 1 — Setup (devDependencies)

**Spec**: R06, D6  
**Commit unit**: `build(deps): add vitest, coverage-v8, and jsdom devDependencies`

### 1.1 Resolve correct Vitest major for Vite 8

- [ ] Run `bun pm ls vite` or inspect `package.json` to confirm current vite version is `^8.0.14`.
- [ ] Check Vitest latest release notes / npm peerDependencies: run `npm info vitest@latest peerDependencies` and confirm its `vite` peer range covers `8.x`. (Vitest 2 predates Vite 8; expected result is Vitest 3.x.)
- [ ] Record the resolved major (e.g. `3`) — this is the version anchor for all install commands below.
- [ ] Check `@vitest/coverage-v8` at the SAME version: run `npm info @vitest/coverage-v8@<major>.x.x peerDependencies` to confirm it pins to the same vitest version. Coverage package MUST track vitest lockstep.
- [ ] **Hard gate**: if the resolved Vitest major does NOT support Vite 8, stop and escalate before continuing.

### 1.2 Install devDependencies

- [ ] Run `bun add -D vitest@^<resolved-major> @vitest/coverage-v8@^<resolved-major>` (lockstep versions).
- [ ] Run `bun add -D jsdom@^25` provisionally (may be dropped in 3.2 if Blob is global).
- [ ] Confirm `bun.lock` is updated and `package.json` devDependencies shows all three packages.
- [ ] Run `bun install` to ensure lock file is consistent.

**Verification**: `bun run build` MUST still pass after install (no new resolution errors).

---

## Phase 2 — Config (vite.config.ts, tsconfig.app.json, package.json, .gitignore)

**Spec**: R01–R10, R11–R12, R25, R32, D1, D2  
**Commit unit**: `build(test): wire Vitest config, TS globals, scripts, and gitignore`

All four tasks in this phase are **sequential** (each edit is small and independent but
should ship together as one config work unit).

### 2.1 Add `test` block to vite.config.ts

- [ ] Add `/// <reference types="vitest/config" />` as the first line of `vite.config.ts`.
- [ ] Add the `test` block inside `defineConfig({...})` after `plugins`:

  ```ts
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
  ```

- [ ] Confirm the existing `base`, `define`, and `plugins` entries are unchanged.
- [ ] Run `bun run build` — must still exit 0 (tsc -b types the `test` prop via `vitest/config` reference).

### 2.2 Add `vitest/globals` to tsconfig.app.json

- [ ] Edit `tsconfig.app.json` `"types"` array from `["vite/client"]` to `["vite/client", "vitest/globals"]`.
- [ ] Do NOT create `tsconfig.test.json` — rejected by D2.
- [ ] Run `bun run build` — must still exit 0 with zero new tsc errors.

### 2.3 Add test scripts to package.json

- [ ] Add to the `"scripts"` block:
  - `"test": "vitest run"`
  - `"test:watch": "vitest"`
  - `"test:coverage": "vitest run --coverage"`
- [ ] Confirm existing scripts (`dev`, `build`, `lint`, `dist:*`) are unchanged.

### 2.4 Add coverage/ to .gitignore

- [ ] Append `coverage/` on its own line to `.gitignore`.
- [ ] Verify `git status` does not show `coverage/` as tracked (directory does not exist yet, so this is a precautionary entry).

---

## Phase 3 — Smoke test (config validation gate)

**Spec**: R01, R24, D4  
**Commit unit**: `test(smoke): trivial smoke test to validate Vitest config + pdfjs import`

This phase is a **live gate** — the trivial test must pass before any characterization tests
are written. It confirms three things: Vitest config resolves, `src/App.tsx` can be imported
without throwing, and V8 coverage runs.

### 3.1 Write trivial smoke test

- [ ] Create `src/__tests__/smoke.test.ts`:

  ```ts
  // Smoke test — validates Vitest config and pdfjs import side-effect tolerance.
  // Removed before merge; this file is intentionally trivial.
  import { describe, it, expect } from 'vitest'

  describe('smoke', () => {
    it('runs', () => {
      expect(1 + 1).toBe(2)
    })
  })
  ```

- [ ] Run `bun run test` — must exit 0 with 1 passing test.

### 3.2 Confirm pdfjs import does not throw

- [ ] Update `smoke.test.ts` to import one exported helper from `src/App.tsx` once exports exist (this step executes AFTER Phase 4 is done, as a re-confirmation, not a blocker now).
- [ ] **Apply-time check (D3/R08)**: run a minimal `getByteSize`-like inline test under node. If `Blob` is globally available (Node 20+, Bun), remove jsdom from devDeps (`bun remove jsdom`) and do NOT add the jsdom pragma to `format.test.ts`. Document the outcome in the commit message.
- [ ] If `Blob` is NOT available under node, keep jsdom and note that `format.test.ts` will need `// @vitest-environment jsdom`.

### 3.3 Confirm V8 coverage runs

- [ ] Run `bun run test:coverage` with just the smoke test — must produce a `coverage/` directory with a report.
- [ ] Confirm `coverage/` appears in `git status` as untracked but NOT committed (`.gitignore` is in effect).

**Verification gate**: all three sub-steps must pass before proceeding to Phase 4.

---

## Phase 4 — Make testable (src/App.tsx exports + normalizeFileName hoist)

**Spec**: R14–R18, R25–R26, R30–R31  
**Commit unit**: `refactor(app): export pure helpers and hoist normalizeFileName to module scope`

### 4.1 Add `export` to 16 module-scoped helpers

- [ ] Prepend `export` to each of the following function declarations in `src/App.tsx`. These are ALL already at module scope (not inside the App component). Current locations per grep:
  - Line ~249: `normalizeMarkdownForRichEditor`
  - Line ~300: `decodePdfDataUrl`
  - Line ~319: `getItemFontSize`
  - Line ~325: `computeHeadingThresholds`
  - Line ~339: `groupItemsIntoLines`
  - Line ~531: `buildPageMarkdown`
  - Line ~746: `getByteSize`
  - Line ~748: `formatFileSize`
  - Line ~755: `formatSavedAt`
  - Line ~782: `escapeHtml`
  - Line ~790: `sanitizeStyleValue`
  - Line ~793: `escapeRegExp`
  - Line ~796: `getStyleDeclaration`
  - Line ~804: `mergeStyle`
  - Line ~831: `getStyledMarkdown`
  - Line ~840: `replaceSelectedTextInMarkdown`
- [ ] Verify line count in App.tsx is unchanged (only the `export ` keyword was added, no logic moved).
- [ ] Confirm no call site inside App.tsx was modified (callers use bare name, still valid).

### 4.2 Hoist `normalizeFileName` to module scope

- [ ] Identify `normalizeFileName` at line ~1636 inside the `App` function body.
- [ ] Cut the entire function declaration from inside the App body.
- [ ] Paste it at module scope — place it with the other format helpers (near line ~755 group, after `formatSavedAt`) for consistency with D5's concern grouping.
- [ ] Add `export` to the declaration at module scope.
- [ ] Verify the single call site at line ~2023 (`normalizeFileName(fileName)`) is UNCHANGED — the identifier resolves because it is now at module scope, accessible everywhere in the file.
- [ ] Confirm no other call sites exist (only one usage per grep output).

### 4.3 Verify build and lint pass

- [ ] Run `bun run build` — must exit 0 with zero errors (tsc -b + vite build).
- [ ] Run `bun run lint` — must exit 0 with zero new errors or warnings.
- [ ] If `noUnusedLocals` or `noUnusedParameters` surfaces errors from test scaffolding, fix in test files — do NOT relax the production tsconfig.

**Commit this phase as one work unit** (exports + hoist + build/lint confirmation all belong
together — one atomic behavior change: "pure helpers are now importable by tests").

---

## Phase 5 — Characterization tests (four files)

**Spec**: R19–R24, R08, D3, D5, Scenarios 05–13  
**Dependencies**: Phase 4 complete, Phase 3 smoke gate passed.

Each test file below is an independent work unit and can be written in parallel once
Phase 4 is done. They share one constraint: each must import from `'../App'` (R23) and
each must pin ACTUAL current output (R20), obtained by running the live function first
if the output is not obvious from static analysis (R21).

**Characterization discipline reminder**: do NOT assert idealized values. If a function
returns an unexpected result, that IS the correct expected value for this change. The goal
is a safety net, not a correctness gate.

---

### 5.1 `src/__tests__/markdown.test.ts`

**Spec**: R19–R24, Scenario 05  
**Helpers covered**: `normalizeMarkdownForRichEditor`, `escapeRegExp`, `replaceSelectedTextInMarkdown`  
**Commit unit**: `test(markdown): characterization tests for markdown helpers`

- [ ] Create `src/__tests__/markdown.test.ts`.
- [ ] Import `{ normalizeMarkdownForRichEditor, escapeRegExp, replaceSelectedTextInMarkdown }` from `'../App'`.
- [ ] **`normalizeMarkdownForRichEditor`**: run the live function with:
  - A plain heading string with no HTML (happy path).
  - A heading with an HTML tag (e.g. `"<b>Title</b>"`) — pin actual stripped output.
  - A string containing `<placeholder>` — pin actual escaped output (spec guidance: `&lt;placeholder&gt;`).
  - A string with bare `<` outside tags — pin actual output.
  - A string with `{}` characters — pin actual escaped output.
- [ ] **`escapeRegExp`**: run with:
  - A string with regex metacharacters `.*+?^${}()|[]\` — pin actual output.
  - An empty string — pin `''`.
  - A string with no metacharacters — pin unchanged output.
- [ ] **`replaceSelectedTextInMarkdown`**: run with:
  - A known substring present in the markdown (happy path) — pin actual output.
  - Replacement at the start of the string.
  - Replacement at the end of the string.
  - Substring not found — pin actual output (no-op or error behavior, whichever is current).
- [ ] Run `bun run test` — all tests in this file must pass green.

---

### 5.2 `src/__tests__/pdf.test.ts`

**Spec**: R19–R24, Scenario 12  
**Helpers covered**: `getItemFontSize`, `computeHeadingThresholds`, `groupItemsIntoLines`, `buildPageMarkdown`, `decodePdfDataUrl`  
**Commit unit**: `test(pdf): characterization tests for PDF text-extraction helpers`

- [ ] Create `src/__tests__/pdf.test.ts`.
- [ ] Import `{ getItemFontSize, computeHeadingThresholds, groupItemsIntoLines, buildPageMarkdown, decodePdfDataUrl }` from `'../App'`.
- [ ] **Confirm pdfjs side-effect** (R24): the first test in this file implicitly confirms Scenario 12 — if importing `App.tsx` throws, the entire suite errors here. If it passes, log the confirmation.
- [ ] **`getItemFontSize`**: run with:
  - An item with a defined `transform` array containing a fontSize — pin actual number.
  - An item with `undefined` transform — pin actual fallback value.
  - An item whose fontSize falls below the minimum threshold — pin actual clamped value.
- [ ] **`computeHeadingThresholds`**: run with:
  - A mixed-size items array — pin actual threshold object.
  - An empty array — pin actual output.
  - An array of identical sizes — pin actual output.
  - A single-element array — pin actual output.
- [ ] **`groupItemsIntoLines`**: run with:
  - A flat array of items at different vertical positions — pin actual grouped structure.
  - Items sharing the same vertical position (same line) — pin actual merged output.
  - An empty array — pin actual output.
- [ ] **`buildPageMarkdown`**: run with:
  - A page object with text items — pin actual markdown string.
  - A page with no items — pin actual output (empty string or newline).
  - A page with mixed heading and body items — pin actual output.
- [ ] **`decodePdfDataUrl`**: run with:
  - A valid base64 PDF data URL (construct a minimal one) — pin actual Uint8Array length or first bytes.
  - An empty string — pin actual output (error throw or null/undefined).
  - A malformed data URL — pin actual output.
  - A non-PDF data URL (e.g. `data:image/png;base64,...`) — pin actual output.
- [ ] Run `bun run test` — all tests in this file must pass green.

---

### 5.3 `src/__tests__/inline-style.test.ts`

**Spec**: R19–R24, Scenarios 06, 07  
**Helpers covered**: `escapeHtml`, `sanitizeStyleValue`, `getStyleDeclaration`, `mergeStyle`, `getStyledMarkdown`  
**Commit unit**: `test(inline-style): characterization tests for inline-style helpers`

- [ ] Create `src/__tests__/inline-style.test.ts`.
- [ ] Import `{ escapeHtml, sanitizeStyleValue, getStyleDeclaration, mergeStyle, getStyledMarkdown }` from `'../App'`.
- [ ] **`escapeHtml`**: run with:
  - The string `& < > " '` — pin exact escaped output (Scenario 06).
  - An empty string — pin `''`.
  - A string with no special characters — pin unchanged output.
- [ ] **`sanitizeStyleValue`**: run with:
  - A clean CSS value string (e.g. `"bold"`) — pin unchanged output.
  - A value with leading/trailing whitespace — pin trimmed (or as-is) output.
  - A value with potentially dangerous content — pin sanitized output.
- [ ] **`getStyleDeclaration`**: run with:
  - An `InlineStyleKind` value and a valid CSS value string — pin actual declaration object/string.
  - An `InlineStyleKind` value with a non-existent property — pin actual output.
- [ ] **`mergeStyle`**: run with:
  - An element with no existing `style` attribute and a styles object — pin actual merged string (Scenario 07).
  - An element that already has an inline `style` attribute and a new property added — pin merged output (Scenario 07).
  - An empty styles object — pin as-is output.
- [ ] **`getStyledMarkdown`**: run with:
  - A markdown string where a matching element exists — pin actual styled output.
  - No matching element — pin actual output (unchanged markdown or empty).
  - Nested style content — pin actual output.
- [ ] Run `bun run test` — all tests in this file must pass green.

---

### 5.4 `src/__tests__/format.test.ts`

**Spec**: R19–R24, R08, Scenarios 08, 09, 10, 11  
**Helpers covered**: `formatFileSize`, `formatSavedAt`, `normalizeFileName`, `getByteSize`  
**Commit unit**: `test(format): characterization tests for format helpers`

- [ ] Create `src/__tests__/format.test.ts`.
- [ ] **Apply jsdom decision from Phase 3 (step 3.2)**:
  - If Blob is global under node: no pragma needed, import normally.
  - If Blob is NOT global: add `// @vitest-environment jsdom` as the FIRST line of this file.
- [ ] Import `{ formatFileSize, formatSavedAt, normalizeFileName, getByteSize }` from `'../App'`.
- [ ] **`formatFileSize`**: run with (Scenario 08):
  - `0` — pin actual output for zero bytes.
  - `1023` — pin actual B-range output.
  - `1024` — pin actual KB-range output.
  - A value in MB range (e.g. `1048576`) — pin actual MB output.
- [ ] **`formatSavedAt`**: run with (Scenario 09):
  - A valid `Date` and locale `"es"` — pin actual Spanish-formatted string.
  - A valid `Date` and locale `"en"` — pin actual English-formatted string.
  - `null` — pin actual fallback output.
  - `undefined` (if the signature allows) — pin actual fallback output.
- [ ] **`normalizeFileName`**: run with (Scenario 10):
  - A filename with characters disallowed by the implementation — pin sanitized output.
  - An already-clean filename — pin unchanged output.
  - An empty string — pin actual output.
  - A filename with leading/trailing spaces — pin actual trimmed (or as-is) output.
- [ ] **`getByteSize`**: run with (Scenario 11):
  - A non-empty ASCII string — pin actual byte count.
  - An empty string — pin `0`.
  - A string with multi-byte characters (e.g. `"café"`) — pin actual byte count.
- [ ] Run `bun run test` — all tests in this file must pass green.

---

## Phase 6 — Verify (full suite + build + lint)

**Spec**: R01, R25–R27, Scenarios 01–04, 12–14, Definition of done  
**Commit unit**: no new commit — this is the gate before the PR.

### 6.1 Full suite green

- [ ] Delete or rename `src/__tests__/smoke.test.ts` (remove the trivial smoke test now that characterization tests confirm the config).
  - Alternative: keep it as an intentional "always-green" sentinel commit — decide per team preference.
- [ ] Run `bun run test` — must exit 0 with ALL characterization tests passing, zero skipped.
- [ ] Confirm test count: at minimum one test per helper = 17+ tests; edge-case guidance from §2.6 should yield 40–60 total tests.

### 6.2 Coverage report

- [ ] Run `bun run test:coverage` — must generate `coverage/` directory.
- [ ] Confirm each of the 17 target helpers appears in the v8 report with at least one covered line (Scenario 02).
- [ ] Confirm `coverage/` is NOT in `git status` as staged or tracked (Scenario 14, R32).

### 6.3 Build and lint green

- [ ] Run `bun run build` — must exit 0 (Scenario 03, R25).
- [ ] Run `bun run lint` — must exit 0, zero new warnings vs pre-change baseline (Scenario 04, R26).
- [ ] Compare bundle output size vs pre-change — must be within 1 KB (R27). Run `vite build` and inspect `dist/` entry file size.

### 6.4 Exclusion confirmation

- [ ] Confirm (Scenario 13): no test file references `pdfImageToDataUrl`, `extractMarkdownFromPdf`, `resolvePageObject`, or `extractPageImages`.
- [ ] Confirm (R30): no function was moved outside `src/App.tsx`.
- [ ] Confirm (R31): no call site was changed except by the `normalizeFileName` hoist (which requires no call-site edit).

### 6.5 Definition of done sign-off

- [ ] `bun run test` exits 0 with all 17 functions covered.
- [ ] `bun run build` exits 0.
- [ ] `bun run lint` exits 0 with no new issues.
- [ ] `coverage/` is in `.gitignore`.
- [ ] No function has been moved out of `src/App.tsx`.
- [ ] No existing runtime behavior has changed.

---

## Commit plan (work units)

| # | Commit message | Phases | Files touched |
|---|---------------|--------|---------------|
| WU-1 | `build(deps): add vitest, @vitest/coverage-v8, and jsdom devDependencies` | 1 | `package.json`, `bun.lock` |
| WU-2 | `build(test): wire Vitest config, TS globals, scripts, and gitignore` | 2 | `vite.config.ts`, `tsconfig.app.json`, `package.json`, `.gitignore` |
| WU-3 | `test(smoke): validate Vitest config and pdfjs import tolerance` | 3 | `src/__tests__/smoke.test.ts` |
| WU-4 | `refactor(app): export pure helpers and hoist normalizeFileName to module scope` | 4 | `src/App.tsx` |
| WU-5 | `test(markdown): characterization tests for markdown helpers` | 5.1 | `src/__tests__/markdown.test.ts` |
| WU-6 | `test(pdf): characterization tests for PDF text-extraction helpers` | 5.2 | `src/__tests__/pdf.test.ts` |
| WU-7 | `test(inline-style): characterization tests for inline-style helpers` | 5.3 | `src/__tests__/inline-style.test.ts` |
| WU-8 | `test(format): characterization tests for format helpers` | 5.4 | `src/__tests__/format.test.ts` |
| WU-9 | `test(verify): remove smoke test, confirm full suite green` | 6 | `src/__tests__/smoke.test.ts` (delete) |

WU-3 is provisional: if the smoke test is kept as a sentinel, WU-9 is a no-op for that file.
WU-5 through WU-8 are parallelisable (independent files, no shared state).

---

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| WU-1: package.json + bun.lock | ~15 lines changed |
| WU-2: vite.config.ts + tsconfig.app.json + package.json + .gitignore | ~25 lines changed |
| WU-3: smoke.test.ts | ~12 lines |
| WU-4: src/App.tsx (export keywords + hoist) | ~40 lines changed (17 `export` additions + hoist cut/paste ~10 lines) |
| WU-5: markdown.test.ts | ~80–100 lines |
| WU-6: pdf.test.ts | ~100–130 lines |
| WU-7: inline-style.test.ts | ~80–110 lines |
| WU-8: format.test.ts | ~80–100 lines |
| WU-9: smoke.test.ts delete | ~12 lines removed |
| **Total estimated changed lines** | **~440–540 lines** |

**Chained PRs recommended**: Yes  
**400-line budget risk**: High (total exceeds 400 even at lower estimate)  
**Decision needed before apply**: Yes

**Recommended split**:
- **PR #1** — WU-1 + WU-2 + WU-3 + WU-4: infrastructure + exports. ~92 lines. Fast-follows, non-controversial. Gate: build + lint + smoke green.
- **PR #2** — WU-5 + WU-6 + WU-7 + WU-8 + WU-9: all characterization tests. ~360–450 lines. Still above 400 at high estimate; if the team wants strict compliance, split test files across PR #2 and PR #3 by concern (markdown+pdf vs inline-style+format).

Splitting WU-1 through WU-4 into PR #1 and WU-5 through WU-9 into PR #2 keeps PR #1 well under 400 lines and makes PR #2 reviewable as "just tests."
