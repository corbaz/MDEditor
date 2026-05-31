# Capability: Vitest Characterization Safety Net

**Status**: active  
**Established**: 2026-05-31 (Change: `add-test-safety-net`)  
**Scope**: src/App.tsx pure helpers

## Overview

This capability provides a **characterization-test safety net** over the 17 pure logic helpers extracted from src/App.tsx using Vitest 4.1.7. The tests pin current behavior across markdown normalization, PDF text grouping, style merging, formatting, and filename sanitization — ensuring that future refactors (including architectural extraction to `src/lib/`) preserve behavior.

## What is pinned

17 pure helper functions have characterization tests that capture their **exact current output** for representative inputs (happy path + edge cases):

- **Markdown**: `normalizeMarkdownForRichEditor`, `escapeRegExp`, `replaceSelectedTextInMarkdown`
- **PDF text**: `getItemFontSize`, `computeHeadingThresholds`, `groupItemsIntoLines`, `buildPageMarkdown`, `decodePdfDataUrl`
- **Inline style**: `escapeHtml`, `sanitizeStyleValue`, `getStyleDeclaration`, `mergeStyle`, `getStyledMarkdown`
- **Formatting**: `formatFileSize`, `formatSavedAt`, `normalizeFileName`, `getByteSize`

## Test organization

Tests are co-located under `src/__tests__/` by behavioral concern:
- `markdown.test.ts` — markdown manipulation
- `pdf.test.ts` — PDF text extraction and grouping
- `inline-style.test.ts` — DOM-style serialization
- `format.test.ts` — size and date formatting, filename sanitization

## Configuration

- **Runner**: Vitest 4.1.7
- **Environment**: node (default); jsdom only for `getByteSize` (Blob dependency)
- **Coverage**: V8 provider, scoped to `src/App.tsx`
- **Globals**: vitest globals ambient types in `tsconfig.app.json`
- **Config location**: inlined into `vite.config.ts` (inherits Prism define + ?url transform)

## Scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

## Known limitations

1. **Scope**: characterization only — tests pin current behavior, including quirks. Tests do NOT assert idealized output.
2. **pdfjs side-effect**: importing `src/App.tsx` triggers a top-level `GlobalWorkerOptions.workerSrc` assignment; this is tolerated in node/jsdom and documented as extraction debt (to be removed when helpers move to `src/lib/`).
3. **Excluded helpers**: `pdfImageToDataUrl` (requires canvas native module), `extractMarkdownFromPdf`, `resolvePageObject`, `extractPageImages` (require mocking entire pdfjs pipeline) are not tested.

## Next use

When extracting helpers to `src/lib/` (Change 2), this safety net ensures the refactor preserves all 17 functions' behavior. The test suite is the guard rail for that refactor.

## References

- Change `add-test-safety-net`: openspec/changes/archive/add-test-safety-net/ (proposal, spec, design, tasks, verify-report)
- Vitest config: vite.config.ts test block
- Test files: src/__tests__/{markdown,pdf,inline-style,format}.test.ts
