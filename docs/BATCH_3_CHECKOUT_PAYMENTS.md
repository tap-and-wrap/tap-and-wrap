# Batch 3: checkout, shipping, payments and WhatsApp foundations

Local implementation: 16 October 2026. Production remains unchanged. This document
supersedes the older Phase 2 fixed-shipping/pre-order-proof descriptions for new
accounting-version-1 orders. It does not supersede operational safety guards.

## Scope and readiness

The new-order foundation is locally verified using disposable loopback replica
sets, provider mocks and isolated browser fixtures. Production launch remains
NO-GO until the release gates below are completed under separate authorization.
No merchant database was inspected, no real R2/email/payment operation was made,
no environment files or flags were changed, and nothing was committed or deployed.
Batch 1 visibility, Batch 2 media and existing Cloudflare redirect work were
preserved. The six existing tracked redirect diffs retain their preflight sizes.

The requested comprehensive commerce audit was not present as a separate current
repository artifact. Implementation was based on the actual source, existing
runbooks/manifests and the user's final requirements, not assumed live settings.

## Financial and order contracts

- Checkout revalidates approved product/variant prices, stock, categories,
  customization and discounts on the server in integer piastres. Cart additions
  do not reserve stock. Existing transactional inventory/discount/upload/outbox
  writes, owner-bound checkout keys and immutable request retries remain intact.
- New orders have `accountingVersion: 1`. `Order.totals` and line snapshots remain
  immutable and represent the initial known merchandise amount after discounts.
  `shippingPiastres` is null. No EGP 90/120 rate is charged or automatically approved;
  the historical global shipping write API is retired with HTTP 409.
- Delivery is a separate charge, initially amount null and state pending. Unknown
  add-ons are separate charges with null amounts. A zero/missing quoted add-on
  stays quote-required; only explicit Free creates a genuine zero amount.
- Charge quotations are versioned, record available COD/InstaPay options and
  require actual customer acceptance before becoming payable. Admin-recorded
  WhatsApp acceptance requires affirmative confirmation and private evidence.
  Accepted charges cannot be edited. Method exceptions are explicitly reconciled
  without silently replacing the original agreement.
- `OrderSettlement` is an append-only collection/refund ledger with immutable
  operation keys/request hashes, global method/reference uniqueness, actor,
  reason and timestamps. A combined receipt can allocate money to merchandise
  and accepted charges while retaining one transfer/collection reference.
- Financial summaries distinguish original merchandise, agreed payable amounts,
  collections, refunds, outstanding balances and excess credits. Partial refunds
  may explicitly reduce the agreed payable amount for a reviewed remedy without
  rewriting the original snapshot. Cancelled/returned funds remain flagged for
  refund review; cancellation does not promise an automatic full refund.
- Order revisions serialize accounting and fulfillment changes. Private bank
  references, reconciliation notes and acceptance evidence remain admin-only.
  Public history uses a separate customer-visible explanation.

## Final normal-order flows

COD: review authoritative merchandise quote -> atomically create unpaid order and
allocate applicable stock -> owner confirms delivery through WhatsApp within 12
hours -> save fee/options and actual acceptance -> dispatch -> record actual COD
collection and reference, separately or combined with accepted charges.

InstaPay: review quote -> atomically create order and allocate stock -> display
unique order reference and destination 01060673073 -> customer transfers only
merchandise -> uploads private proof for that owned order -> administrator checks
the actual receiving account and records actual amount/reference -> paid only
when merchandise is fully reconciled. Delivery is separately quoted, accepted
and settled through its agreed method. A screenshot alone never marks Paid.

Proof signing requires an existing, open, owned website InstaPay order; proofs
cannot be attached to another order. Rejection supports a safe explanation and
replacement while retaining earlier evidence. Existing orders can submit proof
even if new checkout is subsequently disabled. Secure guest ownership is retained;
orders are never attached using an unverified phone/email.

Checkout quote expiry still requires refreshed review; it is not order expiry.
Ambiguous submissions retain the same opaque owner-bound key and in-memory
immutable payload. Recovery checks the owned submission or retries that request;
it does not ask the customer to pay again. No customer details/files are persisted
in recovery storage.

## WhatsApp-first custom-service compatibility

The foundation supports accepted `owner_quotation` orders without website proof
or an account. These default to InstaPay. COD availability requires explicit
authorization recorded before quotation acceptance. Their payment can be
reconciled from WhatsApp evidence against the receiving account; no site upload
is imposed. Usable customer email is optional for these records.

For normal orders, the admin can quote delivery/add-ons, select payment options,
open a professional prefilled WhatsApp message derived from saved amounts, and
record actual acceptance. Opening WhatsApp records neither sending nor delivery.
No WhatsApp Business API, automatic message or assumed acceptance was introduced.

The dedicated custom-service batch must still implement structured Gift Box and
Engraving requests, versioned whole-order quotation drafts, owner price entry,
acceptance evidence, and creation of the accepted order through guarded services.
No public/admin custom-order creation endpoint was added here. Existing automatic
Gift Box/Engraving cart checkout fails closed with QUOTATION_REQUIRED so unfinished
services cannot create unintended purchases. Generic approved product-level
customization is preserved; personalized website orders use InstaPay, with COD
requiring the future owner-authorized quotation path.

## Exceptions and operations

- Verified partial, excessive, late and method-mismatched funds are recorded as
  actual ledger entries; exceptions require explicit reconciliation. Duplicate
  references are rejected and admins can securely locate their existing entry.
- Refunds reference an actual collection allocation and cannot exceed the
  remaining refundable amount. They record completed refunds, not automatic
  payment-provider execution or legal eligibility decisions.
- Customer cancellation is a request. Owner cancellation of an InstaPay order
  requires review for potentially received transfers. Before preparation, stock
  is restored once; after preparation, inspected resellable quantities are
  required. Failed/refused delivery never automatically restores stock. Returns
  require explicit per-claim inspection and reconcile once.
- Coupon usage is reversed only by an explicit reviewed cancellation/return
  operation. Historical redemption records remain with a reversal timestamp.
- Dispatch is blocked while delivery/add-on charges remain unresolved. InstaPay
  merchandise must be fully verified before preparation. Fulfillment, delivery
  failure, return, collection and refund are separate operations.
- Admin filters expose awaiting transfer, proof review, delivery confirmation,
  overdue 12-hour follow-up, cancellation requests and refund review. The deadline
  is an action queue, not an automatic cancellation or a scheduled notification.
- Unpaid reservations deliberately remain allocated until owner reconciliation
  and explicit cancellation. There is no invented expiry duration. The owner must
  adopt a daily review procedure; potentially paid orders must not be cancelled
  blindly. Automatic alerts/scheduling remain a later authorized batch.

Supporting notification events remain transactional and use the existing durable
outbox/retry/ambiguous-SMTP safeguards. Snapshots include payment state, separate
charges, collections/refunds and balance. No usable email skips that supporting
event rather than blocking a WhatsApp-first order. Provider delivery occurs
outside order acceptance; an outage cannot erase the accepted order. No email or
marketing flags were enabled. Existing consent/Purchase deduplication tests pass;
event values continue to use the initial merchandise amount, excluding pending fees.

## Schema compatibility and authorized rollout

1. Keep checkout disabled. Obtain separately authorized read-only inventory of
   historical orders, pending receipts/reservations and existing collection/index
   state. This run did not perform that inspection.
2. Prepare backup, rollback and a reviewed schema-only initialization plan for
   `OrderSettlement` and its unique reference/operation indexes. Runtime schema
   checks remain read-only and fail closed until required indexes exist. Do not
   deploy this server over an unprepared database; do not run automatic startup DDL.
3. Historical orders without accounting version 1 retain their original totals,
   including any previously included delivery amount. They are not silently
   converted. New ledger mutations and legacy direct payment-state changes fail
   closed. Finish them through a separately reviewed reconciliation path or build
   a guarded per-order compatibility procedure before cutover if any exist.
4. That procedure must identify actual merchandise/delivery allocations, receipts,
   refunds, stock claims and coupon usage from evidence; preserve original
   snapshots; reconcile unknowns manually; and dry-run/review before writes.
   Never infer a Paid ledger entry from an old state or relabel old shipping null.
   No production data migration executor was added or run in this batch.
5. Deploy compatible client/API together only after authorization. Rollback must
   preserve version-1 records and the ledger; an older server must not mutate
   these orders through its former direct Paid/cancellation paths.

## Focused verification

Actual local results, no full-suite claim:

- Core checkout/orders/storage/tracking/email/DTO run: 104 passed, zero failures.
- Configuration + foundation + email/DTO rerun: 79 passed, zero failures (overlaps
  the core run; these counts must not be added as independent coverage).
- Website analytics and Batch 2 media regression run: 30 passed.
- Batch 1 visibility + Batch 2 media + new checkout browser run: 13 passed.
- Final affected checkout browser rerun: 4 passed, including 320px checkout,
  order-first proof, immutable uncertain retry and admin WhatsApp operations.
- Targeted frontend ESLint, server syntax (152 JavaScript files), isolated Vite
  build and whitespace checks passed. Build output is ignored under test-results;
  it did not overwrite release artifacts or generate a production SEO export.
- Mobile checkout screenshot reviewed. A nested quote-total fixture exposed a
  summary display issue, corrected with a visible verified-amount assertion.
- Earlier focused failures were obsolete fixed-shipping/pre-order-proof/custom
  service assumptions, duplicate isolated fixture order numbers and browser
  label selectors. Tests were updated to the final policy without removing
  inventory/ownership/transaction/privacy assertions. Tracking fixtures retain
  generic customization coverage while quote-only services are blocked.

Final small-change verification: foundation + website analytics + media passed
47/47, including partial-payment email amounts, strict authorization before
idempotent replay and public/private cancellation explanations. The affected
checkout browser rerun passed 4/4 after the nested-totals correction. Final targeted
ESLint and isolated Vite build passed. The manifest contains 39 unique existing
paths (8 new, 31 modified). Whitespace checks passed; Git reports only its existing
LF-to-CRLF normalization notices.
Final stock-inspection labeling also exposes the immutable product/component
name and source identity to admins, preventing ambiguous return quantities.
The foundation suite passed 17/17 after that change; affected lint/syntax passed.

## Release blockers and configuration prerequisites

- Merchant-reviewed display/pricing/real inventory and variants remain required;
  no imported placeholder stock or unapproved product was approved here.
- Private `STORAGE_ENABLED` and R2 account/key/secret/private bucket settings need
  separately authorized provider testing. Allow direct PUT from the exact website
  origin with the existing signed headers; keep the private bucket inaccessible
  publicly. Preserve separate Batch 2 catalog bucket/credentials/media domain.
  Validate signature/copy/stream/retention/cleanup and guest/account ownership on
  the real topology before enabling ordinary InstaPay checkout.
- Owner must verify receiving destination 01060673073, agree bank/COD reconciliation
  procedures, unique COD receipt references, refund/return/coupon decisions and
  unpaid reservation review. No blanket no-refunds policy is implemented.
- Supporting email credentials/sender, verified safe-recipient tests, approved
  live-recipient settings and reliable job scheduling remain release work. This
  implementation did not enable or externally verify them. Automated owner
  alerts and 12-hour reminders remain outside this batch.
- Audit actual Render/Cloudflare values separately; repository defaults do not
  prove live configuration. `CHECKOUT_ENABLED` and `COMMERCE_LAUNCH_AUTHORIZED`
  remain off; dependencies must pass before either is changed. Leave indexing
  and marketing disabled until their separate consent/SEO activation gates pass.
- Run authorized full-stack release acceptance on the final deployed topology,
  including secure cookies/CSRF/CORS, R2, COD/InstaPay reconciliation and email.
  Browser tests here use API fixtures, while backend integration tests use real
  disposable MongoDB transactions; these do not prove live provider behavior.

Stop here for owner review. No Batch 4, deployment or production operation started.

## Exact Batch 3 file manifest

Some modified files already contained Batch 1/2 work; their earlier changes remain.
Ignored screenshots/build/test-runner artifacts are not application source changes.

New files:

- `client/e2e/checkout-foundation.spec.js`
- `client/src/commerce/OrderFinancials.jsx`
- `docs/BATCH_3_CHECKOUT_PAYMENTS.md`
- `server/src/commerce/accounting-validation.js`
- `server/src/commerce/order-accounting.js`
- `server/src/commerce/whatsapp-quotation.js`
- `server/src/models/OrderSettlement.js`
- `server/test/checkout-foundation.test.js`

Modified files:

- `client/src/admin/order-actions.js`
- `client/src/commerce/api.js`
- `client/src/pages/AdminCommercePage.jsx`
- `client/src/pages/AdminOrderPage.jsx`
- `client/src/pages/AdminWebsitePage.jsx`
- `client/src/pages/CartPage.jsx`
- `client/src/pages/CheckoutPage.jsx`
- `client/src/pages/OrdersPage.jsx`
- `client/src/pages/TrackOrderPage.jsx`
- `server/src/commerce/configuration.routes.js`
- `server/src/commerce/customization.js`
- `server/src/commerce/notifications.js`
- `server/src/commerce/order-presentation.js`
- `server/src/commerce/orders.js`
- `server/src/commerce/pricing.js`
- `server/src/commerce/promotions.js`
- `server/src/commerce/routes.js`
- `server/src/commerce/uploads.js`
- `server/src/commerce/uploads.routes.js`
- `server/src/config/schema.js`
- `server/src/email/templates.js`
- `server/src/models/DiscountRedemption.js`
- `server/src/models/NotificationEvent.js`
- `server/src/models/Order.js`
- `server/src/models/Upload.js`
- `server/src/website/service.js`
- `server/test/commerce-configuration-api.test.js`
- `server/test/commerce-configuration.test.js`
- `server/test/commerce-orders.test.js`
- `server/test/commerce-storage.test.js`
- `server/test/phase3-tracking.test.js`
