# Technical Design: extract-helpers-to-lib

Behavior-preserving relocation of 17 pure helpers + 6 types from `src/App.tsx` into 4 new `src/lib/` modules, plus removal of the now-dead ESLint transitional override. App.tsx becomes a pure consumer. Every move is verified by the existing 114-test characterization suite before commit.

## Quick path

1. Create `src/lib/` and move each module's symbols (riskiest last): `format.ts` → `markdown.ts` → `inline-style.ts` → `pdf.ts`.
2. Per module: move symbols → delete originals from App.tsx → add import-back lines → repoint that module's test file → `bun run test` green → commit.
3. After `pdf.ts` (last module), remove the `src/App.tsx` override block in `eslint.config.js` and confirm lint is 0 errors / 0 warnings.

## Architecture decisions

| # | Decision | Rationale | Rejected alternative |
|---|----------|-----------|----------------------|
| D1 | 4 domain modules, types co-located with owning module | Each type's contract is defined by its module's helpers; keeps graph one-directional | A shared `src/lib/types.ts` — pure indirection, no consumer benefit |
| D2 | `src/lib/pdf.ts` MUST NOT import pdfjs | Lets `pdf.test.ts` import pure logic without triggering the pdfjs side-effect (`GlobalWorkerOptions.workerSrc = ...` at App.tsx:118). This is the decisive payoff of the whole change | Leave pdf helpers in App.tsx — defeats the test-isolation goal |
| D3 | No barrel (`src/lib/index.ts`); import from specific paths | Specific paths are leaner, tree-shake cleaner, and make the App.tsx→lib edges explicit and greppable; a barrel would re-introduce a single import surface that re-couples the modules | A barrel `index.ts` — adds an indirection layer and a re-export maintenance burden for 4 files |
| D4 | Per-module commit + test-green loop, riskiest last | Each commit is independently revertible; the 114-test suite turns any regression red before commit | One big-bang move commit — loses granular rollback, hides which move broke a test |
| D5 | Remove the `src/App.tsx` ESLint override in this change | After extraction App.tsx exports only the default `App` component, so the react-refresh relaxation is dead config. Removing it restores the clean pre-Change-1 ESLint config and proves the 17 warnings are gone (not merely suppressed) | Leave the override — dead config rot; would mask a regression if a helper accidentally stayed |
| D6 | Inline `type` modifier imports (`import { fn, type T }` / `import type { T }`) | `verbatimModuleSyntax: true` (tsconfig.app.json:12) requires explicit type-only imports | Plain `import { T }` for types — fails the build under verbatimModuleSyntax |
| D7 | Delete every moved declaration from App.tsx (no re-declare) | `noUnusedLocals: true` + `noUnusedParameters: true` (tsconfig.app.json:17-18) error on orphans | Keep a local re-declaration — duplicate symbol / unused-local error |

---

## D1 — Module boundaries & export surface

Dependency graph is strictly one-directional: `App.tsx → lib/{format,markdown,inline-style,pdf}.ts`. **No lib-to-lib edges, no cycles.** Verified against App.tsx grep: every intra-module dependency stays inside its own file.

### `src/lib/format.ts`

```ts
export type Locale = 'es' | 'en';

export const getByteSize = (value: string) => /* ... */;
export const formatFileSize = (bytes: number) => /* ... */;
export const formatSavedAt = (value: number | null, locale: Locale) => /* uses Locale */;
export const normalizeFileName = (value: string) => /* ... */;
```

Intra-module order: `Locale` before `formatSavedAt` (only internal dep). No cross-helper value deps.

### `src/lib/markdown.ts`

```ts
const KNOWN_HTML_ELEMENTS = new Set<string>([/* ... */]); // module-private, NOT exported
export const normalizeMarkdownForRichEditor = (value: string): string => /* uses KNOWN_HTML_ELEMENTS */;
```

`KNOWN_HTML_ELEMENTS` stays unexported — it is an implementation detail of `normalizeMarkdownForRichEditor` and is not consumed elsewhere (confirmed: only referenced at App.tsx:280, inside the function being moved). Order: constant before the function.

### `src/lib/inline-style.ts`

```ts
export type InlineStyleKind = 'textColor' | 'highlight' | 'font';

export const escapeHtml = (value: string) => /* ... */;
export const sanitizeStyleValue = (value: string) => /* ... */;
export const escapeRegExp = (value: string) => /* ... */;
export const getStyleDeclaration = (kind: InlineStyleKind, value: string) => /* uses sanitizeStyleValue */;
export const mergeStyle = (/* ... */ kind: InlineStyleKind /* ... */) => /* uses getStyleDeclaration */;
export const getStyledMarkdown = (/* ... */ kind: InlineStyleKind) => /* uses escapeHtml, mergeStyle */;
export const replaceSelectedTextInMarkdown = (/* ... */ kind: InlineStyleKind) => /* uses escapeRegExp, escapeHtml, getStyledMarkdown, mergeStyle */;
```

Intra-module declaration order (must preserve to satisfy const-before-use): `InlineStyleKind`, `escapeHtml`, `sanitizeStyleValue`, `escapeRegExp`, `getStyleDeclaration`, `mergeStyle`, `getStyledMarkdown`, `replaceSelectedTextInMarkdown`. All 7 functions arrow-assigned to `const`, so each must be declared before any caller. The existing App.tsx order (789→803→811→838→847) already satisfies this — preserve it verbatim.

### `src/lib/pdf.ts`

```ts
export type PdfTextItem = { /* ... */ };
export type PdfRawLine = { /* ... */ };
export type PdfImageData = { /* ... */ };
export type PdfPageLike = { /* references PdfImageData */ };

export const PDF_IMAGE_OPS = new Set([82, 83, 85, 88]); // GAINS export
export const PDF_MIN_IMAGE_PX = 50;                      // GAINS export

export const getItemFontSize = (transform: number[] | undefined): number => /* ... */;
export const computeHeadingThresholds = (sizes: number[]) => /* ... */;
export const groupItemsIntoLines = (items: PdfTextItem[]): PdfRawLine[] => /* uses getItemFontSize, PdfTextItem, PdfRawLine */;
export const buildPageMarkdown = (lines: PdfRawLine[], /* ... */) => /* uses PdfRawLine */;
export const decodePdfDataUrl = (dataUrl: string) => /* uses atob (DOM global) */;
```

Intra-module order: types first; then `PDF_IMAGE_OPS`, `PDF_MIN_IMAGE_PX`; then helpers with `getItemFontSize` before `groupItemsIntoLines` (its only intra-module value dep). `PDF_IMAGE_OPS`/`PDF_MIN_IMAGE_PX` change from module-private `const` (App.tsx:315-316) to `export const` because the stay-behind `extractPageImages` (App.tsx:509,518-519) consumes them.

---

## D2 — Type placement & verbatimModuleSyntax

Six types relocate; each is imported back into App.tsx because stay-behind impure code still references it. Confirmed consumer lines from grep:

| Type | New home | Stay-behind consumer in App.tsx | Re-import form |
|------|----------|----------------------------------|----------------|
| `Locale` | format.ts | App state `useState<Locale>` (942), `extractMarkdownFromPdf` sig (587) | `import type { Locale } from './lib/format'` |
| `InlineStyleKind` | inline-style.ts | `applyInlineStyle` (1339) | `import type { InlineStyleKind } from './lib/inline-style'` |
| `PdfTextItem` | pdf.ts | `extractMarkdownFromPdf` cast (607) | grouped `import type { ... } from './lib/pdf'` |
| `PdfRawLine` | pdf.ts | `extractMarkdownFromPdf` local (593) | same group |
| `PdfImageData` | pdf.ts | resolvePageObject (388,391,395,398), pdfImageToDataUrl | same group |
| `PdfPageLike` | pdf.ts | `extractPageImages` param (502) | same group |

### Exact import lines App.tsx will use (added near the top, after existing imports)

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

Value imports (functions + the two const Sets/number) use plain `import`; types use a separate `import type { ... }` line. This split is the cleanest verbatimModuleSyntax-compliant form. (Inline `import { fn, type T }` is also legal but mixing value+type in the pdf group is less scannable — keep them on dedicated `import type` lines.)

### noUnusedLocals discipline

Every moved declaration is **deleted** from App.tsx at these line anchors (delete, do not re-declare):

- Types: `Locale` (54), `InlineStyleKind` (81), `PdfTextItem` (98), `PdfRawLine` (105), `PdfImageData` (111), `PdfPageLike` (492).
- Constants: `PDF_IMAGE_OPS`, `PDF_MIN_IMAGE_PX` (315-316).
- Functions: all 17 `export const` at the grepped line anchors (249, 300, 319, 325, 339, 531, 746, 748, 755, 767, 789, 797, 800, 803, 811, 838, 847).

After deletion + re-import, no orphan declarations remain → `noUnusedLocals` / `noUnusedParameters` stay clean.

---

## D3 — pdf.ts pdfjs-free invariant (PROOF)

The pdfjs import is isolated at the top of App.tsx and stays there:

```ts
// App.tsx:6-9 — STAYS in App.tsx
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
// App.tsx:118 — module-level side effect, STAYS
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
```

The 5 helpers moving to pdf.ts reference **zero** pdfjs symbols (verified by grep — pdfjs/getDocument/GlobalWorkerOptions appear only at 6-9, 118, 589, none inside the 5 helper bodies):

- `getItemFontSize` — pure math on a `number[]`.
- `computeHeadingThresholds` — pure frequency map.
- `groupItemsIntoLines` — pure geometry on `PdfTextItem[]`.
- `buildPageMarkdown` — pure string assembly from `PdfRawLine[]`.
- `decodePdfDataUrl` — `atob` (DOM global; jsdom provides it under Vitest) + `Uint8Array`. No pdfjs.

The pdfjs `getDocument` call (App.tsx:589) lives inside `extractMarkdownFromPdf`, which **stays in App.tsx** and imports the 4 pure pdf helpers + `extractPageImages` back. The stay-behind cross-wire:

- `extractMarkdownFromPdf` (stay) → imports `decodePdfDataUrl`, `groupItemsIntoLines`, `computeHeadingThresholds`, `buildPageMarkdown` from `./lib/pdf`, plus types `PdfTextItem`, `PdfRawLine`, `Locale`.
- `extractPageImages` (stay) → imports `PDF_IMAGE_OPS`, `PDF_MIN_IMAGE_PX` (now exported) and type `PdfPageLike`, `PdfImageData` from `./lib/pdf`.
- `resolvePageObject`, `pdfImageToDataUrl` (stay) → import type `PdfImageData`.

**Verify assertion:** `rg -L pdfjs src/lib/pdf.ts` must return the file path (i.e. zero matches → file is in the "files without match" list). The verify phase MUST run this. Equivalent: `rg -c pdfjs src/lib/pdf.ts` returns 0 / no output.

---

## D4 — ESLint transitional override removal

`eslint.config.js:22-35` is a transitional block added by Change 1 (add-test-safety-net) that relaxes `react-refresh/only-export-components` to `warn` for `src/App.tsx` only. After this change App.tsx exports **only** the default `App` component (the 17 named helper exports are gone), so the override is dead.

**Action:** delete the entire second config object (lines 22-35, the comment block + the `files: ['src/App.tsx']` rules override), restoring the clean pre-Change-1 single-config ESLint setup:

```js
export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [/* ...recommended + reactHooks + reactRefresh... */],
    languageOptions: { globals: globals.browser },
  },
])
```

This is sequenced LAST (after the pdf.ts move + App.tsx delete), and is part of the `pdf.ts` commit or a dedicated final cleanup commit. With the override gone, `react-refresh/only-export-components` returns to preset `error` repo-wide. Expected lint result: **0 errors / 0 warnings**, and the prior 17 react-refresh warnings are proven gone (a regression — any helper left exported in App.tsx — would now error, not warn).

---

## D5 — Test import repointing (one line per file, no logic changes)

| Test file | Current import source | New import source |
|-----------|----------------------|-------------------|
| `src/__tests__/format.test.ts` (line 6) | `'../App'` | `'../lib/format'` |
| `src/__tests__/markdown.test.ts` (line 1) | `'../App'` | `'../lib/markdown'` |
| `src/__tests__/inline-style.test.ts` (line 9) | `'../App'` | `'../lib/inline-style'` |
| `src/__tests__/pdf.test.ts` (line 7) | `'../App'` | `'../lib/pdf'` |

Only the module-path string changes. The imported symbol lists and every assertion stay byte-for-byte identical. `format.test.ts` and `inline-style.test.ts` use `Locale` / `InlineStyleKind` only implicitly (via function args / string literals) — no type import needed. `pdf.test.ts` gains the side-effect-free import it wanted: no more transitive pdfjs load.

---

## D6 — Per-module commit / verification loop

Run this loop once per module, in order `format → markdown → inline-style → pdf`:

1. Create/append `src/lib/<module>.ts` with the module's exports (preserve intra-module declaration order).
2. **Delete** the moved declarations from `src/App.tsx` at their line anchors.
3. Add the matching import-back line(s) to `src/App.tsx`.
4. Repoint that module's test file: `'../App'` → `'../lib/<module>'`.
5. `bun run test` → must be GREEN before proceeding.
6. Commit (conventional: `refactor: move <module> helpers to src/lib/<module>.ts`).

After the `pdf.ts` iteration:

7. Delete the `src/App.tsx` ESLint override (D4).
8. `bun run lint` → 0 errors / 0 warnings; `bun run build` → green; `bun run test` → all 114 green.
9. Final commit (e.g. `chore: remove transitional eslint override for App.tsx`).

Order rationale (riskiest last): `format` (zero cross deps) → `markdown` (1 fn + 1 private const) → `inline-style` (7 fns, all intra-module) → `pdf` (constants + 4 types consumed by stay-behind code; the cross-module wire). Each commit is independently revertible; the 114-test suite is the safety net per D4.

---

## D7 — IPC / Electron boundary check

**None.** All 17 helpers + 6 types are pure browser/DOM logic. They never touch `window.electronAPI`, the preload bridge, or `ipcRenderer`. The Electron boundary code (`PreviewImage`, `isRenderableImageSrc`, `toLocalImagePath`, `fileToBase64`) stays in App.tsx and is out of scope. `decodePdfDataUrl`'s only environment dependency is `atob` (a DOM/global built-in present in both Electron renderer and jsdom). No main-process, preload, or IPC change is required or made.

## Checklist (design intent the apply/verify phases must satisfy)

- [ ] 4 modules created; each export surface matches D1; no barrel file.
- [ ] All 6 types co-located in owning module, re-imported into App.tsx via `import type`.
- [ ] `src/lib/pdf.ts` has zero pdfjs imports (`rg pdfjs src/lib/pdf.ts` → no match).
- [ ] `PDF_IMAGE_OPS` + `PDF_MIN_IMAGE_PX` gained `export`; consumed by stay-behind `extractPageImages`.
- [ ] Every moved declaration deleted from App.tsx (no orphan / noUnusedLocals error).
- [ ] 4 test files repointed (path string only); 114 tests green.
- [ ] `eslint.config.js` App.tsx override removed; lint 0 errors / 0 warnings; 17 react-refresh warnings → 0.
- [ ] `bun run build` green.

## Next step

Proceed to `sdd-tasks` (once the spec is also ready) to produce the formal task breakdown + Review Workload Forecast against the 400-line budget.
