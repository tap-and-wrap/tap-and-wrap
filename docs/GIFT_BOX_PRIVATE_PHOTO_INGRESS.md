# Tap & Wrap — Gift Box Private Photo Ingress

**Development baseline:** `feature/gift-box-builder-v2` @ `d821436a8bb0be9fcbd71e7b32c6a3d82561f5f9`.

The public Gift Box image release (`gift-box-media-2026-10-31.1`) is already uploaded and serves on `https://media.tapandwrap.net`. **Do not re-upload or reconfigure public media for this change.**

## Implemented in this patch

- Extend existing private `/commerce/uploads/sign` and Upload persistence with a distinct `gift_box_photo` purpose and validated `giftBoxId`. Never fabricate `productId` or reuse product-upload fields.
- Reuse existing private R2 signed PUT, full-image verification, isolated verified copy, 24-hour expiry, quota, owner-scoped private read, and cleanup. Public media bucket is not involved.
- Gift Box files are limited to verified 8 MB JPEG/PNG/WebP uploads. An actual selected box and enabled Gift Box backend are required; product IDs, external request keys, and other unrelated upload fields are forbidden.
- `validateGiftBoxPhotoUploadReferences` checks complete, unexpired uploads belonging to both the current cart owner and the selected box; no raw storage object keys are returned.
- Client `uploadGiftBoxPrivatePhotos` uses the existing `uploadPrivateFile` pathway and returns only opaque verified upload IDs, keeping local Files/object URLs/name out of the handoff. Caching is scoped to both box and shopping session.

## Not yet enabled

**This is one real private-storage integration component, not complete Gift Box personalization or an ordering launch.** The helper is not yet invoked by the customer builder: doing so before priced print options and order attachment would create expiring, unowned uploads. Photo-print choices, authoritative costs, cart attachment and order snapshot retention are the next work; existing `personal.hasContent` checkout block remains intact. The 20-file uploader quota is operational, **not** a box capacity assertion.

No live R2/private uploads, DB/index changes, network connections, Render/Cloudflare/deploy or checkout flag changes are performed by installing this patch. Required existing `STORAGE_ENABLED` and private R2 configuration remain off by default.

## Verification

From repository root:

```powershell
node --test client/src/gift-box/private-photo-upload.test.mjs
cd server
node scripts/run-tests.js test/gift-box-private-photo-upload.test.js test/commerce-storage.test.js
npm.cmd test
npm.cmd run check
cd ..\client
npm.cmd run lint
npm.cmd run build
cd ..
git diff --check
git status --short
```

The tests operate against disposable local fixtures, not Atlas or Cloudflare. Do not deploy or enable Gift Box ordering on the basis of this patch alone.
