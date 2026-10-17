# Batch 2: admin image uploads and media readiness

Local implementation and focused verification: 16 October 2026. No production or
staging connection, real provider upload, runtime environment or .env file change, deployment,
commit or push was performed. Only fresh disposable loopback MongoDB fixtures
and in-memory/SDK-transport storage mocks were used.

## Preflight and Batch 1 foundation

Reviewed the working tree, Batch 1 manifest and relevant source/redirect diffs.
The first isolated catalog integration run passed 17/18 assertions. Its failure
was an obsolete test expectation: a display-approved product changed back to
Draft was expected to disappear. The corrected assertion requires HTTP 200,
hidden unapproved price and ordering disabled. The suite then passed 18/18.
No critical Batch 1 implementation regression was found. No production migration
is implied: Batch 1 still requires its reviewed visibility transition before release.

The existing Cloudflare legacy redirect implementation, aliases, expiry rules
and production SEO-export prohibition remain unchanged. Batch 1 edits and all
unrelated untracked handoffs, scripts and backups were preserved.

## Merchant behavior

- Product editor: select multiple JPEG/PNG/WebP images, inspect local previews,
  upload, set primary, move up/down, replace individual photos and remove references.
  The existing limit remains 23 gallery images; the first is the main image.
- Main categories and subcategories: upload/replace/remove one image through the
  existing revision-protected category form. Parent relationships/slugs are unchanged.
- Components and packaging: the existing component editor now manages image
  galleries on both new and existing records. No component price, eligibility,
  inventory, approval or quotation policy is changed by image upload.
- Upload selected images, then Save the record. Save is blocked while selected
  files await upload or verification. Discarding the selection releases browser
  previews. Upload failure preserves saved images and the remaining selection
  for an explicit retry. Partial success remains in the unsaved draft.
- A 409 save conflict retains the uploaded draft and the existing explicit reload
  workflow. Reloading/discarding a draft never deletes the uploaded object.
- Existing imported image paths are preserved internally; no path entry is
  required. Imported images are not renamed, moved, converted or deleted.

## Upload and storage design

`POST /api/v1/admin/media` accepts bounded raw image bytes through the existing
authenticated API. Admin role, signed CSRF, exact Origin, database readiness and
safe-target middleware run before storage work. Rate limiting allows 80 attempts
per fifteen minutes per IP; at most three upload requests are processed concurrently
per API process. Images are sent sequentially by each editor.

Server checks allowlisted MIME, 10 MiB maximum actual bytes, signature, dimensions
(up to 12,000 per side and 40 million pixels) and basic container completeness.
This is not a full pixel decoder/re-encoder or malware scanning service. SVG,
GIF, arbitrary documents and MIME-mismatched files are rejected. Public catalog
photos must not contain private customer files or payment proofs.

Uploads use a separate R2 adapter and separate public-bucket credentials. Keys
are `catalog-media/v1/<SHA256>.<validated extension>`; filenames are never keys.
Distinct content gets a distinct key; identical content intentionally deduplicates.
R2 PUT uses `If-None-Match: *`; replacement never overwrites an existing URL.
Cache-Control is `public, max-age=31536000, immutable`. The adapter reads the
entire bounded object back and compares MIME and SHA256 before success.
Existing CATALOG_MEDIA_BASE_URL path prefixes are also used for R2 object keys.

After verification, the API transaction records a CatalogMedia receipt and a
redacted admin audit. Newly managed keys cannot be attached through product,
category or component saves without a verified receipt. Existing imported paths
retain their existing safe-reference validation. No catalog reference is created
by the upload endpoint; normal revision-protected Save applies references later.

Lost responses, timeouts and database failures are retried explicitly with the
same file. Conditional, content-addressed PUT/read-back recovers an already
stored image; duplicate metadata is constrained by a unique key. A failed receipt
transaction can leave an R2 object without metadata; retry recovers it without
renaming or deleting anything. Browser auth-generation checks and abort cleanup
preserve the existing session isolation model.

Cloudflare documents conditional writes and Cache-Control in its
[S3 compatibility reference](https://developers.cloudflare.com/r2/api/s3/api/).
Provider behavior here was verified using command/transport mocks, not live R2.

## Reference removal and orphan retention

Remove reference changes only the edited record when Save succeeds. There is
**no physical object-deletion endpoint, automatic TTL or deletion worker** for
public catalog media. Thus shared catalog references and immutable historical
orders cannot lose an image through this UI, including during concurrent edits.

`GET /api/v1/admin/media?page=1` provides bounded twenty-record operational pages
with current catalog reference presence and `deletionAllowed: false`. This is
not a declaration that an image is absent from historical orders, old static
publications, saved drafts or external links. Even an apparently unused object
is retained. Objects left before receipt creation need a separately authorized
R2 prefix inventory/reconciliation if the original file cannot be retried.

Do not configure R2 lifecycle expiry on this namespace. Automatic reclamation is
deliberately not implemented; storage can accumulate abandoned images. Any future
deletion procedure needs a separately reviewed retention policy, history/draft/
publication reference checks and a race-safe write fence. Never delete imported
objects or infer deletability just from the current reference report.

## Required configuration and authorized provider checks

Repository examples only were updated; live values remain unknown/unchanged.

| Server variable | Requirement |
| --- | --- |
| CATALOG_MEDIA_BASE_URL | Existing approved HTTPS public media origin, optionally with its established path prefix. Must resolve to the configured catalog bucket. |
| CATALOG_MEDIA_UPLOADS_ENABLED | Defaults false. Enable only after authorized schema/provider preparation and verification. |
| CATALOG_R2_ACCOUNT_ID | Public catalog bucket account; backend only. |
| CATALOG_R2_ACCESS_KEY_ID / CATALOG_R2_SECRET_ACCESS_KEY | Backend-only, bucket-scoped object read/write credentials. Never VITE variables. |
| CATALOG_R2_BUCKET | Existing public catalog bucket; must differ from private R2_BUCKET. |

Separately authorize schema preparation for CatalogMedia and its unique key and
pagination indexes using the existing guarded schema-initialization process.
Ordinary startup remains read-only. Schema readiness includes this collection
when catalog uploads are enabled. Do not casually toggle the flag to prepare schema
on a live service; perform the reviewed operator procedure before activation.

The public bucket/custom domain must serve the same existing image namespace.
Keep bucket writes authenticated; do not expose a public write Worker. Preserve
R2 custom-domain cache settings and set appropriate image Content-Type and
nosniff delivery headers. Do not alter media origin/bucket/prefix after references
exist without a separately reviewed migration. Image changes may require a new
approved SEO/media publication; this task does not export or enable indexing.

Public uploads go browser -> authenticated API -> R2, so browser R2 PUT CORS is
not required for this mechanism. The API's existing CLIENT_ORIGIN/CORS/CSRF rules
still apply. Ordinary public image display needs readable HTTPS images; canvas
use would require separate public-image CORS review.

Private customer uploads remain on STORAGE_ENABLED and the existing R2_ACCOUNT_ID,
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET. That bucket must have public
custom-domain and r2.dev access disabled. Its existing direct signed PUT flow
requires CORS allowing only the exact storefront origin, PUT and the signed
Content-Type header; verify actual Content-Length/signature behavior in a browser.
See [private upload runbook](PHASE_2_COMMERCE_ENGINE.md) and
[Cloudflare CORS documentation](https://developers.cloudflare.com/r2/buckets/cors/).
Ownership, private verified copies, quotas, expiry, retention and on-demand admin
viewing were not changed. No private production uploads were enabled or attempted.

Before activation, separately authorize a non-sensitive provider smoke image:
upload/read-back, custom-domain display, duplicate retry, replacement URL/cache,
negative authorization and an agreed test-object retention outcome. Verify private
bucket non-public access separately. Turning uploads off stops new public writes;
already saved image references and public delivery continue unchanged.

## Focused verification

- Catalog API integration: 18 passed on disposable MongoDB, including actual price
  aggregation, checkout/display independence, inactive categories and stale revisions.
- Catalog media integration/adapter: 8 passed: auth/CSRF/Origin, invalid bytes,
  type/size/dimensions, duplicate races, failed R2 operations/readback, managed-key
  validation, imported paths, ordering, main/subcategory/component updates,
  historical order retention and immutable SDK commands/path-prefix handling.
- Existing commerce configuration and permanent-address integration checks also
  passed. The combined four-file run before the final added adapter test passed
  59/59; the final media file independently passed 8/8.
- Existing private-upload/storage checks passed 22/22 with mocks/disposable MongoDB.
- Final media/editing browser run passed 9/9, covering duplicate/gallery-limit
  behavior, uploaded-draft conflict retention, editor-close selection cleanup,
  primary-image ordering and category/subcategory edit conflicts/compatibility.
  The four focused Batch 1 visibility browser checks also passed (13 distinct
  browser cases across these focused runs).
- Targeted ESLint and server syntax checks, isolated Vite build and Git whitespace
  checks passed. Build/screenshots/test configuration stay in ignored test-results.
  No reviewed production dist artifact was replaced.

The first new media test run exposed an unsupported audit resource type. It was
fixed to use the existing `upload` resource type within the receipt transaction;
the affected tests passed after correction. No audit authorization guard was relaxed.

Windows browser verification used an owned isolated Vite process and temporary
Playwright config to avoid the previously observed standard-runner teardown hang.
No runtime rate limiter was reset or bypassed.

## Scope and readiness

Locally ready for review with mocked providers and disposable database integration.
Actual R2 permissions, public-domain routing/cache, Render/Cloudflare live variables,
private-bucket privacy/CORS and merchant image quality remain production-unverified.
No claim of live upload readiness is made until the authorized checks above pass.

Batch 3 has not started. Shipping/quotation/payment/component pricing policy changes,
required product customization and fixed developer-managed English information/legal
pages remain deferred. The future six-page UI/API write prohibition is not implemented
by this media batch; existing content administration behavior is unchanged.

## Exact Batch 2 file manifest

New files:

- client/src/admin/AdminImageGallery.jsx
- client/src/admin/media.css
- client/e2e/admin-media.spec.js
- server/src/models/CatalogMedia.js
- server/src/catalog/media-storage.js
- server/src/catalog/media.js
- server/src/routes/admin-media.routes.js
- server/test/catalog-media.test.js
- docs/BATCH_2_ADMIN_MEDIA.md

Modified files (additions preserve pre-existing Batch 1 changes where present):

- client/src/pages/AdminProductFormPage.jsx
- client/src/pages/AdminWebsitePage.jsx
- client/src/pages/AdminCommercePage.jsx
- client/src/commerce/AdminEditors.jsx
- client/e2e/catalog-browser.spec.js (one obsolete Batch 1 control selector)
- server/.env.example (examples only)
- server/src/routes/admin.routes.js
- server/src/config/schema.js
- server/src/catalog/service.js
- server/src/commerce/configuration.routes.js
- server/test/catalog-api.test.js (obsolete Batch 1 expectation)
