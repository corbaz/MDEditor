# Exploration: decompose-app-into-components

## Current State

`src/App.tsx` is 2124 lines. The file has three distinct zones:

1. **Module-level utilities** (lines 1–493): type aliases, module-scope constants (`textColors`, `highlightColors`, `fallbackFonts`, `esTranslations`), standalone utility functions (`isRenderableImageSrc`, `toLocalImagePath`, `resolvePageObject`, `pdfImageToDataUrl`, `extractPageImages`, `extractMarkdownFromPdf`, `fileToBase64`, `getReadableMarkdown`), and the `PreviewImage` sub-component (lines 327–391).
2. **App() component** (lines 494–2122): ALL state, refs, effects, memos, callbacks, and the full JSX render tree.
3. `export default App` (line 2124).

The pure logic layer already lives in `src/lib/` (`format.ts`, `markdown.ts`, `inline-style.ts`, `pdf.ts`). No `src/components/` directory exists yet.

The render return (lines 1480–2121) has these top-level regions:

- `<main data-testid="app-root">` — layout root
  - `<header className="appHeader" data-testid="app-header">` — entire header: left action buttons, fileHistory+fileName, themeSwitch, localeSwitch, modeSwitch
  - `<section className="workspace" data-testid="workspace">` — three conditional branches: editorWrap (MDXEditor), sourceEditor (textarea), previewWrap (preview)
  - `<footer className="app-footer">` — StatusBar (fileMeta with folder/size/savedAt)
  - `<div className="pdfPreviewStaging">` — hidden preview export target
  - `{isPdfPreviewOpen && ...}` — PdfModal overlay
  - `<input ref={fileInputRef} ... className="hiddenFileInput">` — fallback file input
  - `{(isLoadingLatest || isLoadingDocument) && ...}` — LoadingOverlay

## State / Refs Inventory (grouped by concern)

**Document state** (stays in App container): `markdown`, `fileName`, `filePath`, `folderPath`, `lastSavedAt`, `fileHandle` (`MaybeFileHandle | null`), `editorDocumentKey` (key prop that remounts MDXEditor), `recentDocuments` (`RecentDocument[]`), `isEditingFileName`.

**File ops / loading** (stays in App): `isLoadingLatest`, `isLoadingDocument`, `hasLoadedLatestRef`, `lastPersistedRef`, `lastAutoSavedSignatureRef`.

**Theme / locale** (stays in App, passed to children): `theme` (`'light'|'dark'`), `locale` (`'es'|'en'`).

**View mode** (stays in App): `viewMode` (`'editor'|'source'|'preview'`).

**PDF viewer** (stays in App): `isPdfPreviewOpen`, `pdfViewerDocument` (`PdfViewerDocument | null`), `pdfViewerUrl` (blob URL), `embeddedPdfUrl` (useMemo).

**Inline-style toolbar** (stays in App): `selectedTextColor`, `selectedHighlightColor`, `selectedFont`, `availableFonts`, `lastSelectedTextRef`.

**Save status** (stays in App): `saveStatus` (`'idle'|'saving'|'saved'`), `saveStatusTimeoutRef`.

**Editor refs** (shared, stay in App):

- `editorRef` (`MDXEditorMethods`) — used by `applyInlineStyle`, `createNewDocument`, `resetToBlankDocument`, `loadMarkdownIntoEditor`, pendingEditorMarkdown effect
- `previewExportRef` (`HTMLDivElement`) — used by `exportPdf`, `printCurrentDocument`
- `fileInputRef` (`HTMLInputElement`) — used by `openFromDevice`
- `fileNameInputRef` (`HTMLInputElement`) — used by isEditingFileName effect (focus/select)
- `fileNameBeforeEditRef` (`string`)
- `pendingEditorMarkdownRef` (`string | null`)

**useMemo**: `imageUploadHandler`, `imagePreviewHandler`, `currentSizeBytes`, `embeddedPdfUrl`, `buildPreviewPdfHtml` (useCallback).

**useCallback handlers**: `getContent`, `getDocumentSignature`, `rememberSavedSignature`, `showSavedState`, `refreshRecentDocuments`, `persistLatestDocument`, `loadMarkdownIntoEditor`, `autosaveDocument`, `waitForPreviewAssets`, `buildPreviewPdfHtml`, `exportPdf`, `downloadPdf`, `openGeneratedPdfPreview`, `openPdf`, `closePdfViewer`, `exportOpenedPdfAsMarkdown`, `printCurrentDocument`.

**Regular functions**: `translation`, `rememberSelection`, `applyInlineStyle`, `downloadMarkdown`, `renderPreviewMarkdown`, `createNewDocument`, `resetToBlankDocument`, `openRecentDocument`, `openFromDevice`, `onFallbackFileChange`, `saveToDevice`, `deleteCurrentFile`.

## Render Regions → Component Map

**AppRoot** — stays as `App()` itself (the container). `<main className="app ..." data-testid="app-root">` STAYS in App.tsx.

**AppHeader** (`src/components/AppHeader/AppHeader.tsx`) — entire `<header className="appHeader" data-testid="app-header">`. Carries `data-testid="app-header"`, `role="group" aria-label="Theme"`, `role="group" aria-label="Language"`, `role="group" aria-label="View mode"`. ~18 props/callbacks (data: `locale`, `theme`, `viewMode`, `fileName`, `saveStatus`, `isEditingFileName`, `recentDocuments`, `isHistoryOpen`; ref: `fileNameInputRef`; callbacks: `onNew`, `onOpen`, `onSave`, `onDelete`, `onDownloadMd`, `onPreviewPdf`, `onOpenPdf`, `onDownloadPdf`, `onThemeChange`, `onLocaleChange`, `onViewModeChange`, `onFileNameChange`, `onFileNameEditStart`, `onFileNameEditEnd`, `onFileNameInputKeyDown`, `onHistoryToggle`, `onRecentDocumentOpen`).

**FileHistoryMenu** (`src/components/FileHistoryMenu/FileHistoryMenu.tsx`) — dropdown list. Props: `locale`, `recentDocuments`, `currentFileName`, `onSelect(filename)`.

**ThemeSwitch / LocaleSwitch / ViewModeSwitch** — each 2–3 buttons + 1 callback + 1 prop. Each carries its `role="group" aria-label="..."` which MUST stay on that element.

**EditorPane** (`src/components/EditorPane/EditorPane.tsx`) — `<div className="editorWrap" data-testid="editor-wrap">` + MDXEditor + plugins + toolbarContents. `data-testid="editor-wrap"` on wrapper div. `editorDocumentKey` becomes the React `key` on MDXEditor (NOT on EditorPane wrapper). Props: `markdown`, `locale`, `selectedTextColor`, `selectedHighlightColor`, `selectedFont`, `availableFonts`, `imageUploadHandler`, `imagePreviewHandler`, `onMarkdownChange`, `onApplyInlineStyle`, `onRememberSelection`. `editorRef` forwarded via `React.forwardRef`.

**EditorStyleTools** (`src/components/EditorStyleTools/EditorStyleTools.tsx`) — the `<div className="styleTools">` block from toolbarContents. Props: `locale`, color/font state, `onApplyTextColor`, `onApplyHighlight`, `onApplyFont`, `onRememberSelection`.

**SourceEditor** — single `<textarea className="sourceEditor" data-testid="source-editor">`. Barely worth extracting; may stay inline in App.

**PreviewPane** (`src/components/PreviewPane/PreviewPane.tsx`) — `<aside className="previewWrap fullPreview" data-testid="preview-wrap">`. Props: `locale`, `saveStatus`, `markdown`, `onSave`, `onPrint`. `PreviewImage` moves to `src/components/PreviewPane/PreviewImage.tsx`.

**PdfModal** (`src/components/PdfModal/PdfModal.tsx`) — `{isPdfPreviewOpen && <div className="pdfPreviewOverlay">...}`. Props: `locale`, `isOpen`, `pdfViewerDocument`, `embeddedPdfUrl`, `saveStatus`, `onClose`, `onExportAsMarkdown`, `onPrint`, and renders ReactMarkdown for the no-document branch.

**StatusBar** (`src/components/StatusBar/StatusBar.tsx`) — `<footer className="app-footer">` with fileMeta. Props: `locale`, `folderPath`, `sizeBytes`, `lastSavedAt`. No callbacks.

**LoadingOverlay** (`src/components/LoadingOverlay/LoadingOverlay.tsx`) — `{(isLoadingLatest || isLoadingDocument) && <div className="loadingOverlay">}`. Props: `isVisible`, `locale`. Leaf; safest to extract first.

## Hard Parts

1. **editorRef (MDXEditorMethods)** — stays in App; passed to EditorPane via `React.forwardRef`. Pattern: `const EditorPane = React.forwardRef<MDXEditorMethods, EditorPaneProps>((props, ref) => <MDXEditor ref={ref} ... />)`. App: `<EditorPane ref={editorRef} ... />`. Keeps all editorRef usages co-located in the container.
2. **MDXEditor plugins + toolbarContents** — plugins array (closures over `locale`, `imageUploadHandler`, `imagePreviewHandler`) and styleTools JSX move inside EditorPane. `translation` reconstructed inside EditorPane from `locale` prop (pure function of locale; `esTranslations` stays a module-level constant).
3. **PreviewImage + renderPreviewMarkdown** — `PreviewImage` moves to PreviewPane folder. `renderPreviewMarkdown` becomes inline ReactMarkdown taking `markdown` as a prop in each consumer. The hidden staging div stays ALWAYS mounted in App (current behavior); it must NOT move into PreviewPane (which is gated by `viewMode === 'preview'`).
4. **Prop-drilling depth** — AppHeader ~18 props; plain props throughout. NO Context (complicates testing, overkill for 2 values).

## What Stays in App.tsx (Container)

All useState/useRef/useMemo/useCallback/useEffect. All handlers. The `actionLabels` derived object. The staging div. The hidden `<input ref={fileInputRef}>`. Composition of all extracted components. Estimated resulting size: ~450–550 lines (render return drops from ~640 lines to ~60 lines of composition).

## Extraction Order (Safest First)

**Batch 1 — Leaf, prop-only, zero logic risk:** LoadingOverlay, StatusBar, PreviewImage (module-boundary cleanup only).

**Batch 2 — Simple UI panels, 1–3 callbacks:** ThemeSwitch, LocaleSwitch, ViewModeSwitch, FileHistoryMenu.

**Batch 3 — Moderate:** PreviewPane, PdfModal.

**Batch 4 — Hard (many props):** AppHeader.

**Batch 5 — Hardest (ref forwarding + plugins):** EditorStyleTools, then EditorPane.

Run `bun run test` + `bun run test:e2e` green after EACH batch before starting the next.

## File/Folder Convention

```
src/
  components/
    LoadingOverlay/LoadingOverlay.tsx
    StatusBar/StatusBar.tsx
    ThemeSwitch/ThemeSwitch.tsx
    LocaleSwitch/LocaleSwitch.tsx
    ViewModeSwitch/ViewModeSwitch.tsx
    FileHistoryMenu/FileHistoryMenu.tsx
    PreviewPane/PreviewPane.tsx
    PreviewPane/PreviewImage.tsx
    PdfModal/PdfModal.tsx
    AppHeader/AppHeader.tsx
    EditorPane/EditorPane.tsx
    EditorStyleTools/EditorStyleTools.tsx
```

One folder per component. No barrel `index.ts`. Full-path imports.

**Shared types**: promote `Theme`, `ViewMode`, `RecentDocument`, `PdfViewerDocument`, `MaybeFileHandle` to `src/types.ts`. `Locale` already lives in `src/lib/format.ts` — keep it there. `verbatimModuleSyntax` is ON — all type-only imports use `import type { ... }`.

## Risks

1. editorRef forwardRef wiring — if wrong, all `editorRef.current` calls become null at runtime. Test E2E immediately after EditorPane.
2. data-testid/aria contract migration — each element MUST carry its testid/aria in the NEW component.
3. CSS class names must stay identical — `App.css` is a global stylesheet targeting `.appHeader`/`.workspace`/`.editorWrap`/`.sourceEditor`/`.previewWrap`/`.app-footer`. No CSS Modules.
4. `key={editorDocumentKey}` must stay on MDXEditor, not EditorPane wrapper (else needless remount of refs).
5. previewExportRef / staging div must stay always-mounted in App.
6. renderPreviewMarkdown called in 3 places — inline ReactMarkdown in each consumer.
7. Prop threading bugs (largest surface: AppHeader). Type safety catches most.
8. verbatimModuleSyntax — type-only imports must use `import type`.
9. translation function reconstructed inside EditorPane from locale.
10. Module-level PDF utilities stay in App.tsx (moving them is out of scope).

## Approaches

| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| A — Container/Presentational (recommended) | Matches existing pattern; App owns state, children dumb; testable in isolation; zero behavior change | Large prop surface on AppHeader and EditorPane | Medium |
| B — Context for theme/locale | Reduces prop drilling | Adds indirection; harder to test; overkill for 2 values | Low-Medium |
| C — Monolithic with same-file sub-components | Zero import/type work | Doesn't reduce file size or improve discoverability | Low value |

## Recommendation

Approach A. 12 components across 5 batches, safest-first. No Context. editorRef forwarded via `React.forwardRef`. Shared types in `src/types.ts`. Tests green between batches.
