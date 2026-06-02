# Spec: decompose-app-into-components

**Change 3c — final architecture step for MDEditor.**
Extract the 640-line render tree of `src/App.tsx` into 12 single-responsibility presentational components. `App.tsx` stays the container. ZERO behavior or visual change. All 114 Vitest unit tests and 7 Playwright E2E tests MUST stay green after each batch.

---

## Quick path

1. Create `src/types.ts` and promote the 5 shared types.
2. Extract 12 components across 5 batches, safest-first.
3. After each batch: `bun run test` + `bun run test:e2e` must be green before starting the next batch.

---

## Requirements

Requirements use RFC 2119 keywords: MUST, MUST NOT, SHOULD, MAY.

### R1 — Component tree

R1.1 The 12 presentational components listed in §Component map MUST be created under `src/components/<Name>/<Name>.tsx` (one folder per component).

R1.2 No barrel `index.ts` MUST be created. All import sites MUST use the full path (`src/components/LoadingOverlay/LoadingOverlay.tsx`, etc.).

R1.3 `App.tsx` MUST remain the sole container. It MUST retain all `useState`, `useRef`, `useEffect`, `useMemo`, `useCallback`, and handler definitions after the refactor.

R1.4 `App.tsx` SHOULD shrink to 450–550 lines (from ~2124).

R1.5 The render return of `App.tsx` SHOULD shrink from ~640 lines to ~60 lines of component composition.

### R2 — Container/presentational contract

R2.1 Every presentational component MUST receive all data and callbacks as plain props. No React Context MUST be introduced.

R2.2 Prop types for each component MUST be defined as a TypeScript interface (or type alias) in the same file as the component.

R2.3 `editorRef` (`MDXEditorMethods`) MUST stay owned by `App.tsx`. It MUST NOT be moved into `EditorPane`.

R2.4 `EditorPane` MUST be implemented with `React.forwardRef<MDXEditorMethods, EditorPaneProps>`. `App.tsx` MUST pass `ref={editorRef}` to `<EditorPane>`. This ensures all five `editorRef.current` call sites in `App.tsx` continue to work without change.

R2.5 `key={editorDocumentKey}` MUST be placed on the `<MDXEditor>` element inside `EditorPane`, NOT on the `<EditorPane>` wrapper in `App.tsx`.

### R3 — Shared types

R3.1 `src/types.ts` MUST be created and MUST export the following types: `Theme`, `ViewMode`, `RecentDocument`, `PdfViewerDocument`, `MaybeFileHandle`.

R3.2 These five types MUST be removed from `App.tsx` after being promoted to `src/types.ts`.

R3.3 `Locale` MUST remain imported from `src/lib/format.ts`. It MUST NOT be duplicated in `src/types.ts`.

R3.4 All new files MUST use `import type { ... }` for type-only imports (`verbatimModuleSyntax` is ON). Value imports and type imports MUST NOT be mixed in the same `import` statement when the import is type-only.

### R4 — Hard contract (DOM, testids, aria, CSS)

R4.1 The 9 `data-testid` attributes MUST be preserved on their exact current DOM elements after the refactor:

| `data-testid` value | Element | Post-refactor location |
|---------------------|---------|------------------------|
| `app-root` | `<main>` | Stays in `App.tsx` |
| `app-header` | `<header>` | Moves into `AppHeader` |
| `btn-new` | `<button>` | Moves into `AppHeader` |
| `btn-save` | `<button>` | Moves into `AppHeader` |
| `workspace` | `<section>` | Moves into `App.tsx` composition (wraps EditorPane/SourceEditor/PreviewPane) |
| `editor-wrap` | `<div>` | Moves into `EditorPane` |
| `source-editor` | `<textarea>` | Stays in `App.tsx` or SourceEditor (see §Component map) |
| `preview-wrap` | `<aside>` | Moves into `PreviewPane` |
| `app-footer-status` | `<footer>` | Moves into `StatusBar` |

R4.2 The `data-testid` attributes MUST NOT be placed on wrapper elements introduced by extraction. They MUST remain on the exact same HTML element they were on before.

R4.3 The three segmented-switch groups MUST preserve their exact `role` and `aria-label` values on the outermost `<div>` of each switch component:

| Component | `role` | `aria-label` |
|-----------|--------|--------------|
| `ThemeSwitch` | `"group"` | `"Theme"` |
| `LocaleSwitch` | `"group"` | `"Language"` |
| `ViewModeSwitch` | `"group"` | `"View mode"` |

R4.4 All `className` strings in the new components MUST be byte-identical to the strings currently in `App.tsx`. `App.css` is a global stylesheet and MUST NOT be modified. Affected class names include at minimum: `appHeader`, `workspace`, `editorWrap`, `sourceEditor`, `previewWrap`, `app-footer`, `themeSwitch`, `localeSwitch`, `modeSwitch`, `segmentedSwitch`, `pdfPreviewStaging`, `loadingOverlay`, `pdfPreviewOverlay`.

### R5 — Always-mounted staging div

R5.1 The `pdfPreviewStaging` `<div>` holding `previewExportRef` MUST remain always-mounted in `App.tsx`, unconditionally, regardless of `viewMode`.

R5.2 The staging div MUST NOT be moved into `PreviewPane`. `PreviewPane` is gated by `viewMode === 'preview'`; moving the staging div there would break PDF export in editor and source modes.

### R6 — renderPreviewMarkdown (ReactMarkdown)

R6.1 The current `renderPreviewMarkdown` helper function MUST NOT be exported from `App.tsx` or made into a shared utility for this change.

R6.2 Each of the three consumers (PreviewPane, PdfModal no-document branch, the staging div in `App.tsx`) MUST render `<ReactMarkdown>` inline, receiving `markdown` as a prop.

### R7 — pdfjs utilities

R7.1 The impure PDF utility functions (`resolvePageObject`, `pdfImageToDataUrl`, `extractPageImages`, `extractMarkdownFromPdf`, `fileToBase64`) MUST remain in `App.tsx`. Moving them is out of scope.

### R8 — Test gate (per batch)

R8.1 After each of the 5 batches, BOTH of the following MUST be green before the next batch starts:
- `bun run test` (114 Vitest unit tests)
- `bun run test:e2e` (7 Playwright E2E tests)

R8.2 `bun run build` MUST succeed after each batch.

R8.3 Lint MUST be clean after each batch (no new errors or warnings introduced by the change).

### R9 — Zero behavior and visual change

R9.1 No user-observable behavior MUST change as a result of this refactor.

R9.2 No visual change MUST be introduced. The rendered output of the application MUST be pixel-identical to the pre-refactor state for all three view modes (editor, source, preview) and both themes (light, dark).

R9.3 No logic MUST be moved out of `App.tsx` except the JSX render tree. State initialization, effect dependencies, memoization, and handler implementations stay in `App.tsx`.

### R10 — Out of scope

R10.1 React Context MUST NOT be introduced.
R10.2 CSS Modules MUST NOT be introduced.
R10.3 No new features MUST be added.
R10.4 No existing tests MUST be modified to make this change pass (tests must pass as-is).

---

## Component map

| Component | File | Extracted from | Key constraints |
|-----------|------|----------------|-----------------|
| `LoadingOverlay` | `src/components/LoadingOverlay/LoadingOverlay.tsx` | App.tsx conditional | Props: `isVisible`, `locale`. Leaf — no callbacks. |
| `StatusBar` | `src/components/StatusBar/StatusBar.tsx` | `<footer className="app-footer">` | Props: `locale`, `folderPath`, `sizeBytes`, `lastSavedAt`. No callbacks. `data-testid="app-footer-status"` stays on `<footer>`. |
| `PreviewImage` | `src/components/PreviewPane/PreviewImage.tsx` | Module-level sub-component in App.tsx | Co-located with PreviewPane. |
| `ThemeSwitch` | `src/components/ThemeSwitch/ThemeSwitch.tsx` | `<div className="themeSwitch ...">` | Must carry `role="group" aria-label="Theme"` on the wrapper `<div>`. Props: `theme`, `onThemeChange`. |
| `LocaleSwitch` | `src/components/LocaleSwitch/LocaleSwitch.tsx` | `<div className="localeSwitch ...">` | Must carry `role="group" aria-label="Language"` on the wrapper `<div>`. Props: `locale`, `onLocaleChange`. |
| `ViewModeSwitch` | `src/components/ViewModeSwitch/ViewModeSwitch.tsx` | `<div className="modeSwitch ...">` | Must carry `role="group" aria-label="View mode"` on the wrapper `<div>`. Props: `viewMode`, `onViewModeChange`. |
| `FileHistoryMenu` | `src/components/FileHistoryMenu/FileHistoryMenu.tsx` | Dropdown in AppHeader | Props: `locale`, `recentDocuments`, `currentFileName`, `onSelect`. |
| `PreviewPane` | `src/components/PreviewPane/PreviewPane.tsx` | `<aside className="previewWrap ...">` | `data-testid="preview-wrap"` on `<aside>`. Props: `locale`, `saveStatus`, `markdown`, `onSave`, `onPrint`. Renders inline ReactMarkdown. |
| `PdfModal` | `src/components/PdfModal/PdfModal.tsx` | `{isPdfPreviewOpen && ...}` | Props: `locale`, `isOpen`, `pdfViewerDocument`, `embeddedPdfUrl`, `saveStatus`, `onClose`, `onExportAsMarkdown`, `onPrint`. Renders inline ReactMarkdown for no-document branch. |
| `AppHeader` | `src/components/AppHeader/AppHeader.tsx` | `<header className="appHeader">` | `data-testid="app-header"` on `<header>`. `data-testid="btn-new"` and `data-testid="btn-save"` on their buttons. ~18 props total. Composes ThemeSwitch, LocaleSwitch, ViewModeSwitch, FileHistoryMenu. |
| `EditorStyleTools` | `src/components/EditorStyleTools/EditorStyleTools.tsx` | `<div className="styleTools">` in toolbarContents | Props: `locale`, color/font state, `onApplyTextColor`, `onApplyHighlight`, `onApplyFont`, `onRememberSelection`. |
| `EditorPane` | `src/components/EditorPane/EditorPane.tsx` | `<div className="editorWrap">` + MDXEditor | `data-testid="editor-wrap"` on wrapper `<div>`. `React.forwardRef<MDXEditorMethods, EditorPaneProps>`. `key={editorDocumentKey}` on `<MDXEditor>`, NOT on `<EditorPane>`. Props: `markdown`, `locale`, `editorDocumentKey`, `selectedTextColor`, `selectedHighlightColor`, `selectedFont`, `availableFonts`, `imageUploadHandler`, `imagePreviewHandler`, `onMarkdownChange`, `onApplyInlineStyle`, `onRememberSelection`. |

---

## Batch boundaries

| Batch | Components | Risk level |
|-------|------------|------------|
| 1 | `LoadingOverlay`, `StatusBar`, `PreviewImage` | Low — leaf/prop-only, zero callbacks |
| 2 | `ThemeSwitch`, `LocaleSwitch`, `ViewModeSwitch`, `FileHistoryMenu` | Low-medium — 1–3 callbacks each |
| 3 | `PreviewPane`, `PdfModal` | Medium — inline ReactMarkdown, moderate prop surface |
| 4 | `AppHeader` | Medium-high — ~18 props, composes Batch 1–2 components |
| 5 | `EditorStyleTools`, `EditorPane` | High — forwardRef, plugins, toolbarContents |

After EACH batch: `bun run test` + `bun run test:e2e` + `bun run build` MUST be green.

---

## Acceptance scenarios

### Scenario 1 — App compiles and renders after each batch

**Given** a batch has been extracted and its files saved  
**When** `bun run build` is executed  
**Then** the build exits with code 0 and no TypeScript or lint errors are reported

### Scenario 2 — All Vitest unit tests remain green after each batch

**Given** any batch has been applied  
**When** `bun run test` is executed  
**Then** all 114 tests pass and 0 tests fail

### Scenario 3 — All Playwright E2E tests remain green after each batch

**Given** any batch has been applied  
**When** `bun run test:e2e` is executed  
**Then** all 7 tests pass and 0 tests fail

### Scenario 4 — Structural regions render (E2E test 1)

**Given** the app is loaded in a browser  
**When** the loading overlay disappears  
**Then** `[data-testid="app-header"]` is visible  
**And** `[data-testid="workspace"]` is visible

### Scenario 5 — Theme switching (E2E tests 2 and 3)

**Given** the app is in dark theme (default)  
**When** the user clicks the button with text "Light" inside `[role="group"][aria-label="Theme"]`  
**Then** `[data-testid="app-root"]` has class `light-theme` and does NOT have class `dark-theme`

**Given** the app is in light theme  
**When** the user clicks the button with text "Dark" inside `[role="group"][aria-label="Theme"]`  
**Then** `[data-testid="app-root"]` has class `dark-theme` and does NOT have class `light-theme`

### Scenario 6 — View-mode switching (E2E tests 4, 5, and 6)

**Given** the app is in editor mode  
**When** the user clicks ".md" inside `[role="group"][aria-label="View mode"]`  
**Then** `[data-testid="source-editor"]` is visible  
**And** `[data-testid="editor-wrap"]` is hidden

**Given** the app is in any mode  
**When** the user clicks "Preview" inside `[role="group"][aria-label="View mode"]`  
**Then** `[data-testid="preview-wrap"]` is visible

**Given** the app is in source mode  
**When** the user clicks "Editor" inside `[role="group"][aria-label="View mode"]`  
**Then** `[data-testid="editor-wrap"]` is visible  
**And** `[data-testid="source-editor"]` is hidden

### Scenario 7 — New document activates filename edit (E2E test 7)

**Given** the app has loaded  
**When** the user clicks `[data-testid="btn-new"]`  
**Then** `input.fileNameEditor` becomes visible

### Scenario 8 — editorRef forwarding works after Batch 5

**Given** EditorPane is extracted with `React.forwardRef` and App passes `ref={editorRef}`  
**When** the user interacts with the editor (types, applies inline styles, creates/resets document)  
**Then** all operations that call `editorRef.current` succeed without null-reference errors  
**And** no console errors about `editorRef.current` being null appear

### Scenario 9 — PDF export works in editor mode after Batch 5

**Given** the app is in editor view mode (PreviewPane is NOT mounted)  
**When** the user triggers PDF export  
**Then** the export succeeds (the always-mounted `pdfPreviewStaging` div is available)  
**And** the export does NOT fail because `previewExportRef.current` is null

### Scenario 10 — App.tsx size constraint

**Given** all 5 batches have been applied  
**When** `App.tsx` line count is measured  
**Then** the line count is between 450 and 550 (inclusive)

### Scenario 11 — src/types.ts exports the five shared types

**Given** the refactor is complete  
**When** `src/types.ts` is inspected  
**Then** it exports `Theme`, `ViewMode`, `RecentDocument`, `PdfViewerDocument`, and `MaybeFileHandle`  
**And** `App.tsx` imports these types from `src/types.ts` using `import type`  
**And** `Locale` is NOT defined in `src/types.ts`

### Scenario 12 — No type-only imports use the value import form

**Given** any new or modified file  
**When** the file is scanned for imports of types defined in `src/types.ts` or other type-only sources  
**Then** every such import uses the `import type { ... }` form  
**And** no `import { SomeType }` (without `type`) exists for type-only imports

### Scenario 13 — className strings are byte-identical

**Given** any extracted component  
**When** the className props passed to DOM elements are compared to the pre-refactor App.tsx  
**Then** every className string (e.g. `"appHeader"`, `"workspace"`, `"editorWrap"`, `"sourceEditor"`, `"previewWrap"`, `"app-footer"`) is byte-identical to the original  
**And** App.css is unchanged

---

## Out of scope (explicit exclusions)

- React Context
- CSS Modules or any CSS changes
- Moving `resolvePageObject`, `pdfImageToDataUrl`, `extractPageImages`, `extractMarkdownFromPdf`, `fileToBase64`
- New features or behavior changes
- Modifying existing tests

---

## Risks captured from proposal

| Risk | Mitigation in spec |
|------|--------------------|
| `editorRef` wiring — if wrong, `.current` is null at runtime | R2.3, R2.4, Scenario 8 are explicit requirements |
| `key` placement — wrong element causes needless ref remount | R2.5 is explicit |
| Staging div — moving it breaks PDF export in non-preview modes | R5.1, R5.2, Scenario 9 are explicit |
| `data-testid` on wrapper vs. original element | R4.1 table with "exact element" column, R4.2 prohibition |
| `className` drift — global CSS depends on exact strings | R4.4 table, Scenario 13 |
| `import type` omission — fails under verbatimModuleSyntax | R3.4, Scenario 12 |
| Test suite used as sole regression gate per batch | R8.1 mandates both suites green after EACH batch |
