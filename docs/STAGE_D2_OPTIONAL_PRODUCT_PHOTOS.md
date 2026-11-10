# Stage D2: optional ready-made product photos

Historical implementation report. New customer photo configuration is superseded by
[Stage D2.1 collections](STAGE_D21_CUSTOMER_PHOTO_COLLECTION.md); individual physical
photo spaces are no longer configured for new purchases.

Base main: `187ce21a8dcf4e1c1142f359dd020ef1bb1f6e4c`.

## Configuration and purchasing

Personal Photo Spaces extends the existing Product.personalization object. Each
space has an internal immutable key, owner label and optional placement/order
instructions. Adding/removing spaces defines the accepted count without another
activation checkbox. The limit remains ten total uploaded images per item,
including historical required fields. The server maintains a monotonic
photoSpacesVersion; remove/re-add cannot resurrect an obsolete setup. No schema
migration, backfill, runtime flag or production configuration write is needed.

Existing requiredBeforePurchase fields keep their historical semantics. Optional
spaces are independent of that legacy requirement checkbox. Unrelated editor
saves omit personalization, and loaded revision conflicts retain owner drafts.

The central productBusinessState remains authoritative. A positive product price,
public visibility, valid purchasing setup and genuinely confirmed tracked stock
or available made-to-order setup govern ordering. ProductPage now uses the shared
positive-price predicate instead of an additional obsolete priceApproved gate.
Owner price saves already derive approval bookkeeping on the server. No price,
stock, launch authorization or environment setting was changed in production.
No-price products remain WhatsApp-only and expose no photo upload interface.
Price removal/re-entry updates API decisions and public actions without deployment.
SEO snapshots continue to fail closed and renew through the existing workflow.

## Customer flow and ordinary product contracts

Eligible pages default to Order as is. Add my personal photos reveals one native
picker per configured space, immediate local thumbnails, replacement/removal and
adjacent Swap actions. There is no layout editor or photo surcharge. Both modes
use the ordinary product/variant price and existing inventory rules. Separate D1
engraving remains available from Order as is; the optional-photo action does not
silently pass or discard photos into that independent engraving builder.

The strict product-photos-v1 selection contains mode and configurationVersion.
Photos stay in the existing personalization map under their slot keys, with one
private upload ID per slot. Product lines remain kind=product. Distinct photo sets
and as-is lines have distinct identities. Cart replacements require a loaded
owner-bound line fingerprint and preserve the line ID. Historical ordinary lines
can acquire optional photos when the owner later configures real spaces.

Immutable add-operation receipts recover uncertain requests before and after order
acceptance. An unconfirmed operation never automatically starts a new request.
Only opaque owner-scoped recovery keys enter sessionStorage. Files, text, private
URLs and upload IDs stay out of browser persistence. Ownership changes abort reads
and unmount private state. Verified completed files are reused during retries.

Switching to as-is removes slot values and releases unused verified temporary
uploads. Existing cart attachments are detached transactionally only when their
replacement is accepted. Expired images show explicit replacement guidance.
Removed/changed configurations invalidate old photo carts; customers can review the
new spaces or replace the line with as-is. Accepted orders retain exact original
slot labels, order/instructions, file IDs, quantities and approved price snapshots.
Files remain separate original bytes. Existing ownership, purpose/product/field,
MIME, complete-image verification, expiry, quota and retained-order checks apply.

Order summaries identify Ready-made, no personal photos versus Ready-made, with
customer photos. Explicit View loads the ordered images in slot order. Owner
retrieval uses the existing audited order-file endpoint and original download.
Photos remain merchandise personalization under existing payment/returns policy,
not customer-owned engraving or a Gift Box Builder configuration.

## Read-only production candidate review

Current production records and their current R2 gallery images were inspected;
the historical spreadsheet and ZIP were not imported or treated as authority.
All five candidates had null prices and unconfirmed imported quantities. No slot
counts were written or inferred as approvals. B6-BOX-050 remains withdrawn.

| Source ID | Current product ID | Image finding | Recommendation |
|---|---|---|---|
| B6-BOX-002 | 6ac82ea10a110c7f998e27bb | The sole current gallery image shows woven name boxes without visible photo spaces. | Hold; reconcile image/product identity before configuration. |
| B6-BOX-010 | 6ac82ea10a110c7f998e27c3 | Current image visibly shows clipped photos inside the lid. | Good candidate; owner confirms actual accepted spaces/count. |
| B6-BOX-022 | 6ac82ea10a110c7f998e27cf | Photo panels/collages appear in the current teddy-box image. | Good candidate; owner defines individual photos versus collage positions. |
| B6-BOX-035 | 6ac82ea10a110c7f998e27da | Current wooden keepsake image visibly has clipped lid photographs. | Good candidate; owner confirms supported spaces. |
| B6-BOX-062 | 6ac82ea10a110c7f998e27f4 | The unfolding hexagon image has many photo positions. | Conditional; owner must define a supported subset/count within ten, or use the existing enquiry flow. |

## Verification and release

Disposable backend tests cover as-is/photos, price-driven eligibility, stock,
variants, role/ownership/expiry, immutable retries/replacement, guest merge,
configuration removal/versioning and retained order snapshots. The affected
regression passed 105 tests; the subsequent added legacy-cart/variant case passed
in the nine-case D2 suite. Existing upload quota/security and payment checks are
included, alongside narrow Gift Box cart-contract isolation.

Three connected D2 scenarios verify the real API, native picker, photo swapping,
cart reconstruction, uncertain recovery, owner originals, configuration management
and price removal/re-entry. Four connected D1 scenarios, 19 isolated historical
personalization/editor tests and 84 SEO tests passed. Screenshots at 320, 390, 768
and 1440 are under ignored client/test-results-contracts. Final lint, syntax and
build results and exact deployment identity belong in the release report.

Only intended D2 source/tests/docs are committed. Existing tokenless Production
SEO renewal must publish the reviewed main commit before frontend release is
complete. If a supported dispatch capability is unavailable, manually run GitHub
Actions > Production SEO renewal > Run workflow > main. No production orders,
private customer uploads, payments, catalog prices or stock were mutated.
