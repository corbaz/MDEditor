# Tasks: decompose-app-into-components

**Change 3c — 12 presentational components extracted from App.tsx (~2124 lines → ~500 lines).**
Container/presentational pattern. ZERO behavior/visual change. All 114 Vitest + 7 Playwright tests MUST stay green after every batch before the next begins.

Delivery: 6 chained PRs stacked-to-main (one per batch). Each batch is a reviewable, independently buildable unit. Strict TDD: `bun run test` (114) + `bun run test:e2e` (7) after EVERY commit.

---

## CONTRACT (holds at every commit)

| Contract item | Detail |
|---|---|
| 9 data-testid hooks | app-root (App `<main>`), app-header / btn-new / btn-save (AppHeader), workspace (App `<section>`), editor-wrap (EditorPane), source-editor (App inline textarea), preview-wrap (PreviewPane), app-footer-status (StatusBar) |
| 3 aria groups | `role="group"` + `aria-label="Theme"/"Language"/"View mode"` on outermost `<div>` of each switch |
| className byte-identity | appHeader, workspace, editorWrap, sourceEditor, previewWrap, app-footer, themeSwitch, localeSwitch, modeSwitch, segmentedSwitch, pdfPreviewStaging, loadingOverlay, pdfPreviewOverlay |
| Always-mounted staging div | `pdfPreviewStaging` + `previewExportRef` stay in App unconditionally |
| import type discipline | verbatimModuleSyntax ON — every type-only import uses `import type { … }` |
| forwardRef wiring | App owns `editorRef`; EditorPane uses `forwardRef<MDXEditorMethods>`; `key={editorDocumentKey}` on `<MDXEditor>` NOT the wrapper |
| No barrel index.ts | Full-path imports everywhere, matching src/lib/ convention |

---

## BATCH 0 — Shared types (prep)

**PR 0 — "refactor(types): extract shared types to src/types.ts"**

Estimated diff: ~50 lines added (types.ts) + ~10 lines changed (App.tsx imports) = **~60 lines total**. Well under 400 budget.

### 0.1 — Create src/types.ts
- [ ] Create `src/types.ts` with exact content from design §1:
  - `export type Theme = 'light' | 'dark'`
  - `export type ViewMode = 'editor' | 'source' | 'preview'`
  - `export type MaybeFileHandle` (with `name?`, `createWritable?`)
  - `export type RecentDocument` (filename, updatedAt, filePath?, folderPath?, sizeBytes?)
  - `export type PdfViewerDocument` (filePath, filename, dataUrl)
- [ ] Verify `Locale` is NOT exported from this file (stays in `src/lib/format.ts`)
- [ ] Verify `LocalFontData`, `WindowWithLocalFonts`, `EditorDocument` are NOT moved (App-internal only)
- [ ] All 5 type bodies are verbatim from App.tsx lines 69–108 (no accidental changes)

*Spec link: R3.1, R3.2, R3.3*

### 0.2 — Update App.tsx imports
- [ ] Remove the 5 inline type declarations from App.tsx
- [ ] Add `import type { Theme, ViewMode, MaybeFileHandle, RecentDocument, PdfViewerDocument } from './types';` to App.tsx
- [ ] Verify App.tsx still imports `Locale` from `'./lib/format'` (unchanged)
- [ ] Verify no type is now imported as a value import (no `import { Theme }` without `type`)

*Spec link: R3.2, R3.4, Scenario 11, Scenario 12*

### 0.3 — Gate: Batch 0 green check
- [ ] `bun run build` exits 0
- [ ] `bun run lint` — no new errors or warnings
- [ ] `bun run test` — 114/114 green
- [ ] `bun run test:e2e` — 7/7 green

### 0.4 — Commit Batch 0
- [ ] `git add src/types.ts src/App.tsx`
- [ ] `git commit -m "refactor(types): extract shared types to src/types.ts"`
- [ ] PR 0: target `main`

---

## BATCH 1 — Leaf components + PreviewContent helper

**PR 1 — "refactor(components): extract LoadingOverlay, StatusBar, PreviewImage, PreviewContent"**

Estimated diff: ~120 lines added (4 new files) + ~60 lines removed from App.tsx + ~15 lines wiring = **~195 lines total**. Under 400 budget.

Dependency: Batch 0 must be merged.

### 1.1 — LoadingOverlay

*Spec link: R1.1, R2.1, R2.2, R4.4, Scenario 2, Scenario 3*

- [ ] Create `src/components/LoadingOverlay/LoadingOverlay.tsx`
- [ ] Props interface at top of file:
  ```ts
  import type { Locale } from '../../lib/format';
  interface LoadingOverlayProps { visible: boolean; locale: Locale; }
  ```
- [ ] Component returns `null` when `!visible` (App composition stays flat)
- [ ] When visible: renders outer `div` with `className="loadingOverlay"` + `aria-label={locale === 'es' ? 'Cargando...' : 'Loading...'}`
- [ ] Inner `.spinner` and `.spinnerLabel` preserved byte-identical to App.tsx lines 2109-2119
- [ ] No `data-testid` on this component (spec confirms none)
- [ ] Wire in App.tsx: replace inline block with `<LoadingOverlay visible={isLoadingLatest || isLoadingDocument} locale={locale} />`
- [ ] Import: `import { LoadingOverlay } from './components/LoadingOverlay/LoadingOverlay';`

### 1.2 — StatusBar

*Spec link: R1.1, R2.1, R2.2, R4.1 (app-footer-status), R4.4, Scenario 2, Scenario 3*

- [ ] Create `src/components/StatusBar/StatusBar.tsx`
- [ ] Props interface at top of file:
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
- [ ] Renders `<footer className="app-footer" data-testid="app-footer-status">` — testid on the `<footer>` element exactly
- [ ] Import `formatFileSize`, `formatSavedAt` from `'../../lib/format'` (pure helpers — value imports)
- [ ] Import `Folder` icon from lucide-react with its current size={13}
- [ ] `.fileMeta` with `title={folderPath || visibleFolder}`, `<Folder/>`, `.fileMetaFolder` all byte-identical to App.tsx lines 1996-2003
- [ ] Wire in App.tsx: replace inline `<footer>` with `<StatusBar folderPath={folderPath} visibleFolder={visibleFolder} currentSizeBytes={currentSizeBytes} lastSavedAt={lastSavedAt} locale={locale} />`

### 1.3 — PreviewImage

*Spec link: R1.1, R2.1, R2.2, R4.4, Scenario 2, Scenario 3*

- [ ] Create `src/components/PreviewPane/PreviewImage.tsx`
- [ ] Move `isRenderableImageSrc` and `toLocalImagePath` helpers (App.tsx lines 113-121) into this file as module-local consts (NOT exported — they are private to PreviewImage)
  - NOTE: `imagePreviewHandler` in App also calls `isRenderableImageSrc`/`toLocalImagePath`. Keep the copies in App.tsx as-is (duplicate-in-App). Do NOT remove them from App.tsx yet. This matches the design's explicit guidance: "keep a copy/shared note — see risks."
- [ ] Props interface:
  ```ts
  interface PreviewImageProps {
      src?: string; alt?: string;
      width?: string | number; height?: string | number;
  }
  ```
- [ ] Move `PreviewImage` function body verbatim from App.tsx lines 327-391 (includes `resolvedImage` local state + `useEffect` that calls `window.electronAPI?.readLocalImageAsDataUrl`)
- [ ] `className="previewImage"` preserved
- [ ] Named export: `export function PreviewImage`
- [ ] Remove the PreviewImage function from App.tsx (it was a module-level sub-component there)

### 1.4 — PreviewContent helper

*Spec link: R6.1, R6.2, Design §4, Scenario 2, Scenario 3*

- [ ] Create `src/components/PreviewPane/PreviewContent.tsx`
- [ ] Props interface: `interface PreviewContentProps { markdown: string; }`
- [ ] Render ReactMarkdown with exact config:
  - `remarkPlugins={[remarkGfm]}`
  - `rehypePlugins={[rehypeRaw]}`
  - `urlTransform={(url) => url}` (collapsed form — both branches of the original return url; behavior-identical)
  - `components={{ img: ({ src = '', alt = '', width, height }) => <PreviewImage src={src} alt={alt} width={width} height={height} /> }}`
- [ ] Imports: `ReactMarkdown` from `'react-markdown'`, `remarkGfm`, `rehypeRaw`, `{ PreviewImage }` from `'./PreviewImage'`
- [ ] Named export: `export function PreviewContent`
- [ ] App.tsx: update its always-mounted staging div to use `<PreviewContent markdown={markdown} />` (replacing inline `renderPreviewMarkdown()` call)
- [ ] App.tsx: add `import { PreviewContent } from './components/PreviewPane/PreviewContent';`
- [ ] App.tsx: remove the `renderPreviewMarkdown` function ONLY if PreviewPane (Batch 3) is not yet consuming it — since Batch 3 is not yet applied, the staging div in App is the only consumer at this point; `renderPreviewMarkdown` can be removed now (it is replaced by `<PreviewContent>`) OR kept as a dead helper (prefer remove to keep App clean)

### 1.5 — Gate: Batch 1 green check
- [ ] `bun run build` exits 0
- [ ] `bun run lint` — no new errors or warnings
- [ ] `bun run test` — 114/114 green
- [ ] `bun run test:e2e` — 7/7 green (Scenario 2, 3, 4 all pass)

### 1.6 — Commit Batch 1
- [ ] `git add src/components/LoadingOverlay/ src/components/StatusBar/ src/components/PreviewPane/ src/App.tsx`
- [ ] `git commit -m "refactor(components): extract LoadingOverlay, StatusBar, PreviewImage, PreviewContent"`
- [ ] PR 1: target `main` (or stacked on PR 0 if PR 0 not yet merged)

---

## BATCH 2 — Segmented switches + file history menu

**PR 2 — "refactor(components): extract ThemeSwitch, LocaleSwitch, ViewModeSwitch, FileHistoryMenu"**

Estimated diff: ~180 lines added (4 new files) + ~170 lines removed from App.tsx + ~20 lines wiring = **~370 lines total**. Near but under 400 budget. (Acceptable; these 4 are tightly coupled in the header region and form one coherent unit.)

Dependency: Batch 1 must be merged.

### 2.1 — ThemeSwitch

*Spec link: R1.1, R2.1, R2.2, R4.3 (role/aria-label="Theme"), R4.4, Scenario 5*

- [ ] Create `src/components/ThemeSwitch/ThemeSwitch.tsx`
- [ ] Props interface:
  ```ts
  import type { Theme } from '../../types';
  interface ThemeSwitchProps { theme: Theme; onThemeChange: (theme: Theme) => void; }
  ```
- [ ] Outermost element: `<div className="themeSwitch segmentedSwitch" role="group" aria-label="Theme">`
- [ ] Two buttons: "Light" / "Dark" — `active` class applied by `theme === 'light'|'dark'`
- [ ] `onClick` calls `onThemeChange('light')` / `onThemeChange('dark')` respectively
- [ ] Named export: `export function ThemeSwitch`

### 2.2 — LocaleSwitch

*Spec link: R1.1, R2.1, R2.2, R4.3 (aria-label="Language"), R4.4*

- [ ] Create `src/components/LocaleSwitch/LocaleSwitch.tsx`
- [ ] Props interface:
  ```ts
  import type { Locale } from '../../lib/format';
  interface LocaleSwitchProps { locale: Locale; onLocaleChange: (locale: Locale) => void; }
  ```
- [ ] Outermost: `<div className="localeSwitch segmentedSwitch" role="group" aria-label="Language">`
- [ ] Buttons "ES" / "US" — `active` by `locale === 'es'|'en'`

### 2.3 — ViewModeSwitch

*Spec link: R1.1, R2.1, R2.2, R4.3 (aria-label="View mode"), R4.4, Scenario 6*

- [ ] Create `src/components/ViewModeSwitch/ViewModeSwitch.tsx`
- [ ] Props interface:
  ```ts
  import type { ViewMode } from '../../types';
  interface ViewModeSwitchProps { viewMode: ViewMode; onViewModeChange: (mode: ViewMode) => void; }
  ```
- [ ] Outermost: `<div className="modeSwitch segmentedSwitch" role="group" aria-label="View mode">`
- [ ] Three buttons: "Editor" / ".md" / "Preview" — `active` by `viewMode`

### 2.4 — FileHistoryMenu

*Spec link: R1.1, R2.1, R2.2, R4.4, Scenario 7*

- [ ] Create `src/components/FileHistoryMenu/FileHistoryMenu.tsx`
- [ ] Extract 3 named closures from App.tsx inline JSX BEFORE wiring FileHistoryMenu:
  - `commitFileNameRename` — the onBlur normalize+persist block (App.tsx lines 1576-1593); stays in App as a named handler
  - `handleFileNameKeyDown` — the onKeyDown handler (lines 1594-1601); stays in App as a named handler
  - `startFileNameRename` — the onDoubleClick block (lines 1608-1611); stays in App as a named handler
  - NOTE: These closures stay in App.tsx. This step is just naming what was inline — it is a prerequisite for FileHistoryMenu being presentational.
- [ ] Props interface (verbatim from design §2, Batch 2):
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
      onFileNameChange: (value: string) => void;
      onFileNameCommit: () => void;
      onFileNameKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
      onToggleHistory: () => void;
      onStartRename: () => void;
      onSelectRecent: (filename: string) => void;
  }
  ```
- [ ] Move the `fileHistory` div JSX verbatim (App.tsx lines 1567-1647): filename editor input (edit mode) OR trigger button + dropdown menu
- [ ] Carries: `className="fileHistory"`, `.fileNameEditor` input, `.fileHistoryTrigger` button with `<ChevronDown size={14}/>`, `.fileHistoryMenu` dropdown
- [ ] "Sin recientes"/"No recent files" empty state locale-conditional
- [ ] `active` class on current file in history list
- [ ] App.tsx owns `fileNameInputRef` and passes it as `fileNameInputRef` prop
- [ ] Wire in App.tsx: replace the fileHistory JSX block with `<FileHistoryMenu fileName={fileName} recentDocuments={recentDocuments} isEditingFileName={isEditingFileName} isHistoryOpen={isHistoryOpen} locale={locale} fileNameInputRef={fileNameInputRef} onFileNameChange={setFileName} onFileNameCommit={commitFileNameRename} onFileNameKeyDown={handleFileNameKeyDown} onToggleHistory={() => setIsHistoryOpen((open) => !open)} onStartRename={startFileNameRename} onSelectRecent={(filename) => void openRecentDocument(filename)} />`

### 2.5 — Gate: Batch 2 green check
- [ ] `bun run build` exits 0
- [ ] `bun run lint` — no new errors or warnings
- [ ] `bun run test` — 114/114 green
- [ ] `bun run test:e2e` — 7/7 green (Scenario 5, 6, 7 all pass: theme-switching, view-mode-switching, btn-new activates filename edit)

### 2.6 — Commit Batch 2
- [ ] One commit per component is fine; group as a single PR:
  - `git commit -m "refactor(components): extract ThemeSwitch"`
  - `git commit -m "refactor(components): extract LocaleSwitch"`
  - `git commit -m "refactor(components): extract ViewModeSwitch"`
  - `git commit -m "refactor(components): extract FileHistoryMenu"` (includes named-closure lift in App.tsx)
- [ ] PR 2: target `main` (or stacked on PR 1)

---

## BATCH 3 — PreviewPane + PdfModal

**PR 3 — "refactor(components): extract PreviewPane and PdfModal"**

Estimated diff: ~120 lines added (2 files) + ~140 lines removed from App.tsx + ~20 lines wiring = **~280 lines total**. Under 400 budget.

Dependency: Batch 1 must be merged (PreviewContent already exists).

### 3.1 — PreviewPane

*Spec link: R1.1, R2.1, R2.2, R4.1 (preview-wrap), R4.4, R5.2, R6.2, Scenario 6 ("preview-wrap visible"), Scenario 2, Scenario 3*

- [ ] Create `src/components/PreviewPane/PreviewPane.tsx`
- [ ] Props interface (locale dropped per design recommendation — all labels pre-computed):
  ```ts
  import type { Locale } from '../../lib/format';
  interface PreviewPaneProps {
      markdown: string;
      saveStatus: 'idle' | 'saving' | 'saved';
      saveLabel: string;
      printLabel: string;
      onSave: () => void;
      onPrint: () => void;
  }
  ```
  NOTE: `locale` prop is NOT included here (spec component map lists it but design recommends dropping it since save/print labels are pre-computed). Confirm App passes `saveLabel={actionLabels.save}` and `printLabel={actionLabels.print}` directly. If any inline copy inside the component turns out to be locale-conditional, add `locale` back — but current design says the `<span>Preview</span>` literal is locale-agnostic.
- [ ] Outermost: `<aside className="previewWrap fullPreview" data-testid="preview-wrap">` — testid on the `<aside>` exactly
- [ ] `.previewHeader.previewHeaderRow` with `<span>Preview</span>`, save button, print button
- [ ] Save button: `className={\`iconBtn actionIcon saveBtn ${saveStatus}\`}` — note interpolation with saveStatus
- [ ] `.pdfPreviewViewport.screenPreviewViewport` > `.pdfPreviewPage.pdfPreviewPageVisible` > `<PreviewContent markdown={markdown} />`
- [ ] Import `PreviewContent` from `'./PreviewContent'` (sibling file, full-path within the same folder)
- [ ] Wire in App.tsx: `{viewMode === 'preview' && <PreviewPane markdown={markdown} saveStatus={saveStatus} saveLabel={actionLabels.save} printLabel={actionLabels.print} onSave={() => void saveToDevice()} onPrint={() => void printCurrentDocument()} />}`
- [ ] Verify staging div is NOT inside PreviewPane — it must remain in App (R5.1, R5.2)

### 3.2 — PdfModal

*Spec link: R1.1, R2.1, R2.2, R4.4, R6.2, Scenario 2, Scenario 3, Scenario 9*

- [ ] Create `src/components/PdfModal/PdfModal.tsx`
- [ ] Props interface (verbatim from design §2, Batch 3):
  ```ts
  import type { Locale } from '../../lib/format';
  import type { PdfViewerDocument } from '../../types';
  interface PdfModalProps {
      open: boolean;
      pdfViewerDocument: PdfViewerDocument | null;
      embeddedPdfUrl: string;
      markdown: string;
      locale: Locale;
      exportLabel: string;
      printLabel: string;
      onClose: () => void;
      onExportPdfAsMarkdown: () => void;
      onPrint: () => void;
  }
  ```
- [ ] Returns `null` when `!open`
- [ ] Carries: `role="dialog"`, `aria-modal="true"`, locale-conditional `aria-label` ("PDF abierto"/"Opened PDF"), `.pdfPreviewOverlay` (onClick=onClose), `.pdfPreviewModal` (onClick stopPropagation), `className="pdfPreviewOverlay"`, `className="pdfPreviewModal"`
- [ ] `pdfViewerDocument` branch: iframe with `src={embeddedPdfUrl}`
- [ ] No-doc branch: `<PreviewContent markdown={markdown} />` inside `.pdfPreviewPage.pdfPreviewPageVisible`
- [ ] Header group: locale-conditional "Visor PDF"/"PDF Viewer", close button with `<X/>` icon
- [ ] Import `PreviewContent` from `'../PreviewPane/PreviewContent'` (cross-folder full-path, no barrel)
- [ ] Wire in App.tsx: `<PdfModal open={isPdfPreviewOpen} pdfViewerDocument={pdfViewerDocument} embeddedPdfUrl={embeddedPdfUrl} markdown={markdown} locale={locale} exportLabel={actionLabels.exportPdfAsMd} printLabel={actionLabels.print} onClose={closePdfViewer} onExportPdfAsMarkdown={() => void exportOpenedPdfAsMarkdown()} onPrint={() => void printCurrentDocument()} />`
- [ ] Remove the `{isPdfPreviewOpen && ...}` inline block from App.tsx

### 3.3 — Gate: Batch 3 green check
- [ ] `bun run build` exits 0
- [ ] `bun run lint` — no new errors or warnings
- [ ] `bun run test` — 114/114 green
- [ ] `bun run test:e2e` — 7/7 green (Scenario 9: staging div still always-mounted in App)

### 3.4 — Commit Batch 3
- [ ] `git commit -m "refactor(components): extract PreviewPane with PreviewContent rendering"`
- [ ] `git commit -m "refactor(components): extract PdfModal"`
- [ ] PR 3: target `main` (or stacked on PR 2)

---

## BATCH 4 — AppHeader (large prop surface)

**PR 4 — "refactor(components): extract AppHeader composing header sub-components"**

Estimated diff: ~150 lines added (AppHeader) + ~235 lines removed from App.tsx + ~35 lines wiring = **~420 lines total**. EXCEEDS 400 budget. Approved under chained delivery strategy (size:exception for this batch — it is one cohesive component; the 30-prop interface justifies the bulk). Note in PR description.

Dependency: Batches 2 + 3 must be merged (AppHeader composes ThemeSwitch, LocaleSwitch, ViewModeSwitch, FileHistoryMenu).

### 4.1 — AppHeader

*Spec link: R1.1, R2.1, R2.2, R4.1 (app-header, btn-new, btn-save), R4.4, Scenario 4, Scenario 7*

- [ ] Create `src/components/AppHeader/AppHeader.tsx`
- [ ] Props interface (verbatim from design §2, Batch 4 — 28 props):
  ```ts
  import type { RefObject } from 'react';
  import type { Locale } from '../../lib/format';
  import type { Theme, ViewMode, RecentDocument } from '../../types';
  interface AppHeaderProps {
      actionLabels: {
          create: string; open: string; save: string; delete: string;
          downloadMd: string; previewPdf: string; openPdf: string; downloadPdf: string;
      };
      saveStatus: 'idle' | 'saving' | 'saved';
      onCreateNew: () => void;
      onOpenFromDevice: () => void;
      onSave: () => void;
      onDelete: () => void;
      onDownloadMarkdown: () => void;
      onPreviewPdf: () => void;
      onOpenPdf: () => void;
      onDownloadPdf: () => void;
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
      theme: Theme;
      onThemeChange: (theme: Theme) => void;
      locale: Locale;
      onLocaleChange: (locale: Locale) => void;
      viewMode: ViewMode;
      onViewModeChange: (mode: ViewMode) => void;
  }
  ```
- [ ] Outermost: `<header className="appHeader" data-testid="app-header">` — testid on the `<header>` exactly
- [ ] `.headerLeft` div: `<h1>MD Editor</h1>` + all 8 action buttons byte-identical className and aria-label to App.tsx lines 1485-1564
- [ ] `data-testid="btn-new"` on the FilePlus/New button
- [ ] `data-testid="btn-save"` on the Save button
- [ ] Save button: `className={\`iconBtn actionIcon saveBtn ${saveStatus}\`}` — interpolation with saveStatus
- [ ] All `aria-label` / `data-label` values come from `actionLabels` props (pre-computed strings)
- [ ] Compose: `<FileHistoryMenu .../>` with all forwarded props
- [ ] Compose: `<ThemeSwitch theme={theme} onThemeChange={onThemeChange} />`
- [ ] Compose: `<LocaleSwitch locale={locale} onLocaleChange={onLocaleChange} />`
- [ ] Compose: `<ViewModeSwitch viewMode={viewMode} onViewModeChange={onViewModeChange} />`
- [ ] Imports from sibling folders:
  - `import { FileHistoryMenu } from '../FileHistoryMenu/FileHistoryMenu';`
  - `import { ThemeSwitch } from '../ThemeSwitch/ThemeSwitch';`
  - `import { LocaleSwitch } from '../LocaleSwitch/LocaleSwitch';`
  - `import { ViewModeSwitch } from '../ViewModeSwitch/ViewModeSwitch';`
- [ ] Wire in App.tsx: Replace the entire `<header>` block (lines 1485-1715) with `<AppHeader actionLabels={actionLabels} saveStatus={saveStatus} ... />` (see design §6 for the exact prop mapping)
- [ ] Verify App.tsx no longer contains FileHistoryMenu, ThemeSwitch, LocaleSwitch, ViewModeSwitch imports after wiring (AppHeader now owns those)

### 4.2 — Gate: Batch 4 green check
- [ ] `bun run build` exits 0
- [ ] `bun run lint` — no new errors or warnings
- [ ] `bun run test` — 114/114 green
- [ ] `bun run test:e2e` — 7/7 green (Scenarios 4, 5, 6, 7 all pass: app-header visible, theme/view-mode switching, btn-new activates filename edit)

### 4.3 — Commit Batch 4
- [ ] `git add src/components/AppHeader/ src/App.tsx`
- [ ] `git commit -m "refactor(components): extract AppHeader composing header sub-components"`
- [ ] PR 4: target `main` (or stacked on PR 3). Note `size:exception` in PR description — this batch exceeds 400 lines because it is one cohesive component.

---

## BATCH 5 — EditorStyleTools + EditorPane (forwardRef — hardest batch)

**PR 5 — "refactor(components): extract EditorStyleTools and EditorPane with forwardRef"**

Estimated diff: ~200 lines added (2 files) + ~235 lines removed from App.tsx + ~35 lines wiring = **~470 lines total**. EXCEEDS 400 budget. Approved under chained delivery strategy (EditorStyleTools and EditorPane are inseparable — EditorStyleTools lives inside EditorPane's toolbarContents; splitting creates a broken intermediate state). Note in PR description.

Dependency: All previous batches must be merged. App.tsx after Batch 4 should be ~900-1100 lines at this point.

### 5.1 — EditorStyleTools

*Spec link: R1.1, R2.1, R2.2, R4.4, Scenario 2, Scenario 3*

- [ ] Create `src/components/EditorStyleTools/EditorStyleTools.tsx`
- [ ] Props interface (verbatim from design §2, Batch 5):
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
      onSelectTextColor: (color: string) => void;
      onSelectHighlightColor: (color: string) => void;
      onSelectFont: (font: string) => void;
      onApplyInlineStyle: (kind: InlineStyleKind, value: string) => void;
      onRememberSelection: () => void;
  }
  ```
- [ ] Move the `.styleTools` div verbatim from App.tsx lines 1770-1945
- [ ] Outermost: `<div className="styleTools" onMouseDown={onRememberSelection}>`
- [ ] `.styleToolGroup` with `<Palette/>` (text color) + `<Highlighter/>` (highlight), `.colorSwatch` buttons, `type="color"` inputs
- [ ] `.fontSelect` verbatim
- [ ] All locale-conditional `title`/`aria-label` strings stay inline-conditional on `locale` prop
- [ ] The combined set+apply onClick handlers (two-call closures: setColor then applyInlineStyle) stay as closures INSIDE this component, calling the two passed callbacks — preserves exact behavior
- [ ] Named export: `export function EditorStyleTools`

### 5.2 — EditorPane (forwardRef — highest-risk task)

*Spec link: R1.1, R2.3, R2.4, R2.5, R4.1 (editor-wrap), R4.4, Scenario 8, Scenario 2, Scenario 3*

- [ ] Create `src/components/EditorPane/EditorPane.tsx`
- [ ] Import `forwardRef` as a value import: `import { forwardRef } from 'react';`
- [ ] Import `MDXEditorMethods` as type: `import type { MDXEditorMethods } from '@mdxeditor/editor';`
- [ ] Import `MDXEditor` and all plugin functions as value imports from `'@mdxeditor/editor'`
- [ ] Props interface (verbatim from design §2, Batch 5):
  ```ts
  import type { Locale } from '../../lib/format';
  import type { InlineStyleKind } from '../../lib/inline-style';
  interface EditorPaneProps {
      markdown: string;
      editorDocumentKey: string;
      onChange: (markdown: string) => void;
      translation: (key: string, defaultValue: string, interpolations?: Record<string, string | number>) => string;
      imageUploadHandler: (image: File) => Promise<string>;
      imagePreviewHandler: (src: string) => Promise<string>;
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
  ```
- [ ] Export signature: `export const EditorPane = forwardRef<MDXEditorMethods, EditorPaneProps>(function EditorPane(props, ref) { ... });` — named inner function for clean stack traces
- [ ] Outer wrapper: `<div className="editorWrap" data-testid="editor-wrap">` — NO `key` on this element
- [ ] `<MDXEditor key={props.editorDocumentKey} ref={ref} markdown={props.markdown} onChange={props.onChange} translation={props.translation} className="editor" plugins={[...]} />`
  - `key={editorDocumentKey}` is on `<MDXEditor>` NOT the wrapper (R2.5)
  - `ref={ref}` — the forwarded ref
- [ ] Build `plugins` array inline inside the render function (NOT wrapped in `useMemo` — preserves current per-render rebuild behavior; adding useMemo would be a behavior change risk):
  - `imagePlugin({ imageUploadHandler: props.imageUploadHandler, imagePreviewHandler: props.imagePreviewHandler, allowSetImageDimensions: true })`
  - `codeMirrorPlugin` with verbatim language map from App.tsx
  - All other plugins verbatim from App.tsx lines 1718-1770
- [ ] `toolbarPlugin({ toolbarContents: () => (<><UndoRedo/>...<InsertThematicBreak/><EditorStyleTools locale={props.locale} textColors={props.textColors} ... /></>) })` — replace the inline `.styleTools` block with `<EditorStyleTools />` passing all style props
- [ ] Import `EditorStyleTools` from `'../EditorStyleTools/EditorStyleTools'`

### 5.3 — Wire EditorPane in App.tsx

*Spec link: R1.3, R2.3, R2.4, Scenario 8*

- [ ] App.tsx: verify `editorRef = useRef<MDXEditorMethods>(null)` stays in App (R2.3 — NOT moved)
- [ ] App.tsx: verify all 5 `editorRef.current` call sites still read from App's local `editorRef`:
  - `applyInlineStyle` handler
  - `createNewDocument` handler
  - `resetToBlankDocument` handler
  - `loadMarkdownIntoEditor` handler
  - `pendingEditorMarkdown` effect
- [ ] Wire: `{viewMode === 'editor' && <EditorPane ref={editorRef} markdown={markdown} editorDocumentKey={editorDocumentKey} onChange={setMarkdown} translation={translation} imageUploadHandler={imageUploadHandler} imagePreviewHandler={imagePreviewHandler} locale={locale} textColors={textColors} highlightColors={highlightColors} availableFonts={availableFonts} selectedTextColor={selectedTextColor} selectedHighlightColor={selectedHighlightColor} selectedFont={selectedFont} onSelectTextColor={setSelectedTextColor} onSelectHighlightColor={setSelectedHighlightColor} onSelectFont={setSelectedFont} onApplyInlineStyle={applyInlineStyle} onRememberSelection={rememberSelection} />}`
- [ ] Remove the inline `.editorWrap` div block from App.tsx (replaced by EditorPane)

### 5.4 — Final App.tsx audit
- [ ] Line count is between 450 and 550 (Scenario 10)
- [ ] App.tsx return is ~60 lines of composition (R1.5)
- [ ] `pdfjs` impure utils (`resolvePageObject`, `pdfImageToDataUrl`, `extractPageImages`, `extractMarkdownFromPdf`, `fileToBase64`) still present in App.tsx (R7.1 — out of scope)
- [ ] Source textarea stays inline (8 lines, not in 12-component list)
- [ ] Always-mounted staging div with `previewExportRef` still unconditionally present (R5.1)
- [ ] All 5 shared types removed from App.tsx (they are in src/types.ts)
- [ ] `LocalFontData`, `WindowWithLocalFonts`, `EditorDocument` still declared in App.tsx (not promoted)

### 5.5 — Gate: Batch 5 green check (final, strictest)
- [ ] `bun run build` exits 0
- [ ] `bun run lint` — no new errors or warnings
- [ ] `bun run test` — 114/114 green
- [ ] `bun run test:e2e` — 7/7 green — verify all 7 scenarios:
  - Scenario 4: app-header + workspace visible on load
  - Scenario 5: theme switch (light ↔ dark class on app-root)
  - Scenario 6: view-mode switch (editor-wrap / source-editor / preview-wrap visibility)
  - Scenario 7: btn-new activates filename editor input
  - Scenario 8 (manual): type in editor, apply inline style, create/reset doc → no editorRef.current null errors
  - Scenario 9 (manual): trigger PDF export while in editor mode → export succeeds (staging div always-mounted)
- [ ] Recommend: one manual save-flow check (Scenario 8 + 9 are E2E integration — worth a single manual smoke test)

### 5.6 — Commit Batch 5
- [ ] `git commit -m "refactor(components): extract EditorStyleTools from MDXEditor toolbar"`
- [ ] `git commit -m "refactor(components): extract EditorPane with forwardRef"`
- [ ] PR 5: target `main` (or stacked on PR 4). Note `size:exception` in PR description.

---

## Review Workload Forecast

| Batch | PR # | Key components | New lines | Removed lines | Changed lines | Est. total diff | Under 400? |
|-------|------|----------------|-----------|---------------|---------------|-----------------|------------|
| 0 (prep) | PR 0 | src/types.ts | +50 | 0 | +10 (App imports) | ~60 | YES |
| 1 (leaves) | PR 1 | LoadingOverlay, StatusBar, PreviewImage, PreviewContent | +120 | ~60 | +15 | ~195 | YES |
| 2 (switches) | PR 2 | ThemeSwitch, LocaleSwitch, ViewModeSwitch, FileHistoryMenu | +180 | ~170 | +20 | ~370 | YES (borderline) |
| 3 (preview) | PR 3 | PreviewPane, PdfModal | +120 | ~140 | +20 | ~280 | YES |
| 4 (header) | PR 4 | AppHeader | +150 | ~235 | +35 | ~420 | NO — size:exception |
| 5 (editor) | PR 5 | EditorStyleTools, EditorPane | +200 | ~235 | +35 | ~470 | NO — size:exception |

**Total estimated changed lines across all PRs: ~1795 lines**

**Chained PRs recommended: Yes** — total exceeds 400 budget by 4.5×. Approved as 6 stacked-to-main PRs.

**PR plan:**
- PR 0 → PR 1 → PR 2 → PR 3 → PR 4 → PR 5, each targeting `main` (stacked-to-main strategy).
- PR 4 and PR 5 carry `size:exception` notes. Both are unavoidable: AppHeader is one cohesive component with a 28-prop interface; EditorStyleTools cannot be shipped without EditorPane (toolbarContents coupling).
- Batches 0–3 each fit within 400 lines individually.

**Decision needed before apply: No** — user has pre-approved chained delivery with stacked-to-main strategy.

---

## Parallelism map

All batches are SEQUENTIAL (each depends on the previous). Within a batch, individual component extractions can be done in parallel but MUST be committed before the batch gate runs.

| Can parallelize? | What |
|---|---|
| YES | Within Batch 1: LoadingOverlay and StatusBar can be extracted in either order |
| YES | Within Batch 2: ThemeSwitch, LocaleSwitch, ViewModeSwitch can be extracted in any order; FileHistoryMenu last (needs named-closure lift first) |
| YES | Within Batch 5: EditorStyleTools must be created before EditorPane (EditorPane imports it) |
| NO | Batch 3 requires Batch 1 (PreviewContent) |
| NO | Batch 4 requires Batch 2 (composes the 4 switches) |
| NO | Batch 5 requires Batch 4 (App.tsx must be stable before touching the editor region) |

---

## Risk register

| Risk | Batch | Mitigation |
|------|-------|------------|
| `editorRef.current` null after forwardRef wiring | 5 | R2.3/R2.4 explicit; Scenario 8 in E2E; App keeps editorRef, never moves it |
| `key` on wrong element — needless ref remount | 5 | R2.5 explicit: key on `<MDXEditor>`, NOT on `.editorWrap` wrapper |
| Staging div moved into PreviewPane — PDF export breaks | 3 | R5.1/R5.2; checklist item 3.1 has explicit reminder; Scenario 9 manual check |
| `data-testid` placed on wrapper not original element | 1–5 | R4.2; each task item names the exact HTML element |
| `className` drift on any extracted component | 1–5 | R4.4 byte-identity requirement; final verify step in Scenario 13 |
| `import type` omission under verbatimModuleSyntax | 0–5 | R3.4; every props interface starts with explicit `import type` |
| `isRenderableImageSrc`/`toLocalImagePath` duplication | 1 | Task 1.3 documents duplicate-in-App explicitly; both copies are intentional |
| Batch 2 borderline at ~370 lines | 2 | Acceptable; 4 switches form one cohesive header-control unit |
| Batch 4/5 exceed 400 — size:exception | 4, 5 | Approved under chained delivery; noted in PR descriptions |
| App.tsx overshoots 550 lines | after B5 | App.tsx final audit (task 5.4) includes line count check |
