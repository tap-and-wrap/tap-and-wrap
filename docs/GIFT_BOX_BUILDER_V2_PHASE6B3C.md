# Phase 6B.3c — Flexible local personalization drafts

Base commit: `111fc772318b268847acfcdd07dcf01aa0c73e68` on `feature/gift-box-builder-v2`.

- Retire the prior *business-looking* six-photo and two-engraving limits for the browser-only preview.
- Keep performance guards: at most 48 local photo references, 64 MiB aggregate selected source bytes, existing 8 MiB/file type check, and 24 engraving editors. These do NOT certify how much will physically fit or what the owner will fulfill.
- Keep the 80 Unicode-code-point limit on each engraving, explicit five color candidates, and twelve unlicensed lettering placeholders.
- Use a new UUID for every subsequent engraving. Removing a middle entry must preserve later text/style/color identity. Photo placement IDs and object-URL cleanup remain stable.
- No photos, engravings, object URLs or preview coordinates are sent to estimates, upload endpoints, the database or checkout.
- No production deployment, policy approval, pricing, cart activation, uploads or git writes.
- Known Box 1 artwork issue remains blocking production; all photo geometry is illustrative.

Local checks: `node server/scripts/audit-gift-box-assets.js`, `cd server && npm.cmd test && npm.cmd run check`, `cd client && npm.cmd run lint && npm.cmd test -- --config=playwright.gift-box-phase4.config.js && npm.cmd run build`, then `git diff --check`.
