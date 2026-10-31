# Tap & Wrap — Phase 6B.6A: Box 1 corrected local development overlay

**Branch:** `feature/gift-box-builder-v2`
**Starting commit:** `eca663585d02c25bc2dcb38f5f627e19ebb25757`
**Scope:** Offline, development-only asset preparation. **No public or production release.**

The owner accepted the visible Box 1 design. The original `boxes/box-1-open-top.webp` remains unchanged and intentionally blocked in the pinned 99-file manifest (`shared/gift-box/asset-manifest.v2.json`, `2026-10-28.2`). That source's hidden RGB remnants must not be silently marked as safe. The previously prepared PNG candidate clears RGB only at zero-alpha pixels, preserving all alpha and nonzero-alpha RGBA bytes.

This phase introduces an **independently versioned overlay** `box1-alpha-rgb-2026-10-31.1`. The source/candidate hashes, dimensions, and exact pixel invariants are pinned in `shared/gift-box/box1-overlay.mjs`. Offline script `server/scripts/prepare-box1-overlay.js` confirms the original manifest is still blocked, audits the 99 original source images, rechecks pinned candidate/source bytes and decoded RGBA, then creates a single transparent WebP *development* derivative and a hash-pinned `development-manifest.json` in `client/.gift-box-assets/box1-alpha-rgb-2026-10-31.1/`. It only writes ignored derivative files and refuses conflicting existing files.

The existing Vite local-media middleware allows **one** fixed loopback-only overlay URL after verifying its manifest/hash, with existing Origin, HTTP method, noindex, no-store and no-symlink protections. The Box 1 geometry review page can show the corrected box artwork in development. Original Box 1 paths remain 404. **Box 1 stays disabled as a selectable gift-box option, and geometry tracing stays blocked** until geometry and placement are separately reviewed. None of this affects production builds: the overlay has no production URL and is excluded from builds. Other 115 source derivatives and 21 ribbons stay on their existing versions.

## Prepare locally (repository root)

```powershell
node server/scripts/audit-gift-box-assets.js
node server/scripts/prepare-box-1-candidate.js
node server/scripts/prepare-box1-overlay.js
```

The first two commands are existing tools. Running them again is idempotent. Run focused tests, frontend lint, build and relevant Playwright browser tests before committing the patch:

```powershell
cd server
node scripts/run-tests.js test/gift-box-box1-candidate.test.js test/gift-box-box1-overlay.test.js test/gift-box-assets.test.js
npm.cmd test
npm.cmd run check
cd ..
cd client
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --config=playwright.gift-box-phase4.config.js
cd ..
git diff --check
git status --short
```

Real backend tests may require the existing disposable test MongoDB binary; no merchant database or credentials are allowed. E2E tests use isolated local fixtures only.

## Do not reinterpret this patch

- Does **not** amend the 99-source historical manifest, 84 unreviewed mapped asset flags, or the original source issue.
- Does **not** approve a production asset, physical geometry, packing quantities, delivery options, prices, checkout or submission.
- Does **not** modify the old source image, original candidate, other box images, ribbons, R2, MongoDB, Render, Workers or `main`.
- Does **not** run catalog migration or any unrelated untracked upload/transfer scripts.

Phase 6B.6B will reconcile the full artwork/bow inventory and plan reviewed production media delivery before any public URL/upload is assigned. Separately resolve the Box 1 geometry/photo-study blocker from actual packing evidence rather than treating an alpha correction as a geometry approval.
