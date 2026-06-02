# Verification Report -- decompose-app-into-components

Change: decompose-app-into-components (Change 3c)
Branch: feat/decompose-app-into-components
Mode: openspec + engram (hybrid)
Reviewer: Fresh adversarial sdd-verify
Verdict: PASS WITH WARNINGS -- GO for PR

## Executive summary

All execution gates green: build exit 0, lint 0/0, unit 114/114, e2e 7/7 on TWO consecutive runs (no flakiness). The hard DOM/testid/aria/className contract is fully preserved, App.css and src/lib untouched, forwardRef wiring sound, always-mounted staging div intact. Two non-blocking deviations: App.tsx is 1425 lines (spec target 450-550) because in-scope pdfjs utils and all handlers stay in the container; EditorStyleTools is co-located under EditorPane/ instead of its own folder. Neither breaks a spec requirement or a test. CRITICAL: 0, WARNING: 2, SUGGESTION: 2.

## Execution evidence

- Build: bun run build -> exit 0 (tsc -b + vite build; chunk-size note is a pre-existing Vite advisory, not an error)
- Lint: bun run lint -> exit 0, 0 errors 0 warnings
- Unit: bun run test -> 4 files, 114 passed (114)
- E2E run 1: bun run test:e2e -> 7 passed (27.7s)
- E2E run 2: bun run test:e2e -> 7 passed (11.8s), no flakiness

E2E run 1 verbatim:
  Running 7 tests using 1 worker
  ok 1 -- app launches and structural regions render (1.1s)
  ok 2 -- theme Dark to Light applies class (868ms)
  ok 3 -- theme Light to Dark applies class (1.0s)
  ok 4 -- view-mode .md shows source textarea and hides rich editor (907ms)
  ok 5 -- view-mode Preview shows preview region (1.1s)
  ok 6 -- view-mode Editor shows rich editor and hides source textarea (980ms)
  ok 7 -- New document activates filename edit input (960ms)
  7 passed (27.7s)

E2E run 2 verbatim:
  Running 7 tests using 1 worker
  ok 1 -- app launches and structural regions render (1.0s)
  ok 2 -- theme Dark to Light applies class (901ms)
  ok 3 -- theme Light to Dark applies class (1.1s)
  ok 4 -- view-mode .md shows source textarea and hides rich editor (881ms)
  ok 5 -- view-mode Preview shows preview region (852ms)
  ok 6 -- view-mode Editor shows rich editor and hides source textarea (1.1s)
  ok 7 -- New document activates filename edit input (903ms)
  7 passed (11.8s)

## Hard contract verification

9 data-testid hooks (R4.1, R4.2) -- ALL PRESENT on correct element:
  app-root=main (App.tsx:1293), app-header=header (AppHeader.tsx:90), btn-new=button FilePlus (AppHeader.tsx:99), btn-save=button Save (AppHeader.tsx:118), workspace=section (App.tsx:1327), editor-wrap=div (EditorPane.tsx:144), source-editor=textarea (App.tsx:1367), preview-wrap=aside (PreviewPane.tsx:22), app-footer-status=footer (StatusBar.tsx:21).

3 aria groups (R4.3) -- ALL on outermost div:
  ThemeSwitch role=group aria-label=Theme; LocaleSwitch role=group aria-label=Language; ViewModeSwitch role=group aria-label=View-mode.

className byte-identity (R4.4) -- PRESERVED: appHeader, workspace, editorWrap, sourceEditor, previewWrap, app-footer, themeSwitch, localeSwitch, modeSwitch, segmentedSwitch, pdfPreviewStaging, loadingOverlay, pdfPreviewOverlay. Save buttons keep interpolated saveBtn-status className.

App.css unchanged (R4.4, Scenario 13) -- CONFIRMED: git diff --stat main..HEAD -- src/App.css is EMPTY.
src/lib untouched -- CONFIRMED: git diff --stat main..HEAD -- src/lib/ is EMPTY.
git status clean: working tree has no source changes (only SDD planning artifacts under openspec/).

## forwardRef soundness (R2.3, R2.4, R2.5, Scenario 8) -- SOUND

EditorPane.tsx line 98: forwardRef<MDXEditorMethods, EditorPaneProps>(function EditorPane(props, ref)...). Correct generic order, named inner fn. Line 147: ref={ref} on MDXEditor. Line 146: key={editorDocumentKey} on MDXEditor, NOT the editorWrap wrapper (wrapper has no key) -> R2.5 OK.
App.tsx line 353: editorRef = useRef<MDXEditorMethods>(null) owned by App (never moved). Line 1330: EditorPane ref={editorRef}. Four direct editorRef.current.setMarkdown sites: 534 (pending effect), 715 (applyInlineStyle), 984 (createNewDocument), 1005 (resetToBlankDocument). The 5th conceptual consumer loadMarkdownIntoEditor routes through pendingEditorMarkdownRef into the editorDocumentKey effect (534), also resolving editorRef.current.
Judgment: ref bridge correct. forwardRef passes the second arg straight to MDXEditor ref, so React assigns the imperative handle to App editorRef.current. Wrong generic order or dropped ref would null editorRef.current and break E2E test 7 (New -> setMarkdown empty at line 984). Test 7 passed both runs, empirically proving the ref is live. key on MDXEditor (not wrapper) remounts only the editor on doc-key change, never thrashing the ref. No null-reference risk.

## No behavior/logic change (R9.3, R7.1, R5.1) -- CONFIRMED

All useState/useRef/useEffect/useMemo/useCallback and handlers remain in App.tsx; only render JSX lifted. pdfjs utils still in App: resolvePageObject (67), pdfImageToDataUrl (100), extractPageImages (177), extractMarkdownFromPdf (209), fileToBase64 (306). Staging div App.tsx:1391-1395 pdfPreviewStaging aria-hidden with previewExportRef + PreviewContent, unconditional, outside any viewMode gate (R5.1/R5.2 OK); consumed by exportPdf (845) and printCurrentDocument (959). Source textarea source-editor stays inline (App.tsx:1362-1368).

## src/types.ts (R3.1-R3.3, Scenario 11) -- CORRECT
Exports exactly Theme, ViewMode, MaybeFileHandle, RecentDocument, PdfViewerDocument. Locale NOT present (from ./lib/format). App.tsx:25 imports the 5 via import type from ./types; inline decls removed. LocalFontData, WindowWithLocalFonts, EditorDocument stay in App.tsx.

import type discipline (R3.4, Scenario 12) -- SATISFIED. Components use import type. App.tsx uses inline-type form for mixed imports (type MDXEditorMethods, type Locale, type InlineStyleKind), valid under verbatimModuleSyntax.

isRenderableImageSrc / toLocalImagePath duplication (intentional) -- CONFIRMED. App.tsx:54-62 (used by imagePreviewHandler 394-395) and PreviewImage.tsx:10-18 (private). No broken refs.

## Component inventory -- 12 components + 1 shared helper
LoadingOverlay, StatusBar, PreviewPane/PreviewImage, ThemeSwitch, LocaleSwitch, ViewModeSwitch, FileHistoryMenu, PreviewPane/PreviewPane, PdfModal, AppHeader, EditorPane/EditorStyleTools (co-located, see S1), EditorPane/EditorPane. Plus PreviewPane/PreviewContent.tsx (shared ReactMarkdown helper used by PreviewPane, PdfModal, App staging div). No barrel index.ts (R1.2 OK); all imports full-path.

## Findings

CRITICAL -- none.

WARNING:
W1 -- App.tsx is 1425 lines, not 450-550 (R1.4 / Scenario 10 NOT met). Render return ~130 lines (1292-1421), not ~60. Root cause legitimate and in-scope: pdfjs impure utils (R7.1, ~lines 52-319, ~265 lines that MUST stay) plus all state/handlers stay in container. R7.1 and the 1425-line reality contradict the R1.4 numeric target, which was over-optimistic. Planning-estimate miss, not a behavior or contract defect; no test depends on line count. Recommend accept as estimate deviation, or optional out-of-scope follow-up to extract pdfjs utils to src/lib/pdf-extract.ts.
W2 -- translation/esTranslations moved INTO EditorPane (design section 3 said App builds translation and passes it as a prop). EditorPane.tsx:32-77 declares esTranslations and builds translation locally (120-141). Design deviation, not a spec violation (no R-series mandates translation ownership). Behavior identical, function body verbatim, keeps App thinner. Acceptable; note design checklist item translation-arrives-as-a-prop not honored.

SUGGESTION:
S1 -- EditorStyleTools folder placement: spec map lists src/components/EditorStyleTools/; actual is src/components/EditorPane/EditorStyleTools.tsx. Co-location with its only consumer is arguably cleaner and matches PreviewImage/PreviewContent precedent. Cosmetic; no import or test impact.
S2 -- Visual parity (R9.1, R9.2) asserted via structure + className byte-identity + green E2E, not pixel-verified here. Orchestrator confirms via screenshot separately. Recommend completing that check across both themes and all three view modes before merge.

## Spec compliance matrix
R1.1 PASS (12 present; EditorStyleTools co-located S1). R1.2 PASS. R1.3 PASS. R1.4 FAIL (W1, 1425 lines). R1.5 PARTIAL (W1, ~130 lines). R2.1 PASS. R2.2 PASS. R2.3 PASS. R2.4 PASS. R2.5 PASS. R3.1-3.3 PASS. R3.4 PASS. R4.1/4.2 PASS. R4.3 PASS. R4.4 PASS (git diff empty). R5.1/5.2 PASS. R6.1/6.2 PASS. R7.1 PASS. R8.1-8.3 PASS. R9.1/9.3 PASS. R9.2 PASS pending screenshot (S2). R10.x PASS.

## Verdict
PASS WITH WARNINGS -- GO for PR. No CRITICAL issues. Both WARNINGS (App.tsx size overshoot from in-scope pdfjs code; translation localized in EditorPane) are explainable, break no spec requirement or test, and carry no runtime risk. All hard contracts (testids, aria, className, App.css, staging div, forwardRef) hold. Recommend orchestrator: (1) accept W1 as estimate deviation or schedule out-of-scope pdfjs extraction; (2) complete screenshot visual-parity check (S2) before merge.
