# Verify Report: extract-helpers-to-lib

**Phase**: sdd-verify (fresh adversarial review)
**Branch**: `feat/extract-helpers-to-lib` (5 commits, not yet pushed)
**Context**: Apply was INTERRUPTED mid-WU-4 and finished manually. Everything re-verified from scratch.
**Verdict**: **GO** — safe to open the PR.

## Executive Summary

0 CRITICAL · 0 WARNING · 1 SUGGESTION (pre-existing, out of scope). All 114 tests pass, build exits 0, lint reports 0 errors / 0 warnings, the pdfjs-free invariant holds, and every moved symbol body is byte-identical to `main`.

## Commits on branch

| SHA | Message |
|-----|---------|
| feb7925 | refactor(lib): extract format helpers to src/lib/format.ts |
| a9f4a55 | refactor(lib): extract markdown normalizer to src/lib/markdown.ts |
| 6478330 | refactor(lib): extract inline-style helpers to src/lib/inline-style.ts |
| 9191979 | refactor(lib): extract pdf text-extraction helpers to src/lib/pdf.ts |
| 59ab099 | refactor(lint): remove transitional App.tsx eslint override after extraction |

## Command results (verbatim)

```
$ bun run test
 Test Files  4 passed (4)
      Tests  114 passed (114)
  Duration  387ms
EXIT 0

$ bun run build
✓ built in 1.17s
(!) Some chunks are larger than 500 kB after minification.  [pre-existing, unrelated]
EXIT 0

$ bun run lint
$ eslint .
EXIT 0   (no output → 0 errors, 0 warnings)

$ bunx eslint --print-config src/App.tsx | rg -A2 only-export-components
    "react-refresh/only-export-components": [
      2,            ← severity 2 = error (override removed, rule back to error)

$ rg "pdfjs" src/lib/pdf.ts
(3 matches — all JSDoc comments, ZERO imports)
$ rg "^import" src/lib/pdf.ts
(empty — no imports at all)

$ rg -c "^export const" src/App.tsx
0

$ git status
nothing to commit, working tree clean
```

## Requirement checklist

| Requirement | Result |
|-------------|--------|
| Module Structure — exactly 4 lib files | PASS — format.ts, markdown.ts, inline-style.ts, pdf.ts |
| Symbol Placement — format.ts | PASS — Locale, getByteSize, formatFileSize, formatSavedAt, normalizeFileName |
| Symbol Placement — markdown.ts | PASS — normalizeMarkdownForRichEditor exported; KNOWN_HTML_ELEMENTS module-private (NOT exported) |
| Symbol Placement — inline-style.ts | PASS — InlineStyleKind + 7 functions |
| Symbol Placement — pdf.ts | PASS — 4 types + PDF_IMAGE_OPS + PDF_MIN_IMAGE_PX + 5 functions |
| pdf.ts MUST NOT import pdfjs-dist | PASS — zero imports; pdfjs appears only in comments |
| App.tsx no longer defines the 17 helpers | PASS — `^export const` count = 0; imports back from 4 lib paths |
| TypeScript import syntax (verbatimModuleSyntax) | PASS — types via `import type`/inline `type`; build clean |
| No orphan declarations (noUnusedLocals) | PASS — build green |
| Test import repointing (4 files) | PASS — only the import-path line changed; logic byte-identical vs main |
| 114 tests pass | PASS |
| Build + lint pass; 17 react-refresh warnings → 0 | PASS — 0 errors / 0 warnings; override removed |
| No behavior change (byte-identical bodies) | PASS — all 26 moved symbols identical to `git show main:src/App.tsx` |
| No lib-to-lib dependencies | PASS — zero imports in all 4 lib modules |

## Adversarial deep checks

- **Body equivalence**: programmatically extracted all 26 moved symbols from `main:src/App.tsx` and compared against the lib files. After trimming trailing neighbor comments, every body is byte-identical. No logic altered, no variables renamed, no abstractions introduced.
- **Test logic immutability**: `git diff main` on each of the 4 test files shows a single changed line (the import source string). Assertions, descriptions, and symbol lists unchanged.
- **Stay-behind integrity**: `resolvePageObject`, `pdfImageToDataUrl`, `extractPageImages`, `extractMarkdownFromPdf`, `PreviewImage` remain in App.tsx. The pdfjs import (App.tsx:6-9) and `GlobalWorkerOptions.workerSrc` side-effect (App.tsx:111) stay in App.tsx. `PDF_IMAGE_OPS` / `PDF_MIN_IMAGE_PX` are imported and consumed by `extractPageImages`. No dangling/unused imports.
- **Lean import set (NOT a defect)**: App.tsx imports only the lib symbols it actually uses (e.g. `escapeHtml` + `replaceSelectedTextInMarkdown` from inline-style; `getItemFontSize` is not imported because it is an intra-module dependency of `groupItemsIntoLines`). The design's illustrative import list was broader; the leaner set is correct under `noUnusedLocals`.

## Findings

### CRITICAL
None.

### WARNING
None.

### SUGGESTION
- **S1 (out of scope)**: the main `index` chunk is ~2,074 kB (Vite warns >500 kB). Pre-existing, unrelated to this refactor. Consider code-splitting in a future change. Does NOT block this PR.

## Verdict

**GO.** The change is mechanically clean, fully test-covered (114 green), lint-clean (0/0), and behavior-preserving. The manual finish of WU-4 introduced no defects. Open the PR.
