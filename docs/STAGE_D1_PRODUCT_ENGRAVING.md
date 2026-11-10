# Stage D1: visual engraving on store-owned products

Base: `a4bc22bdbb378efb854fad55b30439e582d7ce3a`.

## Capability and owner workflow

A saved `productEngraving` setup, rather than another enabled checkbox, supplies
an exact existing gallery key, intrinsic image size, approved registry font IDs,
materials and optional placement guidance. The product editor selects the image
visually and reads its intrinsic size; no dimensions or coordinates are entered.
Saving is the owner's approval. Configuration revisions increase monotonically,
including removal and reconfiguration, so old approvals cannot be resurrected.
Gallery removal cannot silently invalidate an attached engraving surface.

The public detail DTO exposes only the approved URL and an opaque versioned
surface ID. The editor is lazy-loaded from the normal product page. Add to Cart
remains the ordinary purchase action; Add Engraving opens Your Product, Your
Design, Review. Existing genuine price, visibility, variant and inventory rules
still apply. Unpriced products retain WhatsApp enquiries. Checkout retains its
existing global launch authorization. No environment flags or schema migration.

The current production catalog and two real public R2 images were inspected
read-only: B1-WED-007 Wooden Ring Box and B1-OFC-008 Parker Brushed Metal Pen Gift
Set are plausible owner-review candidates, not automatically approved products.
Their sampled records were unpriced with unconfirmed imported quantities. No
production capability, price, stock, image or ordering record was changed.

## Design and commerce contracts

Stage B/C VisualEngravingEditor and VisualDesignPreview provide all editing and
composite rendering. The approved product image is the background; only actual
artwork uses private uploads. There is no icon gallery. Proportional geometry,
layer order, original artwork colors, approved Arabic/English text, touch/mouse,
keyboard controls, independent workspace zoom and Undo/Redo share one engine.

The strict `product-engraving-v1` attachment belongs to an ordinary `product`
cart line. It carries designKey, configurationVersion, material, placement,
visual-engraving-v1 geometry and an owner-bound review fingerprint. The fingerprint
binds the exact product, variant, base price, approved setup and surcharge version.
Private artwork must match owner, shopping scope, product, designKey, purpose,
role, expiry and verified intrinsic aspect ratio. File IDs and metadata remain
separate; originals are not flattened into a composite screenshot.

`product-engraving-order-v1` snapshots preserve exact product/variant, approved
surface, fonts/materials/guidance, original upload IDs, geometry, base price and
surcharge. Snapshots are validated, retained and immutable. Public cart/order
summaries omit private upload IDs; explicit View actions load owned designs and
original bytes. Owner original-file views use the existing audited file endpoint.

Cart replacement is line/design-bound and checks a loaded fingerprint. Immutable
operation receipts handle uncertain responses before and after order acceptance.
Guest merge transfers attachments atomically and renews the owner's fingerprint.
Changed prices/configurations fail closed for review; expired files remain explicit
errors. New unsubmitted bytes and text stay in memory. Browser persistence contains
only opaque owner-scoped operation keys; owner/session changes abort hydration
and unmount private state. Existing standalone v1/v2 contracts are unchanged.

## Pricing and payments

The owner engraving dashboard has an independent store-product surcharge setting.
The initial server default is 10000 piastres (EGP 100); React has no price constant.
The existing SiteContent record holds its price/version, with revision checks,
admin authorization, CSRF/Origin protection, audit and transactional writes.
Checkout takes a shared price write fence, preventing a concurrent settings edit
from accepting an obsolete quote. New quotes reprice; accepted orders do not.

The complete engraved product remains merchandise for inventory, promotions,
fulfillment, accounting and payments. It never enters customer-owned-item receipt,
inspection or deferred engraving-service payment groups. Existing personalized
merchandise payment/return safeguards apply, including website InstaPay policy.
Mixed orders allocate the product plus surcharge to merchandise and only standalone
services to their inspection-gated group. No production checkout or payment tests.

## Verification and release

Focused disposable backend tests cover capability, strict contracts, prices,
variants, stock, ownership/roles/expiry, original bytes, retry/replacement/merge,
order snapshots, price changes and mixed standalone accounting. Connected browser
tests cover both customer and owner interfaces, native artwork selection, Arabic,
original color, zoom, keyboard/touch/mouse, reconstruction, private ownership,
uncertain-request recovery, owner gallery selection, surcharge CAS and normal buy.
Screenshots are stored in ignored client/test-results-contracts at 320/390/768/1440.
Final verification: 109 focused backend tests, 84 SEO tests, frontend lint,
299-file server syntax check and production build passed. The affected isolated
browser pass had 57 successes and exposed a pre-existing disabled-service fallback
prop error; its one-prop correction is covered by the rerun of manual-intake cases.
All four connected D1 scenarios passed, including explicit expired-artwork
replacement and audited owner original download. The four affected manual-intake
cases passed after the fallback correction.
See the release report for final browser counts and exact deployment identity.

Publication uses the existing tokenless Production SEO renewal workflow. If no
approved workflow-dispatch capability is available, manually run GitHub Actions >
Production SEO renewal > Run workflow > main after Render reports the reviewed
commit live. Do not treat backend auto-deploy as completed frontend publication.

Stage D2 remains separate: ready-made photo-slot configuration, as-is purchase,
optional personal photo uploads and cleanup of redundant photo-product switches.
