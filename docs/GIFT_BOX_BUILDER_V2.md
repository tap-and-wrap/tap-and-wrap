# Gift Box Builder V2 — Phase 1 foundation

Architecture approved by the owner on 28 October 2026. Phase 1 is local, offline foundation work on `feature/gift-box-builder-v2`. It adds no customer interface, API routes, Mongoose models, schema registration, migrations or request submission changes. Existing Gift Box, Laser Engraving, product personalization, accounts, carts, quotations and orders keep their current implementation. Nothing is committed, pushed, deployed or uploaded by these tools.

## Approved final experience

1. **Choose Your Box** — required.
2. **Fill With Flowers** — optional; one tap adds one individual rose, with mixed colors.
3. **Add Plush Toys** — optional; multiple instances subject to reviewed physical capacity.
4. **Add Chocolates** — optional; only new owner-supplied selection photographs and transparent builder artwork.
5. **Finishing Touches** — approved ribbon color selection and optional gift-card message.

The later interface needs Back and Next controls on every step, preserved selections and Skip on optional steps. On the first step Back can return to the customization hub; on the final step Next can open review. Neither navigation nor the review screen is implemented in Phase 1. Tap-to-add, touch/pointer dragging, accessible move/remove alternatives, undo, reduced motion and progressive asset loading remain future UI work.

Ribbon choices use solid color buttons, accessible labels and a visible selected indicator. No ribbon images or draggable ribbon elements. Each future source definition must contain an owner-approved immutable `approvedColorHex`. Display name, approved price, display order and enabled status are the only editable business fields. No ribbon entries or color values have been invented; `ribbons/ribbons.jpeg` is an unused reference photograph.

Gift cards use an optional **Add a gift card with a message** checkbox and a textarea. The proposed shared policy is 500 Unicode code points, with nonblank text required when selected. Future frontend and backend validators must consume the same limit, preserve the message in the immutable request snapshot and show it in protected owner details. There is no image or placement element. No card identity or paid/complimentary price policy exists yet; the finishing option stays unavailable until approved. This phase defines the policy only, not message submission or enforcement endpoints.

## Fixed catalog and ownership

`shared/gift-box/definitions.mjs` exports a deeply frozen 32-component registry, the step/pending-category policies and the open asset issue. Identities remain `box-1` through `box-12`, `plush-1` through `plush-17`, and `rose-red`, `rose-yellow`, `rose-black`, in namespace/version `gift-box-v2.1`. Numeric source order is separate from future owner display ordering. These IDs are not merchant SKUs, existing Product IDs or ComponentOption ObjectIds.

Future approved chocolates, ribbons and the gift-card option require reviewed code/manifest additions with new immutable identities. Empty pending category definitions are not selectable products. There is no runtime component registration, factory, create/delete API or automatic import from the existing product catalog.

Future `GiftBoxComponentSetting` records will live separately from `ComponentOption`. Owner edits allow only `displayName`, `displayOrder`, `pricePiastres`, `enabled` and the required `expectedRevision` envelope. They cannot alter IDs, assets, ribbon color, geometry or inventory mappings. Server-side rejection, auditing and 409 draft retention belong to Phase 2. Missing settings are disabled/unpriced with no inferred inventory; the registry contains no prices, counts or enabled products.

Server pricing must use saved approved integer piastres. Total component amount is box + rose quantities + plush quantities + chocolate quantities + ribbon + gift card. Unknown selected amounts are not zero; a complete price must fail closed. Delivery is separately confirmed through the existing quotation flow. Do not add the box/component amount again as a generic base-work charge.

## Authoritative source and manifest

The only source collection is `local-data/taw-giftbox`. Original images were not renamed, reorganized, edited or optimized in place. Other files under `local-data` are unrelated and must never be served, packaged or uploaded by builder tooling.

The checked-in `shared/gift-box/asset-manifest.v2.json` records all 79 source images, including unused references: exact relative filename, format, dimensions, byte length, alpha presence/counts, visible alpha bounds, byte SHA-256 and decoded RGBA SHA-256. It records source roles and known issues separately from production approval. All production approval fields remain false. Local development authorization does not certify production artwork or physical scale.

Versions:

- Catalog: `gift-box-v2.1`.
- Assets: `2026-10-28.1`.
- Geometry: `gift-box-geometry-v1-draft`.
- Local conversion: `webp-v1`.
- Source inventory SHA-256: `5b6ed17d966cc139269ac7fb6e250105db7a2ec4aba5997e2f2999475b82cc02`.

The inventory checksum hashes sorted `relative filename + TAB + source SHA-256` lines joined by LF, without a final LF. It identifies this extracted collection, not an unavailable original ZIP byte stream. Future corrections require a new reviewed asset version/checksum; the auditor never rewrites the manifest to accept changed sources automatically.

### Exact box mappings

All paths below are relative to `local-data/taw-giftbox`. The source numbers are authoritative initial display order.

| Immutable ID | Selection photograph | Transparent placement artwork |
| --- | --- | --- |
| box-1 | boxes/box-1.webp | boxes/box-1-open-top.webp |
| box-2 | boxes/box-2.webp | boxes/box-2-open-top.webp |
| box-3 | boxes/box-3.webp | boxes/box-3-open-top.webp |
| box-4 | boxes/box-4.webp | boxes/box-4-open-top.webp |
| box-5 | boxes/box-5.webp | boxes/box-5-open-top.webp |
| box-6 | boxes/box-6.webp | boxes/box-6-open-top.webp |
| box-7 | boxes/box-7.webp | boxes/box-7-open-top.webp |
| box-8 | boxes/box-8.webp | boxes/box-8-open-top.webp |
| box-9 | boxes/box-9.webp | boxes/box-9-open-top.webp |
| box-10 | boxes/box-10.webp | boxes/box-10-open-top.webp |
| box-11 | boxes/box-11.webp | boxes/box-11-open-top.webp |
| box-12 | boxes/box-12.webp | boxes/box-12-open-top.webp |

Alternate photographs are `boxes/box-N-2.webp` for N = 1, 2, 4, 5, 6, 7, 8, 9, 10, 11. They remain references, not additional components. Box 1's placement source is retained in the manifest but excluded from normal derivative preparation.

### Exact plush mappings

| Immutable ID | Selection photograph | Transparent placement artwork |
| --- | --- | --- |
| plush-1 | toys/plush-1.webp | toys/plush-1-builder.webp |
| plush-2 | toys/plush-2.webp | toys/plush-2-builder.webp |
| plush-3 | toys/plush-3.webp | toys/plush-3-builder.webp |
| plush-4 | toys/plush-4.webp | toys/plush-4-builder.webp |
| plush-5 | toys/plush-5.webp | toys/plush-5-builder.webp |
| plush-6 | toys/plush-6.webp | toys/plush-6-builder.webp |
| plush-7 | toys/plush-7.webp | toys/plush-7-builder.webp |
| plush-8 | toys/plush-8.webp | toys/plush-8-builder.webp |
| plush-9 | toys/plush-9.webp | toys/plush-9-builder.webp |
| plush-10 | toys/plush-10.webp | toys/plush-10-builder.webp |
| plush-11 | toys/plush-11.webp | toys/plush-11-builder.webp |
| plush-12 | toys/plush-12.webp | toys/plush-12-builder.webp |
| plush-13 | toys/plush-13.webp | toys/plush-13-builder.webp |
| plush-14 | toys/plush-14.webp | toys/plush-14-builder.webp |
| plush-15 | toys/plush-15.webp | toys/plush-15-builder.webp |
| plush-16 | toys/plush-16.webp | toys/plush-16-builder.webp |
| plush-17 | toys/plush-17.webp | toys/plush-17-builder.webp |

### Exact flower mappings

| Immutable ID | Bouquet selection photograph | Single-rose placement | Reference bouquet cutout |
| --- | --- | --- | --- |
| rose-red | flowers/red-og.webp | flowers/rose-red-builder.webp | flowers/flowers-red.webp |
| rose-yellow | flowers/yellow-og.webp | flowers/rose-yellow-builder.webp | flowers/flowers-yellow.webp |
| rose-black | flowers/black-og.webp | flowers/rose-black-builder.webp | flowers/flowers-black.webp |

`flowers/all-og.webp` is a mixed-color reference. The three bouquet cutouts are references; no bouquet is ever used as the individual placement unit. `ribbons/ribbons.jpeg` is reference-only. The collection has no chocolate or gift-card artwork, and neither finishing category needs image placeholders.

### Inventory facts

- 34 box files = 12 photographs + 12 placement images + 10 alternates.
- 34 plush files = 17 photographs + 17 placement images.
- 10 flower files = 3 photographs + 3 bouquet cutouts + 3 individual roses + 1 mixed reference.
- 1 unused ribbon photograph.
- 78 WebP, 1 JPEG, 10,676,268 bytes; 35 files contain alpha.
- All 32 component pairs exist; no byte-identical or decoded-pixel-identical duplicates.
- Exact per-file dimensions and alpha bounds are in the manifest, not guessed from filenames.

## Offline commands and derivative safety

From `server/`:

```powershell
npm.cmd run giftbox:assets:audit
npm.cmd run giftbox:assets:audit -- --require-production-ready
npm.cmd run giftbox:assets:prepare
npm.cmd run test:giftbox
```

The audit is read-only and decodes all files. It rejects changed hashes/dimensions/alpha, missing/unexpected files, wrong formats, truncated containers, duplicate artwork, invalid role mappings, traversal and symlinks/junctions. `--require-production-ready` intentionally exits 1 for this collection; valid sources do not override approval blockers. No tool imports runtime environment configuration, dotenv, Mongoose, storage SDKs or notification providers. CLI source/destination paths cannot be redirected with arbitrary flags.

Preparation first audits the entire collection, then writes only eligible mapped assets into ignored `client/.gift-box-assets/2026-10-28.1/webp-v1/`. It excludes all 15 reference-only files and the defective box-1 placement source. The 63 eligible sources produce 95 WebP derivatives: 32 photographs at maximum widths 320 and 640, and 31 placement images at maximum width 1200. Aspect ratios and alpha are preserved; images are never enlarged, cropped, flattened or redrawn. WebP uses quality 82, alpha quality 100; embedded source metadata is not retained.

Existing different output is never overwritten. Identical output is reused. There is no cleanup, deletion, upload or source modification command. Output directories reject links/junctions and stay in the fixed ignored development directory (isolated tests may use `server/.cache`). A failed/interrupted run may leave its own partial derivative files; an identical rerun verifies/reuses them. Changing source/version/conversion policy requires a reviewed version change, not deleting unrelated output to force success.

The generated `development-manifest.json` records every derivative's source hash, dimensions, transparency and resulting hash. `upload-plan.json` contains relative files, content hashes and proposed versioned object keys only; every entry has `publishable: false`, and `uploadAuthorized` is false. The scripts have no upload capability. There are no production URLs or bucket credentials.

Derivatives are outside `client/public` and are not served by Vite, copied into builds or imported into the current application. A narrow allowlisted local-development resolver is future UI integration work; never broaden Vite filesystem access to `local-data`. Standard builds remain independent of the private source collection.

## Geometry foundation and unresolved review

`shared/gift-box/geometry.mjs` defines a versioned entry for every box. All entries are **unreviewed**, with empty inside/beside regions and foreground masks, and null physical dimensions, capacity and per-item scale data. `reviewPlacement` therefore rejects every real-box placement with `GEOMETRY_REVIEW_REQUIRED`. No arbitrary coordinates masquerade as reviewed geometry.

Reusable pure primitives validate normalized rectangles, ellipses and simple polygons (including heart silhouettes). They reject nonfinite/out-of-range values, degenerate/self-intersecting polygons, partial-footprint escape and concave boundary crossing. A footprint must fit in one compartment; it cannot bridge independent regions. Polygon rim contact is conservatively rejected. Tests use clearly synthetic geometry, not merchant measurements. These are foundation primitives, not a finished drag/collision/packing engine.

Owner review must establish:

1. Usable interior outlines, perspective and foreground rim occlusion for all 12 boxes. Square shells 5/6 have heart interiors; box 11 needs independent compartment rules; box 12 needs basket-wall clearance.
2. Box 2's folded/unfolded presentation: supplied builder artwork depicts its central heart container, not the unfolded wings visible in the photograph.
3. Physical box and item dimensions, scale ranges, rose capacities, plush/chocolate quantities, collision/overlap rules and valid beside-box zones.
4. Whether individual item poses in the supplied artwork adequately represent the original photographs at the chosen placement scale.
5. Layering, stem/body occlusion, artwork padding anchors and foreground masks. Alpha bounds are image-content bounds, never automatic placement boundaries.

The source version remains fixed while geometry receives a separately reviewed version. Later request snapshots must preserve both versions plus placements, fixed IDs, saved names, quantities and approved prices. PNG/WebP alpha alone cannot certify realism or capacity.

## Explicit asset issue

`box-1-right-edge-remnants`: `boxes/box-1-open-top.webp` has unwanted horizontal remnants to the right of the box. The source is preserved, the issue is open, and normal derivatives/release are blocked for that artwork. No automatic retouching, cropping or asset substitution is authorized. After an owner-supplied correction, inspect it visually, record a new asset version/checksum and rerun validation before requesting production approval.

All other supplied artwork is authorized for local development, with production review still outstanding. Pending prices, availability, physical geometry, ribbon colors, card pricing policy and new chocolate assets are release blockers, not invented defaults.

## Future integration boundaries

The next approved phase can add the separate settings model, strict revision-safe admin endpoints and server estimates with isolated tests. It must not automatically initialize an existing database or unconditionally require a missing collection in current API readiness. No model/collection has been registered in Phase 1.

Dedicated `GiftBoxBuilderPage` and admin editing come in later separately reviewed phases. Laser Engraving remains on `ServiceRequestPage`; product customization and shared templates/components stay intact. V2 request validation and immutable snapshots must use an explicit discriminator, with legacy recovery/history preserved.

Current request conversion claims `ComponentOption` inventory. New builder IDs cannot enter that path. V2 conversion must be explicitly denied until a reviewed inventory mapping and separately authorized conversion implementation exist, even if global checkout becomes enabled later. Existing checkout/intake flags, payments, order ledger, R2 and production configuration stay unchanged.

## Phase 1 source file manifest

Created:

- `shared/gift-box/definitions.mjs`
- `shared/gift-box/asset-manifest.v2.json`
- `shared/gift-box/geometry.mjs`
- `server/scripts/audit-gift-box-assets.js`
- `server/scripts/prepare-gift-box-assets.js`
- `server/scripts/lib/gift-box-assets.js`
- `server/scripts/lib/prepare-gift-box-assets.js`
- `server/test/gift-box-foundation.test.js`
- `server/test/gift-box-assets.test.js`
- `docs/GIFT_BOX_BUILDER_V2.md`

Modified: `.gitignore`, `server/package.json` (offline tooling/test commands only). No dependency/lockfile changes. Ignored derivatives and isolated verification artifacts are not source changes.

## Verification record

| Executed check | Result |
| --- | --- |
| `server/npm.cmd run test:giftbox` | 24 passed, zero failed/skipped; final run includes all foundation changes |
| `server/npm.cmd run giftbox:assets:audit` | 79 valid source files, 32 components, 35 alpha images, no byte/pixel duplicates; exact original inventory checksum |
| `server/npm.cmd run giftbox:assets:audit -- --require-production-ready` | Intentional exit 1: sources validate, production approval remains false and the explicit box-1 issue remains open |
| `server/npm.cmd run giftbox:assets:prepare` | 95 local derivatives from 63 eligible sources; 6,861,312 derivative bytes; 8,948,946 original bytes for those sources; original collection unchanged |
| `server/npm.cmd test -- test/service-requests.test.js test/owner-workflow.test.js test/product-personalization.test.js` | 32 passed, zero failed/skipped; fresh disposable local databases, no merchant credentials/providers |
| `client/npm.cmd test -- e2e/owner-workflow.spec.js e2e/service-requests.spec.js e2e/product-personalization.spec.js --grep-invert 'gift requests work\|admin saves quotation\|mobile keyboard dialog' --output=test-results-gift-box-phase1-20261028/browser-regression --global-timeout=120000` | 22 passed; installed Edge and isolated API fixtures; legacy services, personalization, retries, owner isolation and intake closure |
| `client/npm.cmd run lint` | Passed |
| `server/npm.cmd run check` | Syntax checks passed for 187 JavaScript files |
| `node --check` for both new shared `.mjs` modules | Passed |
| Isolated Vite production build plus `writeSeoOutput` | Passed; 1,789 modules, 22 noindex development routes, zero indexable routes, checkout offers disabled; no database/network export |
| Git whitespace and output exclusions | Passed; original `local-data` and generated derivatives remain ignored |

The first browser run covered five owner-workflow cases and is included in the later 22-case matrix, not counted again. Three existing screenshot-writing cases were deliberately excluded because they write hardcoded paths under existing `client/test-results`; no screenshot destinations or existing tests were edited. Browser output and build artifacts use the separate ignored `client/test-results-gift-box-phase1-20261028/` directory, preserving prior results and `client/dist`. The full frontend/backend suites and connected contract suite were not run; this is focused Phase 1 verification, not a production acceptance run.

Windows browser teardown left its own Vite listener running after the assertions completed. Stopping only the identified test Vite processes released teardown; both browser commands then exited 0, with five and 22 passing cases respectively. The test process inspection initially needed read-only Windows process permission. No application/test-server configuration was changed to work around this.

The first branch command was denied write access to Git metadata inside the sandbox; the authorized branch was created after tool permission was granted. A one-off manifest-generation command initially tried resolving Sharp from the repository root (which intentionally has no npm package); it made no file changes and was corrected to use the existing server-scoped image utility. No dependency installation was needed.

These results do not verify production MongoDB/R2/CDN, physical fit, real devices, or approval of prices, stock, ribbon colors, gift-card charges or new chocolate artwork. Phase 1 stops here for owner review.
