# Technical Design: Playwright E2E behavioral safety net

This is the HOW for the `add-e2e-playwright` change. It pins concrete decisions: where the
`main.cjs` isolation hook goes, the exact `playwright.config.ts`, the `globalSetup` build flow,
the launch fixture, the 8 `data-testid` placements (line-accurate against current `src/App.tsx`),
and the TypeScript strategy that keeps `tsc -b` green.

## Quick path (what gets built)

1. Add a 2-line env-gated `userData` override to `electron/main.cjs` before `app.whenReady()`.
2. Add 8 `data-testid` attributes to `src/App.tsx` (mechanical, additive).
3. Add `@playwright/test` devDep + `test:e2e` / `test:e2e:build` scripts.
4. Create `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/fixtures.ts`, `e2e/app.spec.ts`.
5. Add `tsconfig.e2e.json` and reference it from the root `tsconfig.json`.

## Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│ playwright test  (Node runner — NOT bun test)                  │
│                                                                │
│  globalSetup (e2e/global-setup.ts)                             │
│    └─ execSync('bun run build')  ← once per suite              │
│                                                                │
│  fixtures.ts  ── electronApp fixture                           │
│    └─ _electron.launch({                                       │
│         args: ['electron/main.cjs'],                           │
│         env: { ...process.env, MDEDITOR_USER_DATA: <tmpdir> }  │
│       })                                                       │
│    └─ firstWindow() → wait .loadingOverlay hidden              │
│    └─ teardown: app.close() + rm(tmpdir)                       │
│                          │                                     │
│                          ▼                                     │
│            ┌─────────────────────────────┐                    │
│            │ Electron main process        │                    │
│            │  main.cjs                     │                    │
│            │   if (MDEDITOR_USER_DATA)     │ ← isolation hook   │
│            │     app.setPath('userData')   │   (before ready)   │
│            │  loadFile(dist/index.html)    │                    │
│            └──────────────┬──────────────┘                     │
│                           ▼                                     │
│            ┌─────────────────────────────┐                    │
│            │ Renderer (dist build)        │                    │
│            │  App.tsx + 8 data-testid     │ ← selector contract │
│            └─────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

Two boundaries change, both additive:
- **main.cjs** (main↔renderer / Node boundary): one env-gated `if` block, no-op in production.
- **App.tsx** (renderer markup): 8 attributes, zero behavior change.

Everything else (config, fixtures, specs) is new isolated files under `e2e/` + project root.

---

## 1. main.cjs test-isolation hook

### Placement

`app` is required at line 1. `app.setPath('userData', ...)` MUST run **before** anything reads
`app.getPath('userData')` (the SQLite/JSON store paths at lines 42–54) and before
`app.whenReady()` (line 680). The earliest safe, readable spot is immediately after the
`require` block at the top of the file (right after line 6, before `MIME_BY_EXT`).

### Exact snippet

Insert after line 6 (`let jsonStorePath = null;`):

```js
// Test isolation hook (additive, env-gated, no-op in production).
// Playwright launches the prod build with MDEDITOR_USER_DATA pointing at a
// fresh temp dir so tests never touch the real profile / SQLite / images.
// MUST run before app.whenReady() and before any app.getPath('userData') call.
if (process.env.MDEDITOR_USER_DATA) {
    app.setPath('userData', process.env.MDEDITOR_USER_DATA);
}
```

### Why here, not elsewhere

| Candidate location | Verdict |
|--------------------|---------|
| After `require` block (chosen) | `app` is defined; runs before `getStorePath()`/`getJsonStorePath()` are ever called and before `whenReady`. Top-of-file = obviously inert when var unset. |
| Inside `app.whenReady().then(...)` | TOO LATE — app is already ready; `setPath('userData')` after ready is undefined/ignored. |
| Inside `createWindow()` | TOO LATE and wrong scope — store paths may already be resolved. |

**Boundary note:** This is the one change touching the flagged main↔renderer boundary. It is
purely additive and environment-gated — when `MDEDITOR_USER_DATA` is unset (every production
run) the block is a no-op and the file behaves exactly as today. No IPC channel added, no
signature changed.

---

## 2. playwright.config.ts (full)

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    // No `projects` array: Electron-only, no browser contexts/binaries.
    fullyParallel: false,
    workers: 1, // Single Electron instance at a time — avoid process contention / port races.
    timeout: 30_000, // Per-test; covers MDXEditor double-RAF + first IPC load.
    expect: { timeout: 7_000 }, // Web-first assertion polling window.
    retries: process.env.CI ? 1 : 0, // Local Windows = no auto-retry; opt-in for future CI.
    reporter: [['list']],
    globalSetup: './e2e/global-setup.ts',
    use: {
        trace: 'retain-on-failure', // Cheap post-mortem without pixel snapshots.
    },
});
```

| Setting | Decision | Rationale |
|---------|----------|-----------|
| `testDir` | `./e2e` | Isolated from `src/**/*.test.ts` (Vitest). Zero collision. |
| `projects` | omitted | No browser binaries; `_electron.launch` is the only entry. |
| `workers` | `1` | Each test spawns a full Electron process; parallel instances fight over the maximized window and add flake. Suite is ~7 tests — serial is fast enough. |
| `fullyParallel` | `false` | Reinforces serial execution intent. |
| `timeout` | `30000` | Build is in globalSetup (not counted); per-test budget covers launch + double-RAF + IPC. |
| `retries` | `0` local, `1` CI | Local run should expose flake immediately; CI guard kept for the future. |
| `globalSetup` | `./e2e/global-setup.ts` | Build once before the whole suite. |
| `trace` | `retain-on-failure` | Debuggability without visual snapshots (which are explicitly out of scope). |

---

## 3. e2e/global-setup.ts

Build **once per suite** (not per test). Per-test builds would multiply ~10–20s by 7 = unacceptable;
the suite tests the same artifact, so one build is correct.

```ts
import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
    // Produce the production dist/ that main.cjs loadFile() serves.
    // stdio: 'inherit' surfaces build errors directly in the test output.
    execSync('bun run build', { stdio: 'inherit' });
}
```

| Decision | Rationale |
|----------|-----------|
| `execSync` (sync) | globalSetup awaits the returned promise; a sync build is simplest and ordering is guaranteed before any test launches. |
| `bun run build` | Same script developers use (`tsc -b && vite build`) — tests the real shipped pipeline including type-check. |
| once globally | Suite asserts behavior of one immutable artifact; rebuilding per test wastes minutes. |
| `stdio: 'inherit'` | A failing build aborts the suite with a visible error instead of a cryptic launch failure. |

Trade-off accepted: editing `src` between runs requires re-running `test:e2e` (which re-triggers
globalSetup → rebuild). For a pre-redesign net run on demand, this is fine. `test:e2e:build` exists
as the explicit "always rebuild" entry for gating.

---

## 4. Launch fixture — e2e/fixtures.ts

Extend Playwright's `test` with an `electronApp` + `page` fixture. Each test gets a freshly
launched app with an isolated temp `userData`, the first window, and a guarantee that the
loading overlay is already hidden before the test body runs.

```ts
import { test as base, _electron as electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Fixtures = {
    electronApp: ElectronApplication;
    page: Page;
};

export const test = base.extend<Fixtures>({
    electronApp: async ({}, use) => {
        // Fresh isolated profile per test → no SQLite/JSON/image bleed.
        const userDataDir = mkdtempSync(join(tmpdir(), 'mdeditor-e2e-'));

        const app = await electron.launch({
            args: ['electron/main.cjs'], // resolved from package.json "main" cwd (project root)
            env: { ...process.env, MDEDITOR_USER_DATA: userDataDir },
        });

        await use(app);

        await app.close();
        rmSync(userDataDir, { recursive: true, force: true });
    },

    page: async ({ electronApp }, use) => {
        const window = await electronApp.firstWindow();
        // Gate on the loading overlay: MDXEditor injects via double-RAF and
        // isLoadingLatest stays true until loadLatestDocument resolves.
        await window.waitForSelector('.loadingOverlay', { state: 'hidden' });
        await use(window);
    },
});

export { expect };
```

| Decision | Rationale |
|----------|-----------|
| `mkdtempSync` per test | Unique dir avoids cross-test state and parallel collisions; deterministic cleanup. |
| `args: ['electron/main.cjs']` | Explicit entry; cwd is project root (where `playwright test` runs), forward-slash path works on Windows via Node child_process. |
| `env` spread + override | Inherits PATH etc.; only adds the isolation var. |
| overlay gate in `page` fixture | Centralizes the anti-flake wait so every test inherits it — no per-test boilerplate, no chance to forget. |
| teardown `app.close()` + `rmSync` | Prevents orphan Electron processes and temp-dir accumulation on Windows. |

Tests import `{ test, expect }` from `./fixtures` instead of `@playwright/test`.

---

## 5. data-testid placements (line-accurate)

Eight attributes, all additive. Lines reference current `src/App.tsx`.

| # | testid | Element | Current location | Edit |
|---|--------|---------|------------------|------|
| 1 | `app-root` | `<main className={...}>` | line 1481–1483 | add `data-testid="app-root"` |
| 2 | `app-header` | `<header className="appHeader">` | line 1484 | add `data-testid="app-header"` |
| 3 | `btn-new` | New `<button aria-label={actionLabels.create}>` | line 1487–1495 | add `data-testid="btn-new"` |
| 4 | `btn-save` | Save `<button ... saveBtn>` | line 1505–1513 | add `data-testid="btn-save"` (the header Save at 1505, not the preview-pane Save at ~1970) |
| 5 | `workspace` | `<section className="workspace">` | line 1720 | add `data-testid="workspace"` |
| 6 | `editor-wrap` | `<div className="editorWrap">` | line 1722 | add `data-testid="editor-wrap"` |
| 7 | `source-editor` | `<textarea className="sourceEditor">` | line 1958–1963 | add `data-testid="source-editor"` |
| 8 | `preview-wrap` | `<aside className="previewWrap fullPreview">` | line 1967 | add `data-testid="preview-wrap"` |

**`btn-open` is intentionally excluded.** No test in the suite interacts with the Open flow
(Open triggers a native OS file dialog, which Playwright cannot drive without extra IPC stubbing —
explicitly out of scope). Adding a testid we never use would be dead contract surface. The proposal's
8-hook list is correct; `btn-open` is deliberately omitted.

**Selector contract (redesign MUST preserve):** these 8 `data-testid` values are the stable
behavioral hooks. The redesign may restructure markup and restyle freely but must keep these
attributes on the equivalent elements. Theme/view-mode buttons are NOT given testids — they use the
already-present `role=group` + `aria-label` + `:has-text(...)` selectors, which are locale-resilient
for the literal labels (Light/Dark/Editor/.md/Preview).

---

## 6. TypeScript config for e2e

### Problem

Root `tsconfig.json` uses **project references** (`tsconfig.app.json` → `src`, `tsconfig.node.json`
→ `vite.config.ts`). The build is `tsc -b && vite build`. If `e2e/**/*.ts` is added to
`tsconfig.app.json`'s `include`, the production build would type-check test files (pulling in
`@playwright/test`, Node-only APIs, mixing DOM + Node libs) — fragile and wrong.

### Decision: separate `tsconfig.e2e.json` referenced from root (cleaner option)

Create `tsconfig.e2e.json`:

```json
{
    "compilerOptions": {
        "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.e2e.tsbuildinfo",
        "target": "es2023",
        "lib": ["ES2023", "DOM"],
        "module": "esnext",
        "moduleResolution": "bundler",
        "types": ["node"],
        "skipLibCheck": true,
        "noEmit": true,
        "verbatimModuleSyntax": true,
        "moduleDetection": "force",
        "strict": true
    },
    "include": ["e2e", "playwright.config.ts"]
}
```

Add the reference to root `tsconfig.json`:

```json
{
    "files": [],
    "references": [
        { "path": "./tsconfig.app.json" },
        { "path": "./tsconfig.node.json" },
        { "path": "./tsconfig.e2e.json" }
    ]
}
```

| Option | Verdict |
|--------|---------|
| Add `e2e` to `tsconfig.app.json` include | REJECTED — pollutes the renderer build with Node/Playwright types; `noUnusedLocals`/`erasableSyntaxOnly` rules would fight test idioms; couples test type-check to ship build. |
| Separate `tsconfig.e2e.json` + root reference (chosen) | Clean isolation. `tsc -b` builds all three projects so type errors in e2e are still caught, but e2e types never leak into the app/node outputs. Matches the existing multi-project pattern. |
| No tsconfig entry at all | REJECTED — e2e files would be unchecked; `tsc -b` ignores them, drift goes unnoticed. |

`@playwright/test` ships its own type definitions, so no `@types/playwright` is needed. `DOM` lib is
included because tests touch Playwright `Page` DOM-query types; `types: ["node"]` covers
`node:fs`/`node:os`/`node:child_process`/`execSync`.

> Note: with `tsc -b`, the new e2e project is now part of the production `bun run build`. This is
> intentional — it means a type error in a test fails the build that globalSetup runs, surfacing
> problems early. If a future need arises to ship without checking e2e, drop the reference and
> type-check e2e via a separate `tsc -p tsconfig.e2e.json` step in `test:e2e:build`.

---

## 7. Runner: Node (`playwright test`), NOT `bun test`

`bun test` is Bun's own test runner and does **not** discover or execute the Playwright suite.
Playwright's runner executes on Node.js. The dedicated script `"test:e2e": "playwright test"`
invokes the Playwright CLI, which runs on Node — even when invoked through `bun run`, the
`playwright` binary shells out to its Node runtime. This separation is deliberate:

- `bun run test` / `vitest run` → 114 unit tests (Vitest, `src/**/*.test.ts`).
- `bun run test:e2e` → Playwright Electron suite (`e2e/**`).

The two never share a runner or a config. No `playwright install` is needed — `_electron` drives the
app's bundled Electron, not a downloaded browser.

### package.json changes

```jsonc
// devDependencies
"@playwright/test": "^1.45.0",

// scripts
"test:e2e": "playwright test",
"test:e2e:build": "bun run build && playwright test"
```

`test:e2e` relies on globalSetup to build; `test:e2e:build` is the redundant-but-explicit
build-then-test entry kept for a gating/CI mental model.

---

## 8. File layout

```
project-root/
├── playwright.config.ts        # new — suite config (section 2)
├── tsconfig.e2e.json           # new — e2e type-check project (section 6)
├── tsconfig.json               # edit — add e2e reference
├── package.json                # edit — devDep + 2 scripts
├── electron/
│   └── main.cjs                # edit — isolation hook after line 6 (section 1)
├── src/
│   └── App.tsx                 # edit — 8 data-testid attributes (section 5)
└── e2e/                        # new directory
    ├── global-setup.ts         # new — bun run build (section 3)
    ├── fixtures.ts             # new — electronApp + page fixtures (section 4)
    └── app.spec.ts             # new — the ~7 behavioral tests
```

`e2e/app.spec.ts` imports `{ test, expect }` from `./fixtures`. Each test relies on the `page`
fixture already having waited for `.loadingOverlay` hidden. Theme/view-mode use aria-group +
`:has-text`; actions use `data-testid`; theme assertions check `app-root` class membership
(`light-theme` / `dark-theme`). No assertions on MDXEditor internal CodeMirror/Lexical DOM.

---

## ADR-style decisions

| # | Decision | Alternatives rejected | Rationale |
|---|----------|------------------------|-----------|
| D1 | Prod build via globalSetup, launch `electron/main.cjs` | Vite dev server (`VITE_DEV_SERVER_URL`) | Dev server = second coordinated process + startup races; prod build tests the real shipped artifact. |
| D2 | Build once per suite (globalSetup) | Build per test | 7 × ~15s wasted; same immutable artifact under test. |
| D3 | Env-gated `app.setPath('userData')` in main.cjs | Chromium `--user-data-dir` flag; no isolation | `--user-data-dir` only moves the Chrome profile, not Electron Node-side `app.getPath('userData')` for SQLite/JSON. Hook must run before app ready — only main.cjs can. |
| D4 | Hook placed top-of-file after requires | Inside `whenReady` / `createWindow` | Those run after the app is ready or after store paths resolve — too late for `setPath('userData')`. |
| D5 | `workers: 1`, serial | Parallel workers | Multiple maximized Electron instances contend and flake; suite is tiny. |
| D6 | Separate `tsconfig.e2e.json` + root reference | Add `e2e` to `tsconfig.app.json`; no tsconfig | Keeps Node/Playwright types out of the renderer ship build while still type-checking e2e under `tsc -b`. |
| D7 | `data-testid` for actions + structure; aria for theme/view-mode | testid everywhere; aria everywhere | App defaults to locale `es` → action aria-labels are localized; structural classes churn in redesign; theme/view-mode labels are stable literals with existing aria groups. |
| D8 | Exclude `btn-open` testid | Add all action testids | Open opens a native OS dialog Playwright can't drive without IPC stubbing (out of scope); unused contract surface. |
| D9 | `.loadingOverlay` class gate in `page` fixture | aria-label `Loading...` selector; per-test waits | aria-label is locale-dependent; centralizing in the fixture removes per-test flake risk. |
| D10 | `@playwright/test` only, no `playwright install` | Add browser binaries | `_electron` drives the app's bundled Electron; no external browser needed. |

## Checklist (verifiable by reviewer)

- [ ] main.cjs hook is additive, env-gated, sits before `app.whenReady()` and before any `getPath('userData')`.
- [ ] All 8 `data-testid` values present on the elements in section 5; `btn-open` absent by design.
- [ ] `playwright.config.ts` has no `projects`, `workers: 1`, `testDir: ./e2e`, globalSetup wired.
- [ ] `tsconfig.e2e.json` referenced from root; `tsc -b` (i.e. `bun run build`) stays green.
- [ ] `test:e2e` runs Playwright (Node), never `bun test`; Vitest's 114 stay green.
- [ ] `page` fixture waits `.loadingOverlay` hidden before test bodies; no MDXEditor-internal assertions.

## Next step

Proceed to `sdd-tasks` once the spec is also ready. Tasks will break this into ordered,
test-first work units (main.cjs hook, testids, config/fixtures/specs, type-check verification).
