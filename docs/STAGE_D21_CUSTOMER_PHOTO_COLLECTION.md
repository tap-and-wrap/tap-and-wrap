# Stage D2.1: optional customer photo collections

Base: `6dc0f014fa47e4651488774101777ed4922a2db4`.
This supersedes D2's physical-space configuration for new customer photo purchases.

## Simple capability and customer experience

Product.personalization.acceptCustomerPhotos is the sole product-specific
capability. Product management shows Accept customer photos and no slot/count,
position, label or placement editor. Saving this capability once is sufficient;
a valid price, genuine stock/made-to-order readiness and valid purchasing setup
continue to control public availability. Unpriced products remain WhatsApp-only.
No global switch, environment variable, surcharge or checkout authorization changes.

The optional Add my personal photos checkbox starts unchecked. Selecting it opens
one WAM-style native multi-image picker. Subsequent selections append. A compact
ordered gallery has Remove and keyboard-accessible earlier/later controls. It uses
two columns at 320px and three at 390/768/1440. Stable object URLs retain focus on
reorder, and URLs are revoked on removal/unmount. Original image bytes and colors
are preserved. No canvas, dimensions or physical placement fields are displayed.

The collection requires one to ten images only when selected. Other required image
fields consume the same ten-image allowance. Existing mandatory fields retain their
own validation and behavior. Switching off excludes the collection and releases
unused temporary uploads; existing cart-bound originals detach only after an
accepted replacement. New files remain memory-only until Add to Cart.

## Versioning and private files

New selections use strict product-photos-v2. The ordinary product personalization
map contains one ordered customer_photos array, whose IDs bind to existing private
upload purpose=personalization, exact product, field role and verified owner.
There are no individual positions. MIME/complete-image/size/quota/expiry checks and
the existing upload-retention transaction remain in force. Customer/order summaries
include collectionKey while file IDs remain in the private personalization data.

customerPhotosVersion is server-managed and monotonic across capability toggles;
clients cannot forge it or revive stale photo quotes. Cart identity, immutable
operation receipts, uncertain-request recovery, owner-bound edit fingerprints,
replacement and quantity/variant pricing reuse D2's ordinary product integration.
Accepted snapshots retain their exact ordered references and price. Explicit owner
View/download continues through the existing audited order-file endpoint.

## Legacy v1 handling

Existing photoSpaces/photoSpacesVersion data is retained. A read-only production
query found zero products with v1 configurations at implementation time. No
production product configuration or order was modified.

Legacy v1 carts keep their original field roles and exact v1 validation. They are
not automatically converted into v2. The new cart editor presents retained v1
photos as a read-only collection, with an explanatory message; customers can keep
it or explicitly order as is. A new item is required for the current collection
model. Historical v1 snapshots continue to display their original labels and permit
authorized original retrieval. Explicitly turning the new capability off rejects
new legacy photo uploads/purchases too, without deleting archival configuration or
retained order files. The owner sees a notice when archival v1 setup exists.

## Verification and release

Focused tests cover as-is, one/multiple photos, append/remove/reorder, native picker,
responsive grid, owner/expiry/role checks, ten-image sharing, private original bytes,
cart edit/retry, immutable snapshots, capability removal and legacy compatibility.
The affected backend regression passed 96 tests. Four connected collection scenarios,
four connected D1 scenarios, historical personalization/editor and SEO checks are
recorded in the release report, along with lint/build/syntax and screenshots.
Screenshots live under ignored client/test-results-contracts at all four widths.

Only intended D2.1 changes are committed. Production product prices, stock, orders,
reviews, homepage media, engraving surcharge and separate Gift Box Builder remain
unchanged. Release uses the existing tokenless Production SEO renewal workflow.
If supported dispatch is unavailable, manually select GitHub Actions > Production
SEO renewal > Run workflow > main; backend deployment alone is not frontend release.
