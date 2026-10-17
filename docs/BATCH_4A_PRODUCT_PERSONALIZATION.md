# Batch 4A: product-level Customize This

Implemented and verified locally on 16 October 2026. Production is unchanged.
No production/staging database connection, real provider operation, email,
payment, environment change, commit, push or deployment occurred. Database tests
used fresh guarded loopback replica sets and in-memory storage. Browser tests
used isolated API fixtures and blocked external requests.

## Preflight and Batch 3 integration review

Reviewed git status/diffs, the three current batch reports, product/admin/cart/
upload/checkout/order contracts and relevant tests before implementation. Captured
hashes of 109 already-dirty files for preservation checks. No new release-blocking
Batch 3 integration defect was found; its focused foundation suite passed 17/17
before edits. Two existing release blockers remain: initialize the reviewed
OrderSettlement collection/indexes under separate authorization before deploying,
and reconcile any historical orders before financial cutover. Runtime schema
verification remains read-only. No persistent migration was attempted.

Batch 3 already supports owner-bound personalization uploads, transactionally
retaining files with an accepted order, immutable line snapshots and InstaPay for
personalized purchases. Batch 4A extends those contracts with readable field-label
snapshots and an explicit required-personalization marker, including configurations
whose fields are optional. Shipping remains separate, null and pending initially.

## Merchant workflow

The ordinary product editor and existing purchase-configuration editor now provide
**Requires Customization Before Purchase**, stored as
`personalization.requiredBeforePurchase`. No customization template is needed.
The existing `customization.enabled` flag remains separate and is explicitly
labelled template-based in advanced configuration.

The merchant configures customer-facing labels, photo/reference-image fields,
short text, notes and predefined choices; chooses required fields; and sets photo
counts, size limits and text limits. Field identities are generated internally;
the new editor does not ask merchants to type technical keys or storage paths.
Required image counts across the configuration cannot exceed ten per item.

Checked products cannot become Ready without a nonempty, valid configuration.
Incomplete configurations can be saved as Draft. Normal price/inventory/review/
category/display approvals remain independent; neither the checkbox nor saving
fields approves prices or imported placeholder stock. All saves retain revision
checks and conflict drafts. Product image galleries, aliases, slugs and existing
template settings are preserved.

Explicitly turning the checkbox off retains field definitions for later but
disables their public use and purchase requirements. Existing records with no
switch retain their former field validation and inline purchase fields until
the merchant chooses the new setting. The editor identifies that legacy state
and offers a direct action to turn existing fields off. Unrelated product saves
omit personalization, preserving earlier configurations. No backfill is required
or automatically applied.

## Customer behavior

- Eligible required-personalization products initially show Customize This.
  A branded native dialog opens for that exact product, with local image previews,
  text/choice controls, errors, keyboard containment, Escape and focus return.
- Valid completion reveals Edit and Add to Cart. Edit preserves selections and
  can update them; missing required information disables purchase. Ordinary
  products keep their normal Add to Cart behavior.
- Variant choice and quantity remain independent. Personalization never changes
  the approved product or selected variant price. Template surcharge payloads
  are rejected for this fixed-price flow.
- Unapproved-price, unavailable and withdrawn products retain existing enquiry/
  visibility protections. Browser controls never replace server eligibility,
  required-field, stock or current-price validation.
- Up to four recent product drafts remain in memory while navigating the same
  tab, scoped to session generation/product/configuration, with a 30-minute
  navigation-restoration window. Account changes clear the draft cache.
  Uncertain operations are not evicted. No photos, instructions or private upload
  identifiers enter localStorage/sessionStorage/IndexedDB.
- A full reload clears unsaved local photos/instructions, as explained in the
  dialog. Successfully added cart items survive through the server-owned cart.
  After an ambiguous add, the customer is told to check the cart before starting
  another add after reload; no automatic new submission is made.

## Private files, retries and immutable orders

Files upload only on Add to Cart using the existing private sign/PUT/verify-copy
pipeline. Actual signature, bytes, dimensions, MIME, size, owner, product and
field binding are enforced by the backend. Public catalog media is unchanged.
Private storage keys and public customer-file URLs are never serialized.

Completed uploads are reused when another file fails or a cart response is lost.
Failed, unverified uploads receive best-effort cleanup; abandoned temporary files
remain subject to the existing expiry/cleanup worker and quota protections.
Removing a reference never deletes a retained order file.

New product-page cart adds use an immutable UUID operation key and request hash.
The receipt is committed in the same cart transaction as line/file attachment.
Concurrent/retried requests with the same key add quantity once; changed payloads
cannot reuse the key. Receipts are bounded at 60 per cart, with an explicit review
error at the limit. Older clients without keys retain their existing contract.
Cart files are still temporary until an accepted order retains them.

Pending request/upload state is shared across product-page mounts, so navigating
away/back during an upload or add cannot accidentally start a second operation.
Ambiguous responses retain the exact request for explicit retry; controls cannot
change that request. Sign/upload/session generation checks remain in place.

Personalization values and sanitized human field labels appear in cart and
checkout review, and are copied into immutable order lines. Later merchant label
changes do not rewrite accepted order instructions. Customer/admin order summaries
show readable labels and private-file counts. Admins view actual retained files
only through existing explicit View actions and protected streams. Guest cart
merge transfers file ownership transactionally; it never attaches orders by an
unverified email/phone. Personalized checkout keeps Batch 3's InstaPay policy;
owner-authorized personalized COD remains a quotation workflow for Batch 4B.

## Focused verification

All final affected checks passed. Counts below overlap and must not be summed:

| Check | Actual result |
| --- | --- |
| Pre-edit Batch 3 new-order foundation | 17/17 |
| Core personalization + checkout foundation + commerce orders + private storage | 74/74 |
| Final personalization + catalog API contracts | 19/19 (9 personalization, 10 catalog) |
| Alias + media + configuration API + personalization + DTO regressions | 54/54, before the final added Made by Request case |
| Model/visibility/DTO subset in earlier catalog run | Passed; catalog expectations subsequently corrected and rerun |
| Final dedicated product-personalization browsers | 9/9 |
| Checkout + legacy personalization/editor + new-flow browser run | 15/15, before the final in-flight-navigation case |
| Batch 1 visibility + Batch 2 media + new-flow browser run | 15/15 at that point (9 existing regression cases) |
| Admin payload helpers | 7/7 |
| Offline Cloudflare worker + SEO generator compatibility | 44/44 |
| Targeted ESLint | Passed |
| Server syntax | 153 JavaScript files passed |
| Scrubbed isolated Vite production build | Passed, output under ignored test-results |
| Whitespace and dirty-file preservation checks | Passed |

Coverage includes ordinary/required initial states, Edit and previews, missing
fields, exact price/variant/quantity, zero-stock/unapproved/withdrawn gates,
Made by Request, foreign files, guest/account ownership, concurrent retry
idempotency, retained order files, immutable labels, stale admin revisions,
current configuration changes at checkout, failed verification and partial-upload
retry, cross-account draft erasure, reload/navigation, 320/768/1440 widths, keyboard
containment/focus return, legacy/friendly URL navigation and existing payment flows.
The 320px dialog screenshot was visually reviewed. Browser API fixtures are not
a claim of a live provider or complete deployed end-to-end test.

Initial failures were corrected explicitly: the new admin service fixture needed
its authorized actor; a browser locator needed the newly added field; and old
catalog assertions predated permanent Draft visibility, confirmed-price sort
aggregation, category public paths and exposed variant approval. The production
guards were not weakened to satisfy those tests. A navigation race found during
review was fixed and received a dedicated delayed-request browser test.

## Compatibility, release risks and next batch

The Product switch and Cart operation receipts are additive, with no new index
or production data migration in this batch. Old carts are hydrated with empty
receipt history. Old orders without field-label snapshots show a generic
personalization label rather than technical keys. Turning fields off or changing
requirements can invalidate an existing cart; checkout fails closed and asks the
customer to review the item instead of discarding instructions silently.

Existing Batch 1/2/3 release gates still apply: merchant approvals, reviewed schema
preparation, private R2 credentials/privacy/exact-origin CORS, cleanup scheduling,
real topology ownership tests and authorized provider/email acceptance. Temporary
files do not gain a longer retention period because a draft is restored.
No checkout, storage, email, indexing or marketing flag was enabled here.

Locally ready for review within the tested scope; production is not activated.
The full connected browser-to-real-API suite and live-provider tests were not run.
Unsaved files intentionally cannot survive a full reload under the memory-only
privacy contract. Cleanup depends on the existing worker being configured at
release; no external scheduled operation was created.

Batch 4B should implement structured Gift Box/Engraving requests; private reference
images; independently approved component eligibility; fixed positive prices,
quote-required zero/missing prices and explicit Free; versioned owner quotations
of product/add-ons/delivery; per-order methods and prior COD authorization;
manual WhatsApp quotation and acceptance; then InstaPay/manual reconciliation
without a mandatory account or website proof. Those service forms/creation APIs
were not built or activated in Batch 4A. Stop here for review.

## Exact Batch 4A file manifest

Eight new files and 26 modified files. Prior dirty changes in modified files were
retained. Ignored screenshots, build output, logs and preservation manifests are
verification artifacts, not deployable application changes.

New:

- `client/e2e/product-personalization.spec.js`
- `client/src/admin/ProductPersonalizationEditor.jsx`
- `client/src/commerce/PersonalizationSummary.jsx`
- `client/src/commerce/ProductPersonalizationDialog.jsx`
- `client/src/commerce/product-personalization-drafts.js`
- `docs/BATCH_4A_PRODUCT_PERSONALIZATION.md`
- `server/test/product-personalization.test.js`
- `shared/product-personalization.mjs`

Modified:

- `client/scripts/catalog-form.test.js`
- `client/src/admin/catalog-form.js`
- `client/src/commerce/api.js`
- `client/src/commerce/commerce.css`
- `client/src/components/CatalogDialog.jsx`
- `client/src/pages/AdminProductConfigurationPage.jsx`
- `client/src/pages/AdminProductFormPage.jsx`
- `client/src/pages/CartPage.jsx`
- `client/src/pages/CheckoutPage.jsx`
- `client/src/pages/OrdersPage.jsx`
- `client/src/pages/ProductPage.jsx`
- `server/src/catalog/product-policy.js`
- `server/src/catalog/public-presentation.js`
- `server/src/catalog/service.js`
- `server/src/catalog/validation.js`
- `server/src/commerce/cart.js`
- `server/src/commerce/configuration.routes.js`
- `server/src/commerce/order-presentation.js`
- `server/src/commerce/orders.js`
- `server/src/commerce/pricing.js`
- `server/src/commerce/routes.js`
- `server/src/commerce/uploads.js`
- `server/src/models/Cart.js`
- `server/src/models/Product.js`
- `server/src/website/service.js`
- `server/test/catalog-phase1b.test.js`
