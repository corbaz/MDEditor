# Proposal: extract-helpers-to-lib

> Flag: This change TOUCHES the `App.tsx` God-component. That is the explicit intent — it is the structural payoff of the Change 1 safety net.

## Intent

### What problem
`src/App.tsx` is a 2565-line God-component. Change 1 already turned 17 pure helpers into `export const` declarations inside App.tsx and wrapped them in 114 characterization tests. But those helpers still live inside the component file, which:
- bloats App.tsx and tangles pure logic with React/DOM/pdfjs orchestration,
- triggers 17 react-refresh warnings (named non-component exports alongside the default `App` export),
- forces test files to import pure logic from `'../App'`, which transitively pulls in the pdfjs side-effect import.

### Why now
The 114 characterization tests from Change 1 are a complete safety net, and `strict_tdd` is now `true`. This is the ideal — and lowest-risk — moment to move the helpers: every move is verified green by the existing suite. Waiting only lets App.tsx accrete more coupling around these helpers.

### What success looks like
A behavior-preserving mechanical refactor where:
- the 17 pure helpers + 6 types live in 4 focused `src/lib/` modules,
- App.tsx becomes a consumer that imports them and no longer defines them,
- all 114 tests stay green (test imports repointed to `../lib/*`),
- the 17 react-refresh warnings drop to 0,
- `src/lib/pdf.ts` contains zero pdfjs imports,
- build and lint stay green.

## Scope

### In scope
- Create `src/lib/` and 4 new modules: `format.ts`, `markdown.ts`, `inline-style.ts`, `pdf.ts`.
- Move the 17 pure helpers and 6 types out of App.tsx into those modules per the module map below.
- Add `export` to `PDF_IMAGE_OPS` and `PDF_MIN_IMAGE_PX`; move `PdfPageLike` into `pdf.ts`.
- Rewire App.tsx to import the moved symbols (value imports for functions/constants, `import type` / inline `type` modifier for types).
- Repoint the 4 test files from `'../App'` to the matching `'../lib/*'` module.
- Delete the moved declarations from App.tsx so no orphan/duplicate symbols remain (`noUnusedLocals`).

### Out of scope
- NO behavior changes, NO new features.
- NO touching the impure stay-behind logic beyond adding imports.
- NO UI changes (that is Change 3).
- NO new abstraction layers (e.g. a shared `src/lib/types.ts`) — types co-locate with their owning module.
- NO test rewrites — only the import path string changes.

## Module Map

### src/lib/format.ts
- Functions: `getByteSize`, `formatFileSize`, `formatSavedAt`, `normalizeFileName`
- Types: `Locale`

### src/lib/markdown.ts
- Functions: `normalizeMarkdownForRichEditor`
- Constants: `KNOWN_HTML_ELEMENTS`

### src/lib/inline-style.ts
- Functions: `escapeHtml`, `sanitizeStyleValue`, `escapeRegExp`, `getStyleDeclaration`, `mergeStyle`, `getStyledMarkdown`, `replaceSelectedTextInMarkdown`
- Types: `InlineStyleKind`

### src/lib/pdf.ts
- Functions: `getItemFontSize`, `computeHeadingThresholds`, `groupItemsIntoLines`, `buildPageMarkdown`, `decodePdfDataUrl`
- Constants: `PDF_IMAGE_OPS`, `PDF_MIN_IMAGE_PX` (both gain `export`)
- Types: `PdfTextItem`, `PdfRawLine`, `PdfImageData`, `PdfPageLike`
- MUST NOT import pdfjs. All 5 helpers + constants + types are pure; the pdfjs orchestration stays in App.tsx.

### Stays in App.tsx (impure — imports the moved symbols back)
`GlobalWorkerOptions.workerSrc` init, `resolvePageObject`, `pdfImageToDataUrl`, `extractPageImages`, `extractMarkdownFromPdf`, `PreviewImage`, `fileToBase64`, `isRenderableImageSrc`, `toLocalImagePath`, `getReadableMarkdown`, `esTranslations`, and the `App` component.

## Approach

### Rationale
Co-locating each type with the module that defines its contract keeps the dependency graph strictly one-directional (`App.tsx → lib/*.ts`, no lib-to-lib edges, no cycles). The decisive design choice is keeping `pdf.ts` pdfjs-free: it is what lets `pdf.test.ts` import pure logic without triggering the pdfjs side-effect import, and it draws a clean line between pure PDF text/geometry logic and live pdfjs/canvas orchestration.

### Constraints (TypeScript strict)
- `verbatimModuleSyntax: true` → type-only imports use `import type` or the inline `type` modifier (`import { fn, type T }`).
- `noUnusedLocals: true` → moved declarations are deleted from App.tsx, not re-declared; no orphans.

### Extraction order (riskiest last)
1. `format.ts` — zero cross-helper deps; pure string/number assertions.
2. `markdown.ts` — 1 export + 1 constant; cleanest.
3. `inline-style.ts` — 7 exports + 1 type; all deps intra-module.
4. `pdf.ts` — constants + types consumed by stay-behind code; riskiest.

Run `bun run test` and keep it green between each module move.

### Rollback
Per-module commits, each independently revertible. The Change 1 characterization suite is the safety net — any regression surfaces as a red test before commit.

## Delivery Note
This is a move refactor: App.tsx loses roughly 500-600 lines while the 4 new files gain them, so the net diff is large but mostly relocation rather than new logic. Whether it fits a single PR or needs chaining depends on how the tasks phase counts moved-line footprint against the review budget. The `sdd-tasks` phase will produce the formal Review Workload Forecast; flag chaining there if the moved-line count crosses the threshold.

## Success Criteria
- All 114 tests green with test imports repointed to `../lib/*`.
- `bun run build` and lint green.
- 17 react-refresh warnings → 0.
- `src/lib/pdf.ts` has zero pdfjs imports.
- App.tsx no longer defines the 17 helpers (only imports them).
