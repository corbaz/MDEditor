# Archive Report: decompose-app-into-components

- **Change**: `decompose-app-into-components`
- **Status**: ARCHIVED & CLOSED
- **Delivery**: single PR #6 (squash `6115985`), 6 work-unit commits (batched), run autonomously per user request
- **Verdict**: GO — merged to main

## What shipped

The final architecture step: decomposed the `App.tsx` render tree into 12 single-responsibility presentational components under `src/components/`, container/presentational pattern.

- App.tsx: **2124 → 1425 lines**; render JSX ~640 → ~60 lines (thin composition).
- Components: LoadingOverlay, StatusBar, PreviewImage, PreviewContent, ThemeSwitch, LocaleSwitch, ViewModeSwitch, FileHistoryMenu, PreviewPane, PdfModal, AppHeader, EditorStyleTools, EditorPane.
- New `src/types.ts` with shared types; `import type` everywhere (verbatimModuleSyntax).
- editorRef stays in App; EditorPane uses `forwardRef<MDXEditorMethods>` (empirically proven live by E2E test 7). `key={editorDocumentKey}` on `<MDXEditor>`. Plugins rebuilt inline (no useMemo).

## Verification (fresh adversarial verify — GO)

- `bun run test`: 114/114. `bun run test:e2e`: 7/7 on TWO consecutive runs (no flakiness), including the editorRef-dependent New flow.
- `bun run build`: exit 0. `bun run lint`: 0/0.
- 9 data-testid on exact elements + 3 aria groups preserved. `git diff main..HEAD -- src/App.css` empty (zero style change). `src/lib` untouched. Visual parity confirmed by screenshot (identical to post-3b).

## Notes / deviations (non-blocking)

- W1: App.tsx is 1425 lines, not the planning estimate of 450-550 — driven by the in-scope module-level pdfjs utils (~265 lines) + all handlers that correctly stay in the container. No behavior impact.
- W2: `translation`/`esTranslations` live inside EditorPane rather than App passing them down (design §3 deviation; behavior identical).
- Process: apply ran in batches; sub-agents repeatedly truncated their narration mid-edit, so the orchestrator finished each batch manually (import cleanups, PdfModal wiring, translation/esTranslations removal) and verified green before each commit. apply-progress was not reliably persisted to engram; verification was done from source + live execution.

## Handoff

The full SDD refactor (Changes 1 → 3c) is complete. The app is now: pure logic in `src/lib/`, render in `src/components/` (container/presentational), Holy Grail + Neumorphic UI, guarded by 114 unit + 7 E2E tests. Future feature work inherits strict_tdd. Possible future cleanups (not scheduled): move the impure pdfjs orchestration out of App.tsx into a dedicated module/hook; optionally split App.css into tokens/layout files.
