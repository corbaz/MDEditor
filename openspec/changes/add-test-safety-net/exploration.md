# Exploration: add-test-safety-net

> Persisted from engram observation #479 (topic `sdd/add-test-safety-net/explore`).

## Current State

`src/App.tsx` is a 2564-line God-component and the **only** source file. Zero tests
exist anywhere in the project. No Vitest (or any test runner) is installed. All pure
helper functions live as **module-scoped `const` declarations** (lines ~120–886) and are
NOT exported. The one exception is `normalizeFileName`, declared **inside** the `App`
function body at line ~1636.

## Function Inventory

### GROUP A — Pure, node environment, exportable as-is (no DOM, no Blob, no atob)

| Function | Lines | Notes |
|---|---|---|
| `normalizeMarkdownForRichEditor` | 249–298 | String transforms + regex. Dep: `KNOWN_HTML_ELEMENTS` (module Set). Pure. |
| `getItemFontSize` | 319–322 | Math only. Pure. |
| `computeHeadingThresholds` | 325–336 | Array/Map math. Pure. |
| `groupItemsIntoLines` | 339–382 | Iterates `PdfTextItem[]`, Math, Map. No DOM. Pure. |
| `buildPageMarkdown` | 531–580 | String assembly from typed objects. Pure. |
| `escapeHtml` | 782–788 | String replace chain. Pure. |
| `sanitizeStyleValue` | 790–791 | String replace. Pure. |
| `escapeRegExp` | 793–794 | String replace. Pure. |
| `getStyleDeclaration` | 796–802 | Returns `{ property, value }`. Pure. |
| `mergeStyle` | 804–829 | Map + string split/join. Pure. |
| `getStyledMarkdown` | 831–838 | Calls escapeHtml + mergeStyle. Pure. |
| `replaceSelectedTextInMarkdown` | 840–885 | Regex + string manipulation. Pure. |
| `formatFileSize` | 748–753 | Number formatting. Pure. |
| `formatSavedAt` | 755–765 | `Intl.DateTimeFormat`. Node native (v12+). Pure. |

### GROUP B — Needs jsdom (uses DOM APIs)

| Function | Lines | Notes |
|---|---|---|
| `pdfImageToDataUrl` | 418–490 | `canvas`, `getContext('2d')`, `ImageData`, `toDataURL()`. Needs jsdom + canvas native polyfill. **SKIP for now.** |
| `getByteSize` | 746 | `new Blob([value]).size`. jsdom provides Blob (also Node 18+). Test under jsdom override. |

### GROUP C — Needs atob (Node 16+ global, also jsdom)

| Function | Lines | Notes |
|---|---|---|
| `decodePdfDataUrl` | 300–310 | Uses `atob`. Testable in node env on modern Node/Bun. |

### GROUP D — Too entangled to test directly (pdfjs-dist + async orchestration) — OUT OF SCOPE

`extractPageImages` (501–528), `resolvePageObject` (385–415), `extractMarkdownFromPdf` (584–641).

### GROUP E — Inside App component body (needs code move)

| Function | Lines | Notes |
|---|---|---|
| `normalizeFileName` | 1636–1640 | Inside `App`. 4-line utility. Must be hoisted to module scope first. |

### Not testing candidates
React hooks (`useCallback`/`useMemo`/`useEffect`), `imageUploadHandler`,
`imagePreviewHandler`, `persistLatestDocument`, `getReadableMarkdown` (trivial),
`fileToBase64` (needs jsdom File API), and all Electron IPC.

## Extraction Problem & Options

All module-scoped helpers are not exported — accessible only within `App.tsx`.

- **Option A** — Add `export` to module-scoped helpers in App.tsx. Minimal diff, zero
  behavior change. Cons: App.tsx stays a God-component, exports pollute UI surface.
- **Option B** — Extract to `src/lib/markdown-utils.ts` + `src/lib/pdf-utils.ts`. Clean
  separation, but updates all call sites — risky before tests exist.
- **Option C (CHOSEN)** — Hybrid: export from App.tsx now, move later under coverage.
  Safety net immediately; the later move becomes a pure refactor under test.

**Decision: Option C.** Pin behavior first (characterization tests), then move in the
next change. Adding `export` is zero-behavior-change and unblocks coverage NOW.

## Vitest Config Approach

Inline `test` block into `vite.config.ts` (no separate `vitest.config.ts`):

```ts
test: {
  environment: 'node',          // Group A doesn't need DOM
  globals: true,
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  coverage: { provider: 'v8' },
}
```

Group B uses a per-file `// @vitest-environment jsdom` override to avoid forcing jsdom
on the whole suite.

DevDeps to install: `vitest@^2`, `@vitest/coverage-v8@^2`, `jsdom@^25`
(optional `@vitest/ui`). Scripts: `test` (`vitest run`), `test:watch` (`vitest`),
`test:coverage` (`vitest run --coverage`).

Notes carried over automatically by Vitest inheriting the Vite config: the Prism
workaround (`define: { Prism: 'globalThis.Prism' }`), the `?url` worker import transform.
`atob`, `Intl.DateTimeFormat`, `Blob` are available in the Bun/Node runtime.

## Risks

1. **TS strict mode**: `tsconfig.app.json` excludes test files; add `src/**/*.test.ts`
   to includes or a `tsconfig.test.json`. May need `vitest/globals` types.
2. **ESM + Electron**: test files must be `.ts` (not `.cjs`); `type: module` handles it.
3. **pdfjs-dist top-level side effect** (`GlobalWorkerOptions.workerSrc = ...`): runs at
   module load. Importing App.tsx triggers a harmless workerSrc string assignment.
4. **`?url` import**: Vitest handles Vite's transform when inheriting config.
5. **`normalizeFileName` hoist**: the only non-export code change; verify manually.
6. **canvas for `pdfImageToDataUrl`**: jsdom lacks `<canvas>`; native `canvas` module
   needed — out of scope for this safety net.

## Ready for Proposal
Yes. Path: (1) export + hoist, (2) install Vitest, (3) characterization tests for
Group A + partial B/C, (4) extraction refactor as a follow-up change.
