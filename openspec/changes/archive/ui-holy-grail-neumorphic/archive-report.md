# Archive Report: ui-holy-grail-neumorphic

- **Change**: `ui-holy-grail-neumorphic`
- **Status**: ARCHIVED & CLOSED
- **Delivery**: single PR #5 (squash `c4dc450`), 5 work-unit commits
- **Verdict**: GO — merged to main

## What shipped

The first VISIBLE change: a Holy Grail grid layout + Neumorphic chrome design system.

- **Layout**: `.app` becomes a CSS grid (`auto 1fr auto`, `100dvh`, `overflow:hidden`); `.workspace` is the only scroll container (`overflow:auto; min-height:0`); editor/source/preview fill via `height:100%`. The 5 editor `calc(100vh-Npx)` magic numbers removed (3 PDF-overlay calcs survive).
- **StatusBar footer**: file metadata (folder · size · saved-at) moved out of the header into a new `<footer className="app-footer">`.
- **Neumorphic tokens**: calibrated per theme (light `#e8ecf3`, dark `#1b2230`), cyan→purple accent gradient on active controls, applied to chrome only — editor content stays clean.
- **Accessibility**: `focus-visible` switched from box-shadow to `outline`; text contrast WCAG AA preserved.

## Verification (fresh adversarial verify — GO)

- `bun run test`: 114/114 green.
- `bun run test:e2e`: 7/7 green (the UI redesign passes the behavioral net unchanged).
- `bun run build`: exit 0. `bun run lint`: 0 errors / 0 warnings.
- App.tsx diff = only the fileMeta→footer move + data-testid wiring; ZERO logic/handler/src/lib changes.
- All 8 data-testid hooks + 3 ARIA groups intact; `app-root` on the outermost element.
- Neumorphic `--nm-*` tokens never leak into MDXEditor internals.
- Visual correctness confirmed via screenshots (dark + light) by the orchestrator.

## Notes

- App.css grew 692 → 782 lines (under the ~850 split threshold; kept as one file per design).
- No visual-regression tests exist; visual verification is by running the app (`bun run dev`) or screenshots.
- SUGGESTION (deferred): the spec's quick-acceptance table names `.app-layout`; implementation keeps `.app` as the grid shell (explicitly allowed by design).

## Handoff

The UI redesign is complete and live. Optional next: **Change 3c** — extract the App.tsx render into presentational components (`src/components/`: AppHeader, Toolbar, StatusBar, EditorPane, PreviewPane, PdfModal, etc.) to finish decomposing the God-component. The data-testid + aria contract and the 114 unit + 7 E2E nets guard that refactor.
