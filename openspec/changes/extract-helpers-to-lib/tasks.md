# Tasks: extract-helpers-to-lib

Strict TDD Mode is active. Test runner: `bun run test`. The 114 characterization tests are the safety net. Tests must be green before every commit.

Delivery: 4 per-module work units (sequential, each depends on the previous being green) + 1 final cleanup work unit.

---

## Phase 0 — Pre-flight

### 0.1 — Confirm baseline green [sequential]

> Satisfies: REQ-12 (extraction order + incremental green), REQ-13 (build passes)

- [ ] Run `bun run test` — confirm all 114 tests pass.
- [ ] Run `bun run build` — confirm exit 0.
- [ ] Run `bun run lint` — record the baseline warning count (expected: 17 react-refresh warnings on App.tsx).
- [ ] Commit nothing; this is a read-only gate.

---

## Phase 1 — Module: format.ts

> Satisfies: REQ-1 (module structure), REQ-2 (symbol placement), REQ-7 (App.tsx imports back), REQ-8 (verbatimModuleSyntax), REQ-9 (noUnusedLocals), REQ-10 (test repointing), REQ-11 (114 green), REQ-12 (incremental green), REQ-16 (no behavior change), REQ-17 (no lib-to-lib deps)

### 1.1 — Create `src/lib/format.ts` [sequential after 0.1]

- [ ] Create file `src/lib/format.ts`.
- [ ] Copy the following symbols from `src/App.tsx` in this exact declaration order (const-before-use):
  - `export type Locale` (App.tsx line 54)
  - `export const getByteSize` (App.tsx line 746)
  - `export const formatFileSize` (App.tsx line 748)
  - `export const formatSavedAt` (App.tsx line 755 — uses `Locale`)
  - `export const normalizeFileName` (App.tsx line 767)
- [ ] Add `export` keyword to each declaration (they were module-level in App.tsx but not exported from a separate file yet).
- [ ] No imports needed — all types are self-contained.
- [ ] Verify no cross-lib imports are introduced.

### 1.2 — Remove declarations from `src/App.tsx` [sequential after 1.1]

- [ ] Delete `type Locale` declaration from App.tsx (line ~54).
- [ ] Delete `const getByteSize`, `const formatFileSize`, `const formatSavedAt`, `const normalizeFileName` from App.tsx (lines ~746, ~748, ~755, ~767).
- [ ] Ensure zero orphan declarations remain (noUnusedLocals).

### 1.3 — Add import back into `src/App.tsx` [sequential after 1.2]

- [ ] Add at the top of App.tsx (after existing pdfjs imports):
  ```ts
  import { formatFileSize, formatSavedAt, normalizeFileName, getByteSize } from './lib/format';
  import type { Locale } from './lib/format';
  ```
- [ ] Confirm `Locale` uses `import type` (verbatimModuleSyntax compliance).

### 1.4 — Repoint `src/__tests__/format.test.ts` [sequential after 1.3]

- [ ] Change line 6: `'../App'` → `'../lib/format'`.
- [ ] No other changes to the test file — assertions and descriptions stay byte-identical.

### 1.5 — Verify green [sequential after 1.4]

- [ ] Run `bun run test` — all 114 tests MUST pass. If red, fix before proceeding.
- [ ] Run `bun run build` — must exit 0.

### 1.6 — Commit work unit [sequential after 1.5]

- [ ] Commit with message: `refactor(lib): extract format helpers to src/lib/format.ts`
- [ ] Commit includes: `src/lib/format.ts` (new), `src/App.tsx` (deletions + new import), `src/__tests__/format.test.ts` (path repoint).
- [ ] No other files.

---

## Phase 2 — Module: markdown.ts

> Satisfies: REQ-1, REQ-3 (symbol placement), REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-16, REQ-17

### 2.1 — Create `src/lib/markdown.ts` [sequential after Phase 1 committed]

- [ ] Create file `src/lib/markdown.ts`.
- [ ] Copy the following symbols in this declaration order:
  - `const KNOWN_HTML_ELEMENTS` — copy without `export` (stays module-private; only used inside `normalizeMarkdownForRichEditor`; App.tsx line ~280 region).
  - `export const normalizeMarkdownForRichEditor` (App.tsx line ~249 / 300 region — the function that uses `KNOWN_HTML_ELEMENTS`).
- [ ] Confirm `KNOWN_HTML_ELEMENTS` has NO `export` keyword — it is a private impl detail.
- [ ] No imports needed.

### 2.2 — Remove declarations from `src/App.tsx` [sequential after 2.1]

- [ ] Delete `KNOWN_HTML_ELEMENTS` declaration from App.tsx.
- [ ] Delete `normalizeMarkdownForRichEditor` declaration from App.tsx.
- [ ] Confirm noUnusedLocals stays clean.

### 2.3 — Add import back into `src/App.tsx` [sequential after 2.2]

- [ ] Add:
  ```ts
  import { normalizeMarkdownForRichEditor } from './lib/markdown';
  ```

### 2.4 — Repoint `src/__tests__/markdown.test.ts` [sequential after 2.3]

- [ ] Change line 1: `'../App'` → `'../lib/markdown'`.
- [ ] No other changes.

### 2.5 — Verify green [sequential after 2.4]

- [ ] Run `bun run test` — all 114 tests MUST pass.
- [ ] Run `bun run build` — must exit 0.

### 2.6 — Commit work unit [sequential after 2.5]

- [ ] Commit with message: `refactor(lib): extract markdown helpers to src/lib/markdown.ts`
- [ ] Commit includes: `src/lib/markdown.ts` (new), `src/App.tsx` (deletions + new import), `src/__tests__/markdown.test.ts` (path repoint).

---

## Phase 3 — Module: inline-style.ts

> Satisfies: REQ-1, REQ-4 (symbol placement), REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-16, REQ-17

### 3.1 — Create `src/lib/inline-style.ts` [sequential after Phase 2 committed]

- [ ] Create file `src/lib/inline-style.ts`.
- [ ] Copy symbols in this EXACT declaration order (const-before-use is mandatory — these are arrow-const functions):
  1. `export type InlineStyleKind` (App.tsx line ~81)
  2. `export const escapeHtml` (App.tsx line ~789)
  3. `export const sanitizeStyleValue` (App.tsx line ~797 / ~800)
  4. `export const escapeRegExp` (App.tsx line ~803)
  5. `export const getStyleDeclaration` (App.tsx line ~811 — uses `sanitizeStyleValue`)
  6. `export const mergeStyle` (App.tsx line ~838 — uses `getStyleDeclaration`)
  7. `export const getStyledMarkdown` (App.tsx line ~847 — uses `escapeHtml`, `mergeStyle`)
  8. `export const replaceSelectedTextInMarkdown` (last — uses `escapeRegExp`, `escapeHtml`, `getStyledMarkdown`, `mergeStyle`)
- [ ] No imports needed — all deps are intra-module.
- [ ] Verify no cross-lib imports.

### 3.2 — Remove declarations from `src/App.tsx` [sequential after 3.1]

- [ ] Delete `type InlineStyleKind` from App.tsx (line ~81).
- [ ] Delete all 7 function declarations: `escapeHtml`, `sanitizeStyleValue`, `escapeRegExp`, `getStyleDeclaration`, `mergeStyle`, `getStyledMarkdown`, `replaceSelectedTextInMarkdown`.
- [ ] Confirm noUnusedLocals clean.

### 3.3 — Add import back into `src/App.tsx` [sequential after 3.2]

- [ ] Add:
  ```ts
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
  ```
- [ ] `InlineStyleKind` uses `import type` (verbatimModuleSyntax compliance).

### 3.4 — Repoint `src/__tests__/inline-style.test.ts` [sequential after 3.3]

- [ ] Change line 9: `'../App'` → `'../lib/inline-style'`.
- [ ] No other changes.

### 3.5 — Verify green [sequential after 3.4]

- [ ] Run `bun run test` — all 114 tests MUST pass.
- [ ] Run `bun run build` — must exit 0.

### 3.6 — Commit work unit [sequential after 3.5]

- [ ] Commit with message: `refactor(lib): extract inline-style helpers to src/lib/inline-style.ts`
- [ ] Commit includes: `src/lib/inline-style.ts` (new), `src/App.tsx` (deletions + new import), `src/__tests__/inline-style.test.ts` (path repoint).

---

## Phase 4 — Module: pdf.ts (riskiest — do last)

> Satisfies: REQ-1, REQ-5 (symbol placement), REQ-6 (no pdfjs import), REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-16, REQ-17

### 4.1 — Create `src/lib/pdf.ts` [sequential after Phase 3 committed]

- [ ] Create file `src/lib/pdf.ts`.
- [ ] Copy symbols in this declaration order:
  1. `export type PdfTextItem` (App.tsx line ~98)
  2. `export type PdfRawLine` (App.tsx line ~105)
  3. `export type PdfImageData` (App.tsx line ~111)
  4. `export type PdfPageLike` (App.tsx line ~492 — references `PdfImageData`)
  5. `export const PDF_IMAGE_OPS` (App.tsx line ~315) — add `export` (was private; needed by stay-behind `extractPageImages`)
  6. `export const PDF_MIN_IMAGE_PX` (App.tsx line ~316) — add `export` (same reason)
  7. `export const getItemFontSize` (App.tsx line ~319)
  8. `export const computeHeadingThresholds` (App.tsx line ~325)
  9. `export const groupItemsIntoLines` (App.tsx line ~339 — uses `getItemFontSize`, `PdfTextItem`, `PdfRawLine`)
  10. `export const buildPageMarkdown` (uses `PdfRawLine`)
  11. `export const decodePdfDataUrl` (uses `atob` — DOM global, no pdfjs)
- [ ] NO import of `pdfjs-dist` or any pdfjs subpath — this is a hard invariant.
- [ ] No cross-lib imports.
- [ ] `atob` is a DOM global — no import needed.

### 4.2 — Remove declarations from `src/App.tsx` [sequential after 4.1]

- [ ] Delete `type PdfTextItem`, `type PdfRawLine`, `type PdfImageData`, `type PdfPageLike` from App.tsx (lines ~98, ~105, ~111, ~492).
- [ ] Delete `PDF_IMAGE_OPS`, `PDF_MIN_IMAGE_PX` (lines ~315-316).
- [ ] Delete `getItemFontSize`, `computeHeadingThresholds`, `groupItemsIntoLines`, `buildPageMarkdown`, `decodePdfDataUrl`.
- [ ] DO NOT delete `extractMarkdownFromPdf`, `extractPageImages`, `resolvePageObject`, `pdfImageToDataUrl` — these stay in App.tsx (they use pdfjs and/or the preload bridge).
- [ ] DO NOT delete the pdfjs imports (App.tsx lines 6-9) or the `GlobalWorkerOptions.workerSrc` side-effect (line ~118).

### 4.3 — Add imports back into `src/App.tsx` [sequential after 4.2]

- [ ] Add:
  ```ts
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
  ```
- [ ] `PdfTextItem`, `PdfRawLine`, `PdfImageData`, `PdfPageLike` use `import type` (verbatimModuleSyntax compliance).
- [ ] Value imports (functions + exported constants) use plain `import`.

### 4.4 — Repoint `src/__tests__/pdf.test.ts` [sequential after 4.3]

- [ ] Change line 7: `'../App'` → `'../lib/pdf'`.
- [ ] No other changes.
- [ ] Key payoff: pdf.test.ts will no longer transitively load the pdfjs worker init side-effect.

### 4.5 — Verify green [sequential after 4.4]

- [ ] Run `bun run test` — all 114 tests MUST pass.
- [ ] Run `bun run build` — must exit 0.
- [ ] Run `rg -L pdfjs src/lib/pdf.ts` — the file path MUST appear in the output (i.e., zero pdfjs matches). If the command returns nothing, it means pdfjs was found — STOP and fix.

### 4.6 — Commit work unit [sequential after 4.5]

- [ ] Commit with message: `refactor(lib): extract pdf helpers to src/lib/pdf.ts`
- [ ] Commit includes: `src/lib/pdf.ts` (new), `src/App.tsx` (deletions + new imports), `src/__tests__/pdf.test.ts` (path repoint).

---

## Phase 5 — Cleanup: remove transitional ESLint override

> Satisfies: REQ-14 (17 react-refresh warnings → 0), REQ-15 (ESLint 0 errors; override removed)

### 5.1 — Remove override from `eslint.config.js` [sequential after Phase 4 committed]

- [ ] Delete the second config object in `eslint.config.js` (lines ~22-35): the comment block + the `files: ['src/App.tsx']` rules override that relaxes `react-refresh/only-export-components` to `warn`.
- [ ] After removal, the file should contain exactly one config object (the global one with `files: ['**/*.{ts,tsx}']`).
- [ ] Confirm the resulting config structure matches design D4's clean form.

### 5.2 — Full final verify [sequential after 5.1]

- [ ] Run `bun run lint` — MUST report 0 errors AND 0 warnings. The `react-refresh/only-export-components` rule is now back to `error` severity project-wide; any helper accidentally left in App.tsx would error here.
- [ ] Run `bun run test` — all 114 tests MUST pass.
- [ ] Run `bun run build` — must exit 0.
- [ ] Run `rg -L pdfjs src/lib/pdf.ts` — confirm no pdfjs in pdf.ts (recheck after final build).
- [ ] Run `rg "from '\./lib" src/App.tsx` — confirm 4 import groups are present (format, markdown, inline-style, pdf).

### 5.3 — Commit final cleanup [sequential after 5.2]

- [ ] Commit with message: `chore(lint): remove transitional eslint override for App.tsx`
- [ ] Commit includes: `eslint.config.js` only.

---

## Commit Plan Summary

| # | Commit message | Files touched | Phase |
|---|----------------|---------------|-------|
| 1 | `refactor(lib): extract format helpers to src/lib/format.ts` | `src/lib/format.ts` (+new), `src/App.tsx` (edits), `src/__tests__/format.test.ts` (1 line) | Phase 1 |
| 2 | `refactor(lib): extract markdown helpers to src/lib/markdown.ts` | `src/lib/markdown.ts` (+new), `src/App.tsx` (edits), `src/__tests__/markdown.test.ts` (1 line) | Phase 2 |
| 3 | `refactor(lib): extract inline-style helpers to src/lib/inline-style.ts` | `src/lib/inline-style.ts` (+new), `src/App.tsx` (edits), `src/__tests__/inline-style.test.ts` (1 line) | Phase 3 |
| 4 | `refactor(lib): extract pdf helpers to src/lib/pdf.ts` | `src/lib/pdf.ts` (+new), `src/App.tsx` (edits), `src/__tests__/pdf.test.ts` (1 line) | Phase 4 |
| 5 | `chore(lint): remove transitional eslint override for App.tsx` | `eslint.config.js` | Phase 5 |

---

## Review Workload Forecast

| Module | Added lines (new lib file) | Removed lines (App.tsx deletions) | App.tsx import-back lines | Test repoint (1 line) | Estimated delta |
|--------|---------------------------|-----------------------------------|--------------------------|----------------------|-----------------|
| format.ts | ~20 | ~20 | ~5 | 1 | ~46 lines |
| markdown.ts | ~35 | ~35 | ~2 | 1 | ~73 lines |
| inline-style.ts | ~55 | ~55 | ~12 | 1 | ~123 lines |
| pdf.ts | ~90 | ~90 | ~12 | 1 | ~193 lines |
| eslint cleanup | 0 | ~14 (eslint.config.js) | 0 | 0 | ~14 lines |
| **TOTAL** | **~200** | **~214** | **~31** | **4** | **~449 lines** |

**Chained PRs recommended: Yes**

**400-line budget risk: High** — total estimated delta is ~449 changed lines across all files. Each individual work unit is well under 200 lines; the risk is only if all 5 commits are bundled into a single PR.

**Decision needed before apply: Yes**

### PR options

**Option A — One PR for the full move (5 commits)**
- Pro: atomic review of the entire extraction; reviewer sees the full picture; easier to merge once.
- Con: ~449 changed lines exceeds the 400-line budget. Reviewer cognitive load is higher. One review cycle blocks all 5 commits.
- Use when: the reviewer knows the codebase well and the change is mechanical enough to trust at a glance.

**Option B — Chained PRs, one per module (recommended)**
- PR 1: format.ts commit (~46 lines) — smallest, zero risk, good warm-up.
- PR 2: markdown.ts commit (~73 lines).
- PR 3: inline-style.ts commit (~123 lines).
- PR 4: pdf.ts + ESLint cleanup commits (~207 lines) — can be combined since the cleanup is tiny and directly follows pdf.ts.
- Pro: each PR is under 210 lines; per-PR rollback is clean; reviewer reviews focused diffs.
- Con: 4 PR reviews instead of 1; slightly more overhead for a solo project.
- Use when: you want maximum rollback granularity or reviewer clarity.

Given this is a refactor with a 114-test safety net and all moves are mechanical, **Option A is acceptable with a `size:exception` justification** (the diff is additive — each "added" line is a copy of an "deleted" line, so the reviewer reads ~200 net-new lines not 449). **Option B is the textbook choice** per the work-unit-commits skill.
