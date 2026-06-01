# Archive Report: add-e2e-playwright

- **Change**: `add-e2e-playwright`
- **Status**: ARCHIVED & CLOSED
- **Delivery**: single PR #4 (squash `e72b679`), 6 work-unit commits
- **Verdict**: GO — merged to main

## What shipped

A Playwright (Electron) E2E functional safety net before the UI redesign:

- `@playwright/test` + `playwright.config.ts` + `tsconfig.e2e.json` (keeps `tsc -b` clean) + `test:e2e` / `test:e2e:build` scripts.
- Env-gated `MDEDITOR_USER_DATA` → `app.setPath('userData')` hook in `electron/main.cjs` (no-op in production) for test state isolation.
- 8 `data-testid` hooks in `src/App.tsx` as a redesign-preserved contract.
- `e2e/global-setup.ts` (builds once), `e2e/fixtures.ts` (launch + teardown), `e2e/app.spec.ts` (7 behavioral tests).

## Verification (fresh adversarial verify — GO)

- `bun run test:e2e`: 7/7 passing on two consecutive runs (no flakiness).
- `bun run test`: 114/114 unit tests green.
- `bun run build`: exit 0. `bun run lint`: 0 errors / 0 warnings.
- Behavioral assertions only (classes/visibility/roles); zero pixel/color/screenshot.

## Key deviation (validated)

The design assumed Playwright `_electron.launch`. It does NOT work in this environment (`ELECTRON_RUN_AS_NODE=1` in the bun env; Electron 42 + Node 24 rejects `--remote-debugging-port`). The shipped approach is `child_process.spawn` (Electron loading `electron/main.cjs`) + `chromium.connectOverCDP`. The verify phase empirically proved it attaches to the REAL Electron app: `window.electronAPI === true` (impossible in bare Chromium) and `page.url()` is the production `file://` build. `workers: 1` + auto-assigned debug port (parsed from stderr) avoids races. Teardown leaves zero orphaned processes. Documented in `e2e/fixtures.ts`.

> Doc drift (acceptable): `design.md`/`spec.md` still describe `_electron.launch`; the real CDP approach is captured in `verify-report.md`, this report, and `fixtures.ts`. The durable capability spec `openspec/specs/e2e-safety-net.md` records the CDP approach as the source of truth.

## Incidents

- Apply left ~26 leaked `mdeditor-e2e-*` temp dirs from debugging (not from passing runs); purged during archive. Teardown is correct for normal runs.
- An extra commit `8b09ed4` added `test-results`/`playwright-report` to `.gitignore` (hygiene).

## Handoff to Change 3b (UI redesign)

The Holy Grail + Neumorphic redesign (`ui-holy-grail-neumorphic`, already explored) now has an automated behavioral net. The redesign MUST preserve the 8 `data-testid` hooks and the `role`+`aria-label` groups so these tests keep passing.
