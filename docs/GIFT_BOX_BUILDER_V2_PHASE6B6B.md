# Tap & Wrap — Phase 6B.6B: Offline media inventory reconciliation

**Starting branch:** `feature/gift-box-builder-v2` at `c5b4ee66a1c2a0cecf3ca55fc041f3763adf2fda`.

**Scope:** Verify the already-prepared 99-file original art collection, 115 standard local derivatives, 21 separately supplied ribbon bows (source plus mirrored development copy), and one corrected Box 1 development overlay. This is an **offline read-only audit**, not a production art manifest, publication, approval, media migration, image regeneration, or checkout change.

## Work delivered

- `server/scripts/audit-gift-box-media-readiness.js` exposes a human-readable JSON summary without arguments, and a full **137-entry** inventory with `--full`.
- The verifier cross-checks immutable component IDs, fixed derivative paths and roles, the historical 99-file manifest's inventory hash and issue exclusions, all 115 derivatives and the unapproved upload plan, exact ribbon IDs/names against both independent local copies, and the corrected Box 1 candidate/overlay pins.
- Every advertised image is checked against its local bytes and decoded image metadata where recorded. Missing, unexpected, renamed, duplicated, altered, redirected/linked or wrong-version files cause the audit to **fail closed**, instead of being silently ignored.
- Its single `manifestDigestSha256` fingerprints the ordered, reconciled 137-entry development media inventory; this is a *reproducible technical reference only*.
- It reports `productionReady: false`, `publicationAuthorized: false`, and `geometryApproved: false` deliberately, even when all source/derivative integrity checks pass.

## Run locally (at repository root)

Use the existing Phase 6B.6A preparation steps if files have not already been prepared:

```powershell
node server/scripts/audit-gift-box-assets.js
node server/scripts/prepare-box-1-candidate.js
node server/scripts/prepare-gift-box-assets.js
node server/scripts/prepare-gift-box-bows.js
node server/scripts/prepare-box1-overlay.js
```

Then run the new audit. It does not write files, access the network, or connect to a provider/database:

```powershell
node server/scripts/audit-gift-box-media-readiness.js
```

To inspect every entry individually:

```powershell
node server/scripts/audit-gift-box-media-readiness.js --full
```

To verify the new tests and existing implementation:

```powershell
cd server
node scripts/run-tests.js test/gift-box-media-readiness.test.js
npm.cmd test
npm.cmd run check
cd ..
git diff --check
git status --short
```

The three focused tests assert the complete 137-entry inventory and release gates, reject altered image bytes, and reject a tampered bow collection. The original 99-file manifest and source images, corrected Box 1 candidate and existing overlays, bow source/derivative files, fixed component definitions, customer UI, pricing, database, R2, Render, Cloudflare Workers and checkout are **unchanged**.

## Outcome and next phase

Technical media consistency does **not** imply physical fit, visual product identity approval, accepted selling prices or publication readiness. In particular, the 84 mapped original image slots have no production-approval records and the original Box 1 source is still blocked; its safe development overlay is not automatically promoted. No upload key or public URL is produced.

**Next: Phase 6B.7** — implement conservative, versioned real-world packing/inside-beside rules from approved physical evidence, with Box 11 split compartments and no arbitrary category caps. Keep public ordering disabled until personalization, pricing, private media and acceptance gates are finished.
