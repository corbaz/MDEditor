# Spec: lib-module-architecture

> Persistent capability spec. Not a change delta. Records the durable architectural contract established by change `extract-helpers-to-lib` (merged via PR #3).

## Purpose

Define the structural and dependency contract for pure-helper modules under `src/lib/`. App.tsx is a consumer of these modules. This document is the source of truth for future changes that touch `src/lib/`.

---

## Modules

### `src/lib/format.ts`

Exports: `getByteSize`, `formatFileSize`, `formatSavedAt`, `normalizeFileName`, `type Locale`.

Pure string/number helpers. No external imports. No cross-lib imports.

### `src/lib/markdown.ts`

Exports: `normalizeMarkdownForRichEditor`.

`KNOWN_HTML_ELEMENTS` is module-private (implementation detail; not exported).

No external imports. No cross-lib imports.

### `src/lib/inline-style.ts`

Exports: `escapeHtml`, `sanitizeStyleValue`, `escapeRegExp`, `getStyleDeclaration`, `mergeStyle`, `getStyledMarkdown`, `replaceSelectedTextInMarkdown`, `type InlineStyleKind`.

All dependencies are intra-module (const-before-use order is mandatory for arrow-assigned consts). No external imports. No cross-lib imports.

### `src/lib/pdf.ts`

Exports: `getItemFontSize`, `computeHeadingThresholds`, `groupItemsIntoLines`, `buildPageMarkdown`, `decodePdfDataUrl`, `PDF_IMAGE_OPS`, `PDF_MIN_IMAGE_PX`, `type PdfTextItem`, `type PdfRawLine`, `type PdfImageData`, `type PdfPageLike`.

**pdfjs-free invariant**: this module MUST NOT import `pdfjs-dist` or any pdfjs subpath — ever. All pdfjs orchestration stays in `src/App.tsx`. The only environment dependency is `atob` (DOM global; no import needed). This invariant is what allows `pdf.test.ts` to run pure logic without triggering the pdfjs worker side-effect.

No cross-lib imports.

---

## Dependency Rules

1. **One-directional graph**: `App.tsx → src/lib/*.ts`. No lib-to-lib edges. No cycles.
2. **No barrel**: import from the specific module path (e.g. `'./lib/format'`), never from `'./lib'`. There is no `src/lib/index.ts`.
3. **Types co-locate with their owning module**: no shared `src/lib/types.ts`. Each type lives in the module whose helpers define its contract.
4. **verbatimModuleSyntax**: type-only imports use `import type { T }` or the inline `type` modifier. Value imports use plain `import`.
5. **noUnusedLocals**: moved declarations are deleted from their origin file; never re-declared alongside an import.

---

## pdfjs-free Invariant — Verification

Run after any change to `src/lib/pdf.ts`:

```sh
rg "^import" src/lib/pdf.ts   # must return empty (zero imports)
rg "pdfjs" src/lib/pdf.ts     # must return only JSDoc comments, never an import line
```

---

## App.tsx Consumer Pattern

App.tsx imports lib symbols via:

```ts
import { formatFileSize, formatSavedAt, normalizeFileName, getByteSize } from './lib/format';
import type { Locale } from './lib/format';
import { normalizeMarkdownForRichEditor } from './lib/markdown';
import { escapeHtml, sanitizeStyleValue, escapeRegExp, getStyleDeclaration, mergeStyle, getStyledMarkdown, replaceSelectedTextInMarkdown } from './lib/inline-style';
import type { InlineStyleKind } from './lib/inline-style';
import { decodePdfDataUrl, getItemFontSize, computeHeadingThresholds, groupItemsIntoLines, buildPageMarkdown, PDF_IMAGE_OPS, PDF_MIN_IMAGE_PX } from './lib/pdf';
import type { PdfTextItem, PdfRawLine, PdfImageData, PdfPageLike } from './lib/pdf';
```

Only actually-consumed symbols are imported (noUnusedLocals enforces this). The design document listed illustrative imports; the leaner set in App.tsx is correct.

---

## What Stays in App.tsx

The following are impure (they use pdfjs, the Electron preload bridge, or React) and MUST remain in App.tsx:

- pdfjs imports + `GlobalWorkerOptions.workerSrc` side-effect
- `resolvePageObject`, `pdfImageToDataUrl`, `extractPageImages`, `extractMarkdownFromPdf`
- `PreviewImage`, `fileToBase64`, `isRenderableImageSrc`, `toLocalImagePath`
- `getReadableMarkdown`, `esTranslations`
- The `App` React component
