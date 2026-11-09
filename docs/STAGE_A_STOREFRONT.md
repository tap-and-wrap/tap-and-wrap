# Stage A storefront foundation

Owner authorization: 9 November 2026, based on main `609f502b90ef0787991688982ba4774c3971bcfc`.

The existing source-managed testimonial collection is the single public source for 64 general reviews. Every ID, customer name, recommended language and five-star rating is checked against the private owner source pack when available. There are 35 Egyptian Arabic and 29 English testimonials. Arabic copy follows the visible originals, including preview reactions without invented delivery claims. The homepage derives 12 records, six per language; `/reviews` and its static SEO first paint use all 64. No product associations, private screenshot filenames or audit notes are shipped. The existing database review model and admin/product approval workflow remain unchanged; production inspection found no saved database reviews to duplicate.

The mobile drawer header gains only a 1px brand border. The hero uses 65svh desktop and 59svh mobile, with content-safe minimum heights and a measured-header upper bound on desktop. Existing approved videos/posters remain configured. A native picture configuration supports real approved local desktop/mobile images at 2520x1080 and 1200x1500 with eager, high-priority loading. No nonexistent image URL is configured. Category imagery retains its existing admin source and 4:3 framing. Gift Box, component prices and checkout configuration are unchanged.

## Exact product removal procedure

Scope: only `B6-BOX-050`, Love Wooden Photo Snack Cabinet Box, production document `6ac82ea10a110c7f998e27e8`. The exact `taw-production` cluster and `tapandwrap_production` database were inspected through the connected Atlas integration. Canonical address: `/products/love-wooden-photo-snack-cabinet-box`; legacy address ends in `-b6-box-050`. The public API confirms that identity and main image, and the actual image was downloaded and visually inspected.

Before removal, preserve the exact Extended JSON product and both address documents in ignored `local-data/stage-a-product-removal/atlas-inspection.json`, plus the matching public image. Check orders, carts, checkout quotes, bundles, discounts, reviews, uploads, service requests, notification events and admin references. The record has no approved price, no orderable stock, no featured selection and cannot acquire a new online order. If historical references exist or reference checks fail, use the existing revision-guarded withdrawal operation and report the permanent-deletion blocker.

When all checks pass, delete one document using the conjunction of its object ID, immutable source ID, exact name and inspected revision. Require `deletedCount === 1`, record the result privately, and read back absence. Keep both immutable URL reservations as tombstones; never reassign or delete them. Keep all category records, media objects and history. Verify the other product count/revision/price totals, public search/category/featured lists, both URL authority responses and the fresh SEO export. Publish through the existing tokenless renewal workflow only after that export excludes the removed product. No import, category cleanup or shared-media deletion is involved.

Recovery: Extended JSON preserves ObjectIds and dates. An authorized recovery can restore only the backed-up exact product record after checking ID/source/slug conflicts; retained address reservations continue to point to its original ID. No automatic restoration is performed.

## Verification

Focused browser checks cover 390px/1440px reviews and hero, responsive picture selection, the existing menu choreography/keyboard lifecycle, ribbon opening, category media and homepage selections. SEO tests check the 64-record static first paint, source identity parity, private-field omission and default noindex behavior. The disposable backend deletion regression retains aliases, returns 404 for both addresses and removes only the target from catalog/SEO. Existing visibility and public-renewal tests also run. Artifacts remain under ignored test-results; actual release outcomes are recorded separately after deployment.
