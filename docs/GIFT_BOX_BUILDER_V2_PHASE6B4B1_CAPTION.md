# Tap & Wrap — Phase 6B.4b.1: Preview note outside gift-box artwork

## Scope

Follow-up to the Phase 6B.4a browser/screenshot audit. At narrow widths and 200% text sizing, the prominent overlaid disclaimer obscured the gift box and selected bow. Move **only** this existing disclaimer from inside the absolute-positioned artwork canvas to normal flow immediately below it. Retain its exact original wording, gate conditions, box geometry, drag/keyboard controls and image loading. No photo sizing, engraving UI or review copy changes in this subphase.

## Implementation

- `client/src/gift-box/ArrangementCanvas.jsx`: render the existing note as a sibling beneath `.gb-canvas` rather than inside the canvas.
- `client/src/gift-box/gift-box.css`: remove absolute positioning, keep a small responsive block and adequate line height for enlarged text.
- `client/e2e/gift-box-phase6b4-audit.spec.js`: add five browser regression cases across mobile/tablet/desktop and 200% text. Ensure note has no canvas overlap, remains within canvas width and does not trigger commerce mutations. Capture screenshots for comparison.

## Validation

Run browser tests with `npm.cmd test -- --config=playwright.gift-box-phase4.config.js` from `client`, then client lint/build, read-only asset audit and server test/check. The installer only validates and edits local source; it does not run tests, deploy or authorize commerce. New screenshots are not a substitute for reviewing actual owner-approved art/packing.

## Open release blockers

Box 1 artwork defect, unapproved physical geometry and fit, licensing of lettering styles, engraving finish/price, personalization file processing and fulfillment, and closed cart/checkout gates remain unchanged. Development-only box movement is not promoted to production.
