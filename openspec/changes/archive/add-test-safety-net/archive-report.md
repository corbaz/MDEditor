# Archive Report: add-test-safety-net

- **Change**: `add-test-safety-net`
- **Project**: mdeditor
- **Status**: ARCHIVED & CLOSED
- **Archive date**: 2026-05-31
- **Verdict**: Successful completion — ready for next change

## Executive Summary

Change `add-test-safety-net` has been completed, verified, and archived. Vitest 4.1.7 safety net with 114 characterization tests is now live on main (PR #1 + #2 merged). Strict TDD enabled in project config. Ready to proceed with Change 2 (extract helpers to src/lib/).

## Artifacts Archived

| Artifact | Path | Type | Status |
|----------|------|------|--------|
| Exploration | openspec/changes/archive/add-test-safety-net/exploration.md | OBSERVATION #479 | Persisted |
| Proposal | openspec/changes/archive/add-test-safety-net/proposal.md | OBSERVATION #480 | Persisted |
| Spec | openspec/changes/archive/add-test-safety-net/spec.md | OBSERVATION #482 | Persisted |
| Design | openspec/changes/archive/add-test-safety-net/design.md | OBSERVATION #483 | Persisted |
| Tasks | openspec/changes/archive/add-test-safety-net/tasks.md | OBSERVATION #484 | Persisted |
| Verify Report | openspec/changes/archive/add-test-safety-net/verify-report.md | OBSERVATION #487 | Persisted |
| Archive Report | openspec/changes/archive/add-test-safety-net/archive-report.md | This document | Live |

## Durable Capability Spec

Created: **openspec/specs/vitest-characterization-safety-net.md**

This capability specification documents the persistent test safety net:
- Vitest 4.1.7 runner
- 17 pure helpers from src/App.tsx covered by 114 characterization tests
- V8 coverage reporting
- Co-located test files under src/__tests__/
- Node environment (default) with jsdom override for getByteSize only
- Zero-behavior-change from initial landing

The spec serves as the reference for all future changes that build on this capability.

## Delivered Changes

### PR #1 — Infrastructure & Exports (Merged to main)
- **Commit**: build(deps): add vitest, @vitest/coverage-v8, and jsdom devDependencies
- **Commit**: build(test): wire Vitest config, TS globals, scripts, and gitignore
- **Commit**: test(smoke): validate Vitest config and pdfjs import tolerance
- **Commit**: refactor(app): export pure helpers and hoist normalizeFileName to module scope
- **Scope**: vite.config.ts, tsconfig.app.json, package.json, .gitignore, src/App.tsx exports + hoist
- **Verification**: bun run build && bun run lint passed; smoke test green

### PR #2 — Characterization Tests (Merged to main)
- **Commit**: test(markdown): characterization tests for markdown helpers
- **Commit**: test(pdf): characterization tests for PDF text-extraction helpers
- **Commit**: test(inline-style): characterization tests for inline-style helpers
- **Commit**: test(format): characterization tests for format helpers
- **Commit**: test(verify): remove smoke test, confirm full suite green
- **Scope**: src/__tests__/ (4 test files, 114 tests total)
- **Verification**:
  - bun run test: 114 tests green (Vitest 4.1.7)
  - bun run build: identical bundle (2,074.07 kB)
  - bun run lint: 0 errors, 17 warnings (expected; doc'd in eslint.config.js)

## Testing Coverage Summary

| Category | Count | Functions |
|----------|-------|-----------|
| Markdown helpers | 3 | normalizeMarkdownForRichEditor, escapeRegExp, replaceSelectedTextInMarkdown |
| PDF text extraction | 5 | getItemFontSize, computeHeadingThresholds, groupItemsIntoLines, buildPageMarkdown, decodePdfDataUrl |
| Inline style | 5 | escapeHtml, sanitizeStyleValue, getStyleDeclaration, mergeStyle, getStyledMarkdown |
| Formatting | 4 | formatFileSize, formatSavedAt, normalizeFileName, getByteSize |
| **TOTAL** | **17** | All pure helpers pinned |

## Key Decisions Implemented

1. **Vitest config location** — Inlined into vite.config.ts (inherits Prism define + ?url transform)
2. **TS visibility** — vitest/globals added to tsconfig.app.json types (zero-emit, clean build)
3. **Test environment** — Node default, jsdom per-file only for getByteSize
4. **pdfjs side-effect** — Tolerated (import as-is); will be removed when helpers move to src/lib/
5. **Test layout** — src/__tests__/ organized by behavioral concern (markdown, pdf, inline-style, format)
6. **Characterization discipline** — Tests pin CURRENT behavior including quirks; no behavior "fixes"

## Critical Incident (Resolved)

During verify phase, an uncommitted working-tree edit had reverted PR #1 exports (export count 17 → 0), likely from stale IDE buffer write-back. Detected by verify-report #487 and discarded with `git restore src/App.tsx` before PR #2 opened. Committed branch state was always correct and verified green.

## Configuration Updates

**openspec/config.yaml** updated:

```yaml
rules:
  apply:
    tdd: true
    test_command: "bun run test"
  verify:
    test_command: "bun run test"
    build_command: "bun run build"
    lint_command: "bun run lint"
    coverage_threshold: 0

testing:
  strict_tdd: true
  runner: "vitest"
  reason: "Vitest 4.1.7 installed via change add-test-safety-net; 114 characterization tests cover 17 pure helpers in src/App.tsx"
  layers:
    unit: true
  coverage: true
```

Strict TDD mode is now **active** for all future changes.

## ESLint Scoping Lesson

The 17 lint warnings (`react-refresh/only-export-components`) are expected and documented:
- Global preset: `error` (correct — component-only export convention at repo level)
- App.tsx exception: `warn` (documented transitional exception for pure-helper exports)
- Anti-pattern avoided: did NOT downgrade global rule; used file-scoped override instead

This architectural-debt signal correctly flags that helpers belong in src/lib/ (Change 2).

## IDE Buffer Revert Incident Caught

The verify phase discovered and prevented a critical issue: an uncommitted buffer revert had stripped all 17 exports from src/App.tsx in working tree, even though committed code was correct. This demonstrated the value of fresh-context verify and the importance of re-confirming exports before writing tests. Lesson: always git restore before opening PR on safety-net changes.

## Handoff to Change 2

This change explicitly enables and de-risks the next change (extract helpers to src/lib/):
- Pure functions are now exported and tested (proof of behavior-preservation capability)
- Test suite is the guard rail for the extraction refactor
- Architectural debt is documented (pdfjs side-effect, react-refresh warnings)
- Strict TDD is active (all future changes must pass tests)

The extraction refactor can now proceed with confidence that any behavior change will be caught.

## Files Changed (Summary)

**Production**:
- src/App.tsx: 16 exports + 1 hoist (normalizeFileName)
- vite.config.ts: test block inlined
- tsconfig.app.json: vitest/globals added to types
- package.json: 3 scripts + 3 devDeps
- .gitignore: coverage/ added

**Tests** (4 files, 114 tests):
- src/__tests__/markdown.test.ts
- src/__tests__/pdf.test.ts
- src/__tests__/inline-style.test.ts
- src/__tests__/format.test.ts

**Config**:
- openspec/config.yaml: strict_tdd enabled
- openspec/specs/vitest-characterization-safety-net.md: new durable spec

## Definition of Done

- ✅ bun run test: 114 tests green (Vitest 4.1.7)
- ✅ bun run build: exit 0, identical bundle
- ✅ bun run lint: 0 errors, 17 expected warnings (documented)
- ✅ coverage/: in .gitignore
- ✅ All 17 functions exported from src/App.tsx
- ✅ normalizeFileName hoisted to module scope
- ✅ No behavior changes (zero-behavior-change by design)
- ✅ Characterization tests pin current behavior
- ✅ Smoke test deleted (verified before closing)
- ✅ Strict TDD enabled in config
- ✅ Durable capability spec created

## Next Steps

1. **Change 2** — Extract pure helpers to src/lib/markdown.ts, pdf.ts, inline-style.ts, format.ts under the coverage now in place. Tests must remain green.
2. **Future changes** — All feature work inherits strict_tdd: true. TDD mode is mandatory for this project going forward.

---

**Archived by**: SDD Archive Phase  
**Date**: 2026-05-31  
**Observation IDs**: #479, #480, #482, #483, #484, #487  
**Status**: CLOSED ✅
