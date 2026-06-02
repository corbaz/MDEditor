# Proposal: Holy Grail layout + Neumorphic chrome (ui-holy-grail-neumorphic)

Restructure the app shell into a true CSS-grid Holy Grail layout (header / main / footer) and apply a Neumorphic design system to the app **chrome only** — header, footer, buttons, switches, panels — integrated with the existing light/dark theme system and accent-tinted with a cyan to purple gradient. The editor text content stays clean. No behavior changes, no logic touched, and all existing test contracts (7 E2E + 114 unit) keep passing.

This is **Change 3b**, the first of two UI changes. Component extraction into `src/components/` is deliberately deferred to a later Change 3c.

## Quick path (what reviewers verify first)

1. App still works: open, save, new, theme toggle, view-mode toggle, PDF preview — unchanged behavior.
2. Layout is a real grid: `grid-template-rows: auto 1fr auto`, `height: 100dvh`, scroll happens **only** on Main.
3. Chrome looks neumorphic in **both** light and dark, with cyan to purple accents; editor content area stays clean.
4. The 7 Playwright E2E tests pass (the data-testid + role/aria-label contract is intact).
5. The 114 Vitest unit tests pass; `src/lib` is untouched.

## Intent

| Question | Answer |
|----------|--------|
| What problem | The shell uses `min-height:100vh` + `padding:20px` and a chain of magic-number heights (`calc(100vh - 96px)`, `- 136px`, `- 140px`). The page scrolls as a whole, there is no semantic footer, and the visual style is flat/utilitarian. |
| Why now | Change 3a delivered both a Vitest unit net (`src/lib`) and a Playwright E2E behavioral net. We finally have a safety net robust enough to restructure layout and restyle chrome with confidence. |
| What success looks like | A true grid layout (scroll only on Main, no `calc()` viewport hacks), neumorphic chrome with cyan to purple accents in light and dark, WCAG AA text contrast preserved, all 7 E2E + 114 unit tests green, build + lint clean, visually verified by running the app. |

## Scope (this change = the visible PR)

In scope:

| Area | Change |
|------|--------|
| `App.tsx` (JSX only) | Wrap existing regions in a Layout shell (`<div class="app-layout">` with grid). Keep `<header>`, `<section class="workspace">` (Main), add a new `<footer class="app-footer">` StatusBar. Move `fileMeta` (folder path / file size / saved-at) out of the header into the StatusBar footer. Minimal, mechanical JSX change. |
| `App.css` | Add a Neumorphic token layer (custom properties: surface, light shadow, dark shadow, radius, distance, blur, plus computed `--nm-raised` / `--nm-inset` and a cyan to purple accent gradient) layered on the existing `.app` / `.app.dark-theme` vars. Dark-mode shadow alphas calibrated separately. |
| `App.css` | Apply neumorphic styling to: header, footer/StatusBar, action icon buttons, segmented switches, file-history menu, panels. Leave the MDXEditor content area clean. |
| `App.css` | Eliminate the magic-number heights (`calc(100vh - Npx)`); the grid drives sizing. Add `height:100%` / `min-height:0` where needed so the editor fills the Main row. |
| `App.css` | Fix `focus-visible` to use `outline` (a contrasting ring), not `box-shadow` — box-shadow would conflict with the neumorphic relief. Merge hover into the raised shadow instead of clobbering it. |
| `index.css` | Add `height:100dvh` (and `overflow:hidden`) to `html, body, #root` so the grid has a definite height to fill. |
| Accessibility | Preserve all 8 `data-testid` hooks and the 3 `role="group"` + `aria-label` groups. Keep text colors unchanged (contrast preserved). iOS safe-area insets on header/footer. |

Out of scope (explicit — do not do these here):

- Full component extraction into `src/components/` (Layout, AppHeader, Toolbar, StatusBar, EditorPane, etc.) — that is **Change 3c**, a separate refactor PR.
- Any behavior or logic change.
- Any change to `src/lib` (the unit-tested pure helpers).
- Removal or weakening of light theme — light mode stays a first-class citizen.

## Approach + rationale

Chosen approach: **Holy Grail layout + Neumorphic tokens together, no component extraction yet** (Approach C from the exploration).

| Decision | Rationale |
|----------|-----------|
| Grid shell, not flex stack | `grid-template-rows: auto 1fr auto` on a `100dvh` container gives a fixed header/footer with a single growable Main. `overflow:auto; min-height:0` on Main is the canonical fix that lets the editor scroll inside its row instead of overflowing the track. |
| CSS classes, not uppercase DOM IDs | The reference HTML used `#LAYOUT / #HEADER / #MAIN / #FOOTER` as literal IDs. **React adaptation:** these become CSS classes (`.app-layout`, `.app-header`, `.app-main` / `.workspace`, `.app-footer`) on semantic elements (`<div>`, `<header>`, `<main>`/`<section>`, `<footer>`). Unique DOM IDs are a React anti-pattern (instance collisions, testing friction). The spirit — named layout regions with stable selectors — is honored. **Flagged explicitly per user instruction.** |
| Neumorphism on chrome only | The MDXEditor content area is owned by Radix/CodeMirror internals; neumorphic surface treatment there would fight the editor's own styling and hurt readability. Relief goes on header, footer, buttons, switches, menu, panels — the editor surface stays clean and readable. |
| Token layer over existing vars | Neumorphic shadows/radius/accent are added as new custom properties layered on the existing 15 `--app-*` vars, not a rewrite. Dark mode redefines the shadow alphas (low-alpha dual shadows) so relief stays visible on a dark base without crushing contrast. |
| Accent as cyan to purple gradient | `#22d3ee` to `#a78bfa`, from the user's reference. Used on accent surfaces / active states / focus ring, integrated into both themes — not replacing the neutral text/surface palette. |
| `focus-visible` via `outline` | Neumorphic elements rely on `box-shadow` for relief; a focus ring built on box-shadow would be invisible or conflict. A 2px contrasting `outline` (accent-tinted) is unambiguous and keyboard-accessible. |
| Keep all test hooks | The E2E net asserts behavior through 8 `data-testid` hooks and 3 role/aria-label groups. The refactor only wraps/moves DOM and changes CSS — every hook stays on its element. This is the hard constraint that keeps the PR safe. |

## Delivery forecast

The exploration estimates ~200-350 changed lines (CSS-heavy with minimal JSX). Likely a **single PR**, but flag for the `sdd-tasks` Review Workload Forecast — if neumorphic styling balloons `App.css` past the 400-line budget, consider splitting tokens/layout into separate files or chaining. `App.css` is already 692 lines; splitting into `tokens.css` + `layout.css` is a reasonable option to raise during tasks.

## Risks

| Risk | Mitigation |
|------|------------|
| MDXEditor height regression — editor may not fill the Main grid row | Set `height:100%` on `.editorWrap` and `min-height:0` on Main; the `<textarea>.sourceEditor` needs `height:100%`. Verify visually in all 3 view modes. |
| Neumorphic shadow vs existing hover `box-shadow` conflict | Merge hover into the raised shadow (add, don't clobber) or drive the shadow via a custom property. |
| Dark-mode neumorphic visibility (low contrast on dark base) | Calibrate dark shadow alphas separately; test with real values; relief must remain perceptible without lowering text contrast. |
| `focus-visible` regression | Move focus indication to `outline`; verify keyboard tab order shows a visible ring on every interactive element. |
| WCAG AA text contrast | Leave `--app-text` / `--app-muted` unchanged; neumorphism styles surfaces, not text. |
| `App.css` growth past ~800 lines | Consider splitting tokens/layout into separate stylesheets (decide in tasks). |
| No visual-regression safety net | The 114 unit + 7 E2E tests cover logic/behavior only. Visual correctness must be validated by running the app — call this out in tasks and apply. |

## Checklist (acceptance)

- [ ] Layout is a CSS grid (`auto 1fr auto`, `100dvh`); scroll only on Main; no `calc(100vh - Npx)` left.
- [ ] StatusBar footer exists and shows folder / size / saved-at (moved from header).
- [ ] Chrome is neumorphic in light AND dark, with cyan to purple accents; editor content area clean.
- [ ] `focus-visible` uses outline; visible on every interactive element.
- [ ] All 8 data-testid hooks + 3 role/aria-label groups intact.
- [ ] 7 E2E tests pass; 114 unit tests pass; `src/lib` untouched.
- [ ] Build + lint clean; app visually verified by running it.

## Next step

Run `sdd-spec` and `sdd-design` (can run in parallel) for this change.
