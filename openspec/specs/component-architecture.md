# Spec: component-architecture

> Persistent capability spec. Records the container/presentational component architecture established by change `decompose-app-into-components` (merged via PR #6).

## Pattern

- **Container/presentational.** `src/App.tsx` is the CONTAINER: it owns all React state (`useState`/`useRef`), effects, memoized values, and handler functions, plus the module-level impure pdfjs orchestration (resolvePageObject, pdfImageToDataUrl, extractPageImages, extractMarkdownFromPdf, fileToBase64) and the always-mounted `pdfPreviewStaging` div (`previewExportRef`). Its render is a thin (~60-line) composition of presentational components.
- **Presentational components** under `src/components/<Name>/<Name>.tsx` receive data + callbacks via plain props (NO Context, NO CSS Modules). They carry the className strings that `src/App.css` (global stylesheet) targets — class names are part of the contract.

## Components

`src/components/`:
- `LoadingOverlay/LoadingOverlay.tsx`
- `StatusBar/StatusBar.tsx` (footer, `data-testid="app-footer-status"`)
- `ThemeSwitch/ThemeSwitch.tsx`, `LocaleSwitch/LocaleSwitch.tsx`, `ViewModeSwitch/ViewModeSwitch.tsx` (each keeps `role="group"`+`aria-label`)
- `FileHistoryMenu/FileHistoryMenu.tsx`
- `AppHeader/AppHeader.tsx` (renders the switches + FileHistoryMenu; carries `data-testid="app-header"`, `btn-new`, `btn-save`)
- `PreviewPane/PreviewPane.tsx` (`data-testid="preview-wrap"`), `PreviewPane/PreviewImage.tsx`, `PreviewPane/PreviewContent.tsx` (shared ReactMarkdown render helper, used by PreviewPane + PdfModal)
- `PdfModal/PdfModal.tsx`
- `EditorPane/EditorPane.tsx`, `EditorPane/EditorStyleTools.tsx`

No barrel `index.ts`; imports use full paths.

## Key invariants

- **editorRef stays in App.** `EditorPane` is `forwardRef<MDXEditorMethods, EditorPaneProps>` and threads the ref to `<MDXEditor ref={...}>`. App declares `editorRef` and passes `ref={editorRef}` to `<EditorPane>`; all `editorRef.current` handler calls keep working.
- **`key={editorDocumentKey}` is on `<MDXEditor>`**, never on the EditorPane wrapper (remount semantics).
- The MDXEditor `plugins` array is rebuilt inline each render (no `useMemo`) to preserve exact behavior.
- `translation` + `esTranslations` live inside EditorPane.
- `isRenderableImageSrc` / `toLocalImagePath` are intentionally duplicated: App keeps copies for `imagePreviewHandler`; `PreviewImage` has its own.
- The source-mode `<textarea data-testid="source-editor">` stays in App.

## Shared types

`src/types.ts`: `Theme`, `ViewMode`, `RecentDocument`, `PdfViewerDocument`, `MaybeFileHandle`. `Locale` stays in `src/lib/format`. All type-only imports use `import type` (verbatimModuleSyntax).

## Contract (preserved; tests enforce)

9 `data-testid` (app-root, app-header, workspace, editor-wrap, source-editor, preview-wrap, btn-new, btn-save, app-footer-status), the 3 role/aria-label groups, byte-identical className strings, `src/App.css` and `src/lib` untouched. 114 Vitest unit + 7 Playwright E2E green; zero visual/behavior change.
