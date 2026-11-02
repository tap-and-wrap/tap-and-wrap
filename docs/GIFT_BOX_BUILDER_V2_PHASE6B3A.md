# Gift Box Builder V2 — Phase 6B.3a: draggable local photo-print previews

## Scope

- Customers select photos as before (temporary six-file limit and existing browser MIME/size screening remain in force).
- When a box is selected in the Vite development layout study, each photo is displayed as one separate moveable print on the canvas, initially beside the box.
- Drag, keyboard arrows, and explicit Inside/Beside buttons change photo positions and proposed zones. Photo order/reordering retains photo identity and positions; removing a photo revokes its browser object URL. Selecting a different box resets photo positions while keeping selected files.
- Physical dimensions, print size, geometry, overlap, placement, capacity, support, and fulfillment have **not** been certified.
- Photo coordinates and file URLs are local to browser memory. They do not modify selection estimates, server requests, shared contracts, or orders.
- The image stack beneath the box is a fallback outside the development study only; one displayed image per selected photo avoids duplicate accessible previews.

## Deliberate exclusions

No upload, R2 storage, database, image asset publication, owner approval, checkout activation, print pricing, photo quantity-contract revision, or engraving color/quantity change. The existing gift-box checkout/submit gates remain closed. A separate phase will review secure private media handling and authoritative customer attachment contracts.

## Tests

Run `node server/scripts/audit-gift-box-assets.js`, `npm.cmd test` and `npm.cmd run check` from `server`, plus `npm.cmd run lint`, `npm.cmd test -- --config=playwright.gift-box-phase4.config.js`, and `npm.cmd run build` from `client`. Test pointer movement, keyboard control, inside/beside switching, deletion, box changes, and no extra pricing calls.
