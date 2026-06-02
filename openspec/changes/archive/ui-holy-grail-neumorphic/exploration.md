# Exploration: ui-holy-grail-neumorphic

## Current State

App.tsx is 2117 lines, all logic + JSX in one component. No src/components/ directory exists yet.

**JSX Return (App.tsx:1480–2117) — current top-level structure:**

```
<main className="app light-theme|dark-theme">          ← .app (root, is <main>)
  <header className="appHeader">                        ← the entire toolbar bar
    <div className="headerLeft">                        ← title h1 + 8 icon action buttons
    <div className="fileHistory">                       ← filename trigger + dropdown menu
    <div className="fileMeta">                          ← folder path + file size + saved-at
    <div className="themeSwitch segmentedSwitch">       ← Light/Dark toggle
    <div className="localeSwitch segmentedSwitch">      ← ES/US toggle
    <div className="modeSwitch segmentedSwitch">        ← Editor/.md/Preview toggle
  </header>
  <section className="workspace">                       ← the content area (editor/source/preview)
    {viewMode==='editor'} <div.editorWrap><MDXEditor …/>
    {viewMode==='source'} <textarea.sourceEditor …/>
    {viewMode==='preview'} <aside.previewWrap.fullPreview>…</aside>
  </section>
  <div className="pdfPreviewStaging" aria-hidden>       ← off-screen PDF render surface (position:fixed left:-10000px)
  {isPdfPreviewOpen} <div.pdfPreviewOverlay>…</div>    ← PDF modal/overlay (position:fixed, z-index:1100)
  <input.hiddenFileInput …/>                            ← hidden <input type="file"> (display:none)
  {isLoadingLatest||isLoadingDocument}
    <div.loadingOverlay>…</div>                         ← loading spinner (position:fixed, z-index:1000)
</main>
```

**CSS architecture:**
- src/index.css (13 lines): box-sizing reset, html/body/#root min-height + font-family only
- src/App.css (692 lines): all app styles
  - .app block (lines 1–21): 16 custom properties (light defaults) + min-height:100vh + padding:20px
  - .app.dark-theme (lines 23–39): 16 dark overrides
  - :root[data-app-theme='dark'] (lines 41–55): 14 MDXEditor Radix base vars (only dark override; no light override block = uses MDXEditor defaults)
  - All component classes: .appHeader, .headerLeft, .iconBtn, .actionIcon, .fileHistory, .fileMeta, .segmentedSwitch, .styleTools, .editorWrap, .editor, .sourceEditor, .previewWrap, .pdfPreviewStaging/.pdfPreviewPage/.pdfPreviewModal/.pdfPreviewOverlay, .loadingOverlay, .hiddenFileInput
  - MDXEditor dark-mode overrides via :root[data-app-theme='dark'] [class*='_toolbar…'] selectors (lines 391–430)
  - .editorWrap uses min-height: calc(100vh - 96px) — viewport-relative, NOT flex/grid

**Theme mechanism:**
- Component state: `theme: 'light' | 'dark'` (App.tsx:~529)
- className on root: `app light-theme` or `app dark-theme`
- Side effect (App.tsx:578–582): sets `document.documentElement.style.colorScheme` and `document.documentElement.dataset.appTheme`
- The `data-app-theme` attribute on `:root` is what drives the MDXEditor Radix var overrides

**Current layout pain point:**
- `.app` uses `min-height: 100vh` + `padding: 20px` (not a fixed-height viewport-filling layout)
- All height calculations are `calc(100vh - Npx)` magic numbers: `.editorWrap` is `calc(100vh - 96px)`, `.editor` is `calc(100vh - 136px)`, `.sourceEditor` is `calc(100vh - 140px)`, etc.
- No overflow containment — the page scrolls as a whole

## Holy Grail Layout → Component Slot Mapping

| Current element | Holy Grail slot | Notes |
|---|---|---|
| `<header className="appHeader">` | Header | Fixed, no scroll. Contains all controls. |
| `<section className="workspace">` | Main | Scrollable. Editor/source/preview panels live here. |
| NO FOOTER exists | Footer (new) | Status bar: folder path + file size + saved-at (moved from fileMeta in header) |
| `.pdfPreviewOverlay` | Stays as fixed overlay | position:fixed, outside layout flow |
| `.pdfPreviewStaging` | Stays as fixed off-screen | position:fixed, outside layout flow |
| `.loadingOverlay` | Stays as fixed overlay | position:fixed, outside layout flow |
| `<input.hiddenFileInput>` | Stays in DOM anywhere | display:none |

**fileMeta migration:** `.fileMeta` (folder, size, saved-at) currently lives inside `<header>`. Move to a new `<footer>` status bar — this frees valuable header horizontal space and gives the footer a clear semantic purpose.

## Affected Areas

- `src/App.tsx` — JSX restructure (component extraction deferred to 3c)
- `src/App.css` — major rewrite: add grid layout, add neumorphic token layer, update all height calculations
- `src/index.css` — add `height:100dvh` to html/body/#root
- `src/main.tsx` — no change needed

## CSS Variable Inventory (current)

Light defaults on .app:
  --app-bg, --app-surface, --app-surface-muted, --app-text, --app-muted,
  --app-control-text, --app-border, --app-border-soft, --app-shadow,
  --app-active-bg, --app-active-text, --app-danger, --app-danger-bg,
  --app-danger-border, --app-overlay  (15 vars)

Dark overrides on .app.dark-theme: same 15 vars redefined

MDXEditor Radix vars (dark only, on :root[data-app-theme='dark']):
  --basePageBg, --baseBase, --baseBgSubtle, --baseBg, --baseBgHover,
  --baseBgActive, --baseLine, --baseBorder, --baseBorderHover, --baseSolid,
  --baseSolidHover, --baseText, --baseTextContrast  (13 vars)

## Component Extraction Proposal (deferred to Change 3c)

```
src/
  components/
    Layout/            ← grid shell: header + main + footer
    AppHeader/         ← <header>: title, action icons, file history, switches
    Toolbar/           ← headerLeft: the icon action buttons row
    FileHistoryMenu/   ← fileHistory dropdown
    ViewModeSwitch/    ← modeSwitch segmented
    ThemeSwitch/       ← themeSwitch segmented
    StatusBar/         ← NEW footer: fileMeta (folder + size + saved-at)
    EditorPane/        ← MDXEditor + styleTools toolbar contents
    PreviewPane/       ← previewWrap + previewBody
    PdfModal/          ← pdfPreviewOverlay + pdfPreviewModal
    LoadingOverlay/    ← loadingOverlay
```

Cleanly extractable (props only): Layout, StatusBar, ThemeSwitch, ViewModeSwitch, FileHistoryMenu, LoadingOverlay, PdfModal header portion.
Requires careful prop threading: AppHeader (8+ callbacks), EditorPane (editorRef + callbacks + state), Toolbar (applyInlineStyle, rememberSelection, etc.).

## Neumorphic Token Approach

New CSS vars layered on existing ones (added to .app and .app.dark-theme):

```css
/* ── Neumorphic tokens ─────────────────────────────────── */
--nm-surface:      var(--app-surface);          /* base surface color */
--nm-shadow-light: rgba(255,255,255,0.72);      /* highlight side */
--nm-shadow-dark:  rgba(15,23,42,0.18);         /* shadow side */
--nm-radius:       12px;                         /* corner radius */
--nm-distance:     6px;                          /* shadow offset */
--nm-blur:         12px;                          /* shadow blur */

/* Computed utilities */
--nm-raised: var(--nm-distance) var(--nm-blur) calc(var(--nm-blur)*2) var(--nm-shadow-dark),
             calc(-1*var(--nm-distance)) calc(-1*var(--nm-blur)) calc(var(--nm-blur)*2) var(--nm-shadow-light);
--nm-inset:  inset var(--nm-distance) var(--nm-blur) calc(var(--nm-blur)*2) var(--nm-shadow-dark),
             inset calc(-1*var(--nm-distance)) calc(-1*var(--nm-blur)) calc(var(--nm-blur)*2) var(--nm-shadow-light);
```

Dark mode: invert shadow polarity; use rgba with lower alpha for both sides. Accent: cyan #22d3ee → purple #a78bfa gradient.

## Accessibility Risks + Mitigations

1. **Low contrast on text** — neumorphic surfaces are monochromatic; keep WCAG AA. Mitigation: keep --app-text / --app-muted unchanged; neumorphism only styles surfaces and interactive elements, NOT text color.
2. **Invisible focus rings** — neumorphic buttons may lose focus outline against same surface. Mitigation: override `focus-visible` with a contrasting `outline` (2px accent), NOT box-shadow.
3. **Low-contrast active states** — .segmentedSwitch active buttons use bg inversion. Safe; keep it.
4. **Button idle state** — actionIcon neumorphic raised shadow replaces the border as depth cue. Keep aria-labels and data-labels unchanged.
5. **Editor chrome vs editor content** — MDXEditor content area should NOT receive neumorphic surface treatment. Only style the `.editorWrap` shell and the MDXEditor toolbar via existing MDXEditor theming hooks.

## MDXEditor Coexistence

MDXEditor ships its own stylesheet (main.tsx line 5: `@mdxeditor/editor/style.css`). It uses BEM-style hashed class names (overridden in App.css 391–430 with `!important`) and Radix UI theme vars (overridden via `:root[data-app-theme='dark']` 41–55). MDXEditor's `className="editor"` (App.tsx:1729) controls content padding only.

Safe to neumorph: `.editorWrap` shell, app chrome header, footer, icon buttons, segmented switches, file history menu.
Leave alone: `.mdxeditor` internals, Radix portal dropdowns, CodeMirror content, toolbar button internals.

## Scroll / Layout Risk

Target CSS:
```css
/* index.css */
html, body, #root { height: 100dvh; overflow: hidden; }

/* Layout component */
.layout {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
}
.layout__main {
  overflow: auto;
  min-height: 0;   /* critical: collapses grid child below content size */
}
```

`min-height:0` is essential — without it a grid/flex child defaults to `min-height:auto` and overflows the track. The sourceEditor `<textarea>` (`resize:none`) needs `height:100%` to fill Main.

iOS safe-area insets:
```css
padding-top: env(safe-area-inset-top);     /* header */
padding-bottom: env(safe-area-inset-bottom); /* footer */
```

## Uppercase DOM ID Adaptation Note

The original spec mentioned `#LAYOUT/#HEADER/#MAIN/#FOOTER` as plain HTML IDs. In React these become component-level class names (`.app-layout`, `.app-header`, `.app-main`, `.app-footer`) on semantic HTML elements. Unique IDs are a React anti-pattern (multiple instances, testing friction). The SPIRIT (named layout regions with stable selectors) is honored via CSS classes.

## Approach Comparison

| Approach | Pros | Cons | Effort |
|---|---|---|---|
| A: Layout shell only (grid + fixed header/footer, no neumorphism) | Low risk, eliminates calc() hacks, preserves tests | No visual refresh | Low |
| B: Full Holy Grail + Neumorphic + component extraction in one PR | Complete delivery, single context | 400+ line budget risk, complex review, risky | High |
| C: Holy Grail layout + Neumorphic tokens, NO component extraction | Manageable scope, visual impact, CSS-only doesn't touch lib tests | App.tsx still monolithic, CSS grows | Medium |
| D: Holy Grail + Neumorphic + partial extraction | Good balance, reduces monolith incrementally | Still touches many files | Medium-High |

**Recommendation: Approach C as PR #1 (this change 3b), component extraction as Change 3c.**

## Risks

1. MDXEditor height regression — editor may not fill Main without explicit height:100% on .editorWrap.
2. CSS specificity conflict — neumorphic box-shadow on .actionIcon conflicts with existing hover box-shadow. Layer them or use a custom property.
3. Dark neumorphism contrast — dark bg (#111827) with near-same-shade shadows risks invisible buttons. Test with real values.
4. App.css growth — already 692 lines; neumorphic + grid tokens push past 800. Consider splitting into layout.css + tokens.css.
5. PR size — full Layout + Neumorphic + extraction exceeds 400 lines. Extraction chained as separate PR.
6. No visual regression tests — 114 tests cover lib only; UI changes validated by running the app.
7. The current `<main>` (`.app`) is the scroll root. After refactor, `<main>` becomes the inner Main slot — aligns semantically with the Holy Grail main slot.
