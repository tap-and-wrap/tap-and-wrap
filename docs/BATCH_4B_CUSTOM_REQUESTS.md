# Batch 4B — Gift Box, engraving and component quotations

Locally implemented; no deployment, production/staging database access, provider uploads, messages, email delivery or payments performed. Previous batch reports and Cloudflare redirect files were checked against preflight SHA-256 hashes and remain unchanged. This document describes this batch's additions to the existing uncommitted tree.

## Customer experience

- `/customize/gift-box`: accountless structured request for occasion, presentation/style, colors, contents, optional budget, recipient/message, instructions, quantity, optional approved components and optional reference images.
- `/customize/laser-engraving`: owner-enabled product and exact variant, approved fonts/placements/materials where configured, Name/Text, Design or Other, artwork and contact details. A verified base price and approved template are unnecessary. A manual item-reference fallback remains available when nothing is configured; it promises no unsupported material or option.
- Both require customer name and a valid Egyptian WhatsApp number. Email is optional. No account, payment or inventory allocation occurs at submission.
- The receipt has a unique `TW-…` reference and a 12-hour owner follow-up deadline. The owner completes quotation, acceptance and payment correspondence through WhatsApp. The customer does not need to return to the website.
- Uploaded images remain local until submission. Existing private upload verification, signature/dimension/size validation and verified private copies are reused. Maximum five JPEG/PNG/WebP images, each up to 8 MiB. Public catalog media is untouched.
- Known amounts are estimates, never a final quotation. Pending custom work and delivery are clearly stated. Component quantities are totals for the request, rather than multiplied again by the gift quantity.
- Retries use an immutable request body and opaque owner-bound UUID; completed uploads are reused. Reload stores only that UUID and an uncertain-submission marker, never customer details or files. Owned status lookup recovers a receipt. An unresolved response after reload blocks duplicate submission and asks the customer to check/contact the owner.

## Merchant configuration

Product editor: **Offer this product for engraving quotations**, approved fonts, placements, optional materials and text limit. These controls are separate from both Batch 4A required personalization and the legacy template engine. Public visibility, resolved catalog review and active categories remain mandatory.

Component editor: explicit owner request approval, allowed services, request availability and request pricing. All existing records default to disabled/unconfirmed; nothing bulk-enables the 80 food ingredients or five packaging candidates. Original IDs, classifications, template approval/pricing and images remain intact.

Request pricing has three modes:

| Saved owner choice | Public presentation | Estimate |
|---|---|---|
| Confirmed positive price | Confirmed EGP amount | Price × selected quantity |
| Pending, zero or missing price | Price to be confirmed | Excluded from known subtotal; retained as pending |
| Explicit Free | Free | Zero additional charge, explicitly distinguished from pending |

Request prices live in `requestPolicy`, independently of legacy automatic-template price approval. Imported financial values are never copied into request prices. Actual stock is also independent: imported unapproved quantity 10 is hidden from the stock input. The owner enters an actual count, explicitly chooses Made by Request, or selects unavailable. Request eligibility alone never approves inventory or normal checkout.

## Requests and quotations

Admin navigation adds **Requests / Custom Quotations**, with reference search, pagination, lifecycle/converted/overdue filters, submitted details, explicit protected image viewing, follow-up deadlines and audit/version history.

Flow:

1. Submitted → Needs Review, or prepare a quotation directly.
2. Save a new quotation version with confirmed work/product unit amount, every requested component, optional additional charges, optional discount within the base work amount, and separately confirmed delivery. Zero delivery requires explicit Free confirmation. Pending component prices must be resolved to a positive price or explicit Free before an offer can be saved.
3. Default method is InstaPay. COD requires explicit owner authorization before offering the version, with a personalization/refusal-risk warning.
4. Open the authoritative saved prefilled WhatsApp quotation and send manually. Opening WhatsApp does not claim sharing/delivery. Record actual sharing separately, with a private evidence note.
5. Record actual WhatsApp acceptance of that version and permitted payment method, with evidence and audit timestamps.
6. Record the agreed Egyptian governorate/address from WhatsApp and create the order before requesting a transfer. This requires the existing authorized commerce launch gates. Current eligibility, categories, variants, engraving options and actual approved inventory are checked again inside the transaction. Insufficient/unapproved stock rolls back everything. Approved Made by Request does not decrement a fictitious stock counter.
7. The linked existing order dashboard handles reconciliation, collections, refunds, cancellation, returns and fulfillment. Derived request statuses show Awaiting Payment, Paid, In Preparation, Completed or Needs Review from the actual order.

Accepted versions are preserved. Before conversion, edits create a new version and require renewed sharing/acceptance. After conversion, cancel/return and reconcile inventory/refunds first; the system refuses silent replacement of a live/paid order. Replacement versions retain prior order links, accepted breakdowns, files and ledger history. Files stay accessible on the original order without rewriting their original order association.

## Payments and accounting

There is one accounting system: existing `Order`, accepted separate charges and `OrderSettlement`. `ServiceRequest` records pre-order specifications and versioned owner offers, not another payment ledger.

- Custom order original merchandise snapshots hold the accepted work/product amount and discount. Accepted add-ons and delivery are separate charges, with quotation version, acceptance, collection method and timestamps.
- The accepted complete quotation total is preserved on the order. Owner-quotation payment state becomes Paid only when all agreed scopes have been reconciled, including delivery/add-ons. Ordinary website checkout retains its original merchandise-payment behavior and pending shipping.
- InstaPay: accepted order reference first, transfer to **01060673073**, screenshot directly through WhatsApp, independent actual-account reconciliation and audited amount/reference entry. No mandatory website proof upload for these orders. Duplicate references, partial/late/mismatched payments and refunds use Batch 3's ledger protections.
- COD is possible only when offered/authorized before acceptance; recording collected funds remains separate from order creation and dispatch.
- Direct charge-edit/accept actions on converted service orders are blocked; changing the agreed offer requires a reviewed replacement quotation.
- Normal product checkout, website InstaPay proof uploads, discounts, inventory transactions and Batch 4A personalization remain separate working paths.
- Supporting request/quotation/acceptance/closure copies enter the existing transactional outbox only with a usable optional email. Custom order emails include the accepted total and separate charges and explain the WhatsApp workflow. Provider delivery stays behind existing configuration/recipient safeguards. No delivery happened during this work.

## Security and contracts

Requests use the existing verified account/guest commerce owner, database guards, CSRF, strict Origin rules and private session lifecycle. Public creation is rate-limited; open requests per owner are bounded. No client financial amount, acceptance or arbitrary lifecycle state is accepted. Public status lookup returns only an owned minimal receipt. Admin data/files require active admin authorization and private/no-store/noindex headers. File viewing is explicit, rate-limited and audited; no storage keys or public artwork URLs are returned.

`service_reference` uploads are bound to the submission UUID and owner. Only complete verified images for that exact request can be retained, atomically with request creation. Conversion atomically creates the existing order, claims inventory, links files, records financial acceptance and queues notification events. Duplicate conversions do not allocate again. Stale admin revisions return 409 and keep the local draft; uncertain operations retry the identical action.

New model: `ServiceRequest`, including unique reference and owner/requestKey indexes, request hash, immutable submitted snapshots, deadline, bounded quotation/history arrays, revision and current order link. Existing Product/ComponentOption/Upload/Order/NotificationEvent gain additive fields. `ServiceRequest` is included in the existing schema contract registry. Runtime schema verification remains read-only; it cannot initialize the new collection/indexes automatically.

Existing records need no automatic rewrite or approval. Missing request/engraving policies fail closed. Existing orders retain their snapshots and accounting versions; service-order behavior is identified explicitly. No catalog addresses, aliases, Cloudflare mapping or SEO publication files were changed.

## Focused verification

All provider interactions were mocked. Backend integration fixtures used fresh disposable loopback replica sets through the scrubbed test runner, never merchant credentials or an existing database.

- `node scripts/run-tests.js test/service-requests.test.js test/checkout-foundation.test.js test/product-personalization.test.js test/commerce-storage.test.js test/commerce-orders.test.js`: **88 passed** at that checkpoint.
- `node scripts/run-tests.js test/service-requests.test.js test/commerce-configuration-api.test.js test/phase3-email.test.js`: **54 passed** after delivery/withdrawal checks were added.
- Final focused request/email run: **29 passed**, including the additional real HTTP request-pricing normalization/stock-protection case. Across these files, **130 distinct backend tests** passed; overlapping runs are not added together.
- Isolated browser coverage: **26 distinct tests passed** across request services (8), admin media (5), product personalization (9), checkout foundation (4). Includes guest/reload/network recovery, private-upload reuse, fixed/pending/Free pricing, zero templates/options, admin configuration and quotation/acceptance/conversion, mobile layouts, normal checkout, aliases and existing image controls.
- Initial browser selectors were corrected to match accessible control names. A real component-editor regression from duplicate sibling revision keys was fixed with distinct keys; its media-save protection and new eligibility/stock controls were rerun successfully.
- Targeted changed-file ESLint passed; server syntax checks passed for 159 JavaScript files; an environment-scrubbed Vite build passed under ignored test-results. No release SEO export or deployment build was generated. Desktop/tablet/320px overflow checks passed; gift/customer and admin screenshots inspected locally.
- `git diff --check` passed (only existing Windows LF/CRLF notices). Prior batch reports and Cloudflare redirect work retain their exact preflight hashes.

## Operational dependencies and limitations

1. Before any authorized release, initialize/verify the new request collection and indexes through the existing guarded schema procedure with separately authorized database writes, exact target/topology checks and a rollback plan. An old production schema cannot silently satisfy the new runtime contract.
2. Merchant explicitly reviews display/engraving eligibility and options, component request services/prices/availability and actual stock or Made by Request. No bulk enabling or placeholder-stock approval is included.
3. Private R2 credentials/bucket/CORS, API origin/cookies/CSRF, upload budgets and cleanup worker require authorized environment verification and a synthetic provider test. Text-only requests can work without storage; image submission fails honestly if storage is disabled/unconfigured. No public catalog bucket is used for customer files.
4. Existing commerce launch authorization remains required to convert accepted requests into inventory-allocating orders. Requests and quotation preparation do not activate checkout. Review dependencies before changing any flags.
5. WhatsApp sharing/acceptance are manual recorded evidence, not API delivery receipts. The owner must check the dashboard, meet the 12-hour follow-up commitment and independently reconcile receiving account funds. No scheduler or WhatsApp Business API was added.
6. Optional email uses existing provider/outbox configuration and separate authorized live verification. Broader notification scheduling/owner alerts remain a later batch.
7. Submitted reference images are retained for review and order history; temporary-source cleanup remains available through existing jobs. Unconverted requests continue consuming their owner upload quota until conversion. A merchant-approved retention/deletion policy for declined/abandoned submitted requests is still required; this batch invents no automatic destruction schedule. Pre-submission temporary uploads retain existing expiry/cleanup behavior.
8. Manual item-reference engraving creates owner-reviewed custom work without pretending a catalog inventory claim exists. Any stock-bearing catalog item/component must be explicitly selected and its real inventory verified before conversion. Review bespoke sourcing and delivery details with the customer before requesting payment.
9. Public option queries are bounded to 20 products/components per page with category checks; no full-catalog frontend fetch. There are no invented selectable products, ingredients, fonts, placements or materials.
10. No production functionality is claimed verified. Batch 4B is locally ready for owner review and guarded release preparation, subject to the above operational dependencies. Later legal pages, broader jobs/email work and production activation are outside this batch.

## Exact Batch 4B file manifest

The following files differ from the preflight baseline for this task, including additive edits to previously uncommitted files:

<!-- File manifest generated from the preflight baseline. -->

- `client/e2e/service-requests.spec.js`
- `client/src/App.jsx`
- `client/src/admin/AdminLayout.jsx`
- `client/src/admin/RequestEligibilityEditors.jsx`
- `client/src/admin/catalog-form.js`
- `client/src/commerce/AdminEditors.jsx`
- `client/src/commerce/OrderFinancials.jsx`
- `client/src/commerce/api.js`
- `client/src/commerce/service-requests.css`
- `client/src/pages/AdminCommercePage.jsx`
- `client/src/pages/AdminOrderPage.jsx`
- `client/src/pages/AdminProductFormPage.jsx`
- `client/src/pages/AdminRequestsPage.jsx`
- `client/src/pages/ServiceRequestPage.jsx`
- `server/src/catalog/service.js`
- `server/src/catalog/validation.js`
- `server/src/commerce/configuration.routes.js`
- `server/src/commerce/models.js`
- `server/src/commerce/notifications.js`
- `server/src/commerce/order-accounting.js`
- `server/src/commerce/order-presentation.js`
- `server/src/commerce/orders.js`
- `server/src/commerce/request-policy.js`
- `server/src/commerce/request-validation.js`
- `server/src/commerce/routes.js`
- `server/src/commerce/service-request.routes.js`
- `server/src/commerce/service-requests.js`
- `server/src/commerce/uploads.js`
- `server/src/commerce/uploads.routes.js`
- `server/src/email/templates.js`
- `server/src/models/ComponentOption.js`
- `server/src/models/NotificationEvent.js`
- `server/src/models/Order.js`
- `server/src/models/Product.js`
- `server/src/models/ServiceRequest.js`
- `server/src/models/Upload.js`
- `server/test/service-requests.test.js`
- `docs/BATCH_4B_CUSTOM_REQUESTS.md`
