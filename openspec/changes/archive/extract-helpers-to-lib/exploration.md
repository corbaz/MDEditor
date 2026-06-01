# Exploration: extract-helpers-to-lib

## Current State

`src/App.tsx` is 2565 lines. 17 pure helpers are currently `export const` inside it, covered by 114 characterization tests across 4 test files that all import from `'../App'`. `src/lib/` does NOT yet exist — it must be created from scratch.

TypeScript strict flags active: `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true`, `noUnusedLocals: true`. This means type-only imports must use the `import type { ... }` form (or inline `type` modifier), and any type exported from a lib module that is imported by App.tsx must use `import type` when value-free.

---

## Symbol Inventory by Target Module

### src/lib/markdown.ts

| Symbol | Kind | Internal deps | External deps |
|--------|------|---------------|---------------|
| KNOWN_HTML_ELEMENTS | const (Set\<string\>) | none | none |
| normalizeMarkdownForRichEditor | export const | KNOWN_HTML_ELEMENTS | none |

No cross-module deps. Self-contained. No types to move with it.

### src/lib/pdf.ts

| Symbol | Kind | Internal deps | External deps |
|--------|------|---------------|---------------|
| PDF_IMAGE_OPS | const (Set\<number\>) | none | none |
| PDF_MIN_IMAGE_PX | const (number) | none | none |
| PdfTextItem | type | none | none (no pdfjs import needed) |
| PdfRawLine | type | none | none |
| PdfImageData | type | none | none |
| getItemFontSize | export const | none | none |
| computeHeadingThresholds | export const | none | none |
| groupItemsIntoLines | export const | getItemFontSize, PdfTextItem, PdfRawLine | none |
| buildPageMarkdown | export const | PdfRawLine | none |
| decodePdfDataUrl | export const | none | none (uses atob — DOM built-in) |

CRITICAL: The 5 exported helpers + constants + types are PURE — no pdfjs import at module level. `decodePdfDataUrl` uses `atob` (DOM/global built-in; jsdom provides it under Vitest). The pdfjs import (`GlobalWorkerOptions`, `getDocument`) stays 100% in App.tsx. Moving these to `src/lib/pdf.ts` means test files importing `src/lib/pdf.ts` will NOT trigger the pdfjs side-effect import — confirmed win.

`PdfTextItem`, `PdfRawLine`, `PdfImageData`: used by pdf helpers and by `extractMarkdownFromPdf` + `extractPageImages` (stay-behind). Define in `src/lib/pdf.ts`, import back into App.tsx as `import type`.

### src/lib/inline-style.ts

| Symbol | Kind | Internal deps | External deps |
|--------|------|---------------|---------------|
| InlineStyleKind | type | none | none |
| escapeHtml | export const | none | none |
| sanitizeStyleValue | export const | none | none |
| escapeRegExp | export const | none | none |
| getStyleDeclaration | export const | sanitizeStyleValue, InlineStyleKind | none |
| mergeStyle | export const | getStyleDeclaration, InlineStyleKind | none |
| getStyledMarkdown | export const | escapeHtml, mergeStyle, InlineStyleKind | none |
| replaceSelectedTextInMarkdown | export const | escapeRegExp, escapeHtml, getStyledMarkdown, mergeStyle, InlineStyleKind | none |

All intra-module deps — no cross-module deps. `InlineStyleKind` is used by inline-style helpers and by App component's `handleApplyInlineStyle` (stay-behind). Define in `src/lib/inline-style.ts`; App.tsx imports it back as `import type`.

### src/lib/format.ts

| Symbol | Kind | Internal deps | External deps |
|--------|------|---------------|---------------|
| Locale | type | none | none (currently in App.tsx line 54) |
| getByteSize | export const | none | none |
| formatFileSize | export const | none | none |
| formatSavedAt | export const | Locale | none |
| normalizeFileName | export const | none | none |

`Locale` (`type Locale = 'es' | 'en'`) is used by `formatSavedAt` AND by the App component (state, `extractMarkdownFromPdf` signature). Decision: move `Locale` to `src/lib/format.ts` (semantically a formatting-locale domain type). App.tsx imports it back.

---

## Shared Types Decision

| Type | Current home | Proposed home | Also used by App? |
|------|-------------|---------------|-------------------|
| Locale | App.tsx | src/lib/format.ts | YES → import back |
| InlineStyleKind | App.tsx | src/lib/inline-style.ts | YES → import back |
| PdfTextItem | App.tsx | src/lib/pdf.ts | YES (extractMarkdownFromPdf cast) → import back |
| PdfRawLine | App.tsx | src/lib/pdf.ts | YES (extractMarkdownFromPdf) → import back |
| PdfImageData | App.tsx | src/lib/pdf.ts | YES (pdfImageToDataUrl, resolvePageObject) → import back |
| PdfPageLike | App.tsx (line 492-497) | src/lib/pdf.ts | YES (extractPageImages) → import back |

No `src/lib/types.ts` warranted — each type is co-located with the helpers that define its contract. A separate types.ts would be indirection with no benefit.

---

## What STAYS in App.tsx (never moves)

| Symbol | Why it stays |
|--------|-------------|
| GlobalWorkerOptions.workerSrc = pdfWorkerUrl | pdfjs side-effect; module-level init |
| resolvePageObject | uses pdfjs live page.objs / page.commonObjs + setTimeout |
| pdfImageToDataUrl | uses canvas, ctx, ImageData |
| extractPageImages | orchestrates resolvePageObject + pdfImageToDataUrl + PDF_IMAGE_OPS |
| extractMarkdownFromPdf | orchestrates getDocument (pdfjs) + moved pdf helpers via import |
| PreviewImage | React component (useState, useEffect, electronAPI) |
| fileToBase64 | File.arrayBuffer(), btoa |
| getReadableMarkdown | small internal utility; not exported, not tested |
| isRenderableImageSrc, toLocalImagePath | not exported; used by PreviewImage and imagePreviewHandler |
| App component | line 941 to end |
| esTranslations | app-level UI strings dict |

`extractMarkdownFromPdf` calls `decodePdfDataUrl`, `groupItemsIntoLines`, `computeHeadingThresholds`, `buildPageMarkdown`, `extractPageImages`. After the move it imports the first 4 from `src/lib/pdf.ts`. `extractPageImages` (stay-behind) uses `PDF_IMAGE_OPS`, `PDF_MIN_IMAGE_PX` — imported back too. This is the key cross-module wire.

---

## Import Rewiring After Move

### In App.tsx (imports to add)
```ts
import { normalizeMarkdownForRichEditor } from './lib/markdown';
import {
  decodePdfDataUrl,
  getItemFontSize,
  computeHeadingThresholds,
  groupItemsIntoLines,
  buildPageMarkdown,
  PDF_IMAGE_OPS,
  PDF_MIN_IMAGE_PX,
} from './lib/pdf';
import type { PdfTextItem, PdfRawLine, PdfImageData, PdfPageLike } from './lib/pdf';
import {
  escapeHtml,
  sanitizeStyleValue,
  escapeRegExp,
  getStyleDeclaration,
  mergeStyle,
  getStyledMarkdown,
  replaceSelectedTextInMarkdown,
} from './lib/inline-style';
import type { InlineStyleKind } from './lib/inline-style';
import {
  formatFileSize,
  formatSavedAt,
  normalizeFileName,
  getByteSize,
} from './lib/format';
import type { Locale } from './lib/format';
```

`verbatimModuleSyntax: true` requires type imports to be `import type` (or inline `type` modifier). Value imports (functions, constants) use regular `import`. The const sets are values — regular import.

### In test files (4 changes)
- `src/__tests__/markdown.test.ts`: `'../App'` → `'../lib/markdown'`
- `src/__tests__/pdf.test.ts`: `'../App'` → `'../lib/pdf'`
- `src/__tests__/inline-style.test.ts`: `'../App'` → `'../lib/inline-style'`
- `src/__tests__/format.test.ts`: `'../App'` → `'../lib/format'`

`format.test.ts` uses `Locale` only implicitly via `formatSavedAt` — no type import needed. `inline-style.test.ts` uses `InlineStyleKind` as string literals only — no type import needed.

---

## Extraction Order (lowest risk first)

1. **src/lib/format.ts** — 4 value exports, 1 type. Zero intra-module deps on other helpers. Pure string/number assertions.
2. **src/lib/markdown.ts** — 1 export + 1 constant. Cleanest extraction.
3. **src/lib/inline-style.ts** — 7 exports + 1 type. All intra-module deps.
4. **src/lib/pdf.ts** — 5 exports + 2 constants + 4 types + PdfPageLike. RISKIEST: constants used by stay-behind code, types used by stay-behind functions, `groupItemsIntoLines` calls `getItemFontSize` (intra-module dep to preserve).

Run `bun run test` between each step.

---

## Risks

1. **verbatimModuleSyntax requires `import type`** — inline `type` modifier form (`import { fn, type T }`) is cleanest.
2. **noUnusedLocals on App.tsx** — moved type declarations must be deleted (not re-declared) and imported back, or TypeScript errors.
3. **PdfPageLike local type** (line 492-497) — safest to move to pdf.ts, export, re-import (it references PdfImageData which moves anyway).
4. **No circular imports** — graph is strictly one-directional App.tsx → lib/*.ts. No lib imports another lib.
5. **decodePdfDataUrl uses atob** — browser global, jsdom provides it. Tests already pass.
6. **src/lib/ does not exist** — must be created (mkdir, no structural blocker).
7. **React-refresh warnings** — currently App.tsx exports non-component symbols alongside the default App component (17 warnings). After extraction, App.tsx exports only the App component (default); the 17 warnings should drop to 0.
