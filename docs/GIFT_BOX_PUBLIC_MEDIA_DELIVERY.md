# Tap & Wrap — Gift Box R2 Media Delivery Candidate

**Branch baseline:** `feature/gift-box-builder-v2` commit `593c7e7` (31 October 2026). This patch does not include database writes, Cloudflare credentials, deployment or checkout activation.

## Why this exists

The standard product catalog has about 4.14k R2 objects already stored in the `tapandwrap-catalog` bucket. The 137 newly prepared Gift Box images and ribbons are currently served from a localhost-only Vite middleware and do not appear in a production build.

This release-candidate mapping covers **115 normal derivatives, 21 ribbon bows, and the 1 corrected Box 1 placement derivative**, a total of 137 objects and 16,796,852 bytes. Original 99-file images and corrected Box 1 source are never modified. All new keys are under `gift-box/gift-box-media-2026-10-31.1/` and cannot replace pre-existing product catalog keys. The previous developer-only asset manifest retains its blocked source and production-approval status; this new mapping is a *delivery candidate*, not geometry or commerce authorization.

## Verify local candidates first (no credentials, network or writes)

From the project root, after preparing the original local assets as documented in the earlier phases:

```powershell
node server/scripts/gift-box-r2-publication.mjs
node --test client/src/gift-box/public-media-url.test.mjs
cd server
node scripts/run-tests.js test/gift-box-r2-publication.test.js
```

The first command checks SHA-256 for each local image. It does **not** upload. If a local image is missing, use the existing safe local preparation scripts; never copy files into a different version or silently change the manifest.

## Cloudflare read-only verification and guarded upload (separate explicit step)

The media uploader uses the existing **catalog-only R2 S3 credentials** supplied as environment variables: `CATALOG_R2_ACCOUNT_ID`, `CATALOG_R2_ACCESS_KEY_ID`, `CATALOG_R2_SECRET_ACCESS_KEY`, `CATALOG_R2_BUCKET=tapandwrap-catalog`. Do **not** commit or paste credentials. The program never reads `.env` files automatically.

After arranging the credential variables locally:

```powershell
node server/scripts/gift-box-r2-publication.mjs --verify-r2
```

This HEAD-checks all 137 pinned objects, reports missing ones and leaves the bucket unchanged. Only after reviewing the output, explicitly opt in:

```powershell
node server/scripts/gift-box-r2-publication.mjs --apply --confirm-giftbox-upload
node server/scripts/gift-box-r2-publication.mjs --verify-r2
```

The uploader uses conditional create-only (`If-None-Match: *`), requires matching size, MD5 ETag and SHA-256 object metadata, and halts on any conflicting existing key. No listing, deletion or overwriting of existing catalog objects. A partial failure can be retried, because successfully created objects are verified before new uploads. The uploader does **not** make buckets public, configure custom domains, or change MongoDB.

## Production image URLs (only after R2 objects are verified and publicly served)

Configure a verified HTTPS public origin that serves *the exact R2 keys*, e.g. your existing catalog image domain, with neither a path suffix nor a query string. The origin is unknown until Cloudflare delivery is checked; do not invent a URL.

Set these **client build-time** variables only after the origin is working:

- `VITE_GIFT_BOX_MEDIA_BASE_URL` = the working HTTPS origin (no trailing path).
- `VITE_GIFT_BOX_MEDIA_RELEASE=gift-box-media-2026-10-31.1`.

With both values matching the versioned manifest, the frontend resolves Gift Box images and ribbon bows from R2. With either missing or invalid, there is **no production URL fallback**; localhost continues using the existing private Vite development middleware. The corrected Box 1 source defect is not declared resolved in the original manifest, and no extra owner technical signoffs are created by this patch.

**Still outstanding before the Gift Box can accept real orders:** production component prices/availability, box packing policy and quantities, private photos/engraving attachment flow, payment/order validation, and production release switches. This patch delivers media transport, not those business facts.
