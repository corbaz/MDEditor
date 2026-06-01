# Verify Report: add-e2e-playwright

**Change**: add-e2e-playwright
**Date**: 2026-06-01
**Branch**: feat/add-e2e-playwright (7 commits, clean working tree, unpushed)
**Reviewer**: fresh adversarial verify (did not trust prior reports — re-ran all commands and read all files)

---

## VERDICT: GO

Open the PR. 0 CRITICAL, 1 WARNING, 2 SUGGESTION. All blocking criteria met.

**Executive summary**: 7/7 E2E tests pass on two consecutive runs with no flakiness; 114/114 unit tests green; build and lint clean; the non-standard CDP+spawn workaround was empirically proven to attach to the real Electron app (not a bare-Chromium false positive); teardown leaves zero orphaned processes.

---

## Command results (verbatim)

### `bun run test:e2e` — RUN 1
```
Running 7 tests using 1 worker

  ok 1 e2e\app.spec.ts:7:1  > 1 — app launches and structural regions render (853ms)
  ok 2 e2e\app.spec.ts:12:1 > 2 — theme Dark to Light applies class (899ms)
  ok 3 e2e\app.spec.ts:21:1 > 3 — theme Light to Dark applies class (958ms)
  ok 4 e2e\app.spec.ts:31:1 > 4 — view-mode .md shows source textarea and hides rich editor (825ms)
  ok 5 e2e\app.spec.ts:38:1 > 5 — view-mode Preview shows preview region (829ms)
  ok 6 e2e\app.spec.ts:44:1 > 6 — view-mode Editor shows rich editor and hides source textarea (1.0s)
  ok 7 e2e\app.spec.ts:54:1 > 7 — New document activates filename edit input (905ms)

  7 passed (11.8s)
```
Exit 0.

### `bun run test:e2e` — RUN 2 (flakiness check)
```
Running 7 tests using 1 worker

  ok 1 e2e\app.spec.ts:7:1  > 1 — app launches and structural regions render (893ms)
  ok 2 e2e\app.spec.ts:12:1 > 2 — theme Dark to Light applies class (911ms)
  ok 3 e2e\app.spec.ts:21:1 > 3 — theme Light to Dark applies class (958ms)
  ok 4 e2e\app.spec.ts:31:1 > 4 — view-mode .md shows source textarea and hides rich editor (799ms)
  ok 5 e2e\app.spec.ts:38:1 > 5 — view-mode Preview shows preview region (955ms)
  ok 6 e2e\app.spec.ts:44:1 > 6 — view-mode Editor shows rich editor and hides source textarea (998ms)
  ok 7 e2e\app.spec.ts:54:1 > 7 — New document activates filename edit input (1.0s)

  7 passed (11.9s)
```
Exit 0. Near-identical timings to run 1 → no flakiness.

### Other gates
| Command | Result |
|---|---|
| `bun run build` | exit 0 (built in 1.27s; pre-existing chunk-size info note only) |
| `bun run lint` | exit 0, 0 errors, 0 warnings |
| `bun run test` | 114/114 Vitest pass |
| `git status` | clean |

---

## CDP+spawn workaround — explicit judgment: SOUND

The apply DEVIATED from the design. Design mandated Playwright's `_electron.launch`; the apply
used `child_process.spawn` + `chromium.connectOverCDP` because `ELECTRON_RUN_AS_NODE=1` is set in
the bun test-runner environment and, combined with Electron 42 / Node 24, breaks `_electron.launch`.

I scrutinized this hard and **proved it is not a liability**:

1. **It tests the REAL Electron app, not bare Chromium.** I wrote a throwaway probe test:
   - `window.electronAPI` evaluated to `true` in the renderer → the preload `contextBridge` ran.
     This is IMPOSSIBLE in a bare Chromium context (no preload, no IPC bridge). Decisive disproof
     of the false-positive concern.
   - `page.url()` was `file:///C:/www/MDEditor/dist/index.html` → the actual production build served
     by `main.cjs` `loadFile`, not a dev server or `about:blank`.
   (Probe removed after verification; working tree restored byte-identical.)

2. **The spawned process is full Electron loading main.cjs.** `electronBin` resolves via
   `require('electron')`; args are `['--remote-debugging-port=0', '.']` where `.` resolves through
   `package.json` `"main": "electron/main.cjs"`. `ELECTRON_RUN_AS_NODE` is explicitly deleted from
   the child env so Electron runs in full context. Confirmed by the probe loading dist/index.html.

3. **Port handling is robust.** `--remote-debugging-port=0` auto-assigns a free port and the actual
   URL is parsed from the `DevTools listening on ws://...` stderr line. This is MORE robust than a
   fixed port (zero collision risk). `workers: 1` + `fullyParallel: false` guarantee a single
   Electron instance at a time, so no port race across workers.

4. **Teardown is correct.** After both runs, `tasklist | grep electron.exe` = 0 orphans. No new
   `mdeditor-e2e-*` temp dirs were created by the verify runs (the ~26 pre-existing ones in %TEMP%
   all predate the runs — they are apply-phase debugging residue). `app.close()` + `process.kill()`
   + `rmSync` work as designed.

5. **Isolation honored.** `main.cjs` reads `MDEDITOR_USER_DATA` and calls `app.setPath('userData')`
   before any `getPath('userData')` and before `whenReady`; each test gets a fresh `mkdtempSync` dir.

---

## Contract conformance

### Eight data-testid hooks (src/App.tsx)
| testid | Line | Element | OK |
|---|---|---|---|
| app-root | 1483 | `<main>` | yes |
| app-header | 1485 | `<header className="appHeader">` | yes |
| btn-new | 1494 | New button | yes |
| btn-save | 1513 | HEADER save (`onClick=saveToDevice`), NOT preview-pane | yes |
| workspace | 1723 | `<section className="workspace">` | yes |
| editor-wrap | 1725 | `<div className="editorWrap">` | yes |
| source-editor | 1966 | `<textarea>` | yes |
| preview-wrap | 1971 | `<aside className="previewWrap fullPreview">` | yes |

`btn-save` is correctly on the header save. The preview-pane save (line 1976) correctly has NO
testid. `btn-open` correctly absent (design D8).

### main.cjs isolation hook (lines 12–14)
Env-gated `if (process.env.MDEDITOR_USER_DATA) app.setPath('userData', ...)`, placed after the
require block, before `getStorePath()` (line 52) and `app.whenReady()`. No-op in production. Correct.

### Tests are behavioral, not visual
Assertions are on CSS classes (`light-theme`/`dark-theme`), visibility (`toBeVisible`/`toBeHidden`),
and `input.fileNameEditor`. NO pixel, color, screenshot, or MDXEditor-internal DOM assertions.

### tsconfig.e2e.json type-checking
PROVEN in the build graph: injecting `const x: number = "string"` into `app.spec.ts` made
`tsc -b` fail with TS2322 (exit 2). e2e files are genuinely type-checked by `bun run build`.

### playwright.config.ts
`testDir: ./e2e`, no `projects`, `workers: 1`, `fullyParallel: false`, `globalSetup` wired,
`trace: retain-on-failure`. Conforms.

---

## Findings

### CRITICAL
None.

### WARNING
- **W1 — Leaked temp dirs from apply-phase debugging.** ~26 `mdeditor-e2e-*` dirs sit in `%TEMP%`,
  all timestamped <= 13:45 (apply-phase debugging when `_electron.launch` was crashing before
  `rmSync` could run). The current passing teardown does NOT leak (verify runs at 14:04+ created
  zero new dirs). Non-blocking; purge once manually. If a future run crashes before teardown,
  dirs will accumulate again — acceptable for temp-dir scratch space.

### SUGGESTION
- **S1 — Docs describe the rejected approach.** `design.md` and `spec.md` still describe
  `_electron.launch`, but the shipped code uses CDP+spawn. Update the docs to match reality so a
  future reader is not misled. (Functionally the `args` difference — `['electron/main.cjs']` vs
  `['--remote-debugging-port=0', '.']` — is equivalent and proven.)
- **S2 — One extra unplanned commit.** `8b09ed4 chore(e2e): gitignore playwright artifacts` is
  beyond the 5 planned WUs. Good hygiene, just note it in the PR description.

---

## Next recommended

`sdd-archive` (clean — no CRITICAL issues block archive).
