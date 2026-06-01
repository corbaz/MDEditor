# Tasks: add-e2e-playwright

**Change**: add-e2e-playwright
**Status**: ready
**Date**: 2026-06-01
**Execution mode**: sequential (each phase gates the next)
**Strict TDD**: active — `bun run test` (114 units) must stay green at all times

---

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| New files | 5 (playwright.config.ts, tsconfig.e2e.json, e2e/global-setup.ts, e2e/fixtures.ts, e2e/app.spec.ts) |
| Edited files | 4 (electron/main.cjs, src/App.tsx, package.json, tsconfig.json) |
| New lines (e2e/ + config) | ~130 |
| Edited lines (main.cjs + App.tsx + package.json + tsconfig.json) | ~30 |
| Total estimated changed lines | **~160** |
| 400-line budget risk | **Low** |
| Chained PRs recommended | No — single PR is fine |
| Decision needed before apply | **No** |

All new code is additive (new files + attribute annotations + one env-gated `if`). The single largest file (`e2e/app.spec.ts`) stays well under 100 lines. One PR is the right shape.

---

## Phase 1 — Tooling Setup

> Installs the dependency and declares scripts. Zero behavior change. Parallel to nothing (must be first — `@playwright/test` types are required by subsequent phases).

### 1.1 Install `@playwright/test` and declare scripts

**Spec link**: E2E Script Entry Point requirement; runner must be `playwright test` (Node), not `bun test`.

- [ ] Run `bun add -D @playwright/test` (pin `^1.45.0` in devDependencies).
- [ ] Add `"test:e2e": "playwright test"` to `package.json` scripts.
- [ ] Add `"test:e2e:build": "bun run build && playwright test"` to `package.json` scripts.
- [ ] Verify `bun run test` still exits 0 (114 green).

### 1.2 Create `playwright.config.ts`

**Spec link**: Production Build Launch requirement; E2E Script Entry Point requirement.

- [ ] Create `playwright.config.ts` at project root.
- [ ] Set `testDir: './e2e'`, no `projects` array, `workers: 1`, `fullyParallel: false`.
- [ ] Set `timeout: 30_000`, `expect: { timeout: 7_000 }`.
- [ ] Set `retries: process.env.CI ? 1 : 0`.
- [ ] Set `reporter: [['list']]`.
- [ ] Set `globalSetup: './e2e/global-setup.ts'`.
- [ ] Set `use: { trace: 'retain-on-failure' }`.

### 1.3 Create `tsconfig.e2e.json` and wire root reference

**Spec link**: Domain 3 — build and lint must pass without errors; design D6.

- [ ] Create `tsconfig.e2e.json` with `lib: ["ES2023","DOM"]`, `types: ["node"]`, `noEmit: true`, `include: ["e2e","playwright.config.ts"]`, `tsBuildInfoFile: "./node_modules/.tmp/tsconfig.e2e.tsbuildinfo"`.
- [ ] Add `{ "path": "./tsconfig.e2e.json" }` to the `references` array in root `tsconfig.json`.
- [ ] Run `bun run build` (`tsc -b && vite build`) — must exit 0 (e2e project is now in the build graph but only type-checks; no emit from it).
- [ ] Run `bun run lint` — must exit 0.

**Commit**: `build(e2e): add playwright config, scripts, and tsconfig.e2e.json`

---

## Phase 2 — main.cjs Isolation Hook

> Adds the env-gated userData override. Additive, no-op in production. Sequential after Phase 1 (no dependency, but ordering keeps the diff clean and reviewable in isolation).

### 2.1 Insert the `MDEDITOR_USER_DATA` hook

**Spec link**: Test Isolation via userData Override requirement; design section 1.

- [ ] Open `electron/main.cjs`.
- [ ] Locate line 6 (`let jsonStorePath = null;`) — immediately after the require block.
- [ ] Insert the following block AFTER line 6, BEFORE any `app.getPath('userData')` call (lines 42–54) and BEFORE `app.whenReady()` (line 680):

  ```js
  // Test isolation hook (additive, env-gated, no-op in production).
  // Playwright launches the prod build with MDEDITOR_USER_DATA pointing at a
  // fresh temp dir so tests never touch the real profile / SQLite / images.
  // MUST run before app.whenReady() and before any app.getPath('userData') call.
  if (process.env.MDEDITOR_USER_DATA) {
      app.setPath('userData', process.env.MDEDITOR_USER_DATA);
  }
  ```

- [ ] Confirm placement: the block is before `getStorePath` / `getJsonStorePath` and before `app.whenReady()`.
- [ ] Run `bun run test` — 114 green (unit tests do not exercise main.cjs).
- [ ] Run `bun run build` — exits 0.
- [ ] Run `bun run lint` — exits 0.

**Commit**: `feat(e2e): add env-gated userData isolation hook in main.cjs`

---

## Phase 3 — data-testid Hooks

> Adds 8 `data-testid` attributes to `src/App.tsx`. Mechanical, purely additive. Sequential after Phase 2 (ordering keeps diffs reviewable; no actual dependency).

### 3.1 Add the 8 `data-testid` attributes

**Spec link**: Eight data-testid Hooks on App.tsx requirement; design section 5.

Line references are against the current (pre-edit) `src/App.tsx`:

- [ ] `app-root` — `<main className={...}>` at line ~1481: add `data-testid="app-root"`.
- [ ] `app-header` — `<header className="appHeader">` at line ~1484: add `data-testid="app-header"`.
- [ ] `btn-new` — New `<button aria-label={actionLabels.create}>` at line ~1487: add `data-testid="btn-new"`.
- [ ] `btn-save` — Save `<button ... saveBtn>` at line ~1505 (header Save, NOT the preview-pane Save at ~1970): add `data-testid="btn-save"`.
- [ ] `workspace` — `<section className="workspace">` at line ~1720: add `data-testid="workspace"`.
- [ ] `editor-wrap` — `<div className="editorWrap">` at line ~1722: add `data-testid="editor-wrap"`.
- [ ] `source-editor` — `<textarea className="sourceEditor">` at line ~1958: add `data-testid="source-editor"`.
- [ ] `preview-wrap` — `<aside className="previewWrap fullPreview">` at line ~1967: add `data-testid="preview-wrap"`.
- [ ] Confirm `btn-open` is NOT given a testid (native OS dialog, out of scope — design D8).

### 3.2 Verify no regression

**Spec link**: Vitest Unit Tests Remain Green requirement.

- [ ] Run `bun run test` — all 114 must pass.
- [ ] Run `bun run build` — exits 0.
- [ ] Run `bun run lint` — exits 0.

**Commit**: `test(e2e): add data-testid hooks to App.tsx`

---

## Phase 4 — E2E Harness + Smoke Gate (BLOCKING)

> Creates the full test infrastructure and validates it end-to-end with ONE smoke test before all 7 behavioral tests are written. This phase is the highest-risk step on Windows — it must pass before Phase 5 proceeds.

### 4.1 Create `e2e/global-setup.ts`

**Spec link**: Production Build Launch requirement (globalSetup builds once).

- [ ] Create `e2e/global-setup.ts`:

  ```ts
  import { execSync } from 'node:child_process';

  export default async function globalSetup(): Promise<void> {
      execSync('bun run build', { stdio: 'inherit' });
  }
  ```

### 4.2 Create `e2e/fixtures.ts`

**Spec link**: Test Isolation via userData Override requirement; Loading Gate Before Every Assertion requirement; design section 4.

- [ ] Create `e2e/fixtures.ts` with `electronApp` fixture: `mkdtempSync(join(tmpdir(),'mdeditor-e2e-'))` → `electron.launch({ args:['electron/main.cjs'], env:{ ...process.env, MDEDITOR_USER_DATA: userDataDir } })` → `use(app)` → `app.close()` + `rmSync`.
- [ ] Add `page` fixture: `electronApp.firstWindow()` → `window.waitForSelector('.loadingOverlay', { state: 'hidden' })` → `use(window)`.
- [ ] Export `{ test, expect }` from fixtures (tests import from `./fixtures`, not `@playwright/test`).

### 4.3 Write ONE smoke test and run the harness

**Spec link**: Scenario 1 (structural regions render) — partial assertion.

- [ ] Create `e2e/app.spec.ts` with a single test:
  - Import `{ test, expect }` from `./fixtures`.
  - Test: "app launches and header is visible" → assert `[data-testid="app-header"]` is visible.
- [ ] Run `bun run test:e2e` — **MUST pass (exit 0) before Phase 5 begins**.
  - This validates: Electron launch, env var injection, `main.cjs` hook, `page` fixture overlay gate, and `data-testid` selector contract — the full Windows harness path.
- [ ] If the smoke fails, diagnose and fix before proceeding (do NOT write more tests against a broken harness).

**Commit**: `test(e2e): add electron launch harness and smoke test`

---

## Phase 5 — Behavioral Tests (depends on Phase 4 smoke green)

> Expands `e2e/app.spec.ts` to the full 7 behavioral tests. The smoke test from Phase 4 is absorbed into Scenario 1.

### 5.1 Write all 7 behavioral tests

**Spec link**: Behavioral E2E Scenarios requirement; Locale-Resilient Selectors requirement.

- [ ] **Scenario 1** — App launches and structural regions render (expand/replace smoke):
  - Assert `[data-testid="app-header"]` visible.
  - Assert `[data-testid="workspace"]` visible.

- [ ] **Scenario 2** — Theme Dark to Light:
  - Click `[role="group"][aria-label="Theme"] :has-text("Light")`.
  - Assert `[data-testid="app-root"]` has class `light-theme`.
  - Assert `[data-testid="app-root"]` does NOT have class `dark-theme`.

- [ ] **Scenario 3** — Theme Light to Dark:
  - First click Light (Scenario 2 setup), then click `[role="group"][aria-label="Theme"] :has-text("Dark")`.
  - Assert `[data-testid="app-root"]` has class `dark-theme`.
  - Assert `[data-testid="app-root"]` does NOT have class `light-theme`.

- [ ] **Scenario 4** — View-mode `.md` shows source textarea, hides rich editor:
  - Click `[role="group"][aria-label="View mode"] :has-text(".md")`.
  - Assert `[data-testid="source-editor"]` visible.
  - Assert `[data-testid="editor-wrap"]` hidden.

- [ ] **Scenario 5** — View-mode Preview shows preview region:
  - Click `[role="group"][aria-label="View mode"] :has-text("Preview")`.
  - Assert `[data-testid="preview-wrap"]` visible.

- [ ] **Scenario 6** — View-mode Editor shows rich editor, hides source textarea:
  - Switch to `.md` first, then click `[role="group"][aria-label="View mode"] :has-text("Editor")`.
  - Assert `[data-testid="editor-wrap"]` visible.
  - Assert `[data-testid="source-editor"]` hidden.

- [ ] **Scenario 7** — New document activates filename edit:
  - Click `[data-testid="btn-new"]`.
  - Assert a filename edit input is visible (the `isEditingFileName` state is true).

- [ ] Confirm NO test asserts pixel values, colors, or MDXEditor CodeMirror/Lexical internal DOM nodes.
- [ ] Confirm ALL tests rely on the `page` fixture (overlay gate is centralized — no per-test `waitForSelector` for the overlay).

**Commit**: `test(e2e): add behavioral flows for theme, view-mode, and new-doc`

---

## Phase 6 — Final Verification

> Runs all checks in one batch to confirm the complete change is green before PR creation.

### 6.1 Full verification pass

**Spec link**: Domain 3 — Existing Test Stability requirement; all behavioral scenario requirements.

- [ ] `bun run test:e2e` — all 7 E2E tests pass, 0 failures.
- [ ] `bun run test` — all 114 Vitest unit tests pass, 0 failures.
- [ ] `bun run build` — exits 0 (includes `tsc -b` over app + node + e2e projects).
- [ ] `bun run lint` — exits 0, no new warnings.
- [ ] Review the 8 `data-testid` values in `src/App.tsx` against the spec table — all 8 present, `btn-open` absent.
- [ ] Review `electron/main.cjs` — isolation hook is before `getStorePath` / `getJsonStorePath` / `app.whenReady()`.

---

## Commit Summary (conventional, no AI attribution)

| Commit | Phase | Content |
|--------|-------|---------|
| `build(e2e): add playwright config, scripts, and tsconfig.e2e.json` | 1.1 + 1.2 + 1.3 | package.json, playwright.config.ts, tsconfig.e2e.json, tsconfig.json |
| `feat(e2e): add env-gated userData isolation hook in main.cjs` | 2.1 | electron/main.cjs |
| `test(e2e): add data-testid hooks to App.tsx` | 3.1 + 3.2 | src/App.tsx |
| `test(e2e): add electron launch harness and smoke test` | 4.1 + 4.2 + 4.3 | e2e/global-setup.ts, e2e/fixtures.ts, e2e/app.spec.ts (smoke) |
| `test(e2e): add behavioral flows for theme, view-mode, and new-doc` | 5.1 | e2e/app.spec.ts (full 7 tests) |

---

## Execution Parallelism

All phases are sequential. The dependency chain is:

```
Phase 1 (tooling) → Phase 2 (main.cjs) → Phase 3 (testids) → Phase 4 (harness + smoke GATE) → Phase 5 (behavioral tests) → Phase 6 (verify)
```

Phase 4 is a hard gate — smoke MUST pass before Phase 5 begins. This is the most likely failure point on Windows and surfaces harness issues before the bulk of test authoring.

Phases 2 and 3 have no strict dependency on each other after Phase 1, but are ordered for reviewer clarity (infra → main process → renderer → test files).
