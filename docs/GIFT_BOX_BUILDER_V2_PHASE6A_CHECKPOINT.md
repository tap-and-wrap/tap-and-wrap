# Gift Box V2 — Phase 6A: category selection ceilings

Status: local implementation checkpoint, **pending full regression verification and physical review**.

- Each box starts with a proposed maximum of **25 total single roses across colors, 6 complete retail chocolate units and 2 plush toys**.
- These are *selection ceilings*, not a claim that all three category maxima fit simultaneously. Only real physical policies can approve combined capacity, lid clearance, transport and compartment restrictions.
- Explicitly approved current per-box policies may change the displayed per-category maximum, including zero. Missing, pending, obsolete or withdrawn policies cannot override the defaults.
- Both the UI reducer and server estimate enforce aggregate category ceilings. Changing boxes preserves incompatible selections and reports an actionable limit warning; it does not discard customer work silently.
- Existing photo-study sizes, geometry and assets are unchanged, pending visual calibration. Existing test-only checkout and public commerce fences remain closed.
- No customer photo uploads, fonts, engraving or new charges are added by this checkpoint. They require coordinated later contract/version, private-upload and immutable-order work.

## Run local verification before further implementation

From the repository root:

```powershell
cd server
npm.cmd test
npm.cmd run check
cd ../client
npm.cmd run lint
npm.cmd test -- --config=playwright.gift-box.config.js
```

No deployment or production configuration should be changed as a result of applying this patch.
