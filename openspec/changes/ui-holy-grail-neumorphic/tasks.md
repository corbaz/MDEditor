# Tasks: ui-holy-grail-neumorphic (Change 3b)

**Artifact store**: hybrid (this file + engram topic `sdd/ui-holy-grail-neumorphic/tasks`)
**TDD discipline**: make a layout/style change → `bun run test` (114) green → `bun run test:e2e` (7) green → commit.
**Commit convention**: conventional commits, NO AI attribution.

---

## Review Workload Forecast

| Dimension | Estimate |
|-----------|----------|
| Files changed | 3 (src/App.css, src/App.tsx, src/index.css) |
| Estimated changed lines | ~280–350 (CSS-heavy; minimal JSX) |
| 400-line budget risk | **Low** |
| Chained PRs recommended | No — single PR is safe |
| Decision needed before apply | **No** |

Notes:
- App.css currently 692 lines. After deleting 5 `calc(100vh-Npx)` rules and adding ~150 lines of tokens + neumorphic chrome, estimated final size is ~760–800 lines (under the 800 guideline from design §8).
- App.tsx: 2 edits only — delete lines 1648–1653 (fileMeta from header) + insert ~7-line footer block. Net JSX delta ≈ +2 lines.
- index.css: 3-line change (swap `min-height:100%` for `height:100dvh; overflow:hidden`).
- The 3 `calc(100vh-Npx)` occurrences inside `.pdfPreviewModal` / `.pdfPreviewViewport` / PDF iframe are left untouched (fixed overlays, exempt per REQ-LAYOUT-09).

---

## Phase 1 — Grid Layout Shell

> Satisfies: REQ-LAYOUT-01, REQ-LAYOUT-02, REQ-LAYOUT-03, REQ-LAYOUT-04, REQ-LAYOUT-05, REQ-LAYOUT-08, REQ-BUILD-03

### 1.1 Lock html/body/#root (index.css)

**File**: `src/index.css`

- [x] Replace `min-height: 100%` on the `html, body, #root` rule with `height: 100dvh; overflow: hidden`.
- [x] Keep `box-sizing: border-box` and `margin: 0` and `font-family` declarations unchanged.

### 1.2 Convert .app to the Holy Grail grid shell (App.css)

**File**: `src/App.css`

- [x] Add section banner `/* === LAYOUT (Holy Grail) === */` above the `.app` block.
- [x] On `.app`: replace `min-height: 100vh` with `display: grid; grid-template-rows: auto 1fr auto; height: 100dvh; overflow: hidden`.
- [x] On `.app`: change `padding: 20px` to `padding: 16px`. Add `gap: 12px`.
- [x] On `.app`: add iOS safe-area overrides:
  ```
  padding-top: max(16px, env(safe-area-inset-top));
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  ```
  Spanish comment: `/* Respeta notch/home-indicator en iOS */`
- [x] On `.appHeader`: set `margin-bottom: 0` (gap covers spacing now). Spanish comment: `/* El gap del grid reemplaza el margin-bottom */`
- [x] On `.workspace`: add `min-height: 0; overflow: auto`. Spanish comment: `/* ÚNICO contenedor scrolleable — min-height:0 obligatorio en grid */`

### 1.3 Delete calc(100vh-Npx) magic numbers — fill chain (App.css)

**File**: `src/App.css`

- [x] `.editorWrap` (line ~381): replace `min-height: calc(100vh - 96px); flex: 1` with `height: 100%`. Keep all other rules (`background`, `border`, `border-radius`, `overflow`). Spanish comment: `/* height:100% funciona porque .workspace tiene altura resuelta por el grid */`
- [x] `.editor` (line ~388): replace `min-height: calc(100vh - 136px)` with `height: 100%`. Keep `padding: 16px`.
- [x] `.sourceEditor` (line ~437): replace `min-height: calc(100vh - 140px)` with `height: 100%`. Keep all other rules.
- [x] `.previewWrap` (line ~452): replace `min-height: calc(100vh - 96px)` with `height: 100%`. Keep all other rules.
- [x] `.fullPreview` (line ~458): remove `min-height: calc(100vh - 140px)` entirely (rule can remain empty or be dropped). Spanish comment: `/* min-height eliminado — el grid + height:100% de .previewWrap gobiernan */`
- [x] Verify: search App.css for `calc(100vh` — should return zero matches in the shell/editor rules. The three PDF overlay occurrences (`pdfPreviewModal`, `pdfPreviewViewport`, PDF iframe) are position:fixed overlays (REQ-LAYOUT-09) and must remain untouched.

### 1.4 Verify and commit Phase 1

- [x] Run `bun run test` — must report 114 passed, 0 failed.
- [x] Run `bun run test:e2e` — must report 7 passed, 0 failed. (E2E exercises view-mode switching and the workspace region.)
- [x] Visual sanity: start the dev server; confirm editor fills the main row in editor/source/preview modes; confirm header/footer do not scroll.
- [x] Commit:
  ```
  refactor(ui): convert app shell to Holy Grail grid layout
  ```

---

## Phase 2 — StatusBar Footer (JSX)

> Satisfies: REQ-LAYOUT-06, REQ-STATUS-01, REQ-STATUS-02, REQ-STATUS-04, REQ-CONTRACT-01, REQ-CONTRACT-02, REQ-A11Y-04

### 2.1 Remove fileMeta from header (App.tsx)

**File**: `src/App.tsx`

- [x] Delete lines 1648–1653: the `<div className="fileMeta" title={...}>…</div>` block from inside `<header>`.
- [x] Leave all other header children untouched: `<div className="headerLeft">`, theme/locale/mode `segmentedSwitch` groups, all 8 `data-testid` hooks, all 3 `role="group"` / `aria-label` attributes.

### 2.2 Add `<footer>` StatusBar after `</section>` (App.tsx)

**File**: `src/App.tsx`

- [x] After the closing `</section>` tag at line 2000, insert the footer element:
  ```tsx
  <footer className="app-footer" data-testid="app-footer-status">
      <div className="fileMeta" title={folderPath || visibleFolder}>
          <Folder size={13} />
          <span className="fileMetaFolder">{visibleFolder}</span>
          <span>{formatFileSize(currentSizeBytes)}</span>
          <span>{formatSavedAt(lastSavedAt, locale)}</span>
      </div>
  </footer>
  ```
- [x] `data-testid="app-footer-status"` is a NEW additive hook — does not affect any existing testid contract.
- [x] Confirm the existing `pdfPreviewStaging` div (currently line 2002) remains immediately after the new footer — it is a `position:fixed` overlay, unchanged.

### 2.3 Clean up orphaned media-query fileMeta rule (App.css)

**File**: `src/App.css`

- [x] Find the `@media (max-width: 1080px)` rule that sets `.fileMeta { order: 4; flex-basis: 100% }` in the header context. Remove or scope it to `.app-footer .fileMeta` — it becomes a no-op for the header and is harmless but cleaner to remove.

### 2.4 Verify and commit Phase 2

- [x] Run `bun run test` — 114 green.
- [x] Run `bun run test:e2e` — 7 green.
- [x] Visual sanity: footer shows folder · size · saved-at; header does NOT show fileMeta.
- [x] Confirm `data-testid="app-root"`, `"app-header"`, `"workspace"` are still on their correct elements.
- [x] Commit:
  ```
  feat(ui): add StatusBar footer with file metadata
  ```

---

## Phase 3 — Neumorphic Token Layer (CSS only)

> Satisfies: REQ-NM-01, REQ-NM-02, REQ-NM-03

### 3.1 Add token section banner and light-theme tokens (App.css)

**File**: `src/App.css`

- [x] Add section banner `/* === TOKENS (neumórficos — Change 3b) === */` at the very top of App.css, above the existing `.app {` block.
- [x] Inside the existing `.app { … }` block, append the full neumorphic token set (verbatim from design §2):
  - Geometry: `--nm-radius`, `--nm-distance`, `--nm-blur`
  - Surface: `--nm-surface: #e8ecf3`
  - Shadow pair: `--nm-shadow-light: rgba(255,255,255,0.75)`, `--nm-shadow-dark: rgba(163,177,198,0.55)`
  - Accent: `--nm-accent-from`, `--nm-accent-to`, `--nm-accent-gradient`, `--nm-accent-text`
  - Composed shorthands: `--nm-raised`, `--nm-inset`, `--nm-raised-hover`
  - Spanish comments for each group (as in design §2 code block).

### 3.2 Add dark-theme token overrides (App.css)

**File**: `src/App.css`

- [x] Inside the existing `.app.dark-theme { … }` block, append the dark token overrides:
  - `--nm-surface: #1b2230`
  - `--nm-shadow-light: rgba(255,255,255,0.05)`
  - `--nm-shadow-dark: rgba(0,0,0,0.55)`
  - `--nm-accent-text: #0b1020` (unchanged, listed for clarity)
  - Spanish comment: `/* Alphas recalibradas: highlight tenue (5%), sombra profunda (55%) */`

### 3.3 Verify and commit Phase 3

- [x] Run `bun run test` — 114 green (no visual change expected yet, tokens are defined but not applied).
- [x] Run `bun run test:e2e` — 7 green.
- [x] Commit:
  ```
  feat(ui): add neumorphic CSS design tokens (light + dark)
  ```

---

## Phase 4 — Apply Neumorphic Relief to App Chrome (CSS)

> Satisfies: REQ-NM-04, REQ-NM-05, REQ-NM-06, REQ-STATUS-03

### 4.1 Add chrome section banner (App.css)

- [x] Add section banner `/* === CHROME (neumórfico — Change 3b) === */` above the `.appHeader` block.

### 4.2 Style header and footer as raised surfaces (App.css)

**File**: `src/App.css`

- [x] `.appHeader`: add `background: var(--nm-surface); border-radius: var(--nm-radius); box-shadow: var(--nm-raised);`. Remove any existing `border-bottom` if present.
- [x] `.app-footer`: add `background: var(--nm-surface); border-radius: var(--nm-radius); box-shadow: var(--nm-raised); padding: 8px 14px; font-size: 12px; color: var(--app-muted); display: flex; align-items: center; gap: 10px; padding-bottom: max(8px, env(safe-area-inset-bottom));`.
  - Spanish comment: `/* Footer StatusBar: relieve elevado, safe-area iOS */`

### 4.3 Style iconBtn and actionIcon as raised buttons (App.css)

**File**: `src/App.css`

- [x] `.iconBtn`: set `border: 0; background: var(--nm-surface); border-radius: var(--nm-radius); box-shadow: var(--nm-raised);`. Keep `width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:var(--app-text)`. Spanish comment: `/* Botón neumórfico: borde eliminado, relieve lo reemplaza */`
- [x] `.actionIcon`: set `border-radius: var(--nm-radius);`. Keep all other existing properties (`position:relative; width:34px; height:34px; transition:…`).
- [x] `.iconBtn:active, .actionIcon:active`: add `box-shadow: var(--nm-inset); transform: translateY(0);`. Spanish comment: `/* Presionado = hundido */`

### 4.4 Style segmentedSwitch as recessed track with raised active chip (App.css)

**File**: `src/App.css`

- [x] `.segmentedSwitch` track: set `background: var(--nm-surface); box-shadow: var(--nm-inset); border: 0; border-radius: var(--nm-radius);`. Keep `display:inline-flex; gap:4px; padding:4px; overflow:visible`.
- [x] `.segmentedSwitch button` (inactive): set `border: 0; background: transparent; color: var(--app-control-text); padding: 6px 12px; font-size:12px; font-weight:600; border-radius: calc(var(--nm-radius) - 4px); cursor:pointer`.
- [x] `.segmentedSwitch button.active`: set `background: var(--nm-accent-gradient); color: var(--nm-accent-text); box-shadow: var(--nm-raised);`. Spanish comment: `/* Activo = chip con gradiente de acento (más legible que el inset) */`

### 4.5 Style file-history trigger, menu and inputs as recessed (App.css)

**File**: `src/App.css`

- [x] `.fileHistoryTrigger, .fileNameEditor`: add `box-shadow: var(--nm-inset); background: var(--nm-surface); border-radius: var(--nm-radius); border: 0;`. Spanish comment: `/* Campos tipo input: surco hundido */`
- [x] `.fileHistoryMenu`: add `background: var(--nm-surface); box-shadow: var(--nm-raised); border-radius: var(--nm-radius);`. Keep any existing `position`, `z-index`, `overflow` rules.

### 4.6 Optional — styleToolGroup / fontSelect subtle inset (App.css)

- [x] `.styleToolGroup, .fontSelect`: add `box-shadow: var(--nm-inset);` at reduced opacity (or leave as-is if it looks noisy during visual review). Mark as optional polish.

### 4.7 Confirm MDXEditor internals are untouched

- [x] Search App.css for `.editor`, `.mdxeditor`, `[class*='_toolbar']` — confirm none of these have neumorphic `box-shadow`, `--nm-surface` background, or `border-radius` from the new tokens.
- [x] `.previewBody`, `.pdfPreview*`, `.loadingOverlay`, `.spinner` — confirm unchanged.

### 4.8 Verify and commit Phase 4

- [x] Run `bun run test` — 114 green.
- [x] Run `bun run test:e2e` — 7 green.
- [x] Visual sanity: toggle light/dark — chrome shows neumorphic relief in both; editor content area remains clean; active segmented chip shows gradient.
- [x] Commit:
  ```
  style(ui): apply neumorphic relief to app chrome
  ```

---

## Phase 5 — Accessible Focus Outline + Hover Shadow Merge (CSS)

> Satisfies: REQ-A11Y-02, REQ-A11Y-03

### 5.1 Replace box-shadow focus-visible with outline (App.css)

**File**: `src/App.css`

- [x] Locate the current combined rule at App.css ~line 103–108:
  ```css
  .actionIcon:hover,
  .actionIcon:focus-visible {
    transform: translateY(-1px);
    border-color: var(--app-border-soft);
    box-shadow: 0 10px 18px var(--app-shadow);
  }
  ```
- [x] Split it into two separate rules:
  - **Hover only** (`.actionIcon:hover`): `transform: translateY(-1px); box-shadow: var(--nm-raised-hover);` — amplifies relief, does NOT replace it.
  - **Focus-visible group** (new block for all interactive chrome elements):
    ```css
    .iconBtn:focus-visible,
    .actionIcon:focus-visible,
    .segmentedSwitch button:focus-visible,
    .fileHistoryTrigger:focus-visible,
    .fileNameEditor:focus-visible {
      outline: 2px solid var(--nm-accent-from);
      outline-offset: 2px;
    }
    ```
    Spanish comment: `/* Foco accesible: outline independiente del relieve neumórfico */`
- [x] Remove `border-color: var(--app-border-soft)` from the hover rule (border removed from neumorphic buttons; rule is now a no-op but cleaner to drop).
- [x] Confirm `.actionIcon::after` tooltip rule at lines ~133–137 is untouched.

### 5.2 Verify and commit Phase 5

- [x] Run `bun run test` — 114 green.
- [x] Run `bun run test:e2e` — 7 green.
- [x] Visual sanity: Tab through chrome controls — each shows a 2px cyan outline; neumorphic relief is not clobbered.
- [x] Commit:
  ```
  fix(ui): accessible focus outline + amplified hover shadow merge
  ```

---

## Phase 6 — Final Gate (no new code)

> Satisfies: REQ-BUILD-01, REQ-BUILD-02, REQ-BUILD-03, REQ-CONTRACT-03, REQ-CONTRACT-04

### 6.1 Full test and build sweep

- [x] `bun run test` — 114 passed.
- [x] `bun run test:e2e` — 7 passed.
- [x] `bun run build` — exit 0, zero errors.
- [x] `bun run lint` — zero errors (or identical to pre-change baseline).
- [x] Search App.css for `calc(100vh` — must match ONLY the three PDF overlay rules (exempt), zero shell/editor matches.

### 6.2 Spec compliance checklist

- [x] `grid-template-rows: auto 1fr auto` present on `.app` in App.css.
- [x] `height: 100dvh` on `.app`, `html, body, #root`.
- [x] No `min-height: 100vh` on `.app`.
- [x] `overflow: auto; min-height: 0` on `.workspace`.
- [x] Zero `calc(100vh - Npx)` in `.editorWrap`, `.editor`, `.sourceEditor`, `.previewWrap`, `.fullPreview`.
- [x] All 8 `data-testid` hooks present in rendered JSX (grep App.tsx).
- [x] All 3 `role="group"` + `aria-label` groups present in App.tsx.
- [x] `<footer className="app-footer">` exists in App.tsx after `</section>`.
- [x] fileMeta block NOT present inside `<header>` in App.tsx.
- [x] All 8 neumorphic tokens present on `.app` and `.app.dark-theme`.
- [x] `.editor` and MDXEditor internals have no `--nm-*` rules.

### 6.3 No additional commit

Phase 6 produces no commit — it is the acceptance gate before the PR is opened.

---

## Dependency graph and parallelism

```
Phase 1 (grid shell)
  └── Phase 2 (JSX footer)           ← sequential: footer CSS uses .app-footer which needs the grid row
        └── Phase 3 (tokens)         ← sequential: tokens must exist before chrome rules reference them
              └── Phase 4 (chrome)   ← sequential: depends on Phase 3 tokens
                    └── Phase 5 (focus/hover)  ← sequential: replaces the focus rule written in Phase 4
                          └── Phase 6 (final gate)
```

All phases are strictly sequential. No parallel execution risk. Each phase ends with both test suites green, giving an independent rollback boundary at every commit.

---

## Commit story (in order)

| # | Commit message | Phase |
|---|----------------|-------|
| 1 | `refactor(ui): convert app shell to Holy Grail grid layout` | Phase 1 |
| 2 | `feat(ui): add StatusBar footer with file metadata` | Phase 2 |
| 3 | `feat(ui): add neumorphic CSS design tokens (light + dark)` | Phase 3 |
| 4 | `style(ui): apply neumorphic relief to app chrome` | Phase 4 |
| 5 | `fix(ui): accessible focus outline + amplified hover shadow merge` | Phase 5 |

Five work-unit commits, one PR. Estimated diff: ~280–350 lines changed. Under the 400-line budget.
