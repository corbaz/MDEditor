# Proposal: Add a Playwright E2E behavioral safety net before the UI redesign

Add `@playwright/test` (Electron mode) and ~7 redesign-resilient functional E2E tests so the upcoming Holy Grail + Neumorphic UI redesign (`ui-holy-grail-neumorphic`) lands against an automated behavioral net. The 114 Vitest unit tests only cover `src/lib` pure helpers — none of the actual UI. These E2E tests pin current end-user BEHAVIOR (launch, theme toggle, view-mode switching, new document) so the redesign can change pixels freely while we detect functional regressions.

## Intent

| Question | Answer |
|----------|--------|
| What problem | The UI has zero automated coverage. A large visual redesign is about to start with no way to detect if it breaks core behavior (theming, view modes, document lifecycle). |
| Why now | The net must exist BEFORE the redesign, not after — its whole value is catching regressions the redesign introduces. Writing it after would mean asserting on already-changed code. |
| What success looks like | `bun run test:e2e` launches the built Electron app and all ~7 tests pass on Windows; the 114 Vitest unit tests stay green; `data-testid` hooks are documented as a contract the redesign MUST preserve. |

These are BEHAVIORAL tests, not pixel snapshots. They assert what the user can do, not how it looks — so they survive a visual redesign by design.

## Scope

### In scope

- Add `@playwright/test` as a devDependency (bundles the `_electron` API — no separate browser binary).
- Add npm scripts: `"test:e2e": "playwright test"` and `"test:e2e:build": "bun run build && playwright test"`.
- Add `playwright.config.ts` (`testDir: ./e2e`, no browser `projects`, `globalSetup` that runs `bun run build` once per suite, `timeout: 30000`).
- Include `e2e/**/*.ts` in the TypeScript config.
- Add a minimal, env-gated test-isolation hook to `electron/main.cjs` (before `app.whenReady()`) so tests use a temp `userData` dir and never touch the real profile / SQLite / images.
- Add 8 `data-testid` hooks to `src/App.tsx`: `app-root`, `app-header`, `workspace`, `editor-wrap`, `source-editor`, `preview-wrap`, `btn-new`, `btn-save`. Mechanical and non-breaking.
- Write ~7 E2E tests under `e2e/` (enumerated below).

### Out of scope

- NO visual / pixel snapshots (those would break on the redesign — opposite of the goal).
- NO CI wiring (local Windows only for now).
- NO changes to app behavior beyond the `main.cjs` test hook + `data-testid` attributes.
- NO touching `src/lib` (already covered by the 114 Vitest unit tests).

## Approach

### Launch strategy — prod build

Run a real production build, then launch the actual Electron entry point.

- A `globalSetup` runs `bun run build` once per suite.
- Tests launch via `_electron.launch({ args: ['electron/main.cjs'] })`.

Rationale: a dev-server approach needs a second coordinated process (Vite) and introduces races. For a small pre-redesign safety net, building once and testing the real shipped artifact is the cleanest and most representative path.

### State isolation — env-gated userData override

Add to `electron/main.cjs` before `app.whenReady()`:

```js
// Test isolation: allow override of userData path
if (process.env.MDEDITOR_USER_DATA) {
  app.setPath('userData', process.env.MDEDITOR_USER_DATA);
}
```

Tests pass a fresh temp dir per run via `env`. Rationale: `app.setPath('userData', ...)` must run before the app is ready; Playwright launches the process and cannot call Electron APIs early. The Chromium `--user-data-dir` flag only moves the Chrome profile, not Electron's Node-side `app.getPath('userData')` used by the SQLite/JSON store. A 2-line, env-gated hook is the minimal correct mechanism and is inert in production.

This change touches `electron/main.cjs` — the main↔renderer boundary flagged by the project config rule — but only as an additive, environment-gated override with zero effect when the env var is unset.

### Selector strategy — aria where stable, data-testid where locale-bound

| Target | Selector | Why |
|--------|----------|-----|
| Theme / view-mode groups | `role=group` + `aria-label` (already present) | Locale-resilient, redesign-resilient. |
| Theme / view-mode buttons | group selector + `:has-text(...)` | "Light/Dark/Editor/.md/Preview" are stable literals. |
| Action buttons (New, Save) | `data-testid` | aria-labels are locale-dependent and the app defaults to `'es'` ("Nuevo archivo", not "New file"). |
| Structural regions | `data-testid` | `app-root`, `workspace`, `editor-wrap`, `preview-wrap` survive class/markup churn. |
| Loading overlay gate | `.loadingOverlay` class | aria-label is locale-dependent. |

The 8 `data-testid` attributes are a redesign-preserved contract: the redesign may restyle and restructure freely but MUST keep these hooks.

### Timing — always gate on the loading overlay

MDXEditor injects markdown via a double `requestAnimationFrame`, and `isLoadingLatest` stays true until `loadLatestDocument` resolves. Every test MUST wait for `.loadingOverlay` to be hidden before asserting, or it will flake. Tests assert only on the outer editor wrapper and the source textarea — never on MDXEditor's internal CodeMirror/Lexical DOM.

### The ~7 tests

| # | Test | Asserts |
|---|------|---------|
| 1 | App launches, structure renders | `app-header` and `workspace` visible after overlay hidden |
| 2 | Theme Dark → Light | `app-root` gains `light-theme`, loses `dark-theme` |
| 3 | Theme Light → Dark | inverse of #2 |
| 4 | View-mode `.md` | `source-editor` textarea visible, `editor-wrap` hidden |
| 5 | View-mode Preview | `preview-wrap` region visible |
| 6 | View-mode Editor | `editor-wrap` visible, source textarea hidden |
| 7 | New document | clears editor and activates filename edit input |

## Risks

| Risk | Mitigation |
|------|------------|
| MDXEditor double-RAF timing causes flake | Every test gates on `.loadingOverlay` hidden before asserting. |
| Locale default is `'es'` — aria-labels for actions differ | Use `data-testid` for locale-bound action buttons. |
| `bun test` does NOT run the Playwright runner | Dedicated `test:e2e` script (`playwright test`) execs through Node; documented explicitly. |
| `main.cjs` test hook touches the IPC boundary | Additive, env-gated, no-op in production; isolated to a single `if` block. |
| Build latency (~10-20s) | Acceptable for a once-before-redesign safety net; `globalSetup` builds once per suite. |

## Next step

Proceed to `sdd-spec` and `sdd-design` (can run in parallel). Spec captures the behavioral acceptance criteria for the ~7 flows and the `data-testid` contract; design captures the Playwright config, `globalSetup` build flow, and the `main.cjs` isolation hook.
