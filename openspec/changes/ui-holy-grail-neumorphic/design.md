# Design: ui-holy-grail-neumorphic (Change 3b)

Restructure the MD Editor shell into a true CSS-grid Holy Grail layout (header / scrolling main / footer status bar) and layer a Neumorphic design system on the app CHROME ONLY, integrated with the existing light/dark theme vars and a cyan→purple accent gradient. No logic changes. All E2E (8 testids + 3 aria groups) and unit contracts preserved.

## Quick path (what the implementer does)

1. Add a Neumorphic + layout **token layer** at the top of `src/App.css` (custom properties for both themes).
2. Convert `.app` into the grid shell (`.app` = `.app-layout`): `grid-template-rows: auto 1fr auto; height: 100dvh; overflow: hidden`.
3. Make `.workspace` the scrolling Main (`overflow: auto; min-height: 0`) and fill children with `height: 100%`, deleting every `calc(100vh - Npx)`.
4. Add a `<footer className="app-footer">` StatusBar inside the root and MOVE `.fileMeta` content into it.
5. Apply `--nm-raised` (resting) / `--nm-inset` (active/pressed) to chrome selectors; leave MDXEditor internals untouched.
6. Replace the `box-shadow` focus on `.actionIcon:focus-visible` with an `outline`; merge hover into the raised shadow.
7. `index.css`: lock `html, body, #root` to `height: 100dvh; overflow: hidden`.

---

## 1. Architecture approach

| Decision | Choice |
|----------|--------|
| Layout pattern | CSS Grid Holy Grail. The existing `<main className="app">` (which carries `data-testid="app-root"`) becomes the **grid shell**. Three rows: `auto 1fr auto`. |
| Scroll model | Page never scrolls. Only the Main row scrolls (`overflow: auto` + `min-height: 0`). Header and footer are pinned by the grid, not `position: fixed` — simpler, no z-index/overlap bugs, no layout shift. |
| Neumorphism scope | Chrome only (header, footer, icon buttons, segmented switches, file-history menu, file-history trigger). MDXEditor / CodeMirror / Radix internals stay clean because we do not own their DOM. |
| Token strategy | A neumorphic layer *composed from* the existing `--app-*` vars. Light and dark get **separately calibrated** shadow alphas (dark neumorphism dies if you reuse light alphas). |
| Accent | A single `--nm-accent-gradient` (cyan→purple) used for active segmented buttons and the focus outline color. |
| File organization | **Keep one `App.css` file** for this change (see §8). Split deferred to 3c. |
| React adaptation | Reference HTML used DOM IDs (`#LAYOUT/#HEADER/#MAIN/#FOOTER`). In React those become CSS **classes** on existing semantic elements. No unique IDs added. |

### Component / DOM map (after change)

```
<main class="app app-layout" data-testid="app-root">      ← grid shell (rows: auto 1fr auto)
  <header class="appHeader" data-testid="app-header">      ← row 1 (auto)  · neumorphic raised
  <section class="workspace" data-testid="workspace">      ← row 2 (1fr)   · the ONLY scroll container
       editorWrap | source-editor | preview-wrap          ← height:100%
  <footer class="app-footer">                              ← row 3 (auto)  · neumorphic raised · StatusBar
       fileMeta content (folder · size · saved-at)
  (overlays: pdfPreviewStaging, pdfPreviewOverlay, hiddenFileInput, loadingOverlay — unchanged, position:fixed)
```

Data flow is unchanged — this is purely presentational. `fileMeta` props (`folderPath`, `visibleFolder`, `currentSizeBytes`, `lastSavedAt`, `locale`) simply render in the footer instead of the header.

---

## 2. Token layer (copy-ready — paste at TOP of App.css, inside `.app` and `.app.dark-theme`)

```css
/* ============================================================
   Neumorphic + layout token layer (Change 3b)
   Se compone a partir de los --app-* existentes.
   Light y dark calibran las alphas de sombra por separado.
   ============================================================ */
.app {
  /* --- tokens existentes (--app-bg, --app-surface, etc.) se mantienen --- */

  /* Geometría neumórfica (compartida entre temas) */
  --nm-radius: 12px;        /* radio de las piezas de chrome */
  --nm-distance: 5px;       /* desplazamiento de la sombra */
  --nm-blur: 12px;          /* difuminado de la sombra */

  /* Superficie neumórfica: un peldaño POR DEBAJO del fondo plano para
     que el relieve se lea. En claro el fondo de la app es #f3f4f6. */
  --nm-surface: #e8ecf3;

  /* Pareja de sombras (claro): luz arriba-izquierda, sombra abajo-derecha */
  --nm-shadow-light: rgba(255, 255, 255, 0.75);
  --nm-shadow-dark: rgba(163, 177, 198, 0.55);

  /* Acento cyan -> purple */
  --nm-accent-from: #22d3ee;
  --nm-accent-to: #a78bfa;
  --nm-accent-gradient: linear-gradient(135deg, var(--nm-accent-from), var(--nm-accent-to));
  /* Texto sobre el gradiente: slate-950, contraste AA sobre cyan y purple */
  --nm-accent-text: #0b1020;

  /* Sombras compuestas (no editar aquí: derivan de las variables de arriba) */
  --nm-raised:
     var(--nm-distance) var(--nm-distance) var(--nm-blur) var(--nm-shadow-dark),
     calc(var(--nm-distance) * -1) calc(var(--nm-distance) * -1) var(--nm-blur) var(--nm-shadow-light);
  --nm-inset:
     inset var(--nm-distance) var(--nm-distance) var(--nm-blur) var(--nm-shadow-dark),
     inset calc(var(--nm-distance) * -1) calc(var(--nm-distance) * -1) var(--nm-blur) var(--nm-shadow-light);
  /* Variante hover: relieve amplificado (NO reemplaza, suma intensidad) */
  --nm-raised-hover:
     calc(var(--nm-distance) + 2px) calc(var(--nm-distance) + 2px) calc(var(--nm-blur) + 4px) var(--nm-shadow-dark),
     calc((var(--nm-distance) + 2px) * -1) calc((var(--nm-distance) + 2px) * -1) calc(var(--nm-blur) + 4px) var(--nm-shadow-light);
}

.app.dark-theme {
  /* --- tokens existentes se mantienen --- */

  /* Superficie neumórfica oscura: por encima del baseBase para tener relieve.
     Fondo plano oscuro es #0f172a; la superficie de chrome sube a ~#1b2230. */
  --nm-surface: #1b2230;

  /* Pareja de sombras (oscuro): alphas recalibradas.
     El highlight es tenue (5%) y la sombra profunda (50%) para que el
     relieve sea visible sin halos lechosos. */
  --nm-shadow-light: rgba(255, 255, 255, 0.05);
  --nm-shadow-dark: rgba(0, 0, 0, 0.55);

  /* El acento y su texto se mantienen: el gradiente cyan->purple ya
     contrasta sobre texto slate-950 en ambos temas. */
  --nm-accent-text: #0b1020;
}
```

**Calibration notes**
- Light surface `#e8ecf3` sits one step below `--app-bg #f3f4f6`, so the raised pieces visibly pop. The classic blue-grey shadow `rgba(163,177,198,…)` reads as a soft drop, not pure black.
- Dark: a pure-black 55% shadow plus a 5% white highlight is the only combo that reads as relief on `#0f172a`; higher white alphas look like dirty halos.
- `--nm-accent-text #0b1020` over the gradient: contrast is **≈ 8.9:1 over cyan #22d3ee** and **≈ 5.6:1 over purple #a78bfa** — both clear WCAG AA (and AA-large/AAA on the cyan end). Verify the purple end at small text during apply; if it dips, darken the gradient `--nm-accent-to` to `#8b5cf6`.

---

## 3. Layout CSS (copy-ready)

### index.css

```css
* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  height: 100dvh;       /* shell ocupa exactamente el viewport dinámico (iOS) */
  overflow: hidden;     /* nada scrollea a nivel página; solo el Main */
  font-family: Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
}
```

### App.css — shell + regions

```css
/* Shell Holy Grail: header (auto) / main (1fr) / footer (auto) */
.app {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100dvh;
  overflow: hidden;
  padding: 16px;               /* sustituye al padding:20px previo */
  gap: 12px;
  background: var(--app-bg);
  color: var(--app-text);
  /* iOS safe-area: respeta notch/home-indicator sin romper el grid */
  padding-top: max(16px, env(safe-area-inset-top));
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  /* OJO: se elimina min-height:100vh — el grid ya fija la altura */
}

/* Header = fila 1. Quita el margin-bottom (el gap del grid lo cubre). */
.appHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 0;
}

/* Main = fila 2. ÚNICO contenedor con scroll. min-height:0 es obligatorio
   para que el hijo flex/grid pueda encogerse y el overflow funcione. */
.workspace {
  display: block;
  min-height: 0;
  overflow: auto;
}

/* Footer / StatusBar = fila 3. */
.app-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  font-size: 12px;
  color: var(--app-muted);
  border-radius: var(--nm-radius);
  background: var(--nm-surface);
  box-shadow: var(--nm-raised);
}
```

### App.css — fill Main, delete the calc() magic numbers

```css
/* Antes: min-height: calc(100vh - 96px); flex:1  → ahora llena el Main */
.editorWrap {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  height: 100%;
  overflow: hidden;
}

/* Antes: min-height: calc(100vh - 136px) */
.editor {
  padding: 16px;
  height: 100%;
}

/* Antes: min-height: calc(100vh - 140px) */
.sourceEditor {
  width: 100%;
  height: 100%;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text);
  padding: 16px;
  resize: none;
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* Antes: min-height: calc(100vh - 96px) */
.previewWrap {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* .fullPreview tenía min-height: calc(100vh - 140px) → eliminar la regla
   o vaciarla; el height:100% de .previewWrap ya manda. */
.fullPreview {
  /* sin min-height: el grid + height:100% gobiernan la altura */
}
```

**Why `height:100%` works now:** `.workspace` is a grid row with a resolved height (`1fr` of `100dvh`), so a percentage height on its children has a definite basis. The previous `calc(100vh - Npx)` constants were brittle guesses at header+padding height; the grid computes it exactly.

---

## 4. Neumorphic selector map

| Selector | Resting | Active / pressed | Notes |
|----------|---------|------------------|-------|
| `.appHeader` | `--nm-raised` + `--nm-surface` + `--nm-radius` | — | header floats above the bg |
| `.app-footer` (StatusBar) | `--nm-raised` + `--nm-surface` | — | new region |
| `.iconBtn`, `.actionIcon` | `--nm-raised` + `--nm-surface`, drop the 1px border | `--nm-inset` on `:active` | border removed; relief replaces it |
| `.segmentedSwitch` | `--nm-inset` on the track (sunken well) | — | container is the recessed groove |
| `.segmentedSwitch button.active` | `--nm-accent-gradient` bg + `--nm-accent-text` | raised chip inside the groove | active uses accent, not neumorphism |
| `.segmentedSwitch button` (inactive) | transparent over the inset track | — | |
| `.fileHistoryTrigger`, `.fileNameEditor` | `--nm-inset` (input-like recess) | — | reads as a field |
| `.fileHistoryMenu` | `--nm-raised` + `--nm-surface` | — | floating popover |
| `.styleToolGroup`, `.fontSelect` | `--nm-inset` light | — | optional polish; keep subtle |

### Untouched (explicit)
- `.editor` and **all MDXEditor / CodeMirror / Radix internals** (`[class*='_toolbar…']`, `[class*='_select…']`, `.mdxeditor-*`). DOM owned by the library.
- `.previewBody`, `.pdfPreviewPage*`, `.pdfViewerFrame` — document content, must stay clean/printable.
- `.loadingOverlay`, `.spinner` — overlay chrome, no neumorphism.
- All `--app-*` text colors — unchanged (WCAG AA preserved).

### Example (copy-ready) — icon buttons + segmented switch

```css
.iconBtn {
  width: 30px;
  height: 30px;
  border: 0;                      /* el relieve sustituye al borde */
  background: var(--nm-surface);
  border-radius: var(--nm-radius);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--app-text);
  box-shadow: var(--nm-raised);
}

.actionIcon {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: var(--nm-radius);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease;
}

/* Pressed = hundido */
.iconBtn:active,
.actionIcon:active {
  box-shadow: var(--nm-inset);
  transform: translateY(0);
}

/* Segmented switch: el track es el surco hundido */
.segmentedSwitch {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 0;
  border-radius: var(--nm-radius);
  background: var(--nm-surface);
  box-shadow: var(--nm-inset);
  overflow: visible;
}

.segmentedSwitch button {
  border: 0;
  background: transparent;
  color: var(--app-control-text);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: calc(var(--nm-radius) - 4px);
  cursor: pointer;
}

/* Activo = chip con gradiente de acento */
.segmentedSwitch button.active {
  background: var(--nm-accent-gradient);
  color: var(--nm-accent-text);
  box-shadow: var(--nm-raised);
}
```

---

## 5. focus-visible fix (copy-ready)

Current focus relief lives ONLY at `App.css:104-108` — `box-shadow` shared with hover on `.actionIcon:focus-visible`. That box-shadow now CONFLICTS with the neumorphic relief (it would clobber `--nm-raised`). Replace it with an outline so focus and relief are independent.

```css
/* Foco accesible sin pisar el relieve neumórfico */
.iconBtn:focus-visible,
.actionIcon:focus-visible,
.segmentedSwitch button:focus-visible,
.fileHistoryTrigger:focus-visible,
.fileNameEditor:focus-visible {
  outline: 2px solid var(--nm-accent-from);  /* cyan, visible en ambos temas */
  outline-offset: 2px;
}

/* Hover SOLO (sin foco): amplifica el relieve, no lo reemplaza */
.actionIcon:hover {
  transform: translateY(-1px);
  box-shadow: var(--nm-raised-hover);
}
```

The tooltip rules at `App.css:133-137` (`.actionIcon:focus-visible::after`) stay — they only toggle tooltip opacity, no conflict.

---

## 6. Hover / neumorphic merge

Hover must **add** intensity, never reset the shadow. We do this by swapping `--nm-raised` → `--nm-raised-hover` (a deeper/wider version of the SAME light+dark pair) plus the existing `translateY(-1px)` lift. Active/pressed flips to `--nm-inset`. Order of precedence by state: resting (`--nm-raised`) → hover (`--nm-raised-hover`) → focus (adds outline, keeps relief) → active (`--nm-inset`). No state clobbers another's relief because hover and active set `box-shadow` while focus sets `outline`.

---

## 7. JSX changes (minimal, copy-ready intent)

Keep `<main className="app …" data-testid="app-root">` as the outer grid shell — do NOT add a nested `<main>`. Add `app-layout` is optional; `.app` already becomes the grid, so no class rename is required. Two edits only:

**Edit A — remove the fileMeta block from the header** (delete `App.tsx:1648-1653`, the `<div className="fileMeta">…</div>`).

**Edit B — add the footer after `</section>`** (insert after `App.tsx:2000`, before the `pdfPreviewStaging` div):

```tsx
            </section>

            <footer className="app-footer" data-testid="app-footer-status">
                <div className="fileMeta" title={folderPath || visibleFolder}>
                    <Folder size={13} />
                    <span className="fileMetaFolder">{visibleFolder}</span>
                    <span>{formatFileSize(currentSizeBytes)}</span>
                    <span>{formatSavedAt(lastSavedAt, locale)}</span>
                </div>
            </footer>
```

Notes:
- `data-testid="app-footer-status"` is NEW and additive — it does not touch any existing contract. (Optional; add only if tasks/spec want a footer hook.)
- The `@media (max-width:1080px)` rule that set `.fileMeta { order:4; flex-basis:100% }` becomes a no-op for the header; harmless to leave, cleaner to drop the `.fileMeta` part.
- All 8 testids and 3 aria groups remain exactly where they were in the header/workspace.

### E2E contract confirmation (preserved)

| Hook | Location after change | Status |
|------|----------------------|--------|
| `data-testid="app-root"` | `<main className="app">` (now grid shell) | preserved |
| `data-testid="app-header"` | `<header className="appHeader">` | preserved |
| `data-testid="workspace"` | `<section className="workspace">` | preserved |
| `data-testid="editor-wrap"` | `.editorWrap` | preserved |
| `data-testid="source-editor"` | `.sourceEditor` | preserved |
| `data-testid="preview-wrap"` | `.previewWrap` | preserved |
| `data-testid="btn-new"` | create button | preserved |
| `data-testid="btn-save"` | save button | preserved |
| `role="group" aria-label="Theme"` | `.themeSwitch` | preserved |
| `role="group" aria-label="Language"` | `.localeSwitch` | preserved |
| `role="group" aria-label="View mode"` | `.modeSwitch` | preserved |

---

## 8. App.css organization — recommendation

**Keep a single `App.css` for this change.** Rationale:
- The change is ~200-350 lines; after deleting the `calc()` rules and adding the token layer + neumorphic rules, App.css lands around ~760-800 lines — under the 800 threshold the proposal flagged.
- A `tokens.css` / `layout.css` split is a *structural* refactor that belongs with the component extraction in **Change 3c**, where files move anyway. Splitting now creates churn and import wiring that the visible-redesign PR does not need.
- Mitigation: add 3 clear section banners inside App.css — `/* === TOKENS === */`, `/* === LAYOUT (Holy Grail) === */`, `/* === CHROME (neumorphic) === */` — so the future split is a copy-paste.

If during apply the file crosses ~850 lines, fall back to extracting only `tokens.css` (imported first) — it is the cleanest seam.

---

## 9. ASCII mockup

```
┌──────────────────────────────────────────────────────────────────────────┐ ─┐
│  MD Editor  [+][📂][💾][🗑][⤓MD][👁PDF][↗PDF][⤓PDF]   ┌ filename ▾ ┐        │  │ header (auto)
│                                            [Light|Dark][ES|US][Editor|.md|Preview] │  │ neumorphic raised
└──────────────────────────────────────────────────────────────────────────┘ ─┘
┌──────────────────────────────────────────────────────────────────────────┐ ─┐
│                                                                            │  │
│   ┌────────────────────────────────────────────────────────────────────┐  │  │
│   │ MDXEditor toolbar …                                                 │  │  │
│   ├────────────────────────────────────────────────────────────────────┤  │  │ MAIN (1fr)
│   │                                                                     ▲│  │  │ overflow:auto
│   │   # Document content                                                ││  │  │ ONLY scroll
│   │   The editor / source / preview fills this region at height:100%.   ▼│  │  │ region
│   │                                                                     ░│  │  │
│   └────────────────────────────────────────────────────────────────────┘  │  │
│                                                                            │  │
└──────────────────────────────────────────────────────────────────────────┘ ─┘
┌──────────────────────────────────────────────────────────────────────────┐ ─┐
│  📁 ~/Documents/notes   ·   2.4 KB   ·   Saved 14:32                        │  │ footer (auto)
└──────────────────────────────────────────────────────────────────────────┘ ─┘  StatusBar, neumorphic raised
                                                                                   (fileMeta moved here)

  Active segmented chip ([Editor]) = cyan→purple gradient, text #0b1020.
  Buttons rest = soft raised relief; pressed = inset; focus = 2px cyan outline.
  Page itself never scrolls (html/body/#root: height:100dvh; overflow:hidden).
```

---

## 10. Decision-rationale table (ADR-style)

| Decision | Rationale | Rejected alternative |
|----------|-----------|----------------------|
| Grid `auto 1fr auto` on `.app`, scroll on `.workspace` | Single source of truth for height; deletes all `calc(100vh - Npx)` guesses; header/footer pinned without `position:fixed`. | `position:fixed` header/footer + padded body → z-index, overlap, and safe-area headaches. |
| `100dvh` (not `100vh`) | Dynamic viewport unit accounts for mobile browser chrome; pairs with `env(safe-area-inset-*)`. | `100vh` → iOS Safari cuts off the footer behind the toolbar. |
| Neumorphism on chrome only | We own the chrome DOM; MDXEditor/CodeMirror/Radix internals are library-owned and would break or fight `!important` rules. | Styling editor internals → fragile selector wars, broken on lib upgrades. |
| Separate dark-theme shadow alphas | Reusing light alphas on `#0f172a` produces invisible relief or milky halos. Black 55% + white 5% is the only readable combo. | One shared shadow set → dark mode looks flat/dirty. |
| Active chip = accent gradient, NOT neumorphism | Neumorphic "pressed" is too subtle to signal selection; the gradient is an unambiguous active state and reinforces brand. Text `#0b1020` clears WCAG AA on both gradient ends. | Inset-only active → users can't tell which mode is selected. |
| Focus via `outline`, not `box-shadow` | Box-shadow focus would overwrite `--nm-raised`. Outline is independent of relief and visible in both themes. | Box-shadow focus ring → clobbers neumorphic shadow, focus invisible. |
| Hover amplifies (`--nm-raised-hover`) | Keeps the same light/dark pair, just deeper — relief stays coherent. | Replacing shadow on hover → flicker/relief loss. |
| Single App.css now, split in 3c | Lands under ~800 lines; splitting is a structural refactor that belongs with component extraction; avoids import churn in a visual PR. | Split into tokens/layout/App now → churn unrelated to the redesign goal. |
| `<main>` stays as grid root (no nested main) | Preserves `data-testid="app-root"`; avoids invalid nested `<main>` landmarks. | New wrapper div around `<main>` → extra node, risk of moving the testid. |
| Footer is a real `<footer>` | Semantic landmark for the StatusBar; `fileMeta` is metadata, belongs in contentinfo. | Keeping fileMeta in header → cramped header, no semantic footer. |

---

## Checklist (verify during apply)

- [ ] Page does not scroll; only `.workspace` scrolls, in all 3 view modes.
- [ ] No `calc(100vh - …)` remains in App.css.
- [ ] Editor / source / preview each fill the Main region with no clipping or double scrollbar.
- [ ] Light AND dark neumorphism both show visible relief (eyeball both themes).
- [ ] Active segmented chip uses the gradient; text is legible (AA) on cyan and purple ends.
- [ ] Keyboard focus shows a 2px cyan outline on every chrome control; no missing focus ring.
- [ ] Footer renders folder · size · saved-at; header no longer shows fileMeta.
- [ ] All 8 data-testid and 3 aria groups still resolve (run Playwright).
- [ ] iOS: footer not hidden behind home indicator (safe-area inset applied).

## Next step

Proceed to `sdd-tasks` once `sdd-spec` is also ready — design (HOW) + spec (WHAT) feed the task breakdown.
