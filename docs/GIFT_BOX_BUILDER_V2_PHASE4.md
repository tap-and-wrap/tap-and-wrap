# Gift Box Builder V2 — Phase 4

Local implementation on `feature/gift-box-builder-v2`. Public V2 submission, checkout, order conversion, production media and authoritative geometry approval remain disabled. No merchant database initialization, production operation, source-image modification, commit, push, merge or deployment is part of this phase.

## Dynamic business configuration

The registry is now `gift-box-v2.3`: 12 boxes, 3 individual roses, 17 plush toys, 20 complete pictured chocolate retail units, 21 ribbons and one gift card (74 identities). Existing 52 IDs and numerical ordering are preserved. Ribbons and the card have no asset paths. The image collection remains pinned to asset catalog `gift-box-v2.2`, asset version `2026-10-28.2`; adding image-less definitions does not rewrite the existing 115 local media derivatives or their manifests.

`GiftBoxComponentSetting` retains immutable known `componentId`, strict fields, unique identity index, optimistic revision, approval metadata and creation/update audit actors/times. Editable business fields are `displayName`, `displayOrder`, `pricePiastres`, `enabled`, `available`, `inventoryMode`, `inventoryQuantity`. New server-owned `initialProvisioningVersion` and `initialProvisionedAt` identify explicit initial creation. There are no new indexes, automatic collection creation or startup seeds.

The dedicated APIs continue to require verified administrator sessions, CSRF, strict Origin and loaded `expectedRevision`. Immutable category, paths, hashes, geometry and ribbon color fields are rejected. No arbitrary component create/delete API exists. Updating an existing fixed identity's settings and reordering one complete category remain atomic with audit records. A conflict returns `409 EDIT_CONFLICT`; the editor preserves the draft until an explicit reload.

Physical inventory modes are `tracked` and `made_to_order`. Tracked stock is a nonnegative safe integer and must cover the entire selected quantity. A switch into tracked mode requires an explicit quantity plus `confirmInventoryQuantity: true`. Switching away preserves the stored quantity. Numeric edits in Made to Order are rejected. Missing mode or quantity never implies unlimited stock. `available` controls manual availability separately from `enabled` and approved pricing. Ribbons use server-controlled `status_only`, an availability toggle and null quantity; API attempts to supply a mode or numeric stock are rejected.

## Approved initial settings, explicit provisioning only

| Category | Initial saved name | Unit price (piastres) | Initial stock |
| --- | --- | ---: | ---: |
| Box 1–12 | Box N | 20,000 | 10 each, tracked |
| Plush 1–17 | Plush N | 50,000 | 10 each, tracked |
| Red / Yellow / Black Rose | Red Rose / Yellow Rose / Black Rose | 3,000 | 50 each, tracked |
| Chocolate 1–20 | Chocolate N | Null, unapproved | 10 each, tracked |
| Gift card (`gift-card-1`) | Gift Card | 5,000 | 10, tracked |
| Ribbon 1–21 | Names below | Null, unapproved | Status only; no number |

The initial plan explicitly enables these known identities and marks stock available, consistent with the supplied starting stock/color catalog. Unpriced chocolates/ribbons still fail priced eligibility. Box 1 remains artwork-blocked independently of any business setting.

`npm.cmd run giftbox:settings:plan` is an offline, no-connection dry run. The approved values exist only in `server/scripts/lib/gift-box-initial-settings.js`; runtime pricing/catalog/frontend code never imports them. Its authorization set is pinned to these 74 IDs, so future registry additions cannot inherit initial business approval.

The separately guarded apply tool requires `--apply --target local|staging --confirm-initial-settings-writes --admin-id <verified-admin-id>`, explicit terminal configuration and an already prepared dedicated transaction-capable database. It skips dotenv, rejects production, validates the URI and live target, verifies existing schema read-only, rechecks the current admin, and creates only missing settings in one audited transaction. It consumes virtual revision 0 on creation. A second run creates nothing and changes no timestamps, prices, quantities, revisions or audit records. Existing owner settings, including incomplete earlier settings, are skipped completely and require deliberate admin review; there is no automatic backfill.

**No apply command was run against a persistent database.** Executed provisioning tests use fresh disposable loopback replica sets only. Future persistent schema preparation and provisioning require separate explicit authorization.

## Fixed ribbon definitions

Colors are reasonable screen interpretations of owner names, not measured fabric matches. Names below are initial provisioning names; live labels always come from saved settings. All ribbon prices remain null until an owner saves an approved price.

| Order | Immutable ID | Initial name | Immutable CSS color |
| ---: | --- | --- | --- |
| 1 | `ribbon-cream-ivory` | Cream / Ivory | `#F3E8CC` |
| 2 | `ribbon-blush-pink` | Blush Pink | `#F4C6D0` |
| 3 | `ribbon-champagne` | Champagne | `#D8C49B` |
| 4 | `ribbon-white` | White | `#FFFFFF` |
| 5 | `ribbon-burgundy-dark-red` | Burgundy / Dark Red | `#752838` |
| 6 | `ribbon-dusty-pink` | Dusty Pink | `#B77B8C` |
| 7 | `ribbon-mint` | Mint | `#C3E9DF` |
| 8 | `ribbon-coral-soft-pink-red` | Coral / Soft Pink-Red | `#EE847D` |
| 9 | `ribbon-red` | Red | `#C92D39` |
| 10 | `ribbon-navy` | Navy | `#203356` |
| 11 | `ribbon-black` | Black | `#202024` |
| 12 | `ribbon-grey-blue` | Grey-Blue / Blue-Grey | `#7C96AC` |
| 13 | `ribbon-mint-green` | Mint Green | `#72BC99` |
| 14 | `ribbon-classic-green` | Classic Green | `#3D814F` |
| 15 | `ribbon-emerald` | Emerald | `#087C60` |
| 16 | `ribbon-baby-blue` | Baby Blue | `#B0D5F1` |
| 17 | `ribbon-silver` | Silver | `#BDC1C7` |
| 18 | `ribbon-gold` | Gold | `#C39936` |
| 19 | `ribbon-lavender` | Lavender | `#B5A0D4` |
| 20 | `ribbon-beige` | Beige | `#CBB799` |
| 21 | `ribbon-peach` | Peach | `#F3B58F` |

## Pricing and API contracts

Existing paths remain `/api/v1/gift-box/catalog`, `POST /gift-box/estimate`, and admin GET/PATCH `/admin/gift-box/components/:componentId`, GET `/admin/gift-box/components`, PATCH `/admin/gift-box/components/reorder`. Catalog paging remains bounded; the client loads this small fixed catalog once and slices options locally in groups of 12. No per-option pagination calls are added.

Admin patches additionally accept `available`, `inventoryMode`, `inventoryQuantity`, and conditional confirmation intent. Price editing uses exact decimal EGP drafts converted to integer piastres. Public catalog eligibility requires saved enabled, manually available, valid inventory and approved price. Missing settings are unnamed/unpriced/disabled with null inventory mode and quantity, never initialized by reads.

The estimate contract still contains exactly one box, distinct quantity lines, at most one ribbon, and optional `{ componentId: 'gift-card-1', message }`. Blank card messages are permitted when selected; well-formed Unicode text is limited to 500 code points on both sides, with normal line breaks/tabs and no other control characters. Messages are customer text, never HTML or artwork.

The server reads a coherent current settings snapshot and computes every line from saved approved prices. Paid positive and explicitly approved complimentary zero prices are supported; null, malformed or unapproved prices fail. Quantity and total processing bounds remain distinct from physical capacity. Safe integer multiplication/addition guards overflow. Each line captures name, unit, quantity, price, subtotal, approval mode, setting revision, inventory mode/quantity and availability; ribbons also capture immutable color. Delivery remains separately pending. Estimation never reserves or deducts stock. Every estimate reports physical-fit review required, no arrangement approval, and submission/conversion disabled.

## Geometry and physical-fit limitations

The Phase 3.5 photo study remains the visual foundation: heart interiors for boxes 1–4, heart wells in square cases for 5–6, round interiors for 7–10, two separate elevated circular compartments for box 11, and the basket interior for box 12. Thirteen proposed floor regions plus draft rim masks and beside-plush proposals remain unreviewed. The unchanged owner images and source bounds are revalidated by the asset and geometry tests. No draft region, apparent visual fit or price estimate establishes centimeters, packing capacity, support, usable depth or a guaranteed physical fit.

Authoritative regions, capacities, physical dimensions and item scales remain unapproved. Public acceptance is blocked; request snapshots must explicitly identify the need for owner physical-fit review. Measurements and owner review of interiors, rim/lid clearance, box-11 elevations, plush orientation and complete retail chocolate dimensions remain prerequisites.

## Guarded request contract and owner presentation

The fixed contract is `kind: 'gift-box-v2'`, `contractVersion: 'gift-box-request-v2.1'`. It requires an opaque request UUID, current catalog/asset/authoritative geometry versions, a bounded draft-version trace label, contact name/normalized phone/optional email, the strict server-priced selection, and individual placement UUIDs. Each selected rose, plush or chocolate unit must have exactly one placement. Duplicate instance IDs, missing/mismatched quantities, unknown components, client prices, totals, unbounded coordinates and non-plush beside placement are rejected.

Placement coordinates are `[0,1]` against the explicitly versioned illustrative scene `{ x: -0.05, y: -0.03, width: 1.5, height: 1.12 }`, allowing the beside-plush proposal without claiming a physical dimension. The contract captures region labels, inside/beside zone and layer. Draft version and region IDs are explicitly **unverified customer trace labels**, never authoritative geometry or confirmed fit. Snapshot metadata includes `physicalFitReviewRequired: true`, `draftVersionVerified: false`, `regionIdsVerified: false`, `placementTraceStatus: 'unverified-customer-proposal'`, and closed arrangement/submission/conversion gates.

Pure preparation recomputes the estimate from an explicit saved-settings snapshot, normalizes contact and selection order, hashes the immutable normalized request, and freezes the prepared snapshot. The additive `ServiceRequest.giftBoxV2Snapshot` is immutable and separate from legacy component charges. It preserves configuration, quantity, unit/name/price/revision/inventory/color snapshots without changing historical requests or their existing statuses.

`POST /api/v1/gift-box/requests` is an intentionally closed foundation endpoint: after existing rate-limit, CSRF and Origin middleware it always returns `503 GIFT_BOX_V2_SUBMISSION_DISABLED`. Neither feature flags nor client data can open it. Authoritative geometry also independently blocks production acceptance. There is no customer submission button, cart attachment or V2 order conversion.

The persistence contract is exercised through `persistGiftBoxV2RequestForDisposableTest`, which has no HTTP/runtime caller and refuses anything except the fresh test helper's exact loopback `tap_wrap_catalog_test` replica set, test process/environment and empty merchant database URIs. It reads current settings again in a snapshot transaction, validates inventory/prices, creates a ServiceRequest and preserves owner + request-key + immutable-hash recovery under the existing unique index. Identical retries recover the original snapshot even after business edits; different payloads with the same owned key conflict; other owners and rotated guests cannot recover it. Requests never reserve/deduct stock or enqueue an automatic order.

Legacy `prepare`, `share`, `accept`, and `convert` actions reject every non-null V2 snapshot, including malformed scalar values. V2 request components are not copied into legacy charge rows, preventing the component subtotal from being added again as custom-work/base charges. Legacy null/absent snapshots retain their existing behavior. A dedicated future quotation contract must be approved before V2 financial actions can open.

The owner view displays saved quantities/units, itemized unit/subtotal prices, inventory mode/availability at request time, ribbon swatch/color, selected gift card and literal message, UUID positions/region traces and versions. Current availability and fit still need review. Matching local DEV artwork can provide a read-only illustration; historical/unavailable media and production rendering have an honest unavailable message, with no guessed media URLs. Mobile tables use the existing inner admin scroll pattern with readable columns, accessible region names, keyboard scrolling and visible focus. Unknown or malformed snapshot data produces a truthy review-only DTO and specialist-review panel while financial actions remain closed. Existing review/cancel/decline and audit histories remain available.

## Box-1 correction candidate

The separate candidate is documented in [the candidate report](GIFT_BOX_BUILDER_V2_BOX1_CANDIDATE.md). Its output is `server/.cache/gift-box-phase4/box-1-candidate/alpha-rgb-candidate-v1/box-1-open-top-alpha-rgb-candidate-v1.png`: 1453 × 1083 PNG, 809,452 bytes.

Exactly **96,750 fully transparent pixels** had hidden RGB cleared (185,733 RGB channel changes). There are **zero alpha changes**, **zero visible/partial RGBA changes**, and all 9,643 partially transparent pixels are preserved. Right-strip hidden RGB decreases from 44,049 pixels to zero. Lossless round-trip pixels equal the corrected buffer exactly; light/dark/checkerboard composites are pairwise identical before and after. The unchanged source SHA is `8d0944c0d98ffa3e685c56863316c3163398d88e06c1cc572d5ec7d81544b55d`; candidate SHA is `0a0477ba1be45bb1a4253f23c5709cc60b5ddd9f74be1a26c2bac0ddebd364e6`.

The comparison JSON, six full-resolution previews and labeled contact sheet are in the same ignored directory. Candidate generation was repeated successfully with byte-identical reuse. The original file, authoritative manifest, box-1 identity and blocking issue are unchanged. **Candidate owner approval remains pending.**

## Exact Phase 4 files

Created (20):

- `shared/gift-box/request-contract.mjs`
- `server/src/gift-box/inventory.js`
- `server/src/gift-box/request-contract.js`
- `server/src/gift-box/request-gates.js`
- `server/src/gift-box/request-preparation.js`
- `server/src/gift-box/request-presentation.js`
- `server/src/gift-box/request-persistence.js`
- `server/scripts/lib/gift-box-initial-settings.js`
- `server/scripts/provision-gift-box-settings.js`
- `server/scripts/lib/box-1-candidate.js`
- `server/scripts/prepare-box-1-candidate.js`
- `server/test/gift-box-inventory.test.js`
- `server/test/gift-box-requests.test.js`
- `server/test/gift-box-box1-candidate.test.js`
- `client/src/admin/GiftBoxV2RequestDetails.jsx`
- `client/e2e/gift-box-phase4.spec.js`
- `client/e2e/gift-box-request-details.spec.js`
- `client/playwright.gift-box-phase4.config.js`
- `docs/GIFT_BOX_BUILDER_V2_PHASE4.md`
- `docs/GIFT_BOX_BUILDER_V2_BOX1_CANDIDATE.md`

Modified from the preserved Phase 3.5 working tree (28):

- `shared/gift-box/definitions.mjs`
- `server/src/models/GiftBoxComponentSetting.js`
- `server/src/models/ServiceRequest.js`
- `server/src/gift-box/catalog.js`
- `server/src/gift-box/pricing.js`
- `server/src/gift-box/validation.js`
- `server/src/gift-box/routes.js`
- `server/src/commerce/service-requests.js`
- `server/src/commerce/service-request.routes.js`
- `server/scripts/lib/gift-box-assets.js`
- `server/scripts/lib/prepare-gift-box-assets.js`
- `server/test/gift-box-foundation.test.js`
- `server/test/gift-box-assets.test.js`
- `server/test/gift-box-pricing.test.js`
- `server/test/gift-box-api.test.js`
- `server/test/gift-box-interaction.test.js`
- `server/package.json`
- `client/src/pages/AdminGiftBoxComponentsPage.jsx`
- `client/src/pages/GiftBoxBuilderPage.jsx`
- `client/src/pages/AdminRequestsPage.jsx`
- `client/src/gift-box/Options.jsx`
- `client/src/gift-box/state.mjs`
- `client/src/gift-box/gift-box.css`
- `client/src/commerce/service-requests.css`
- `client/e2e/gift-box-fixtures.js`
- `client/e2e/gift-box-v2.spec.js`
- `client/e2e/gift-box-phase35.spec.js`
- `client/playwright.config.js`

Earlier phase changes to App, AdminLayout, Vite, schema/config/app registration, ignored assets and other uncommitted local files were preserved. No source image, authoritative geometry, source asset manifest, dependency lockfile or `.env` was changed by Phase 4. Local review/build/log files are ignored artifacts, not deployable merchant data.

## Verification results and review evidence

The final backend run passes **634 tests**, zero failures/skips, including approved initialization values, create-only/idempotent provisioning, all inventory modes, price/stock edits, revisions/races, audit rollback, pricing tampering/overflow/zero approval, Unicode text, owner/key isolation/recovery, closed submission/geometry/conversion, malformed snapshots, legacy requests, engraving, customization and checkout.

Builder browser coverage passes **39 distinct cases across the initial and focused corrected runs** (16 V2, 12 Phase 3.5, 11 Phase 4). All 13 affected admin/responsive cases pass after correcting a real controlled-price draft validation issue and an ambiguous test selector. Coverage includes 12-option/Load More persistence, 21 colored ribbons, stock limits, paid/blank/Unicode cards, Back/Next, item state and movement, touch, keyboard, undo/removal, reduced motion, text enlargement and 320/390/tablet/desktop layouts.

The full legacy/default browser run exercised 367 cases: **365 legacy cases passed**, one new owner case passed, and one new owner case initially failed because its pricing-cell locator also matched a placement-table cell. The corrected owner suite passes **3/3**, including both original cases and the new malformed-data fallback; the final visual-review rerun also checks readable inner table scrolling and keyboard focus at 320px. No existing test was removed or bypassed. Existing engraving/request/cart/checkout/account/authorization/SEO browser behavior passed.

Client ESLint passes. Server syntax checks pass for **211 JavaScript files**. The isolated production build and offline SEO generation pass with **1,806 modules**, **22 noindex routes**, zero indexable routes and checkout offers disabled. Build output stays under ignored Phase 4 results; earlier local build output is preserved. No dependency or heavyweight renderer was added. Quantities/finishing choices affect the estimate key; dragging still does not request prices. Asset loading remains visible-thumbnail/selected-placement only.

Final read-only source validation passes: **99 files**, **13,740,658 bytes**, **55 alpha images**, **zero byte or decoded-pixel duplicates**, **74 fixed identities**. Source inventory SHA remains `ffa5e6e01ac8eeb4c3bfe5c2f18dbfd756c5479526a62efd50e85edaf8111dc5`. Geometry stays unreviewed and production readiness stays false.

Evidence locations:

- Backend acceptance: `server/.cache/phase4-full-backend-acceptance.log`; focused inventory, request, asset and syntax logs are beside it.
- Offline initial plan: `server/.cache/phase4-initial-settings-plan.json`.
- Builder screenshots: `client/test-results-gift-box-phase4-final/` (320, 390, 768, 1440 finishing controls and restricted stock editor; synthetic fixture names/prices only).
- Owner screenshots: `client/test-results-gift-box-phase4-owner-review/` (readable inner tables; normalized top-of-page captures). The three-case functional acceptance is preserved in `client/test-results-gift-box-phase4-owner-readable/`.
- Full browser logs/traces, lint, isolated production build and SEO report: `client/test-results-gift-box-phase4-verification/`.
- Box-1 candidate/comparison: `server/.cache/gift-box-phase4/box-1-candidate/alpha-rgb-candidate-v1/`.

The full browser suite used the same scrubbed environment and Playwright configuration with a separate ignored working/output directory, preserving hardcoded legacy screenshot paths. Windows' npm/Vite teardown waited after all assertions; only the verified test-created Node listener on 5191 was stopped to finalize each result. A process-detail query was unavailable under the local sandbox; PID, process name, listener and matching test-start times verified ownership. No unrelated server was stopped. One initial build command reported PowerShell's stderr warning as an error despite a completed Vite build; subsequent captured exit-status builds verify both Vite and SEO exit code 0. These are local tool/runtime details, not production verification.

## Remaining owner information and next phase

1. Supply approved chocolate and ribbon prices through saved restricted settings; null remains unavailable. Chocolate selections remain one complete pictured retail unit. Generic Chocolate N names are approved initial names; owner refinements remain editable.
2. Review the box-1 correction candidate before any new authoritative asset reference or derivative version is adopted.
3. Review photo-based regions, rim/lid layering, oversized-plush beside arrangements and physical fit. No dimensions or capacities have been invented; production acceptance remains blocked.
4. Separately authorize any persistent schema/settings provisioning and controlled media/R2 integration. Existing earlier settings are intentionally not overwritten by the initial plan.
5. Recommended next phase: owner review of configuration and corrected artwork, followed by a separately approved local V2 quotation/physical-fit decision workflow and end-to-end submission recovery tests. Review a dedicated price-once quotation contract and current-stock revalidation before considering public request activation. Checkout, stock reservation/deduction, order conversion and deployment require their own later authorization.

Stop after Phase 4 for review. Nothing is committed, pushed, merged, deployed, uploaded to R2, initialized in a merchant database or activated for public V2 submission/checkout/conversion.
