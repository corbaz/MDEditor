# Spec: ui-layout-and-theming

> Persistent capability spec. Records the durable UI shell + theming contract established by change `ui-holy-grail-neumorphic` (merged via PR #5).

## Layout (Holy Grail, React-adapted)

- The app shell is a CSS grid: `grid-template-rows: auto 1fr auto` (header / main / footer), `height: 100dvh`, `overflow: hidden`. `#root`/html/body are `height: 100dvh; overflow: hidden`.
- Semantic elements + CSS classes (NOT uppercase DOM IDs): the outer `<main className="app">` is the grid shell (also `data-testid="app-root"`); `.appHeader` is the header; `.workspace` is the scrollable main; `<footer className="app-footer">` is the status bar.
- **Scroll happens ONLY in the main/workspace** (`overflow: auto; min-height: 0`). Header and footer stay fixed.
- The editor/source/preview fill the main row via `height: 100%`. The old `calc(100vh - Npx)` magic numbers are gone (only 3 `calc(100vh-…)` remain, inside `position:fixed` PDF overlays).
- iOS safe-area insets applied on header/footer.
- The footer StatusBar shows folder path · file size · saved-at (moved out of the header).

## Theming

- Two themes: light (`.app`) and dark (`.app.dark-theme`), driven by app-level CSS custom properties. `document.documentElement.dataset.appTheme` mirrors the theme for MDXEditor's Radix variables.
- MDXEditor's own light/dark Radix variables are used for editor internals.

## Neumorphic design system (chrome only)

- Token custom properties on `.app` (light) and `.app.dark-theme` (dark): `--nm-surface`, `--nm-shadow-light`, `--nm-shadow-dark`, `--nm-radius`, `--nm-distance`, `--nm-blur`, composed `--nm-raised` / `--nm-inset` / `--nm-raised-hover`, and the accent gradient.
- Light surface `#e8ecf3` (shadows `rgba(255,255,255,0.75)` / `rgba(163,177,198,0.55)`); dark surface `#1b2230` (shadows `rgba(255,255,255,0.05)` / `rgba(0,0,0,0.55)`).
- Accent: `linear-gradient(135deg, #22d3ee, #a78bfa)` (cyan→purple) on active segmented buttons / accents, with `--nm-accent-text: #0b1020` (WCAG AA: ~8.9:1 over cyan, ~5.6:1 over purple).
- Neumorphic relief (`--nm-raised` resting, `--nm-inset` active) applies to CHROME ONLY: header, footer, action icon buttons, segmented switches, file-history menu, panels. The MDXEditor content area (`.editor` and its internals) is NEVER given `--nm-*` shadows.

## Accessibility invariants

- Body/UI text contrast meets WCAG AA (neumorphism only affects surfaces, not text colors).
- `focus-visible` uses a visible `outline` (accent color), NOT `box-shadow` (which would conflict with neumorphic shadows).

## Test contract (must be preserved by future UI changes)

- 8 `data-testid` hooks: `app-root`, `app-header`, `workspace`, `editor-wrap`, `source-editor`, `preview-wrap`, `btn-new`, `btn-save` (header save).
- `role="group"` + `aria-label` on the Theme and View-mode segmented groups.
- The 7 Playwright E2E behavioral tests and 114 Vitest unit tests must stay green.
