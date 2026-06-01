# Spec: add-e2e-playwright

**Change**: add-e2e-playwright  
**Status**: draft  
**Date**: 2026-06-01  
**Domains**: e2e-playwright-suite (new), app-testid-contract (new)

---

## Domain 1 — Playwright E2E Suite

### Purpose

Provide a behavioral safety net for the Electron app via ~7 Playwright tests that run against the real production build, asserting behavior (not pixels) so the upcoming UI redesign cannot silently break core user flows.

---

## Requirements

### Requirement: E2E Script Entry Point

`bun run test:e2e` MUST invoke the Playwright test runner via Node (not `bun test`) and execute all tests under `e2e/`. The suite MUST pass in full (~7 tests, 0 failures) on Windows before the UI redesign begins.

`bun run test:e2e:build` MUST first run `bun run build`, then run the Playwright suite. Both scripts MUST be declared in `package.json`.

#### Scenario: Developer runs the E2E suite

- GIVEN the app has been built (dist/ is current)
- WHEN the developer runs `bun run test:e2e`
- THEN Playwright launches, executes all tests in `e2e/`, and exits 0 with all tests passing

#### Scenario: Developer runs the build-then-test script

- GIVEN no prior build exists or an outdated build exists
- WHEN the developer runs `bun run test:e2e:build`
- THEN `bun run build` completes first, then Playwright runs the full suite and exits 0

---

### Requirement: Production Build Launch

The Electron app MUST be launched via `_electron.launch` against `electron/main.cjs` (the built production entry point). A `globalSetup` MUST run `bun run build` exactly once per suite invocation so tests always run against a current build.

Tests MUST NOT launch a Vite dev server.

#### Scenario: globalSetup builds once per suite run

- GIVEN `playwright.config.ts` declares a `globalSetup` module
- WHEN Playwright starts
- THEN the globalSetup executes `bun run build` and completes before any test file runs
- AND each test file launches its own Electron instance against the already-built `dist/`

---

### Requirement: Test Isolation via userData Override

Each test MUST launch a fresh Electron instance with a temporary `userData` directory so tests NEVER read from or write to the real user profile, SQLite database, or saved images.

The isolation MUST be achieved by passing `MDEDITOR_USER_DATA` as an environment variable to `_electron.launch`. The Electron process MUST read this variable and call `app.setPath('userData', ...)` before `app.whenReady()`.

In production (env var unset), behavior MUST be identical to the current baseline — the hook is a no-op.

#### Scenario: Test runs with isolated userData

- GIVEN a test calls `_electron.launch` with `MDEDITOR_USER_DATA` set to a unique temp dir
- WHEN the Electron process starts
- THEN `app.getPath('userData')` returns the injected temp path
- AND the SQLite store and JSON store are created in that temp dir, not in the real profile

#### Scenario: Production launch is unaffected

- GIVEN the app is launched without `MDEDITOR_USER_DATA` set
- WHEN `electron/main.cjs` executes its startup block
- THEN `app.getPath('userData')` returns the default OS-level user data path (no override applied)

---

### Requirement: Loading Gate Before Every Assertion

Every test MUST wait for the `.loadingOverlay` element to reach `state: 'hidden'` before making any behavioral assertion. No test MAY assert on editor content, class state, or element visibility before this gate resolves.

#### Scenario: Test waits for loading overlay

- GIVEN the Electron app has launched and the BrowserWindow is open
- WHEN the test calls `waitForSelector('.loadingOverlay', { state: 'hidden' })`
- THEN the overlay has disappeared and MDXEditor has completed its double-RAF initialization
- AND subsequent assertions on editor state and UI structure are stable

---

### Requirement: Behavioral E2E Scenarios

The suite MUST contain the following 7 behavioral tests. Tests MUST assert behavior, classes, and element visibility — NEVER pixel values, colors, or MDXEditor-internal DOM nodes.

#### Scenario 1: App launches and structural regions render

- GIVEN the Electron app has launched and the loading overlay is hidden
- WHEN the test inspects the window
- THEN `[data-testid="app-header"]` is visible
- AND `[data-testid="workspace"]` is visible

#### Scenario 2: Theme toggle Dark to Light applies class

- GIVEN the app is in dark theme (default on fresh launch)
- AND the loading overlay is hidden
- WHEN the test clicks the "Light" button inside `[role="group"][aria-label="Theme"]`
- THEN `[data-testid="app-root"]` has the CSS class `light-theme`
- AND `[data-testid="app-root"]` does NOT have the CSS class `dark-theme`

#### Scenario 3: Theme toggle Light to Dark applies class

- GIVEN the app has been switched to light theme
- WHEN the test clicks the "Dark" button inside `[role="group"][aria-label="Theme"]`
- THEN `[data-testid="app-root"]` has the CSS class `dark-theme`
- AND `[data-testid="app-root"]` does NOT have the CSS class `light-theme`

#### Scenario 4: View-mode ".md" shows source textarea and hides rich editor

- GIVEN the app is ready and the loading overlay is hidden
- WHEN the test clicks the ".md" button inside `[role="group"][aria-label="View mode"]`
- THEN `[data-testid="source-editor"]` (the `<textarea>`) is visible
- AND `[data-testid="editor-wrap"]` is hidden

#### Scenario 5: View-mode "Preview" shows preview region

- GIVEN the app is ready and the loading overlay is hidden
- WHEN the test clicks the "Preview" button inside `[role="group"][aria-label="View mode"]`
- THEN `[data-testid="preview-wrap"]` is visible

#### Scenario 6: View-mode "Editor" shows rich editor and hides source textarea

- GIVEN the app has been switched away from the rich editor view
- WHEN the test clicks the "Editor" button inside `[role="group"][aria-label="View mode"]`
- THEN `[data-testid="editor-wrap"]` is visible
- AND `[data-testid="source-editor"]` (the `<textarea>`) is hidden

#### Scenario 7: New document clears editor and activates filename edit

- GIVEN the app is ready and the loading overlay is hidden
- WHEN the test clicks `[data-testid="btn-new"]`
- THEN a filename edit input becomes visible (the `isEditingFileName` state is true)
- AND the editor content reflects an empty document

---

### Requirement: Locale-Resilient Selectors

Tests MUST use selectors that do not depend on the app's current locale. Specifically:

- Theme group and buttons MUST be selected via `[role="group"][aria-label="Theme"]` + `:has-text("Light")` / `:has-text("Dark")` (stable English literals).
- View-mode group and buttons MUST be selected via `[role="group"][aria-label="View mode"]` + `:has-text("Editor")` / `:has-text(".md")` / `:has-text("Preview")` (stable literals).
- Action buttons (New, Save) MUST be selected by `data-testid` because their `aria-label` values are locale-dependent (app defaults to `'es'`).
- The loading overlay MUST be selected by `.loadingOverlay` class (its `aria-label` is locale-dependent).

#### Scenario: Theme button click works in any locale

- GIVEN the app is running with its default locale (`'es'`)
- WHEN the test selects the theme group by `[role="group"][aria-label="Theme"]`
- THEN the selector resolves correctly regardless of the surrounding locale context

#### Scenario: Action button click works without aria-label dependency

- GIVEN the app is running with locale `'es'` (button label is "Nuevo archivo")
- WHEN the test clicks `[data-testid="btn-new"]`
- THEN the click is dispatched to the correct button

---

## Domain 2 — App data-testid Contract

### Purpose

Eight `data-testid` attributes on `src/App.tsx` form a stable behavioral hook contract. The upcoming UI redesign MUST preserve all eight hooks even as it restructures markup, renames CSS classes, and changes visual appearance.

---

## Requirements

### Requirement: Eight data-testid Hooks on App.tsx

`src/App.tsx` MUST expose exactly the following `data-testid` attributes on the corresponding structural elements:

| `data-testid` value | Element | Role |
|---|---|---|
| `app-root` | Root container (`<main>`) | Theme class carrier; E2E root anchor |
| `app-header` | Header region (`<header>`) | Structural visibility anchor |
| `workspace` | Main content area (`<section>`) | Structural visibility anchor |
| `editor-wrap` | Rich editor wrapper (`<div>`) | View-mode visibility switch |
| `source-editor` | Source textarea (`<textarea>`) | View-mode visibility switch |
| `preview-wrap` | Preview aside (`<aside>`) | View-mode visibility switch |
| `btn-new` | New document button | Locale-resilient action trigger |
| `btn-save` | Save document button | Locale-resilient action trigger |

#### Scenario: All eight hooks are present in a rendered app

- GIVEN the Electron app has launched and the loading overlay is hidden
- WHEN the test queries for each of the eight `data-testid` values
- THEN all eight elements are found in the DOM (existence check, not visibility check)

---

### Requirement: data-testid Hooks Are Redesign-Preserved

The UI redesign (`ui-holy-grail-neumorphic`) MUST NOT remove, rename, or move any of the eight `data-testid` attributes. Visual changes (CSS class names, markup structure, nesting depth) are permitted provided all eight hooks remain present on functionally equivalent elements.

#### Scenario: Redesign ships without removing a hook

- GIVEN the redesign branch has been applied
- WHEN `bun run test:e2e` runs the full Playwright suite
- THEN all 7 behavioral tests pass (confirming hooks are intact and behavior is preserved)

---

## Domain 3 — Existing Test Stability

### Requirement: Vitest Unit Tests Remain Green

The 114 existing Vitest unit tests under `src/__tests__/` MUST continue to pass after all changes in this work item are applied. Adding `data-testid` attributes and the `electron/main.cjs` env hook MUST NOT break any unit test.

`bun run build` and `bun run lint` MUST also pass without errors or new warnings.

#### Scenario: Unit tests pass after data-testid additions

- GIVEN `data-testid` attributes have been added to `src/App.tsx`
- WHEN `bun run test` (Vitest) is executed
- THEN all 114 tests pass with 0 failures

#### Scenario: Build and lint pass after all changes

- GIVEN all files in scope have been modified (electron/main.cjs, src/App.tsx, package.json, new playwright.config.ts, new e2e/)
- WHEN `bun run build` and `bun run lint` are executed
- THEN both commands exit 0 with no errors
