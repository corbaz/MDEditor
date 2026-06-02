# Technical design: decompose App.tsx into 12 presentational components

App.tsx becomes a thin container. The render return drops from ~640 lines to ~60 lines of composition. All state, refs, effects, handlers, the always-mounted staging div, the hidden file input, and the `<main data-testid="app-root">` wrapper stay in App. Twelve dumb presentational components under `src/components/<Name>/<Name>.tsx` receive plain props + callbacks. Shared types move to `src/types.ts`. ZERO behavior or visual change — guarded by 114 Vitest + 7 Playwright tests.

## Quick path (architecture at a glance)

| Decision | Choice |
|----------|--------|
| Pattern | Container / presentational. App = container; 12 children = pure presentational. |
| State ownership | 100% in App. Children get props + callbacks only. |
| Cross-cutting state (theme/locale) | Plain props. NO React Context. |
| `editorRef` | `forwardRef<MDXEditorMethods, EditorPaneProps>`; App keeps the ref. |
| Types | `import type` everywhere (`verbatimModuleSyntax` ON). New `src/types.ts`. |
| Styling | Global `App.css` unchanged. NO CSS Modules. className strings byte-identical. |
| File layout | One folder per component, NO barrel `index.ts`, full-path imports. |
| `actionLabels` | App computes once, passes the needed slice(s) to each consumer. |
| `renderPreviewMarkdown` | Inlined as `<PreviewPaneBody markdown={...}/>`-style ReactMarkdown in each of the 3 consumers, each taking `markdown` prop. |

## 1. src/types.ts (exact, copy-ready)

Move the 5 shared types out of App.tsx. `LocalFontData`, `WindowWithLocalFonts`, and `EditorDocument` stay in App.tsx (App-internal only, not crossing a component boundary). `Locale` stays imported from `src/lib/format.ts` — do NOT re-export it here.

```ts
// src/types.ts

export type Theme = 'light' | 'dark';

export type ViewMode = 'editor' | 'source' | 'preview';

export type MaybeFileHandle = {
    name?: string;
    createWritable?: () => Promise<{
        write: (data: string) => Promise<void>;
        close: () => Promise<void>;
    }>;
};

export type RecentDocument = {
    filename: string;
    updatedAt: number;
    filePath?: string;
    folderPath?: string;
    sizeBytes?: number;
};

export type PdfViewerDocument = {
    filePath: string;
    filename: string;
    dataUrl: string;
};
```

App.tsx then imports: `import type { Theme, ViewMode, MaybeFileHandle, RecentDocument, PdfViewerDocument } from './types';` and removes those 5 inline `type` declarations. `MaybeFileHandle`, `RecentDocument`, `PdfViewerDocument` are used in `useState` generics; `Theme`/`ViewMode` in `useState` generics and props.

## 2. Per-component Props interfaces (exact, copy-ready)

All component files start with `import type { ... } from '../../types';` (or `../../lib/...`) for type-only imports. Each `Props` interface lives at the top of its `.tsx`.

### Batch 1 — leaves

**LoadingOverlay** — `src/components/LoadingOverlay/LoadingOverlay.tsx`
Renders the `loadingOverlay` block (App lines 2109-2119). App keeps the `(isLoadingLatest || isLoadingDocument)` gate OR passes a single `visible` prop; recommend the component returns `null` when not visible to keep App composition flat.

```ts
import type { Locale } from '../../lib/format';

interface LoadingOverlayProps {
    visible: boolean;
    locale: Locale;
}
```
Carries: `className="loadingOverlay"`, `aria-label={locale==='es' ? 'Cargando...' : 'Loading...'}`, inner `.spinner` and `.spinnerLabel`. No testid. Returns `null` when `!visible`.

**StatusBar** — `src/components/StatusBar/StatusBar.tsx`
Renders `<footer className="app-footer" data-testid="app-footer-status">` (lines 1996-2003).

```ts
import type { Locale } from '../../lib/format';

interface StatusBarProps {
    folderPath: string;
    visibleFolder: string;
    currentSizeBytes: number;
    lastSavedAt: number | null;
    locale: Locale;
}
```
Carries: `data-testid="app-footer-status"`, `className="app-footer"`, `.fileMeta` with `title={folderPath || visibleFolder}`, `<Folder size={13}/>`, `.fileMetaFolder`, and `formatFileSize` / `formatSavedAt` calls (imported from `../../lib/format` inside the component — they are pure).

**PreviewImage** — `src/components/PreviewPane/PreviewImage.tsx`
Moves the existing `PreviewImage` function (lines 327-391) verbatim, plus the two helpers it depends on (`isRenderableImageSrc`, `toLocalImagePath`, lines 113-121) — move those into `PreviewImage.tsx` as module-local consts (they are only used by PreviewImage and `imagePreviewHandler`; keep a copy/shared note — see risks).

```ts
interface PreviewImageProps {
    src?: string;
    alt?: string;
    width?: string | number;
    height?: string | number;
}
```
Carries: `className="previewImage"`, the local-image resolution `useEffect` (the ONE allowed stateful leaf — it owns `resolvedImage` local state and calls `window.electronAPI?.readLocalImageAsDataUrl`). This is intentionally not "pure" but is self-contained presentational state, identical to today.

> Folder note: PreviewImage lives under `PreviewPane/` because it is PreviewPane's private child. It is also imported by `App.tsx`'s staging div and by `PdfModal`. Full-path import: `import { PreviewImage } from '../PreviewPane/PreviewImage';` from PdfModal, `'./PreviewPane/PreviewImage'`-style from App. (See decision table for why no barrel.)

### Batch 2 — simple panels

**ThemeSwitch** — `src/components/ThemeSwitch/ThemeSwitch.tsx` (lines 1648-1667)

```ts
import type { Theme } from '../../types';

interface ThemeSwitchProps {
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
}
```
Carries: `<div className="themeSwitch segmentedSwitch" role="group" aria-label="Theme">`, two buttons with `active` class by `theme`, `onClick={() => onThemeChange('light'|'dark')}`. Button text `Light` / `Dark` stays literal.

**LocaleSwitch** — `src/components/LocaleSwitch/LocaleSwitch.tsx` (lines 1668-1687)

```ts
import type { Locale } from '../../lib/format';

interface LocaleSwitchProps {
    locale: Locale;
    onLocaleChange: (locale: Locale) => void;
}
```
Carries: `<div className="localeSwitch segmentedSwitch" role="group" aria-label="Language">`, buttons `ES` / `US`, `active` by `locale === 'es'|'en'`.

**ViewModeSwitch** — `src/components/ViewModeSwitch/ViewModeSwitch.tsx` (lines 1688-1714)

```ts
import type { ViewMode } from '../../types';

interface ViewModeSwitchProps {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
}
```
Carries: `<div className="modeSwitch segmentedSwitch" role="group" aria-label="View mode">`, three buttons `Editor` / `.md` / `Preview`, `active` by `viewMode`.

**FileHistoryMenu** — `src/components/FileHistoryMenu/FileHistoryMenu.tsx` (lines 1567-1647)
The `fileHistory` div: filename editor input (edit mode) OR trigger button + dropdown menu.

```ts
import type { RefObject } from 'react';
import type { Locale } from '../../lib/format';
import type { RecentDocument } from '../../types';

interface FileHistoryMenuProps {
    fileName: string;
    recentDocuments: RecentDocument[];
    isEditingFileName: boolean;
    isHistoryOpen: boolean;
    locale: Locale;
    fileNameInputRef: RefObject<HTMLInputElement | null>;
    onFileNameChange: (value: string) => void;        // setFileName
    onFileNameCommit: () => void;                      // onBlur logic (normalize + persist)
    onFileNameKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onToggleHistory: () => void;                       // setIsHistoryOpen(o => !o)
    onStartRename: () => void;                          // onDoubleClick: set ref + setIsEditingFileName(true)
    onSelectRecent: (filename: string) => void;        // openRecentDocument
}
```
Carries: `className="fileHistory"`, `.fileNameEditor` input, `.fileHistoryTrigger` button with `<ChevronDown size={14}/>`, `.fileHistoryMenu` dropdown, "Sin recientes"/"No recent files" empty state, `active` class on the current file.
Ref: App owns `fileNameInputRef`; it is passed down so focus logic in App's effect still targets the live input.
Recommendation: keep the onBlur normalize+persist closure in App and expose it as `onFileNameCommit` so FileHistoryMenu stays presentational (no `normalizeFileName`/`persistLatestDocument` knowledge).

### Batch 3 — moderate

**PreviewPane** — `src/components/PreviewPane/PreviewPane.tsx` (lines 1964-1993, the `viewMode === 'preview'` `<aside>`)

```ts
import type { Locale } from '../../lib/format';

interface PreviewPaneProps {
    markdown: string;
    saveStatus: 'idle' | 'saving' | 'saved';
    saveLabel: string;       // actionLabels.save
    printLabel: string;      // actionLabels.print
    locale: Locale;          // reserved; only needed if future copy — see note
    onSave: () => void;      // () => void saveToDevice()
    onPrint: () => void;     // () => void printCurrentDocument()
}
```
Carries: `data-testid="preview-wrap"`, `className="previewWrap fullPreview"`, `.previewHeader.previewHeaderRow` with `<span>Preview</span>`, save button `className={\`iconBtn actionIcon saveBtn ${saveStatus}\`}`, print button, `.pdfPreviewViewport.screenPreviewViewport` > `.pdfPreviewPage.pdfPreviewPageVisible` containing the inline ReactMarkdown.
ReactMarkdown: rendered inline inside PreviewPane (see §4). `locale` prop is only needed if we move aria copy; since save/print labels are passed pre-computed, `locale` can be DROPPED from PreviewPaneProps. Recommend dropping it — the `<span>Preview</span>` literal is locale-agnostic today.

**PdfModal** — `src/components/PdfModal/PdfModal.tsx` (lines 2011-2100, the `isPdfPreviewOpen` overlay)

```ts
import type { Locale } from '../../lib/format';
import type { PdfViewerDocument } from '../../types';

interface PdfModalProps {
    open: boolean;                              // isPdfPreviewOpen
    pdfViewerDocument: PdfViewerDocument | null;
    embeddedPdfUrl: string;
    markdown: string;                           // for the no-document ReactMarkdown branch
    locale: Locale;                             // all modal copy is locale-conditional
    exportLabel: string;                        // actionLabels.exportPdfAsMd
    printLabel: string;                         // actionLabels.print
    onClose: () => void;                        // closePdfViewer
    onExportPdfAsMarkdown: () => void;          // () => void exportOpenedPdfAsMarkdown()
    onPrint: () => void;                        // () => void printCurrentDocument()
}
```
Carries: `role="dialog"`, `aria-modal="true"`, the locale-conditional `aria-label`, `.pdfPreviewOverlay` (onClick=onClose), `.pdfPreviewModal` (onClick stopPropagation), header group, the `pdfViewerDocument` iframe branch (`src={embeddedPdfUrl}`) vs no-doc inline ReactMarkdown branch, close `<X/>`.
`locale` IS needed here (modal text "PDF abierto"/"Opened PDF", "Visor PDF", "Cerrar"/"Close" are inline-conditional). Returns `null` when `!open` so App composition stays flat.

### Batch 4 — large prop surface

**AppHeader** — `src/components/AppHeader/AppHeader.tsx` (lines 1485-1715, the whole `<header>`)
AppHeader OWNS the `.headerLeft` action buttons and COMPOSES the four sub-components (FileHistoryMenu, ThemeSwitch, LocaleSwitch, ViewModeSwitch). This keeps App's composition flat: App renders `<AppHeader .../>`, AppHeader renders the switches.

```ts
import type { RefObject } from 'react';
import type { Locale } from '../../lib/format';
import type { Theme, ViewMode, RecentDocument } from '../../types';

interface AppHeaderProps {
    // action labels (slice of actionLabels)
    actionLabels: {
        create: string; open: string; save: string; delete: string;
        downloadMd: string; previewPdf: string; openPdf: string; downloadPdf: string;
    };
    saveStatus: 'idle' | 'saving' | 'saved';
    // header-left actions
    onCreateNew: () => void;          // () => void createNewDocument()
    onOpenFromDevice: () => void;     // openFromDevice
    onSave: () => void;               // saveToDevice
    onDelete: () => void;             // () => void deleteCurrentFile()
    onDownloadMarkdown: () => void;   // downloadMarkdown
    onPreviewPdf: () => void;         // openGeneratedPdfPreview
    onOpenPdf: () => void;            // () => void openPdf()
    onDownloadPdf: () => void;        // () => void downloadPdf()
    // file history (forwarded to FileHistoryMenu)
    fileName: string;
    recentDocuments: RecentDocument[];
    isEditingFileName: boolean;
    isHistoryOpen: boolean;
    fileNameInputRef: RefObject<HTMLInputElement | null>;
    onFileNameChange: (value: string) => void;
    onFileNameCommit: () => void;
    onFileNameKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onToggleHistory: () => void;
    onStartRename: () => void;
    onSelectRecent: (filename: string) => void;
    // switches
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
    locale: Locale;
    onLocaleChange: (locale: Locale) => void;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
}
```
Carries: `data-testid="app-header"`, `className="appHeader"`, `.headerLeft` with `<h1>MD Editor</h1>` and all action buttons including `data-testid="btn-new"` (on the FilePlus button) and `data-testid="btn-save"` (on the Save button). All `aria-label`/`data-label` come from `actionLabels`. Save button keeps `className={\`iconBtn actionIcon saveBtn ${saveStatus}\`}`.
Composition inside AppHeader: `<FileHistoryMenu .../>`, `<ThemeSwitch .../>`, `<LocaleSwitch .../>`, `<ViewModeSwitch .../>` — full-path imports from sibling folders (`../FileHistoryMenu/FileHistoryMenu`, etc.).

### Batch 5 — ref forwarding + plugins

**EditorStyleTools** — `src/components/EditorStyleTools/EditorStyleTools.tsx` (lines 1770-1945, the `.styleTools` div)

```ts
import type { Locale } from '../../lib/format';
import type { InlineStyleKind } from '../../lib/inline-style';

interface EditorStyleToolsProps {
    locale: Locale;
    textColors: readonly string[];
    highlightColors: readonly string[];
    availableFonts: string[];
    selectedTextColor: string;
    selectedHighlightColor: string;
    selectedFont: string;
    onSelectTextColor: (color: string) => void;        // setSelectedTextColor
    onSelectHighlightColor: (color: string) => void;   // setSelectedHighlightColor
    onSelectFont: (font: string) => void;              // setSelectedFont
    onApplyInlineStyle: (kind: InlineStyleKind, value: string) => void;  // applyInlineStyle
    onRememberSelection: () => void;                   // rememberSelection (onMouseDown)
}
```
Carries: `.styleTools` (onMouseDown=onRememberSelection), `.styleToolGroup` (text color + highlight), `<Palette/>`, `<Highlighter/>`, `.colorSwatch` buttons, `type="color"` inputs, `.fontSelect`. All locale-conditional `title`/`aria-label` strings stay inline-conditional on `locale`. The combined set+apply onClick handlers stay as two-call closures inside this component (calling the two passed callbacks), preserving exact behavior.

**EditorPane** — `src/components/EditorPane/EditorPane.tsx` (lines 1718-1952, the `viewMode === 'editor'` `.editorWrap` + `<MDXEditor>`)

```ts
import { forwardRef } from 'react';
import type { MDXEditorMethods } from '@mdxeditor/editor';
import type { Locale } from '../../lib/format';
import type { InlineStyleKind } from '../../lib/inline-style';

interface EditorPaneProps {
    markdown: string;
    editorDocumentKey: string;
    onChange: (markdown: string) => void;        // setMarkdown
    translation: (key: string, defaultValue: string,
        interpolations?: Record<string, string | number>) => string;
    imageUploadHandler: (image: File) => Promise<string>;
    imagePreviewHandler: (src: string) => Promise<string>;
    // forwarded to EditorStyleTools (toolbar)
    locale: Locale;
    textColors: readonly string[];
    highlightColors: readonly string[];
    availableFonts: string[];
    selectedTextColor: string;
    selectedHighlightColor: string;
    selectedFont: string;
    onSelectTextColor: (color: string) => void;
    onSelectHighlightColor: (color: string) => void;
    onSelectFont: (font: string) => void;
    onApplyInlineStyle: (kind: InlineStyleKind, value: string) => void;
    onRememberSelection: () => void;
}

export const EditorPane = forwardRef<MDXEditorMethods, EditorPaneProps>(
    function EditorPane(props, ref) { /* ... */ }
);
```
See §3 for the body contract.

## 3. EditorPane forwardRef design

Signature: `forwardRef<MDXEditorMethods, EditorPaneProps>(function EditorPane(props, ref) {...})`. Named inner function for clean stack traces / devtools.

App wiring (unchanged ownership): App still declares `const editorRef = useRef<MDXEditorMethods>(null);` and renders `{viewMode === 'editor' && <EditorPane ref={editorRef} ... />}`. All 5 App-level consumers (`applyInlineStyle`, `createNewDocument`, `resetToBlankDocument`, `loadMarkdownIntoEditor`, the `pendingEditorMarkdown` effect) keep calling `editorRef.current?.*` exactly as today.

Body contract:
- Outer wrapper: `<div className="editorWrap" data-testid="editor-wrap">` — the `data-testid` moves WITH this div. NO `key` here.
- `<MDXEditor key={props.editorDocumentKey} ref={ref} markdown={props.markdown} onChange={props.onChange} translation={props.translation} className="editor" plugins={[...]} />`. The `key={editorDocumentKey}` stays on `<MDXEditor>` (NOT the wrapper) so changing the document key remounts only the editor, never thrashing the ref bridge.
- The `plugins` array is built INSIDE EditorPane's render (it depends on `imageUploadHandler`, `imagePreviewHandler`, and the toolbar which needs locale + style-tool callbacks). `imagePlugin({ imageUploadHandler: props.imageUploadHandler, imagePreviewHandler: props.imagePreviewHandler, allowSetImageDimensions: true })`. The `codeMirrorPlugin` language map and all other plugins are copied verbatim.
- `toolbarPlugin({ toolbarContents: () => (<><UndoRedo/>...<InsertThematicBreak/><EditorStyleTools {...styleToolProps}/></>) })`. The inline `.styleTools` block (lines 1770-1945) is replaced by `<EditorStyleTools ... />` receiving the forwarded style props.
- `translation` arrives as a prop (App builds it from `locale` + `esTranslations`); EditorPane does not own translation logic.

Memo note: today the `plugins` array is rebuilt every render (it is an inline literal). EditorPane preserves that exact behavior — do NOT introduce `useMemo` (that would be a behavior change risk on the toolbar closure). Keep parity.

## 4. PreviewPane + PdfModal + staging (ReactMarkdown in 3 places)

`renderPreviewMarkdown()` (lines 925-951) is currently a closure over `markdown`. It is consumed in 3 places: PreviewPane (1989), staging div (2007), PdfModal no-doc branch (2094). We do NOT keep a shared closure across components. Instead each consumer renders ReactMarkdown inline, taking `markdown` as a prop, using `PreviewImage` for the `img` component.

To avoid triplicating the ReactMarkdown config, extract a tiny shared presentational helper:

`src/components/PreviewPane/PreviewContent.tsx`:
```ts
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { PreviewImage } from './PreviewImage';

interface PreviewContentProps { markdown: string; }

export function PreviewContent({ markdown }: PreviewContentProps) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            urlTransform={(url) => url}
            components={{
                img: ({ src = '', alt = '', width, height }) => (
                    <PreviewImage src={src} alt={alt} width={width} height={height} />
                ),
            }}
        >
            {markdown}
        </ReactMarkdown>
    );
}
```
> Note: the original `urlTransform` has dead-code branches that both `return url`; collapse to `(url) => url` (behavior-identical). If verify is strict about byte parity, keep the original branchy version — functionally identical. Recommend the collapsed form.

Consumers:
- **PreviewPane** renders `<PreviewContent markdown={markdown} />` inside `.pdfPreviewPage.pdfPreviewPageVisible`.
- **PdfModal** no-document branch renders `<PreviewContent markdown={markdown} />` inside `.pdfPreviewPage.pdfPreviewPageVisible`.
- **Staging div STAYS IN App** (lines 2005-2009), always-mounted, holding `ref={previewExportRef}`, rendering `<PreviewContent markdown={markdown} />`. It must NOT move into PreviewPane (which is `viewMode === 'preview'`-gated) or PDF export breaks in editor/source mode. App imports `PreviewContent` from `./components/PreviewPane/PreviewContent`.

`PreviewContent` lives under `PreviewPane/` (it is PreviewPane's content), shared by PdfModal and App's staging div via full-path import. This is the same no-barrel, deep-import convention as PreviewImage.

## 5. actionLabels — recommendation

**Recommend: App computes `actionLabels` once (unchanged, lines 1460-1478) and passes the needed slices down.** Do NOT have each component re-derive from `locale + saveStatus`.

Rationale:
- The `save` label already couples `locale` AND `saveStatus`; re-deriving in two places (AppHeader + PreviewPane) risks drift.
- Single source of truth keeps the locale/status logic in the container where all other derived values live.
- Passing strings keeps children dumb and trivially testable (`saveLabel="Saved"` is a clear prop).

Distribution:
- AppHeader gets the full `actionLabels` object (it uses 8 of the labels).
- PreviewPane gets `saveLabel` + `printLabel`.
- PdfModal gets `exportLabel` + `printLabel`.
- `saveStatus` is still passed separately to AppHeader and PreviewPane because the save button className (`saveBtn ${saveStatus}`) needs the raw status, not just the label.

## 6. App.tsx after — resulting composition

App keeps ALL of: every `useState`/`useRef` (lines 495-535), `translation`, `imageUploadHandler`/`imagePreviewHandler` memos, every `useCallback`/`useEffect`/`useMemo`, every handler (`createNewDocument`, `applyInlineStyle`, `rememberSelection`, `saveToDevice`, `openPdf`, `closePdfViewer`, `loadMarkdownIntoEditor`, etc.), `visibleFolder`, `embeddedPdfUrl`, `actionLabels`, the always-mounted staging div, the hidden file input, and the `<main data-testid="app-root">` wrapper. The pdfjs impure utils (`resolvePageObject`, `pdfImageToDataUrl`, `extractPageImages`, `extractMarkdownFromPdf`, `fileToBase64`) STAY in App.tsx (out of scope).

Resulting return (~60 lines):
```tsx
return (
    <main
        className={`app ${theme === 'dark' ? 'dark-theme' : 'light-theme'}`}
        data-testid="app-root"
    >
        <AppHeader
            actionLabels={actionLabels}
            saveStatus={saveStatus}
            onCreateNew={() => void createNewDocument()}
            onOpenFromDevice={openFromDevice}
            onSave={saveToDevice}
            onDelete={() => void deleteCurrentFile()}
            onDownloadMarkdown={downloadMarkdown}
            onPreviewPdf={openGeneratedPdfPreview}
            onOpenPdf={() => void openPdf()}
            onDownloadPdf={() => void downloadPdf()}
            fileName={fileName}
            recentDocuments={recentDocuments}
            isEditingFileName={isEditingFileName}
            isHistoryOpen={isHistoryOpen}
            fileNameInputRef={fileNameInputRef}
            onFileNameChange={setFileName}
            onFileNameCommit={commitFileNameRename}   // extracted onBlur closure
            onFileNameKeyDown={handleFileNameKeyDown} // extracted onKeyDown closure
            onToggleHistory={() => setIsHistoryOpen((open) => !open)}
            onStartRename={startFileNameRename}
            onSelectRecent={(filename) => void openRecentDocument(filename)}
            theme={theme}
            onThemeChange={setTheme}
            locale={locale}
            onLocaleChange={setLocale}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
        />

        <section className="workspace" data-testid="workspace">
            {viewMode === 'editor' && (
                <EditorPane
                    ref={editorRef}
                    markdown={markdown}
                    editorDocumentKey={editorDocumentKey}
                    onChange={setMarkdown}
                    translation={translation}
                    imageUploadHandler={imageUploadHandler}
                    imagePreviewHandler={imagePreviewHandler}
                    locale={locale}
                    textColors={textColors}
                    highlightColors={highlightColors}
                    availableFonts={availableFonts}
                    selectedTextColor={selectedTextColor}
                    selectedHighlightColor={selectedHighlightColor}
                    selectedFont={selectedFont}
                    onSelectTextColor={setSelectedTextColor}
                    onSelectHighlightColor={setSelectedHighlightColor}
                    onSelectFont={setSelectedFont}
                    onApplyInlineStyle={applyInlineStyle}
                    onRememberSelection={rememberSelection}
                />
            )}
            {viewMode === 'source' && (
                <textarea
                    className="sourceEditor"
                    value={getReadableMarkdown(markdown)}
                    spellCheck={false}
                    readOnly
                    data-testid="source-editor"
                />
            )}
            {viewMode === 'preview' && (
                <PreviewPane
                    markdown={markdown}
                    saveStatus={saveStatus}
                    saveLabel={actionLabels.save}
                    printLabel={actionLabels.print}
                    onSave={() => void saveToDevice()}
                    onPrint={() => void printCurrentDocument()}
                />
            )}
        </section>

        <StatusBar
            folderPath={folderPath}
            visibleFolder={visibleFolder}
            currentSizeBytes={currentSizeBytes}
            lastSavedAt={lastSavedAt}
            locale={locale}
        />

        {/* Always-mounted; powers PDF export in every viewMode */}
        <div className="pdfPreviewStaging" aria-hidden="true">
            <div ref={previewExportRef} className="pdfPreviewPage">
                <PreviewContent markdown={markdown} />
            </div>
        </div>

        <PdfModal
            open={isPdfPreviewOpen}
            pdfViewerDocument={pdfViewerDocument}
            embeddedPdfUrl={embeddedPdfUrl}
            markdown={markdown}
            locale={locale}
            exportLabel={actionLabels.exportPdfAsMd}
            printLabel={actionLabels.print}
            onClose={closePdfViewer}
            onExportPdfAsMarkdown={() => void exportOpenedPdfAsMarkdown()}
            onPrint={() => void printCurrentDocument()}
        />

        <input
            ref={fileInputRef}
            type="file"
            accept=".md,text/markdown"
            className="hiddenFileInput"
            onChange={onFallbackFileChange}
        />

        <LoadingOverlay
            visible={isLoadingLatest || isLoadingDocument}
            locale={locale}
        />
    </main>
);
```

Note: the `textarea` source view (lines 1954-1962) stays inline in App — it is 8 lines, trivial, and not in the 12-component list. The leftover `source` branch is acceptable in the container.

Three small closures must be extracted from inline JSX into named App handlers so FileHistoryMenu stays dumb: `commitFileNameRename` (the onBlur normalize+persist block, lines 1576-1593), `handleFileNameKeyDown` (lines 1594-1601), `startFileNameRename` (lines 1608-1611). These are pure lifts — same logic, just named.

## 7. Per-batch apply + verify loop

Extraction order (safest-first). After EACH batch: run the full gate before advancing.

| Batch | Components | Gate (all must pass before next batch) |
|-------|-----------|----------------------------------------|
| 0 (prep) | Create `src/types.ts`; migrate the 5 types; update App imports. | `bun run build` + `bun run lint` + Vitest + Playwright green. |
| 1 | LoadingOverlay, StatusBar, PreviewImage (+ PreviewContent helper) | same gate |
| 2 | ThemeSwitch, LocaleSwitch, ViewModeSwitch, FileHistoryMenu | same gate |
| 3 | PreviewPane, PdfModal | same gate |
| 4 | AppHeader (composes batch-2 switches + FileHistoryMenu) | same gate |
| 5 | EditorStyleTools, EditorPane (forwardRef) | same gate |

Per-batch loop: extract → wire props in App → `bun run build` → `bun run lint` → `bun run test` (Vitest 114) → Playwright (7). Any red → fix or revert that batch's commit; prior batches remain valid. One commit/PR per batch (chained, stacked-to-main) per the proposal's delivery forecast (~1600 lines > 400 budget).

> Batch ordering caveat: Batch 0 (types) is a pure prep step folded into Batch 1's PR if preferred. PreviewContent (the ReactMarkdown helper) MUST land in Batch 1 because PreviewPane (Batch 3), PdfModal (Batch 3), and App's staging div all depend on it.

## 8. Decision-rationale table

| Decision | Rationale | Rejected alternative |
|----------|-----------|----------------------|
| Container/presentational | App already owns all state/handlers → children are a mechanical JSX lift, lowest risk to zero-behavior-change. | Logic rewrite / hooks extraction (scope creep, behavior risk). |
| No React Context | Only theme+locale are cross-cutting; 2 values do not justify hidden data flow + harder tests. | Context provider (Approach B) — over-engineered. |
| `forwardRef` for EditorPane | Keeps `editorRef` owned by App so its 5 consumers stay co-located; EditorPane still renders `<MDXEditor ref>`. | Lifting ref consumers into EditorPane (would scatter container logic). |
| `import type` everywhere | `verbatimModuleSyntax` ON — type-only imports must be elided. | Value imports for types → build error. |
| No barrel `index.ts`, deep imports | Explicit provenance, no circular-import traps, smaller bundles, matches existing `src/lib/` convention. | Barrel exports — hide deps, risk cycles. |
| No CSS Modules | `App.css` is global; classNames are the test/style contract and must stay byte-identical. | CSS Modules → className hashing breaks global CSS + tests. |
| App computes `actionLabels`, passes slices | Single source of truth for locale+saveStatus-coupled labels; children stay dumb. | Per-component re-derivation → drift risk on `save` label. |
| `PreviewContent` shared helper | Avoids triplicating ReactMarkdown config across 3 consumers while keeping each consumer prop-driven. | Inline ReactMarkdown ×3 (duplication) / shared closure across components (breaks isolation). |
| Staging div stays in App | Always-mounted requirement for PDF export across all viewModes; PreviewPane is viewMode-gated. | Moving it into PreviewPane → export breaks in editor/source mode. |
| AppHeader composes the 3 switches + history | Keeps App's composition flat (~60 lines) and groups header concerns. | App rendering switches directly → fatter App return, weaker cohesion. |
| `key={editorDocumentKey}` on `<MDXEditor>` | Remount only the editor on doc change; never thrash the wrapper/ref. | `key` on `.editorWrap` → needless ref remount. |
| `data-testid`/`aria` move with exact element | Hard test contract (8 testids, 3 aria groups) must survive. | Putting testids on new wrappers → test failures. |

## Checklist (verify after all batches)

- [ ] `src/types.ts` exports Theme, ViewMode, MaybeFileHandle, RecentDocument, PdfViewerDocument; `Locale` still from `src/lib/format`.
- [ ] 12 components under `src/components/<Name>/<Name>.tsx`; PreviewImage + PreviewContent under `PreviewPane/`.
- [ ] No barrel `index.ts`; all imports full-path.
- [ ] `import type` for every type-only import.
- [ ] 8 data-testid present (app-root on App `<main>`; app-header/btn-new/btn-save in AppHeader; workspace in App `<section>`; editor-wrap in EditorPane; source-editor in App textarea; preview-wrap in PreviewPane).
- [ ] 3 `role="group"` + aria-label (Theme/Language/View mode).
- [ ] All className strings byte-identical.
- [ ] `editorRef.current` works (forwardRef wired); `key` on `<MDXEditor>`.
- [ ] Staging div always-mounted in App.
- [ ] App.tsx ~450–550 lines; 114 Vitest + 7 Playwright green; build + lint clean.

## Next step

Run `sdd-tasks` (needs both this design and the spec). The tasks phase consumes the 5-batch order and per-component prop contracts above.
