# Spec: ui-holy-grail-neumorphic (Change 3b)

Holy Grail CSS-grid shell + neumorphic chrome styling for MDEditor. This spec describes the **observable state after the change** — what MUST be true for the PR to be accepted.

## Quick acceptance path

| # | Check |
|---|-------|
| 1 | `grid-template-rows: auto 1fr auto` on `.app-layout`, `height:100dvh`, scroll ONLY in Main |
| 2 | StatusBar `<footer>` shows folder path, file size, and saved-at timestamp |
| 3 | Chrome is neumorphic in both light and dark themes; editor content area is clean |
| 4 | `focus-visible` shows a visible outline on every interactive element |
| 5 | All 8 `data-testid` hooks present; `role="group"` + `aria-label` intact on Theme and View-mode groups |
| 6 | 7 Playwright E2E tests green; 114 Vitest unit tests green |
| 7 | Build and lint pass; no `calc(100vh - Npx)` patterns remain in CSS |

---

## 1. Layout

### 1.1 Grid shell

**REQ-LAYOUT-01** The root grid container MUST have the CSS class `app-layout` and render as a `display:grid` element with `grid-template-rows: auto 1fr auto` and `height: 100dvh`.

**REQ-LAYOUT-02** `html`, `body`, and `#root` MUST each have `height: 100dvh` and `overflow: hidden` declared in `index.css` so the grid has a definite height to fill.

**REQ-LAYOUT-03** The Main row (`.app-main` or `.workspace`) MUST have `overflow: auto` AND `min-height: 0`. This is the ONLY scrollable region; the header and footer MUST NOT scroll.

**REQ-LAYOUT-04** All `calc(100vh - Npx)` height expressions MUST be removed. No magic-number viewport offsets are permitted after this change.

**REQ-LAYOUT-05** The editor fill chain MUST be: `.app-layout` fills `100dvh` → `.app-main` row takes `1fr` → `.editorWrap` has `height: 100%` → `.editor` has `height: 100%` → `.sourceEditor` `<textarea>` has `height: 100%`. No element in this chain may have an explicit pixel height.

### 1.2 Semantic elements and class names

**REQ-LAYOUT-06** The layout MUST use semantic HTML elements: `<header class="app-header">`, the main content area MUST be reachable via `.workspace` (the existing class may be kept on a `<section>` or `<main>` element), and a new `<footer class="app-footer">` MUST exist as a direct child of `.app-layout`.

**REQ-LAYOUT-07** Layout regions MUST be identified by CSS classes (`.app-layout`, `.app-header`, `.app-main` / `.workspace`, `.app-footer`), NOT by uppercase DOM IDs. Unique DOM IDs on layout shells are prohibited.

### 1.3 Scrolling contract

**REQ-LAYOUT-08** When file content is long enough to exceed the viewport, the header and footer MUST remain stationary. Scrolling MUST be confined to the Main content row.

**REQ-LAYOUT-09** Positioned overlays (`pdfPreviewOverlay`, `loadingOverlay`, `pdfPreviewStaging`) MUST remain `position: fixed` and are exempt from the grid flow. Their behavior MUST not change.

---

## 2. StatusBar footer

**REQ-STATUS-01** A `<footer class="app-footer">` StatusBar element MUST exist and be visible in the rendered DOM at all times (it is not conditionally rendered).

**REQ-STATUS-02** The StatusBar MUST display all three of the following metadata values: current folder path, current file size, and last saved-at timestamp. These values MUST be moved OUT of the header; they MUST NOT appear in both regions simultaneously.

**REQ-STATUS-03** The StatusBar MUST inherit neumorphic styling consistent with the footer chrome (see Section 3). It MUST NOT display a neumorphic inset on the content text itself.

**REQ-STATUS-04** iOS safe-area insets MUST be applied to the footer: `padding-bottom: env(safe-area-inset-bottom)`.

---

## 3. Neumorphic styling

### 3.1 Token layer

**REQ-NM-01** The following CSS custom properties MUST be declared on `.app` (light defaults) and redefined on `.app.dark-theme`:

| Property | Purpose |
|----------|---------|
| `--nm-surface` | Base surface color (aliased from `--app-surface`) |
| `--nm-shadow-light` | Highlight side of the relief shadow |
| `--nm-shadow-dark` | Shadow side of the relief shadow |
| `--nm-radius` | Corner radius for neumorphic elements |
| `--nm-distance` | Shadow offset |
| `--nm-blur` | Shadow blur radius |
| `--nm-raised` | Computed shorthand: raised-element `box-shadow` |
| `--nm-inset` | Computed shorthand: pressed-element `box-shadow` |

**REQ-NM-02** The dark-theme shadow values (`--nm-shadow-light`, `--nm-shadow-dark`) MUST use lower alpha values than light-theme equivalents so that relief remains perceptible without crushing text contrast on a dark surface.

### 3.2 Accent gradient

**REQ-NM-03** An accent gradient from `#22d3ee` (cyan) to `#a78bfa` (purple) MUST be available as a CSS token and applied to active/accent elements (active segmented-switch item, focus ring tint, accent surfaces). The exact token name is left to design, but the two color endpoints are fixed.

### 3.3 Applied surfaces

**REQ-NM-04** Neumorphic `box-shadow` styling (raised relief) MUST be applied to: header (`.app-header`), footer (`.app-footer` / StatusBar), action icon buttons (`.iconBtn` / `.actionIcon`), segmented switches (`.segmentedSwitch`), the file-history menu trigger and panel, and any panel/card surfaces in the chrome.

**REQ-NM-05** The MDXEditor content area MUST remain visually clean — NO neumorphic `box-shadow`, surface color override, or radius treatment MUST be applied to `.editor` internals, CodeMirror content, Radix portal dropdowns, or MDXEditor toolbar button internals.

### 3.4 Theme coverage

**REQ-NM-06** Neumorphic styling MUST be present and visually coherent in BOTH the light theme and the dark theme. Switching themes MUST re-skin the chrome neumorphic appearance. The light theme MUST remain a first-class citizen — it MUST NOT be degraded or removed.

---

## 4. Accessibility

**REQ-A11Y-01** Body and UI text contrast MUST continue to meet WCAG AA (4.5:1 for normal text, 3:1 for large text). The `--app-text` and `--app-muted` color tokens MUST NOT be changed by this PR. Neumorphism styles surfaces; it MUST NOT lower text contrast.

**REQ-A11Y-02** The `focus-visible` state on ALL interactive elements (buttons, switches, inputs, menu items) MUST be indicated via CSS `outline`, NOT via `box-shadow`. The outline MUST be visibly distinct (2px minimum width, accent-tinted or high-contrast color) so it is not masked by neumorphic relief.

**REQ-A11Y-03** Hover states on neumorphic elements MUST be implemented by merging the hover effect into the existing raised shadow (adding depth, not clobbering the relief). Removing or replacing `box-shadow` on hover is prohibited.

**REQ-A11Y-04** iOS safe-area insets MUST be applied to the header: `padding-top: env(safe-area-inset-top)`.

---

## 5. Contract preservation

### 5.1 data-testid hooks

**REQ-CONTRACT-01** All 8 `data-testid` attributes MUST remain on their respective elements after the refactor. Removal, renaming, or moving to a different element is a spec violation.

| Hook | Element |
|------|---------|
| `app-root` | Root app container |
| `app-header` | Header element |
| `workspace` | Main content region |
| `editor-wrap` | MDXEditor wrapper |
| `source-editor` | Source `<textarea>` |
| `preview-wrap` | Preview region |
| `btn-new` | New file button |
| `btn-save` | Save button |

### 5.2 ARIA groups

**REQ-CONTRACT-02** The Theme and View-mode control groups MUST each have `role="group"` and a non-empty `aria-label`. These attributes MUST NOT be removed or changed.

### 5.3 Test suites

**REQ-CONTRACT-03** All 7 Playwright E2E tests MUST pass without modification after the change is applied. No E2E test file may be modified as part of this PR.

**REQ-CONTRACT-04** All 114 Vitest unit tests MUST pass without modification. `src/lib` MUST NOT be modified in any way.

### 5.4 Behavior and logic

**REQ-CONTRACT-05** No behavioral or logic changes are permitted. All user-visible functionality (open, save, new, theme toggle, view-mode switch, file history, PDF preview, language switch) MUST behave identically before and after the change.

---

## 6. Build and code quality

**REQ-BUILD-01** `bun run build` (or the project's standard build command) MUST complete with zero errors.

**REQ-BUILD-02** The linter MUST report zero errors after the change.

**REQ-BUILD-03** No `calc(100vh - Npx)` or `calc(100dvh - Npx)` patterns are permitted in any CSS file after this change.

---

## 7. Acceptance scenarios

### Scenario 1 — Holy Grail scroll contract

```
Given the app is open with a file that has many lines of content
When the user scrolls inside the editor/source/preview area
Then the header (.app-header) remains stationary at the top
 And the footer (.app-footer) remains stationary at the bottom
 And only the content inside .app-main scrolls
 And no horizontal or vertical scrollbar appears on <body>
```

### Scenario 2 — Editor fills Main row in all view modes

```
Given the app is open
When the user switches to Editor view mode
Then the MDXEditor fills the entire Main grid row with no clipping or empty space below
When the user switches to Source view mode
Then the source <textarea> fills the entire Main grid row
When the user switches to Preview view mode
Then the preview panel fills the entire Main grid row
 And in none of these modes does a calc(100vh - Npx) expression drive the height
```

### Scenario 3 — StatusBar shows file metadata

```
Given a file is open with a known folder path, file size, and a recorded save time
When the app renders
Then the footer StatusBar is visible
 And it displays the folder path
 And it displays the file size
 And it displays the saved-at timestamp
 And none of these values appear in the header simultaneously
```

### Scenario 4 — Theme toggle re-skins neumorphic chrome

```
Given the app is in light theme
Then header, footer, icon buttons, and segmented switches display neumorphic raised-relief box-shadows
When the user toggles to dark theme
Then the same chrome elements display neumorphic styling calibrated for the dark surface
 And the MDXEditor content area remains clean (no neumorphic styling) in both themes
 And no text contrast drops below WCAG AA in either theme
```

### Scenario 5 — View-mode switch still works

```
Given the app is open
When the user clicks the Editor option in the View Mode group
Then viewMode state becomes 'editor' and the MDXEditor is rendered
When the user clicks the Source option
Then viewMode state becomes 'source' and the source textarea is rendered
When the user clicks the Preview option
Then viewMode state becomes 'preview' and the preview panel is rendered
 And the View Mode group retains role="group" and its aria-label throughout
```

### Scenario 6 — Keyboard focus ring is visible on neumorphic elements

```
Given the app is open
When the user navigates interactive elements with the Tab key
Then a visible focus ring (outline, not box-shadow) appears on each focused element
 And the focus ring is not obscured by neumorphic relief shadows
 And the focus ring is visible in both light and dark themes
```

### Scenario 7 — All 7 Playwright E2E tests pass

```
Given the change is fully applied
When the full Playwright test suite runs (bun run test:e2e or equivalent)
Then all 7 tests report PASSED
 And no test is skipped or modified
```

### Scenario 8 — All 114 Vitest unit tests pass

```
Given the change is fully applied
When the full Vitest test suite runs (bun run test or equivalent)
Then all 114 tests report PASSED
 And src/lib contains no modifications
```

### Scenario 9 — Build and lint pass

```
Given the change is fully applied
When the build command runs
Then it completes with zero errors and zero warnings that were not present before
When the lint command runs
Then it reports zero new errors
```

---

## Out of scope (explicit)

The following are NOT requirements of this change. Including them is a spec violation.

- Component extraction into `src/components/` (deferred to Change 3c)
- Any change to `src/lib` modules
- Any behavioral or logic change
- Removal of the light theme or degradation of its visual quality
- Visual regression test automation (no safety net exists; visual correctness is validated by running the app)
