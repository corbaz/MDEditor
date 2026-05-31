# Spec: add-test-safety-net

- **Change**: `add-test-safety-net`
- **Project**: mdeditor
- **Phase**: spec
- **Status**: approved
- **RFC keywords**: MUST / SHALL / SHOULD / MAY per RFC 2119

---

## 1. Context

`src/App.tsx` is a 2564-line God-component with zero test coverage and no test runner.
This change adds a Vitest characterization-test safety net over its 17 testable pure
helpers **before** the planned architectural extraction to `src/lib/`. No runtime behavior
changes are permitted.

---

## 2. Requirements

### 2.1 Test runner availability

| ID  | Requirement |
|-----|-------------|
| R01 | `bun run test` MUST execute the full Vitest suite and exit zero when all tests pass. |
| R02 | `package.json` MUST declare scripts `test`, `test:watch`, and `test:coverage`. |
| R03 | The `test` script MUST invoke `vitest run`. |
| R04 | The `test:watch` script MUST invoke `vitest`. |
| R05 | The `test:coverage` script MUST invoke `vitest run --coverage`. |
| R06 | `vitest@^2`, `@vitest/coverage-v8@^2`, and `jsdom@^25` MUST be added as `devDependencies`. |
| R07 | The Vitest configuration MUST be inlined into `vite.config.ts` so it inherits the existing Prism `define` workaround and `?url` worker transform without duplication. |
| R08 | The default test environment MUST be `'node'`. Only the `getByteSize` test file MAY override to `'jsdom'` via a per-file `// @vitest-environment jsdom` comment. |
| R09 | The `include` pattern MUST be `['src/**/*.test.ts']`. |
| R10 | V8 coverage MUST be enabled in the coverage config. |

### 2.2 TypeScript visibility of test files

| ID  | Requirement |
|-----|-------------|
| R11 | Test files MUST be type-checked by TypeScript without errors. |
| R12 | The `vitest/globals` types MUST be available so `describe`, `it`, `expect`, `vi` etc. are recognised without explicit imports. |
| R13 | Whether R11–R12 are satisfied by extending `tsconfig.app.json` or by a separate `tsconfig.test.json` is left to the design phase; the spec only requires the outcome. |

### 2.3 Export additions (zero behavior change)

| ID  | Requirement |
|-----|-------------|
| R14 | The following 16 module-scoped functions in `src/App.tsx` MUST have the `export` keyword added: `normalizeMarkdownForRichEditor`, `getItemFontSize`, `computeHeadingThresholds`, `groupItemsIntoLines`, `buildPageMarkdown`, `escapeHtml`, `sanitizeStyleValue`, `escapeRegExp`, `getStyleDeclaration`, `mergeStyle`, `getStyledMarkdown`, `replaceSelectedTextInMarkdown`, `formatFileSize`, `formatSavedAt`, `decodePdfDataUrl`, `getByteSize`. |
| R15 | Adding `export` to those functions MUST NOT alter their runtime behavior, signature, or any call site inside `App.tsx`. |

### 2.4 normalizeFileName hoist

| ID  | Requirement |
|-----|-------------|
| R16 | `normalizeFileName`, currently declared inside the `App` component body, MUST be moved to module scope and exported. |
| R17 | The hoist MUST NOT change the function's implementation, signature, or behavior. |
| R18 | All existing call sites inside `App.tsx` MUST continue to call `normalizeFileName` without modification (hoisting to module scope keeps the identifier accessible throughout the file). |

### 2.5 Characterization tests — general rules

| ID  | Requirement |
|-----|-------------|
| R19 | Each of the 17 target functions MUST have at least one characterization test in a `.test.ts` file under `src/`. |
| R20 | Tests MUST pin the **actual current output** of each function for the chosen inputs — including quirky, surprising, or imperfect output. Tests MUST NOT assert an idealized or corrected result. |
| R21 | Where the apply phase cannot determine the exact current output from static analysis alone, the test MUST execute the live function and capture its actual return value rather than hard-coding a guess. |
| R22 | Each tested function SHOULD have at least one representative edge-case scenario in addition to the happy path. See §2.6 for per-function guidance. |
| R23 | Tests MUST import the helpers directly from `src/App.tsx` via named imports (e.g., `import { escapeHtml } from '../App'`). |
| R24 | Importing `src/App.tsx` in tests triggers a harmless top-level `pdfjs GlobalWorkerOptions.workerSrc` string assignment. This MUST NOT cause a test failure; if it throws in the node runtime, the import MUST be shimmed or the assignment guarded. |

### 2.6 Per-function edge-case guidance (SHOULD)

These are guidance requirements for the apply phase, not hard pass/fail gates. For any
function where the exact current output is unknown, the test pins whatever the live
implementation returns.

| Function | Required happy path | Edge cases SHOULD cover |
|---|---|---|
| `normalizeMarkdownForRichEditor` | A heading string with no HTML | HTML tags stripped from heading text; `<placeholder>` tokens escaped to `&lt;placeholder&gt;`; bare `<` outside tags escaped; `{}` chars escaped |
| `getItemFontSize` | An item with a defined fontSize | Item with no fontSize property; item whose fontSize falls below the minimum threshold |
| `computeHeadingThresholds` | An array of mixed-size items | Empty array; array of identical sizes; single-element array |
| `groupItemsIntoLines` | A flat array of items | Items that share the same vertical position (same line); empty input |
| `buildPageMarkdown` | A page with text items | Page with no items; page with heading and body items mixed |
| `escapeHtml` | String with `&`, `<`, `>`, `"`, `'` | Empty string; string with no special characters |
| `sanitizeStyleValue` | A clean CSS value string | Value with leading/trailing whitespace; value with potentially dangerous content |
| `escapeRegExp` | String with regex metacharacters (`.*+?^${}()\|[]\\`) | Empty string; string with no metacharacters |
| `getStyleDeclaration` | An element with an inline style | Element with no inline style; non-existent property |
| `mergeStyle` | Merging a new property into an empty style | Merging into an existing `style` attribute string; empty new styles object |
| `getStyledMarkdown` | A markdown string with matching style | No matching element; nested style content |
| `replaceSelectedTextInMarkdown` | Replace a known substring in markdown | Replacement at start of string; replacement at end; substring not found |
| `formatFileSize` | Size in KB range | Exactly 0 bytes; exactly 1023 bytes (B boundary); exactly 1024 bytes (KB boundary); MB range |
| `formatSavedAt` | A valid Date with Spanish (`es`) locale | Valid Date with English (`en`) locale; `null` input; `undefined` input |
| `normalizeFileName` | A filename with disallowed characters | Empty string; already-clean name; name with leading/trailing spaces |
| `decodePdfDataUrl` | A valid base64 PDF data URL | Empty string; malformed data URL; non-PDF data URL |
| `getByteSize` | A non-empty UTF-8 string | Empty string; string with multi-byte characters |

### 2.7 Build and lint integrity

| ID  | Requirement |
|-----|-------------|
| R25 | `bun run build` MUST pass with zero errors after all changes are applied. |
| R26 | `bun run lint` MUST pass with zero new errors or warnings introduced by this change. |
| R27 | The runtime-shipped bundle MUST be functionally identical to the pre-change bundle. The new `export` keywords are tree-shaken for any consumer that does not import them and MUST NOT increase bundle size beyond negligible identifier-export metadata. |

### 2.8 Exclusions

| ID  | Requirement |
|-----|-------------|
| R28 | `pdfImageToDataUrl` MUST NOT be tested in this change (requires the `canvas` native module). |
| R29 | `extractMarkdownFromPdf`, `resolvePageObject`, and `extractPageImages` MUST NOT be tested in this change (require mocking the entire pdfjs pipeline). |
| R30 | NO function MUST be moved to `src/lib/` as part of this change. |
| R31 | NO existing call site in `App.tsx` MUST be modified for reasons other than the `normalizeFileName` hoist (which requires no call-site change). |

### 2.9 .gitignore

| ID  | Requirement |
|-----|-------------|
| R32 | The `coverage/` directory MUST be added to `.gitignore` so coverage reports are not committed. |

---

## 3. Acceptance Scenarios

### Scenario 01 — Test suite runs end-to-end

```
Given the dev dependencies are installed (bun install)
When  I run `bun run test`
Then  Vitest executes all *.test.ts files under src/
And   the suite exits with code 0
And   no test is marked skipped or todo
```

### Scenario 02 — Coverage report is generated

```
Given the dev dependencies are installed
When  I run `bun run test:coverage`
Then  Vitest generates a coverage report under coverage/
And   each of the 17 target functions appears in the report with at least one covered line
```

### Scenario 03 — Export additions do not break the build

```
Given `export` has been prepended to the 16 module-scoped helpers
And   normalizeFileName has been hoisted to module scope and exported
When  I run `bun run build`
Then  the build exits with code 0
And   the output bundle size is within 1 KB of the pre-change bundle
```

### Scenario 04 — Lint passes unchanged

```
Given all source edits are applied
When  I run `bun run lint`
Then  the linter exits with code 0
And   the number of lint warnings is equal to or fewer than before the change
```

### Scenario 05 — normalizeMarkdownForRichEditor characterization

```
Given normalizeMarkdownForRichEditor is exported from App.tsx
When  the test passes an input heading string containing an HTML tag (e.g. "<b>Title</b>")
Then  the test asserts the actual return value matches whatever the current implementation produces (HTML stripped from heading)

When  the test passes a string containing a "<placeholder>" token
Then  the test asserts the token is escaped to "&lt;placeholder&gt;" (or whatever current output is)

When  the test passes a string with bare "{" and "}" characters
Then  the test asserts those characters are escaped (or whatever current output is)
```

### Scenario 06 — escapeHtml characterization

```
Given escapeHtml is exported from App.tsx
When  the test passes the string `& < > " '`
Then  the test asserts the exact escaped output the current implementation returns

When  the test passes an empty string
Then  the test asserts the return value is an empty string (or whatever current output is)
```

### Scenario 07 — mergeStyle characterization

```
Given mergeStyle is exported from App.tsx
When  the test passes an element with no existing style and a styles object
Then  the test asserts the returned style string matches current output

When  the test passes an element that already has an inline style attribute
And   the styles object adds a new property
Then  the test asserts the merged style string matches current output (existing props preserved)
```

### Scenario 08 — formatFileSize boundary characterization

```
Given formatFileSize is exported from App.tsx
When  the test passes 0
Then  the test asserts the return value matches what the current implementation returns for 0 bytes

When  the test passes 1023
Then  the test asserts the return value is in the bytes (B) representation

When  the test passes 1024
Then  the test asserts the return value is in the kilobytes (KB) representation

When  the test passes a value in the megabyte range
Then  the test asserts the return value is in the MB representation
```

### Scenario 09 — formatSavedAt locale + null characterization

```
Given formatSavedAt is exported from App.tsx
When  the test passes a valid Date object and locale "es"
Then  the test asserts the Spanish-formatted string matches current output

When  the test passes a valid Date object and locale "en"
Then  the test asserts the English-formatted string matches current output

When  the test passes null
Then  the test asserts the return value matches what the current implementation returns for null input (e.g. empty string, null, or a fallback)
```

### Scenario 10 — normalizeFileName hoist preserves behavior

```
Given normalizeFileName has been hoisted to module scope
When  the test passes a filename containing characters disallowed by the current implementation
Then  the test asserts the sanitized filename matches what normalizeFileName returned before the hoist

When  the test passes an already-clean filename
Then  the test asserts it is returned unchanged (or matches pre-hoist output)
```

### Scenario 11 — getByteSize runs under jsdom

```
Given the getByteSize test file has the comment `// @vitest-environment jsdom` at the top
When  the test passes a non-empty UTF-8 string
Then  the test asserts the byte length matches what the current implementation returns

When  the test passes an empty string
Then  the test asserts the return value matches current output (expected: 0)
```

### Scenario 12 — pdfjs workerSrc import does not throw

```
Given a test file imports any helper from src/App.tsx
When  Vitest evaluates the module in the node or jsdom environment
Then  the top-level `pdfjs GlobalWorkerOptions.workerSrc` assignment does not throw
And   the test suite continues normally
```

### Scenario 13 — Excluded functions have no test

```
Given the change is fully applied
When  I search src/ for test files
Then  there is no test for pdfImageToDataUrl
And   there is no test for extractMarkdownFromPdf
And   there is no test for resolvePageObject
And   there is no test for extractPageImages
```

### Scenario 14 — coverage/ is gitignored

```
Given bun run test:coverage has been run
When  I run `git status`
Then  the coverage/ directory does not appear as an untracked or modified path
```

---

## 4. Out-of-scope boundary

The following are explicitly NOT verified by this spec and MUST NOT be implemented as
part of this change:

- Moving any function to `src/lib/` or any new file
- Changing any function's behavior, even to fix a known bug
- Adding tests for `pdfImageToDataUrl`, `extractMarkdownFromPdf`, `resolvePageObject`,
  or `extractPageImages`
- Changing any call site for a reason other than the `normalizeFileName` hoist

---

## 5. Definition of done

- [ ] `bun run test` exits 0 with all 17 functions covered
- [ ] `bun run build` exits 0
- [ ] `bun run lint` exits 0 with no new issues
- [ ] `coverage/` is in `.gitignore`
- [ ] No function has been moved out of `src/App.tsx`
- [ ] No existing runtime behavior has changed
