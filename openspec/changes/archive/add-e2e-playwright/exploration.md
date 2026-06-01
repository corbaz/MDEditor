# Exploration: add-e2e-playwright

## Current State

Desktop Markdown editor: Electron 42 + React 19 + Vite 8 + MDXEditor. Stack confirmed from `package.json`.

**Existing test infra** (Vitest 4.1.7):
- `vite.config.ts:12-21` — Vitest config uses `environment: 'node'`, tests in `src/**/*.test.ts`
- 4 test files under `src/__tests__/`: format, inline-style, markdown, pdf — all pure-unit, no DOM
- No Playwright config or `e2e/` directory exists

**Electron launch path** (`electron/main.cjs:363-386`):
- `createWindow()` creates BrowserWindow (1280×860, `autoHideMenuBar: true`, `mainWindow.maximize()` at line 379)
- Load logic at lines 381-386: if `VITE_DEV_SERVER_URL` env var is set → `mainWindow.loadURL(devServerUrl)`, else → `mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))`
- `app.whenReady().then(() => createWindow())` at line 680
- NO existing env var hook for userData/test isolation

**State persistence** (`electron/main.cjs:42-54`):
- `getStorePath()` → `path.join(app.getPath('userData'), 'md-editor-state.db')` — hardcoded, no override hook
- `getJsonStorePath()` → `path.join(app.getPath('userData'), 'md-editor-state.json')` — same
- Images saved to `app.getPath('documents')/MDEditor Images` (line 411)
- SQLite via `node:sqlite` (built-in Node 22+, via Electron 42)

**App component** (`src/App.tsx`):
- Root element: `<main className={`app ${theme === 'dark' ? 'dark-theme' : 'light-theme'}`}>` at line 1481-1483
- Header: `<header className="appHeader">` at line 1484
- Theme switch: `<div className="themeSwitch segmentedSwitch" role="group" aria-label="Theme">` at lines 1652-1670; children are plain `<button>Light</button>` and `<button>Dark</button>` with NO aria-label or data-testid
- Locale switch: `<div className="localeSwitch segmentedSwitch" role="group" aria-label="Language">` at lines 1671-1690; buttons ES / US — no aria-label, no data-testid
- View-mode switch: `<div className="modeSwitch segmentedSwitch" role="group" aria-label="View mode">` at lines 1691-1717; buttons "Editor", ".md", "Preview" — no data-testid
- New button: `aria-label={actionLabels.create}` where `actionLabels.create` is locale-dependent ("Nuevo archivo" / "New file") — at lines 1487-1495
- Open button: `aria-label={actionLabels.open}` locale-dependent at line 1500
- Save button: `aria-label={actionLabels.save}` locale-dependent at lines 1506-1513
- Editor region: `<div className="editorWrap">` wrapping MDXEditor — no data-testid. MDXEditor has `className="editor"`.
- Source textarea: `<textarea className="sourceEditor">` at line 1958
- Preview section: `<aside className="previewWrap fullPreview">` at line 1967
- Workspace: `<section className="workspace">` at line 1720
- Loading overlay: `<div className="loadingOverlay" aria-label="Loading...">` at lines 2102-2112

**MDXEditor timing** (`src/App.tsx:720-735`):
- After mount and document load, markdown is injected via DOUBLE requestAnimationFrame: `raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => { editorRef.current?.setMarkdown(content); }) })`
- `isLoadingLatest` state is `true` on init until `loadLatestDocument` completes (line 508, set false at line 710)
- `loadingOverlay` is shown while `isLoadingLatest || isLoadingDocument` (line 2102)
- Tests MUST wait for loading overlay to disappear before asserting editor content

**createNewDocument** (`src/App.tsx:1196-1216`):
- Calls `persistLatestDocument`, then sets markdown to `''`, calls `editorRef.current?.setMarkdown('')`, generates a new untitled filename with timestamp, sets `isEditingFileName(true)` — activates filename input

## Affected Areas
- `electron/main.cjs` — needs a small test hook: read `MDEDITOR_USER_DATA` env var to call `app.setPath('userData', ...)` BEFORE `app.whenReady()`
- `src/App.tsx` — needs `data-testid` attributes on key regions (workspace, editor wrap, source editor, preview, header) so the redesign can preserve them
- `package.json` — add `@playwright/test` devDep, `test:e2e` script
- New file: `playwright.config.ts` (testDir: `e2e/`, no browser projects)
- New directory: `e2e/` with test files

## Launch Strategy Options

| Approach | Pros | Cons | Effort |
|---|---|---|---|
| A: prod build (`bun run build` → `_electron.launch`) | No dev server needed, tests real build, closer to production | Build step slow (~10-20s), rebuilds needed on changes | Medium |
| B: Vite dev server (`bun run dev:renderer` then launch with `VITE_DEV_SERVER_URL`) | Fast iteration, no build step | Two processes to coordinate, Vite startup adds time | Medium |
| C: prod build, pre-built | Run build once, multiple test runs fast | Stale if code changes between test runs | Low (after first) |

**Recommendation: Option A (prod build)**. For a safety-net set (~5-7 tests), run `bun run build` in a `globalSetup` then `_electron.launch({ args: [path.join(__dirname, '..', 'electron', 'main.cjs')] })` (or `args: ['.']` from project root). The dev server approach introduces a second process and potential race conditions. For a pre-UI-redesign safety net run once before the redesign, Option A is the cleanest.

## State Isolation Approach

`electron/main.cjs` currently has NO env-var hook for userData. `app.setPath()` MUST be called before the app is ready. The only way to do this without modifying main.cjs is via `app.commandLine.appendSwitch` — but Playwright launches the process, it can't call Electron APIs before ready.

**Required hook in main.cjs** — add near the top (before `app.whenReady()`):
```js
// Test isolation: allow override of userData path
const testUserData = process.env.MDEDITOR_USER_DATA;
if (testUserData) {
  app.setPath('userData', testUserData);
}
```
Playwright test then passes: `_electron.launch({ env: { ...process.env, MDEDITOR_USER_DATA: os.tmpdir() + '/mdeditor-test-' + Date.now() } })`

This requires a 2-line addition to main.cjs. Alternative (no code change) would be the `--user-data-dir` Chromium flag but that only affects the Chrome profile, not `app.getPath('userData')` for Electron's Node side. The env var hook is minimal and correct.

## Selector Strategy

Current selectors (before redesign):
- Root: `main.app.dark-theme` / `main.app.light-theme` — stable for theme assertion
- Header: `.appHeader` — fragile to redesign
- Theme group: `[role="group"][aria-label="Theme"]` — stable (aria)
- Theme Dark btn: `[role="group"][aria-label="Theme"] button:has-text("Dark")` — stable
- Theme Light btn: `[role="group"][aria-label="Theme"] button:has-text("Light")` — stable
- View mode group: `[role="group"][aria-label="View mode"]` — stable (aria)
- View mode buttons: `[role="group"][aria-label="View mode"] button:has-text("Editor")` etc. — stable
- New button: `[aria-label="New file"]` (EN) — but locale starts as `'es'` (line 495), so actual label is "Nuevo archivo". Use `[data-testid="btn-new"]` instead.
- Save button: same locale problem — use `data-testid`
- Editor wrap: add `data-testid="editor-wrap"` to `<div className="editorWrap">`
- Source textarea: add `data-testid="source-editor"` or use `textarea.sourceEditor`
- Preview region: add `data-testid="preview-wrap"` or use `aside.previewWrap`
- Loading overlay: `[aria-label="Loading..."]` or `[aria-label="Cargando..."]` — locale-dependent; use `.loadingOverlay` class

**Suggested data-testid additions for the redesign to preserve:**
- `data-testid="app-root"` on the `<main>` element (replaces `main.app`)
- `data-testid="app-header"` on the header region
- `data-testid="editor-wrap"` on the editor div
- `data-testid="source-editor"` on the textarea
- `data-testid="preview-wrap"` on the preview aside
- `data-testid="workspace"` on `<section className="workspace">`
- `data-testid="btn-new"`, `data-testid="btn-open"`, `data-testid="btn-save"` on action buttons

## Playwright + Electron + Windows Details

- Package needed: `@playwright/test` (includes `_electron` API as of Playwright 1.9+). No separate package.
- Electron launch in Playwright: `const { _electron: electron } = require('@playwright/test')` — then `electron.launch({ args: ['electron/main.cjs'] })` or `args: ['.']` (uses `main` from package.json)
- Bun compatibility: Playwright's test runner runs on Node.js. Under bun, `bun test` does NOT run Playwright. Must run via `node node_modules/.bin/playwright test` or `npx playwright test`. Add a dedicated script: `"test:e2e": "playwright test"` (bun will shell out to node for this). Confirmed working pattern for bun + Playwright on Electron.
- `playwright.config.ts`: set `testDir: './e2e'`, no `projects` array (Electron only, no browser contexts), `timeout: 30000`, `globalSetup` for build step.
- `tsconfig` needs to include `e2e/**/*.ts` if using TypeScript for test files.

## Proposed devDeps and Scripts

devDependencies to add:
- `"@playwright/test": "^1.45.0"` (or latest — includes `_electron`)

Scripts to add:
- `"test:e2e": "playwright test"` — runs the e2e suite via Node
- `"test:e2e:build": "bun run build && playwright test"` — full build + run (for CI or before-redesign gate)

No `playwright install` needed for Electron (no separate browser binary required).

## Target E2E Flows (~5-7 tests)

1. **App launches and renders header + workspace** — wait for loading overlay to disappear, assert `[data-testid="app-header"]` visible and `[data-testid="workspace"]` visible
2. **Theme toggle: Dark → Light applies class** — click `[aria-label="Theme"] button:has-text("Light")`, assert `main.app` has class `light-theme` and not `dark-theme`
3. **Theme toggle: Light → Dark applies class** — inverse of above
4. **View-mode switch to .md shows source textarea** — click `.md` button in view-mode group, assert `[data-testid="source-editor"]` / `textarea.sourceEditor` is visible, editor-wrap is NOT visible
5. **View-mode switch to Preview shows preview region** — click "Preview", assert `aside.previewWrap` visible
6. **View-mode switch back to Editor shows editor** — click "Editor", assert editor-wrap visible, textarea not visible
7. **New document clears editor and activates filename input** — wait for app ready, click `[data-testid="btn-new"]`, assert filename input visible (isEditingFileName = true state)

Optional (if stable enough): typing in the source editor while in .md mode updates visible content.

## Risks

1. **Electron + bun runner**: `bun test` does NOT invoke Playwright. Must use `node`/`npx`. Script must be explicit: `playwright test` (bun will exec it through node). LOW risk once documented.
2. **mainWindow.maximize()** (main.cjs:379): Window starts maximized. This is fine for Playwright. No action needed, but note that screenshot tests would be screen-resolution-dependent — avoided since we're not doing visual tests.
3. **autoHideMenuBar** (main.cjs:370): No impact on test selectors.
4. **SQLite native module**: `node:sqlite` is a Node.js built-in (requires Node 22.5+). Electron 42 bundles its own Node runtime, so this runs in the Electron process, not the test runner. The isolation env-var approach sidesteps pollution completely.
5. **MDXEditor double-RAF timing**: Tests MUST `await page.waitForSelector('.loadingOverlay', { state: 'hidden' })` before asserting editor content. Missing this will cause flaky tests.
6. **Locale default is 'es'**: The app starts in Spanish (`useState<Locale>('es')` at App.tsx:495). aria-labels for New/Open/Save are locale-dependent. Use `data-testid` for those buttons to avoid locale coupling in selectors.
7. **IPC on first load**: `loadLatestDocument` reads from SQLite. With a fresh tmpdir, it returns null and the editor shows empty content. This is the correct isolated baseline.
8. **Build step latency**: `bun run build` takes ~10-20s. Acceptable for a safety-net set.
9. **Windows path handling**: `_electron.launch({ args: ['electron/main.cjs'] })` uses forward-slash paths — works on Windows with Playwright's Node child_process.
10. **MDXEditor internal DOM**: The rich editor's internals (CodeMirror, Lexical) are complex. Tests should NOT assert on MDXEditor's internal DOM. Only assert on the outer wrapper visibility and the textarea in source mode.

## Ready for Proposal
Yes — enough context to propose. The main decision is whether to add the 2-line test hook to main.cjs (recommended yes) and which data-testid attributes to add to App.tsx (small, mechanical, resilient).
