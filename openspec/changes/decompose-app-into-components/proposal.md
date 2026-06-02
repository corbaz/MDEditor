# Decompose App.tsx into single-responsibility components

This is **Change 3c**, the final architecture step for MDEditor. The pure-logic layer already lives in `src/lib/` (extracted in earlier changes). This change extracts the render tree of the `src/App.tsx` God-component (~2124 lines) into 12 presentational components under `src/components/`, using the container/presentational pattern. `App.tsx` stays the CONTAINER (all state, refs, effects, handlers) and shrinks to ~450–550 lines. The work is a pure structural refactor: ZERO behavior or visual change, guarded end-to-end by the existing test suite.

## Intent

| Question | Answer |
|----------|--------|
| What problem? | `src/App.tsx` is a 2124-line God-component. Its render return (~640 lines) mixes layout, header, editor, preview, modal, status, and overlay concerns in one file. This is hard to read, hard to review, and hard to test in isolation. |
| Why now? | The pure-logic layer is already extracted to `src/lib/`. Decomposing the view tree is the natural next and final architecture step — the remaining bulk of App.tsx is JSX, not logic. |
| What does success look like? | App.tsx becomes a thin container composing 12 dumb presentational components. Each component has a single responsibility and a typed prop surface. The render return drops from ~640 lines to ~60 lines of composition. All tests stay green; no user-visible change. |

## Scope

### In scope

- Create `src/components/<Name>/<Name>.tsx` (one folder per component, no barrel `index.ts`, full-path imports).
- Extract **12 presentational components** across **5 batches**, safest-first:
  - **Batch 1** (leaf, prop-only): `LoadingOverlay`, `StatusBar`, `PreviewImage`
  - **Batch 2** (simple UI panels): `ThemeSwitch`, `LocaleSwitch`, `ViewModeSwitch`, `FileHistoryMenu`
  - **Batch 3** (moderate): `PreviewPane`, `PdfModal`
  - **Batch 4** (large prop surface): `AppHeader`
  - **Batch 5** (ref forwarding + plugins): `EditorStyleTools`, `EditorPane`
- Apply the **container/presentational** pattern: App keeps ALL `useState`/`useRef`/`useEffect`/`useMemo`/`useCallback`/handlers; children receive plain props and callbacks.
- Create `src/types.ts` and promote shared types `Theme`, `ViewMode`, `RecentDocument`, `PdfViewerDocument`, `MaybeFileHandle` out of App.tsx. (`Locale` stays imported from `src/lib/format.ts`.)
- Use `React.forwardRef` for `EditorPane` so `editorRef` stays owned by App.
- Use `import type` for all type-only imports (`verbatimModuleSyntax` is ON).

### Out of scope

- No behavior change. No visual change.
- No new features.
- No moving the impure pdfjs utilities (`resolvePageObject`, `pdfImageToDataUrl`, `extractPageImages`, `extractMarkdownFromPdf`, `fileToBase64`) — they stay in App.tsx for now.
- No React Context — plain props throughout.
- No CSS Modules — `App.css` stays a global stylesheet; class names are preserved verbatim.

## Approach and rationale

Adopt **Approach A (container/presentational)** from the exploration.

- **App = container.** It already owns every piece of state and every handler. Keeping them there means children stay pure and the refactor is a mechanical lift of JSX, not a logic rewrite — the lowest-risk path to zero behavior change.
- **Plain props, no Context.** Only `theme` and `locale` would benefit from Context, and at 2 values the indirection costs more than it saves (harder to test, hidden data flow). Rejected (Approach B).
- **`editorRef` via `forwardRef`.** `editorRef` is consumed by five App-level handlers (`applyInlineStyle`, `createNewDocument`, `resetToBlankDocument`, `loadMarkdownIntoEditor`, the pendingEditorMarkdown effect). Forwarding the ref into `EditorPane` keeps all those usages co-located in the container while letting EditorPane render `<MDXEditor ref={...}>`.
- **Safest-first batching.** Leaf components (no callbacks, no refs) go first so the riskiest piece (EditorPane's ref + plugins) lands last, after the pattern is proven. Tests run green after every batch.
- **Same-file sub-components rejected** (Approach C): keeps the file huge, defeats the purpose.

## The hard parts (must-handle)

| Hard part | Required handling |
|-----------|-------------------|
| `editorRef` forwarding | `EditorPane = React.forwardRef<MDXEditorMethods, EditorPaneProps>(...)`; App passes `<EditorPane ref={editorRef} ...>`. If wired wrong, every `editorRef.current` call returns null at runtime. |
| `data-testid` / `aria` migration | Each testid and aria attribute MUST move WITH its exact element into the new component (not onto a wrapper). |
| `key={editorDocumentKey}` placement | The `key` MUST stay on `<MDXEditor>`, NOT on the EditorPane wrapper — otherwise the whole component (and its ref) remounts needlessly. |
| Always-mounted staging div | The `pdfPreviewStaging` div holding `previewExportRef` MUST stay always-mounted in App. It must NOT move into PreviewPane (which is gated by `viewMode === 'preview'`); export would break in editor mode. |
| `className` strings | App.css is a global stylesheet targeting `.appHeader`/`.workspace`/`.editorWrap`/`.sourceEditor`/`.previewWrap`/`.app-footer`. Every className string must be byte-identical in the new components. |
| `renderPreviewMarkdown` in 3 places | Inline ReactMarkdown in each consumer (PreviewPane, PdfModal no-document branch, staging div in App), each taking `markdown` as a prop. |

## HARD CONTRACT to preserve

These hooks are asserted by the test suite and MUST survive the refactor:

- **8 `data-testid` hooks**: `app-root` stays on App's `<main>`; `app-header` / `btn-new` / `btn-save` move into AppHeader; `workspace` / `editor-wrap` / `source-editor` / `preview-wrap` move with their elements.
- **`role="group"` + `aria-label`** on the Theme, Language, and View-mode groups.
- **All existing `className` strings** (global CSS dependency).

## Success criteria

- [ ] `App.tsx` reduced to ~450–550 lines.
- [ ] 114 Vitest unit tests green.
- [ ] 7 Playwright E2E tests green.
- [ ] `bun run build` and lint clean.
- [ ] Hard contract preserved (all 8 testids, all aria groups, all className strings).
- [ ] No behavior or visual change observable.

## Rollback

Per-batch commits / PRs. Each batch is independently revertible: if a batch breaks tests, revert that batch's commit and the prior batches remain valid. The test suite is the gate — no batch advances until green.

## Delivery forecast (flag for tasks)

- **~1600 lines moved** across the 5 batches — heavily exceeds the 400-line single-PR budget.
- **Recommendation: CHAINED PRs, one per batch (5 PRs), stacked-to-main.** Each batch maps naturally to one focused, reviewable PR with its own green test run.
- This proposal touches the App.tsx God-component directly — that is the entire point of the change. Flag for the tasks-phase review-workload forecast.

## Next step

Run `sdd-spec` and `sdd-design` (can proceed in parallel from this proposal).
