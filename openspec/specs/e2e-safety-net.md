# Spec: e2e-safety-net

> Persistent capability spec. Records the durable E2E testing contract established by change `add-e2e-playwright` (merged via PR #4).

## Purpose

Define the Playwright (Electron) end-to-end functional safety net. These tests assert **behavior** (classes, visibility, roles) that survives a visual redesign — never pixels, colors, or screenshots. They complement the Vitest unit suite (which covers `src/lib` only, not the UI).

## Runner & Layout

- Runner: `@playwright/test` (Electron mode). Invoked via `bun run test:e2e` (which execs `playwright test` on Node — `bun test` does NOT run Playwright).
- `test:e2e:build` runs `bun run build` first; `globalSetup` (`e2e/global-setup.ts`) builds once per suite so tests launch the freshly built `dist/`.
- Files: `playwright.config.ts` (testDir `./e2e`, `workers: 1`, no browser projects), `e2e/fixtures.ts` (launch helper + teardown), `e2e/app.spec.ts` (the tests).
- Type-checking: `tsconfig.e2e.json` is referenced by the build so `e2e/**/*.ts` is type-checked while keeping production `tsc -b` clean.

## Launch & Isolation

- **Launch (machine-specific):** Playwright's `_electron.launch` does NOT work in this environment (`ELECTRON_RUN_AS_NODE=1` in the bun env makes Electron run as bare Node; Electron 42 + Node 24 rejects `--remote-debugging-port`). The working approach is `child_process.spawn` of Electron loading `electron/main.cjs` + `chromium.connectOverCDP` to attach to the real renderer. Verified to connect to the real app (`window.electronAPI === true`, production `file://` build), not bare Chromium.
- **State isolation:** `electron/main.cjs` honors `process.env.MDEDITOR_USER_DATA` via `app.setPath('userData', ...)` (env-gated, set before `app.whenReady()` and before any `getPath('userData')` read; no-op in production). Each test run uses a fresh temp userData dir; teardown closes the app and removes the dir.
- Every test waits for `.loadingOverlay` to be hidden before asserting (MDXEditor double-RAF readiness).

## data-testid Contract (redesign-preserved)

`src/App.tsx` MUST expose these 8 hooks; any UI redesign MUST preserve them:
`app-root`, `app-header`, `workspace`, `editor-wrap`, `source-editor`, `preview-wrap`, `btn-new`, `btn-save` (the HEADER save, not the preview-pane save).

Theme and view-mode controls are selected via `role="group"` + `aria-label` (locale-resilient); locale-dependent action buttons use `data-testid`.

## Covered Flows (7)

App launches + structural regions render; theme Dark→Light applies class; theme Light→Dark applies class; view-mode `.md` shows the source textarea; view-mode Preview shows the preview region; view-mode Editor shows the rich editor; New activates the filename edit input.
