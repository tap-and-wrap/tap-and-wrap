# Batch 1: permanent catalog visibility and merchant approval

Implemented locally on 16 October 2026. No database connection, database write,
production migration, environment change, provider activation or deployment is
authorized by this document. Existing uncommitted HTTP redirect work is preserved.

## Policy and merchant workflow

`Product.visibility` is `hidden` (default), `public`, or `withdrawn`. Missing
legacy values fail closed. Public display requires `public`, a recognized product
status and valid active main/subcategory relationships. Display is independent
of checkout flags, price approval, purchase status and stock. The temporary
`CATALOG_BROWSE_PREVIEW_ENABLED` public bypass is retired; enabling it cannot
expose unreviewed records or inactive categories.

Purchase still requires public visibility, Ready/published, resolved review flags,
positive approved base/variant prices, approved inventory, active categories and
actual selected availability. Tracked zero stock cannot be ordered; approved
Made by Request has no stock deduction. Withdrawing an item also invalidates new
cart/quote purchase eligibility. Alias reservations are never modified.

Public DTOs disclose only verified positive prices, independently of purchase
eligibility. Unpriced items show Price on request. Unavailable/otherwise
unorderable items retain WhatsApp enquiries and confirmed prices. A selected
unpriced variant cannot fall back to a different price. Approved prices sort
before quote-required products; provisional prices do not affect public sorting
or min/max ranges. Product lists remain bounded to twenty, homepage selections
to eight, and category/URL/search contracts remain intact.

The product editor has separate Public display and Purchase readiness controls.
Typing a positive price deliberately confirms it. Availability offers stock not
confirmed, tracked stock, Made by Request and unavailable. Entering an actual
tracked quantity confirms that count. Selecting tracked stock never reuses an
imported quantity as an approval. Unapproved imported quantities are not prefilled
into the count field. An unrelated save preserves an existing provisional count
privately with approval false. A new unconfirmed record stores the model's zero
quantity with approval false: this is not a verified stock count. UI-only draft
metadata never enters API payloads.

For a simple product the merchant reviews display, enters its confirmed price,
selects accurate availability, resolves any real catalog review issues, and
chooses Ready when approving online purchase. Draft/Hold can remain visible for
enquiries. No automated promotion to Ready or review-flag clearing is performed.
Personalization/customization fields omitted by the editor remain preserved.

SEO compatibility changes only prevent display-only/hidden records gaining
Product/Offer markup or entering approved exports. Export target restrictions
remain intact; production export is still forbidden. No indexing flag changes.

## Existing-production-data transition: separately authorized future work

Do not deploy this strict visibility policy over existing records without an
approved transition: records missing visibility would disappear from public
listing and purchasing. Prepare a coordinated reviewed transition first.

1. Separately authorize an exact-target read-only snapshot through existing safe
   target/topology controls. This task did not take that snapshot. Include current
   product IDs, loaded admin revisions, public content/image references, status,
   review notes/reasons and category relationships, plus category identities,
   active state and parent relationships. Keep the evidence in ignored local-data.
2. Merchant reviews grouped product sheets by category/source identity. Assign
   each exact product ID to public, hidden or withdrawn. Hold records need explicit
   review; review flags and price/inventory approvals remain independent. A group
   decision is permitted, but never an unchecked "approve the entire catalog".
3. `server/src/catalog/display-transition.js` provides offline-only
   `displayReviewDigest(products, categories)` and
   `planDisplayTransition(products, categories, review)`. It opens no files or
   connections and writes nothing. Review has version 1, source
   `merchant-reviewed-product-display`, the current snapshotHash and groups of
   `{ visibility, productIds }`. Input bounds are 10,000 products/categories/groups.
   Duplicate, missing, unknown or stale records fail. Public groups require an
   image reference and active coherent categories. The digest binds content,
   review fields, product revision and category availability/relationships.
4. Review output contains only exact IDs and patches `{ expectedRevision,
   visibility }`. It cannot approve price, inventory, Ready status, review
   resolution, aliases or components. The digest is a drift check, not a signature
   or evidence that owner approval or database reads were authorized.
5. A future separately authorized executor can submit these captured-revision
   patches through the existing protected admin API in bounded batches. No apply
   command/executor or new bulk write endpoint is added here. Stop on revision,
   category or evidence drift; record committed/failed/uncertain outcomes and
   reconcile uncertain responses rather than replay blindly. Recheck category
   state at application/release time; planner evidence is not a transactional
   database fence. Preserve the previous visibility for an explicit reviewed
   rollback; do not enable the retired preview bypass as recovery.
6. Independently verify data, aliases, browsing and checkout-toggle invariance
   before authorized release. Refresh the separately reviewed Cloudflare URL
   mapping as required; do not bypass its expiry or the production SEO-export ban.

This replaces 1,595 individual technical checkbox operations with grouped,
reviewed display decisions and generated guarded proposals. Real prices and
availability still require actual merchant evidence, preferably starting with a
small purchasable cohort. Never approve the imported stock placeholder of ten.

## Roadmap using the finalized business rules

Batch 1 only implements product visibility/approval and required compatibility.
Next, after owner review, prioritize **admin public-media uploads and storage**:
product/category/component direct uploads, scoped admin authorization, byte/size
validation, previews, main selection/reorder/replace/remove, R2 public delivery
and reference-aware removal. Keep public media separate from private customer
files and historical order references.

Then implement commerce/accounting: order before InstaPay transfer; full known
merchandise amount; shipping Pending Confirmation with null amount, confirmed
within twelve hours; separate quoted add-ons and accepted outstanding charges;
COD/InstaPay settlement, proof replacement/rejection/refunds and delivery states.
No initial final shipping calculation or zero/free-shipping fiction.

The dedicated customization batch must distinguish required fixed-price product
customization (future Requires Customization Before Purchase, Edit/Add to Cart,
private files) from quotation requests for Build Your Gift Box and Laser
Engraving. Both services collect structured preferences/reference images, obtain
owner price/shipping review within twelve hours, customer acceptance and then
manually verified InstaPay payment. Submission alone is never a charge.

Component eligibility/availability must be independent of automatic pricing:
verified positive cost, zero/missing quote-required, and explicit Free are distinct.
No component or quotation changes are implemented here. Finish transactional and
owner emails, twelve-hour alerts, bounded scheduled jobs, settings/diagnostics,
permanent HTTP routing, enabled-checkout acceptance, security/performance review,
and independently approved tracking/indexing activation. Release variables must
be inventoried and enabled by dependency, never by switching every false to true.

## Verification scope

Database-free policy/model validation, query-double service tests, offline export
contracts, form tests, isolated browser API fixtures and SEO tests exercise this
batch. No test opens MongoDB. Existing database-backed fixtures were updated to
declare display permission where intended, but their suites are not run under
the no-database restriction. Actual Mongo query execution/concurrency and live
merchant/provider behavior require separately authorized verification before
production release. Build checks must use scrubbed environment/no dotenv and
must not replace a reviewed production output artifact.

## Verification results

- Database-free backend checks: 34 passed.
- Catalog form checks: 6 passed.
- SEO/export/Cloudflare compatibility checks: 65 passed.
- Isolated browser API-fixture checks: 4 passed, including 320px, tablet and desktop.
- Targeted ESLint, changed-server-file syntax checks and isolated Vite build passed.
- Git whitespace check passed; Git reports existing LF/CRLF normalization notices.

The standard Windows browser runner passed its assertions but stalled during web-server teardown. Verification was repeated successfully with an owned isolated Vite process and a temporary ignored Playwright configuration; only that owned process was stopped. No runner infrastructure was changed.

## Exact Batch 1 file manifest

- `client/e2e/catalog-fixtures.js`
- `client/e2e/permanent-visibility.spec.js`
- `client/scripts/catalog-form.test.js`
- `client/src/admin/catalog-form.js`
- `client/src/components/ProductCard.jsx`
- `client/src/pages/AdminProductFormPage.jsx`
- `client/src/pages/AdminProductsPage.jsx`
- `client/src/pages/ProductPage.jsx`
- `client/src/seo/metadata.js`
- `docs/BATCH_1_PERMANENT_VISIBILITY.md`
- `server/scripts/export-seo-catalog.js`
- `server/src/catalog/display-transition.js`
- `server/src/catalog/product-policy.js`
- `server/src/catalog/public-presentation.js`
- `server/src/catalog/service.js`
- `server/src/catalog/validation.js`
- `server/src/commerce/configuration.routes.js`
- `server/src/commerce/pricing-context.js`
- `server/src/models/Product.js`
- `server/src/website/service.js`
- `server/test/batch1-inventory-revision.test.js`
- `server/test/batch3-catalog-efficiency.test.js`
- `server/test/batch3-commerce.test.js`
- `server/test/catalog-api.test.js`
- `server/test/catalog-models.test.js`
- `server/test/catalog-phase1b.test.js`
- `server/test/commerce-configuration-api.test.js`
- `server/test/commerce-orders.test.js`
- `server/test/helpers/connected-api-server.js`
- `server/test/permanent-visibility-service.test.js`
- `server/test/permanent-visibility.test.js`
- `server/test/phase3-tracking.test.js`
- `server/test/product-addresses.test.js`
- `server/test/seo-export.test.js`
- `server/test/website-admin.test.js`

The six pre-existing SEO/Worker/document modifications and shared/product-url-compatibility.mjs are preserved and excluded from this manifest. Other pre-existing untracked handoff files, scripts and backups are untouched.
