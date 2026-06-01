# Archive Report: extract-helpers-to-lib

**Archived**: 2026-05-31
**Status**: CLOSED — implementation verified, PR merged
**Verdict at archive**: GO (0 CRITICAL · 0 WARNING · 1 pre-existing SUGGESTION)

---

## Executive Summary

Change `extract-helpers-to-lib` successfully decomposed the 2565-line `src/App.tsx` God-component by moving 17 pure helpers and 6 types into 4 focused `src/lib/` modules. App.tsx is now a pure consumer. A single PR (#3) merged 5 work-unit commits on branch `feat/extract-helpers-to-lib`. All 114 characterization tests stayed green throughout. Build and lint are clean. The pdfjs-free invariant holds for `src/lib/pdf.ts`.

---

## Delivery

| Item | Detail |
|------|--------|
| Branch | `feat/extract-helpers-to-lib` |
| PR | #3 (merged to `main`) |
| Commits | 5 work-unit commits |
| PR size | ~449 changed lines (size:exception accepted — moves are copy+delete, reviewer reads ~200 net-new lines) |

### Commit trail

| SHA | Message |
|-----|---------|
| feb7925 | refactor(lib): extract format helpers to src/lib/format.ts |
| a9f4a55 | refactor(lib): extract markdown normalizer to src/lib/markdown.ts |
| 6478330 | refactor(lib): extract inline-style helpers to src/lib/inline-style.ts |
| 9191979 | refactor(lib): extract pdf text-extraction helpers to src/lib/pdf.ts |
| 59ab099 | refactor(lint): remove transitional App.tsx eslint override after extraction |

---

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| App.tsx lines | ~2594 | ~2117 |
| App.tsx reduction | — | −477 lines |
| Tests | 114 green | 114 green |
| Test duration | ~3s (pdfjs side-effect loaded) | ~387ms (~8x faster) |
| ESLint errors | 0 | 0 |
| ESLint warnings | 17 (react-refresh) | 0 |
| pdfjs in pdf.ts | — | 0 imports (invariant held) |
| react-refresh suppressions | 1 override block | 0 (override removed, not suppressed) |

---

## Verification Results

All 13 spec requirements PASS. Key checks:

- `bun run test` — 4 files, 114 tests, 387ms, EXIT 0
- `bun run build` — EXIT 0 (pre-existing >500kB chunk warning, unrelated)
- `bun run lint` — EXIT 0, 0 errors, 0 warnings
- `rg "^import" src/lib/pdf.ts` — empty (zero imports; pdfjs-free)
- `rg -c "^export const" src/App.tsx` — 0 (no helpers left in App.tsx)
- Test bodies: byte-identical to main (only import-path string changed per test file)
- Symbol bodies: all 26 moved symbols byte-identical to `git show main:src/App.tsx`

---

## Interrupted-Apply Incident

The `sdd-apply` agent stopped mid-WU-4 (pdf helpers extracted, but the unused `getStyledMarkdown` import from the WU-3 step had not been removed from App.tsx). The orchestrator finished WU-4 manually:

1. Removed the unused `getStyledMarkdown` import from App.tsx (noUnusedLocals would have errored otherwise).
2. Committed WU-4: `refactor(lib): extract pdf text-extraction helpers to src/lib/pdf.ts`.
3. Proceeded to WU-5 (ESLint override removal) and committed: `refactor(lint): remove transitional App.tsx eslint override after extraction`.

The `sdd-verify` phase was run on the full result from scratch (adversarial, fresh context) and confirmed zero defects introduced by the manual finish.

---

## Engram Observation IDs (Traceability)

| Artifact | Engram ID |
|----------|-----------|
| proposal | #489 |
| spec | #490 |
| design | #491 |
| tasks | #492 |
| verify-report | #493 |
| archive-report | (saved after this file — see engram topic `sdd/extract-helpers-to-lib/archive-report`) |

---

## Persistent Capability

The durable architectural contract extracted from this change is documented in:

`openspec/specs/lib-module-architecture.md`

Key invariants:
- Pure helpers live in `src/lib/{format,markdown,inline-style,pdf}.ts`
- Dependency graph is strictly one-directional: `App.tsx → lib/*.ts`
- No lib-to-lib edges; no barrel file; types co-locate with their module
- `src/lib/pdf.ts` is and must remain pdfjs-free

---

## Handoff to Change 3

**Next change**: UI — Holy Grail layout in React + Neumorphic design system.

Context for that change:
- App.tsx is now ~2117 lines, focused on React/DOM/pdfjs orchestration (not pure logic).
- The 4 `src/lib/` modules are stable, tested, and should not need to change for a layout/design-system change.
- The `vitest-characterization-safety-net.md` spec and `lib-module-architecture.md` spec are both live in `openspec/specs/`.
- Strict TDD is active (`openspec/config.yaml: strict_tdd: true`).
- Test suite is 114 tests, ~387ms — a fast feedback loop for any UI change.
