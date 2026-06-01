# Spec: extract-helpers-to-lib

> This is a NEW spec — `src/lib/` does not exist yet. No delta required.

## Purpose

Define the behavioral and structural contract for extracting 17 pure helpers and 6 types
from `src/App.tsx` into 4 new `src/lib/` modules. App.tsx becomes a consumer that imports
them back. Zero behavior change — the characterization test suite is the contract.

---

## Requirements

### Requirement: Module Structure

The build MUST create exactly 4 files: `src/lib/format.ts`, `src/lib/markdown.ts`,
`src/lib/inline-style.ts`, and `src/lib/pdf.ts`. No other files MUST be created under
`src/lib/` as part of this change.

#### Scenario: lib directory created with all 4 modules

- GIVEN `src/lib/` does not exist
- WHEN the extraction is applied
- THEN `src/lib/format.ts`, `src/lib/markdown.ts`, `src/lib/inline-style.ts`, and
  `src/lib/pdf.ts` MUST all exist

---

### Requirement: Symbol Placement — format.ts

`src/lib/format.ts` MUST export `getByteSize`, `formatFileSize`, `formatSavedAt`,
`normalizeFileName`, and `type Locale`. No other symbols from App.tsx MUST appear in
this module.

#### Scenario: format module exports all assigned symbols

- GIVEN `src/lib/format.ts` exists
- WHEN the module is imported
- THEN all 4 functions and the `Locale` type are available as named exports

---

### Requirement: Symbol Placement — markdown.ts

`src/lib/markdown.ts` MUST export `normalizeMarkdownForRichEditor` and
`KNOWN_HTML_ELEMENTS`. No other symbols from App.tsx MUST appear in this module.

#### Scenario: markdown module exports both symbols

- GIVEN `src/lib/markdown.ts` exists
- WHEN the module is imported
- THEN `normalizeMarkdownForRichEditor` (function) and `KNOWN_HTML_ELEMENTS` (const) are
  available as named exports

---

### Requirement: Symbol Placement — inline-style.ts

`src/lib/inline-style.ts` MUST export `escapeHtml`, `sanitizeStyleValue`, `escapeRegExp`,
`getStyleDeclaration`, `mergeStyle`, `getStyledMarkdown`, `replaceSelectedTextInMarkdown`,
and `type InlineStyleKind`. No other symbols from App.tsx MUST appear in this module.

#### Scenario: inline-style module exports all assigned symbols

- GIVEN `src/lib/inline-style.ts` exists
- WHEN the module is imported
- THEN all 7 functions and the `InlineStyleKind` type are available as named exports

---

### Requirement: Symbol Placement — pdf.ts

`src/lib/pdf.ts` MUST export `getItemFontSize`, `computeHeadingThresholds`,
`groupItemsIntoLines`, `buildPageMarkdown`, `decodePdfDataUrl`, `PDF_IMAGE_OPS`,
`PDF_MIN_IMAGE_PX`, and types `PdfTextItem`, `PdfRawLine`, `PdfImageData`, `PdfPageLike`.
No other symbols from App.tsx MUST appear in this module.

#### Scenario: pdf module exports all assigned symbols

- GIVEN `src/lib/pdf.ts` exists
- WHEN the module is imported
- THEN all 5 functions, 2 constants, and 4 types are available as named exports

---

### Requirement: pdf.ts MUST NOT Import pdfjs-dist

`src/lib/pdf.ts` MUST NOT contain any import of `pdfjs-dist` (direct or side-effect).
The pdfjs `GlobalWorkerOptions` init and all live pdfjs calls MUST remain in `src/App.tsx`.

#### Scenario: pdf.ts has zero pdfjs imports

- GIVEN `src/lib/pdf.ts` is written
- WHEN its import statements are inspected
- THEN no line imports from `pdfjs-dist` or any pdfjs sub-path

#### Scenario: pdf.test.ts runs without triggering pdfjs side-effect

- GIVEN `src/__tests__/pdf.test.ts` imports from `'../lib/pdf'`
- WHEN the test suite runs
- THEN the pdfjs worker init code is NOT executed during the test run

---

### Requirement: App.tsx No Longer Defines the 17 Helpers

After extraction, `src/App.tsx` MUST NOT declare any of the 17 moved helpers or 6 moved
types. It MUST import all of them from their respective `src/lib/*` modules.

#### Scenario: App.tsx imports symbols from lib modules

- GIVEN the extraction is complete
- WHEN `src/App.tsx` is inspected
- THEN it contains import statements for all moved symbols from `./lib/format`,
  `./lib/markdown`, `./lib/inline-style`, and `./lib/pdf`
- AND it does NOT contain `const getByteSize`, `const formatFileSize`, `const formatSavedAt`,
  `const normalizeFileName`, `const normalizeMarkdownForRichEditor`, `const escapeHtml`,
  `const sanitizeStyleValue`, `const escapeRegExp`, `const getStyleDeclaration`,
  `const mergeStyle`, `const getStyledMarkdown`, `const replaceSelectedTextInMarkdown`,
  `const getItemFontSize`, `const computeHeadingThresholds`, `const groupItemsIntoLines`,
  `const buildPageMarkdown`, or `const decodePdfDataUrl` as local declarations

#### Scenario: Impure stay-behind functions continue to work via imports

- GIVEN `extractMarkdownFromPdf`, `extractPageImages`, and `PreviewImage` remain in App.tsx
- WHEN they call moved symbols (`decodePdfDataUrl`, `groupItemsIntoLines`, `PDF_IMAGE_OPS`, etc.)
- THEN those calls resolve via the lib imports — no runtime errors

---

### Requirement: TypeScript Import Syntax Compliance

All type-only imports in `src/App.tsx` and the 4 lib modules MUST use the `import type`
form or the inline `type` modifier (`import { fn, type T }`). Value imports (functions,
constants, const-sets) MUST use regular `import`. This is required by `verbatimModuleSyntax: true`.

#### Scenario: Type imports use correct syntax in App.tsx

- GIVEN `verbatimModuleSyntax: true` is active
- WHEN App.tsx imports `Locale`, `InlineStyleKind`, `PdfTextItem`, `PdfRawLine`,
  `PdfImageData`, and `PdfPageLike` from lib modules
- THEN each import uses `import type { … }` or the inline `type` modifier
- AND the TypeScript compiler emits zero errors for these imports

#### Scenario: No orphan declarations after move

- GIVEN `noUnusedLocals: true` is active
- WHEN the moved declarations are deleted from App.tsx and imported back
- THEN `tsc --noEmit` reports zero unused-local errors

---

### Requirement: Test Import Repointing

Each of the 4 test files MUST update its import path from `'../App'` to the matching
`'../lib/<module>'`. Test logic (assertions, test descriptions, mock setup) MUST NOT change.

| Test file | Old import | New import |
|-----------|-----------|------------|
| `src/__tests__/format.test.ts` | `'../App'` | `'../lib/format'` |
| `src/__tests__/markdown.test.ts` | `'../App'` | `'../lib/markdown'` |
| `src/__tests__/inline-style.test.ts` | `'../App'` | `'../lib/inline-style'` |
| `src/__tests__/pdf.test.ts` | `'../App'` | `'../lib/pdf'` |

#### Scenario: All 114 characterization tests pass after repointing

- GIVEN the 4 test files have their import paths updated
- WHEN `bun run test` executes
- THEN all 114 tests pass with zero failures and zero skips

#### Scenario: Test logic is byte-identical after the change

- GIVEN a test file before and after the change
- WHEN the two versions are diffed
- THEN the only difference is the import path string on the import line

---

### Requirement: Extraction Order and Incremental Green

The extraction MUST be performed in order: `format.ts` → `markdown.ts` →
`inline-style.ts` → `pdf.ts`. After each module is created and App.tsx is rewired for
that module, `bun run test` MUST be green before proceeding to the next module.

#### Scenario: Tests remain green after each incremental step

- GIVEN one module has just been created and App.tsx rewired for it
- WHEN `bun run test` is run before starting the next module
- THEN all 114 tests pass (or the tests for already-moved modules pass and the remaining
  tests still pass against App.tsx declarations)

---

### Requirement: Build and Lint Pass

`bun run build` MUST succeed after the full extraction. ESLint MUST report 0 errors.
The 17 react-refresh warnings present before this change (caused by named non-component
exports alongside the default `App` export) MUST drop to 0 after extraction. The
transitional ESLint override for `src/App.tsx` SHOULD be removed once App.tsx exports
only the `App` component.

#### Scenario: Build succeeds with no new errors

- GIVEN the full extraction is complete
- WHEN `bun run build` runs
- THEN the build exits with code 0 and produces the same output artifacts as before

#### Scenario: React-refresh warnings eliminated

- GIVEN App.tsx no longer exports the 17 helpers as named exports
- WHEN ESLint runs
- THEN the count of `react-refresh/only-export-components` warnings for `src/App.tsx`
  is 0 (down from 17)

#### Scenario: Lint is clean with 0 errors

- GIVEN the full extraction is complete
- WHEN ESLint runs across the project
- THEN 0 errors are reported

---

### Requirement: No Behavior Change

The moved code MUST be byte-identical in logic to its original form in App.tsx. Only the
file location changes. No algorithmic changes, no renamed variables, no new abstractions
MUST be introduced as part of this change.

#### Scenario: Moved functions produce identical outputs

- GIVEN the characterization tests capture the output contract of every moved helper
- WHEN the tests run against the new lib module locations
- THEN every assertion passes without modification to test expectations

---

### Requirement: No Lib-to-Lib Dependencies

The dependency graph MUST be strictly one-directional: `App.tsx → src/lib/*.ts`. No
`src/lib/` module MUST import from another `src/lib/` module.

#### Scenario: No cross-lib imports exist

- GIVEN all 4 lib modules are written
- WHEN each module's import statements are inspected
- THEN none of them imports from another file under `src/lib/`
