# Proposal: add-test-safety-net

- **Change**: `add-test-safety-net`
- **Project**: mdeditor
- **Artifact store**: hybrid (files + engram)
- **Status**: proposed
- **Delivery**: single PR, small (<400 lines), work-unit commits, push when verified

## Intent

### Problem
`src/App.tsx` is a 2564-line God-component with **zero test coverage** and **no test
runner installed**. The project intends to refactor this component (extract pure logic
into `src/lib/`), but doing so today is unsafe: there is no way to prove the refactor
preserves behavior. Refactoring without a safety net risks silently breaking markdown
normalization, PDF text grouping, style merging, and selection-replacement logic.

### Why now
The architectural refactor is the next planned change. A safety net MUST exist first so
that the refactor becomes a verifiable, behavior-preserving move rather than a leap of
faith. This is the textbook characterization-test sequence: **pin current behavior, then
move code under coverage.**

### Success looks like
- `bun run test` runs and is green.
- Every targeted pure helper has characterization tests pinning its **current** behavior.
- `bun run build` and `bun run lint` still pass (zero behavior regression).
- `strict_tdd` can flip to `true` after this lands, unlocking TDD mode for future changes.

## Scope

### In scope
1. Add `export` to the ~14 module-scoped pure helpers in `src/App.tsx` (zero behavior
   change — one keyword each).
2. Hoist `normalizeFileName` out of the `App` component body (line ~1636) to module
   scope, then export it. This is the **only** non-`export` code change.
3. Install dev dependencies: `vitest@^2`, `@vitest/coverage-v8@^2`, `jsdom@^25`.
4. Extend `vite.config.ts` with a `test` block (`environment: 'node'`, `globals: true`,
   `include: ['src/**/*.test.ts']`, v8 coverage).
5. Add npm scripts to `package.json`: `test`, `test:watch`, `test:coverage`.
6. Write characterization tests that pin CURRENT behavior for:
   - `normalizeMarkdownForRichEditor`
   - `getItemFontSize`
   - `computeHeadingThresholds`
   - `groupItemsIntoLines`
   - `buildPageMarkdown`
   - `escapeHtml`
   - `sanitizeStyleValue`
   - `escapeRegExp`
   - `getStyleDeclaration`
   - `mergeStyle`
   - `getStyledMarkdown`
   - `replaceSelectedTextInMarkdown`
   - `formatFileSize`
   - `formatSavedAt`
   - `normalizeFileName`
   - `decodePdfDataUrl`
   - `getByteSize` (under a per-file `// @vitest-environment jsdom` override)
7. If needed: add `src/**/*.test.ts` to test-visible TS config and `vitest/globals` types;
   add `coverage/` to `.gitignore`.

### Out of scope
- **NO** architectural extraction — functions stay in `App.tsx` for this change.
- **NO** moving functions to `src/lib/` — that is the explicit next change.
- **NO** behavior refactor of any helper.
- **SKIP** `pdfImageToDataUrl` (requires the `canvas` native module).
- **SKIP** Group D entangled functions (`extractMarkdownFromPdf`, `resolvePageObject`,
  `extractPageImages`) — require mocking the entire pdfjs pipeline.

## Approach (Option C — export-now, move-later)

The exploration weighed three options. **Option C (hybrid)** is chosen:

> Add `export` to the helpers in `App.tsx` NOW to unblock testing immediately, then
> perform the `src/lib/` extraction as a SEPARATE follow-up change — safely, under the
> coverage this change creates.

### Rationale
- **Option A** (export only, never move) leaves App.tsx a God-component permanently and
  pollutes a UI component's API surface — not acceptable long-term.
- **Option B** (extract now) updates every call site before any test exists — exactly the
  unsafe move this change is meant to de-risk.
- **Option C** sequences correctly: zero-behavior-change exports + tests first; the
  refactor inherits a green suite to verify against. The export keyword is reversible and
  the only structural change (`normalizeFileName` hoist) is a 4-line move verified by its
  own characterization test.

### Configuration decisions
- **Inline Vitest config into `vite.config.ts`** rather than a separate file — Vitest
  inherits the existing Prism `define` workaround and the `?url` worker transform for free.
- **`environment: 'node'` by default** — Group A helpers need no DOM; jsdom is heavier and
  only `getByteSize` needs it, handled by a per-file environment override.
- **Tests import the exported helpers from `App.tsx`** — importing the module triggers a
  harmless top-level `pdfjs GlobalWorkerOptions.workerSrc` string assignment (no worker
  actually loads in the node/jsdom test runtime). This is acceptable and documented.

### Characterization discipline
Tests document the **current behavior, including quirks** — not idealized behavior. If a
helper has surprising edge-case output today, the test pins that output. The next change
(extraction) must keep the suite green; intentional behavior changes are a separate,
later decision.

## Rollback plan
- The change is additive and reversible: revert the single PR.
- `export` keywords and the Vitest devDeps/config carry no runtime impact on the shipped
  app (test tooling is dev-only; exports are tree-shaken if unused at runtime).
- The only structural edit (`normalizeFileName` hoist) is a localized move guarded by its
  own test; reverting restores the in-component declaration.

## App.tsx God-component flag (per project rule)
This change **touches `src/App.tsx`** but does so minimally and without behavior change
(adding `export`, hoisting one 4-line helper). It deliberately defers the God-component
decomposition to the follow-up extraction change, which this safety net exists to protect.

## Risks / open questions
- TS test visibility: `tsconfig.app.json` excludes test files; confirm whether to extend
  includes or add `tsconfig.test.json`. May need `vitest/globals` in compiler types.
- Importing `App.tsx` in tests runs the pdfjs `workerSrc` assignment — harmless but should
  be confirmed not to throw in the node/jsdom runtime during the apply phase.
- `getByteSize` relies on `Blob`; if the Bun/Node test runtime exposes `Blob` globally the
  jsdom override may be unnecessary — apply phase decides.

## Next recommended phases
- `sdd-spec` and `sdd-design` (can run in parallel).
