# Owner handoff release 2

Release baseline: `36d768132e10f12654e245c899a7d2efac67984f`. The owner's Release 2 brief authorizes implementation, controlled production verification, legitimate catalog publication and safe SEO activation. Older phase restrictions on those specific actions are superseded by that brief. Payment policy, stock correctness and private ownership protections remain mandatory.

## Checkpoint A: locally verified

The old chooser cleared native inputs before asynchronously copying file bytes and manipulated browser history around the picker. Several engraving/Gift Box surfaces bypassed it entirely. A JavaScript reference to a picker-backed File does not guarantee that an Android content-provider handle survives input reset/unmount.

`selected-images.mjs` now copies and verifies bytes before releasing the mounted input. Reads have cancellation/deadline handling and a FileReader fallback; signatures, field MIME/size/count/budget limits and browser image decoding are checked. JPEG, PNG and WebP are supported; HEIC/HEIF receives actionable guidance rather than a false conversion promise. Temporary decode URLs are revoked. Session-generation changes discard late results. Failed/cancelled preparation leaves the previous draft intact. Selection alone does not upload private customer files.

All active image inputs use ImageSourceChooser: Gift Box photos (including per-photo replacement and legacy personal touches), engraving item/close-up/artwork/handwriting replacement, configured product/service image fields, order-bound InstaPay proofs, and admin product/category/media galleries. Public admin uploads and private customer upload completion retain their separate existing API contracts. The chooser offers Gallery, Camera and Files without claiming OS permission control. Native picker cancellation cannot close its enclosing form.

Read-only cross-project inspection confirmed the same input-retention lesson in Darb's `client/src/utils/selectedImageFile.js` (`snapshotSelectedImageBeforeReset`, ArrayBuffer/FileReader fallback) and Wish and Mesh's `client/src/lib/uploadPickerLifecycle.js` plus its asynchronous handle-invalidation regression. No files in those projects were modified. Their persistent upload/recovery mechanisms were not transplanted into Tap & Wrap's memory-only customer-file contract.

Navigation adapts the official [React Bits StaggeredMenu](https://reactbits.dev/components/staggered-menu) choreography: three left-entering layers, coordinated panel, rising numbered links, rotating plus/X, rolling Menu/Close, original logo and approved existing social URLs. Web Animations supplies the motion without a new dependency. Native modal isolation, focus containment, explicit opener restoration, Escape, backdrop, route closing, short-height scrolling and live reduced-motion changes remain tested. Public/customer destinations and exactly eight admin primary destinations are preserved. The original desktop center navigation stays visible.

Upstream source reviewed: DavidHDev/react-bits `src/content/Components/StaggeredMenu/StaggeredMenu.jsx` and `.css`, and `LICENSE.md`, retrieved during this release. The license is MIT with the Commons Clause restriction, not unqualified MIT. Full notice is included at `client/public/licenses/react-bits.txt`; embedded website use is retained, component resale is not granted. The Worker explicitly serves that notice while unknown license paths remain 404.

Verification evidence is ignored under `local-data/handoff-r2/`:

- 22 image-preparation unit cases; 34 focused backend storage/private-upload/catalog-media cases.
- Browser suite: 43 cases initially passed; final affected navigation/gallery suite 18 passed and storefront/checkout suite 28 passed. Overlapping reruns are not additional distinct cases.
- Gift Box calibration/handoff/picker selection: 37 passed, including all six replacement viewports.
- Connected disposable API: engraving studio 1 passed; checkout/payment-proof/customization 3 passed. No real production order or payment was created.
- SEO/Worker regression 68 passed; ESLint and production build passed.
- Visually inspected chooser, Gift Box replacement, engraving personal/icon/handwriting/cart, proof, admin gallery and public/admin menu screenshots at 320, 390, 440, 768, 1024 and 1440px. Reviewed entrance frames at 90/180/360/650/1200/1900ms against the actual official demo.

Physical Android Chrome/iOS Safari devices were unavailable. Responsive Edge, touch emulation and injected native-file failures do not prove physical OS-picker behavior. Device smoke remains a stated limitation.

Checkpoint A does not change production data, upload existing customer files, alter payment gates or activate indexing. Catalog/SEO implementation and production release verification follow this checkpoint and must be recorded below before claiming Release 2 completion.

## Checkpoint B: business policy and publication

The root cause was a single legacy readiness gate combining import status, price approval, stock approval, review warnings and public display. The production catalog contained 1,257 Draft and 338 Hold products, all with public visibility, no price, and provisional tracked quantity ten with inventory approval false. Hold warnings were importer confidence/grouping/customization notes; merchant hold notes were empty. Missing-price records were being treated as unfinished instead of legitimate enquiry products.

`shared/product-business-state.mjs` now separates public visibility, positive price, genuine inventory and configured purchase options. Public presentation, cart pricing, owner editing and SEO consume this policy; bounded database predicates select equivalent candidates without fetching the catalog into React. Published unpriced products have Price on Request/WhatsApp. Positive saved price plus real confirmed stock enables normal purchase with no second price/readiness approval. Confirmed zero stock is Out of Stock; unconfirmed stock remains unavailable for online purchase. Explicit approved made-to-order rules remain distinct. Hidden/withdrawn records remain hidden. Removing price restores WhatsApp.

The owner form edits price and real stock together. Imported unapproved quantity is shown as unconfirmed and is not prefilled as a merchant count. Saving unrelated fields never approves placeholder stock. Historical import status, source identities, review reasons and grouping notes remain preserved for audit and ordinary options configuration; they are not publication bureaucracy. Invalid required personalization/options still prevent unsafe purchases. Existing revisions, 409 drafts, transactions, inventory deductions, cart identity and payment policy remain in place.

The reviewed production publication plan contains 1,595 legitimate products and zero exclusions. Every original main image was read and verified against actual public R2 objects (1,595 objects, 109,288,606 bytes in the initial verification). No images were overwritten or uploaded. A fresh pre-apply read of every product matched its reviewed before-image. Planned database changes are only `published: true`, public visibility compatibility and a revision increment. No price, quantity, inventory approval, product identity, category, URL, media, historical status or order changes are authorized by that plan. Application and final before/after verification must be recorded before calling it complete.

## Development control disposition

| Control | Disposition | Reason |
| --- | --- | --- |
| `CATALOG_BROWSE_PREVIEW_ENABLED` | Remove runtime path and example | Public information is ordinary production catalog behavior. |
| Public Draft/Hold and price-approval readiness gate | Replace with shared business state | Historical import bookkeeping cannot hide legitimate enquiry products. |
| `VITE_CHECKOUT_ENABLED` unused example | Remove example | Actual server checkout authorization remains authoritative; existing provider variable can remain unused. |
| `STAGING_PREVIEW_ENABLED` | Keep | Authenticated staging-only preview, no-store/noindex and no ordering. |
| `CHECKOUT_ENABLED` + `COMMERCE_LAUNCH_AUTHORIZED` | Keep unchanged | Genuine global financial kill switch; routine product saves need no flag changes. |
| Engraving configuration/intake/launch authorization | Keep unchanged | Service authorization and inspection-aware financial workflow. |
| Gift Box backend/direct-commerce/personalization/made-to-order controls | Keep unchanged | Active service capabilities and explicit personalized checkout rules. |
| Custom-request intake authorization | Keep unchanged | Real supported request workflow, not a catalog visibility gate. |
| Catalog media upload enablement | Keep unchanged | Authorized public media management/storage control. |
| Product alias compatibility | Keep unchanged | Reserved historic URL safety. |
| SEO build/runtime enablement + exact publication ID | Keep | Explicit reviewed publication activation and fail-closed deployment matching. |
| SEO finite expiry, media validity and live routing fingerprints | Keep | Prevent stale/unapproved indexing after edits/withdrawal. |
| Consent, tracking, mail delivery, storage and financial safeguards | Keep unchanged | Real privacy/provider/operational controls. |

## SEO

Unpriced public products export as truthful product-information pages without fabricated Offers, stock, brand, ratings or reviews. Confirmed priced zero stock has truthful OutOfStock; unknown inventory supplies no unsupported Offer. Variant offers require confirmed variant stock. Public aliases resolve to reserved canonical addresses. Live product/category fingerprints, emergency withdrawals, protected/private route headers and the Release 1 Cloudflare redirect compatibility fix remain enforced. Child sitemaps now bound distinct product validation dependencies to twenty, preventing large category groups from overwhelming the Worker's deadline.

The bounded public SEO publication endpoint returns only allowlisted public DTOs and opaque current routing attestations. The read-only renewal pipeline needs no database credentials. It verifies actual media and rejects catalog/checkout drift. An offline review of the real catalog generated 1,595 product pages, 205 nonempty category pages and five static routes (1,805 indexable routes); four empty category pages and six unapproved legal/information pages remain noindex. This review is not a deployed publication and cannot substitute for a fresh post-release export.

Automatic renewal now uses the existing Cloudflare Git integration and a dedicated publication branch; see [the tokenless renewal contract and recovery runbook](SEO_TOKENLESS_RENEWAL.md). No new Cloudflare API token is required or requested. Actual workflow execution, branch switch and live deployment verification remain release acceptance steps.

The Google Search Console owner should verify the domain and submit `https://tapandwrap.net/sitemap.xml` once live crawl checks pass. Crawl permission does not establish Google indexing. Legal/policy content still needs genuine owner review; this release does not fabricate that approval.

The API remains on Render Free, so idle cold starts are a production availability limitation. Renewal has bounded public readiness retries, but live Worker authority deadlines are not weakened to mask a sleeping API. Always-on compute is an owner operational decision with a hosting cost; no plan upgrade or billing change was performed.

## Additional verification in progress

The new catalog business-state visual suite passed seven cases covering 320, 390, 440, 768, 1024 and 1440px, including an owner price/stock save and price removal without a second approval. All 42 resulting shop/detail/admin screenshots were visually inspected. No clipping or overlapping purchase controls was observed. The final complete backend/browser/connected runs and production results must be appended after completion, including any failed cases and their resolutions.

Final local release gate:

- Backend: 1,000 tests passed, zero failures in the serial full run. A prior concurrent run had one existing 100ms cleanup-budget timing failure; the serial full run resolved it without changing production cleanup logic.
- Storefront: 439 cases exercised; 438 passed initially and one navigation load timed out under concurrent load. The complete affected account/catalog selection then passed 23 cases, including the timed-out case and the final advanced-filter correction. Overlapping cases are not additional independent tests.
- Gift Box: all 123 cases passed.
- Connected disposable API suites: all twelve file batches exercised. Old cart selectors and obsolete publication/sold-out expectations were corrected; the four unaffected engraving cases passed, its remaining builder case passed after correction, and all five operations cases passed. The mixed Product + Gift Box fixture was additionally run with shopping explicitly enabled: one case passed, real quote HTTP 200, no order created, unchanged component inventory. The default batch's intentional skipped shopping case is not counted as a pass.
- SEO/Worker/renewal: 74 tests passed. Workflow YAML and fourteen release-script syntax checks passed; server syntax check covered 293 JavaScript files. ESLint, production Vite/SEO build and Wrangler Worker dry run passed. Wrangler initially failed sandbox ancestor/log permissions; the authorized non-deploying run outside the sandbox compiled successfully.
- Reviewed all six connected mixed-cart screenshots and 23 connected engraving/cart/checkout screenshots, in addition to Checkpoint A and the 42 business-state screenshots. The mixed-cart test deliberately blocks its external ordinary-product image host; that isolated broken fixture image is not evidence about production R2 delivery. Real catalog media availability is verified separately.
- All 205 baseline unrelated untracked files matched their original hashes before release staging.

Production publication, GitHub-token renewal execution, native Cloudflare branch/settings activation and read-only live verification are still required. The local gate alone is not a deployment claim.
