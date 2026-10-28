# Gift Box Builder V2 — Phase 5B.3: transactional checkout and orders

Implemented locally on `feature/gift-box-builder-v2`, 28 October 2026. The existing order engine now supports internal gift-only and mixed transactions. **Public/runtime gift checkout remains unconditionally disabled.** All successful gift purchases in verification use fresh disposable loopback replica sets and explicitly synthetic approved policies. No real policy, geometry, media or launch approval was granted.

## Exact Phase 5B.3 files

Created (13):

- `server/src/models/GiftBoxFulfillmentPolicyFence.js`
- `server/src/gift-box/checkout-guard.js`
- `server/src/gift-box/order-inventory.js`
- `server/src/gift-box/order-snapshot.js`
- `server/test/gift-box-order-inventory.test.js`
- `server/test/gift-box-order-presentation.test.js`
- `server/test/gift-box-checkout.test.js`
- `server/test/gift-box-order-tracking.test.js`
- `client/src/commerce/GiftBoxOrderDetails.jsx`
- `client/e2e/gift-box-orders.spec.js`
- `client/playwright.gift-box-orders.config.js`
- `client/connected-e2e/gift-box-order-contracts.spec.js`
- `docs/GIFT_BOX_BUILDER_V2_PHASE5B3.md`

Modified (18):

- `server/src/commerce/orders.js`
- `server/src/commerce/cart.js`
- `server/src/gift-box/cart-pricing.js`
- `server/src/config/schema.js`
- `server/src/commerce/routes.js`
- `server/package.json`
- `server/src/commerce/inventory.js`
- `server/src/commerce/order-accounting.js`
- `server/src/models/Order.js`
- `server/src/commerce/order-presentation.js`
- `server/src/tracking/service.js`
- `server/src/commerce/notifications.js`
- `server/src/email/templates.js`
- `server/test/helpers/connected-api-server.js`
- `client/src/pages/OrdersPage.jsx`
- `client/src/pages/AdminOrderPage.jsx`
- `client/src/commerce/OrderFinancials.jsx`
- `client/src/commerce/commerce.css`

Total: **31 source/test/config/report files**. Earlier uncommitted work is preserved. No dependency/lockfile, environment file, original artwork, asset manifest, authoritative geometry, Product inventory model, Cart model, builder admin settings API, public purchase control or production flag changed. Ignored `.cache/` helpers/logs, test databases, browser artifacts and isolated build output are verification evidence.

## Internal integration and the public fence

`prepareCheckout`, `placeOrder` and `checkoutQuote` retain their public signatures and use the same shared transaction implementation as the internal test workflow. Normal `quoteCart(..., { strict: true })` still rejects every cart containing `gift_box_v2` with `GIFT_BOX_CHECKOUT_DISABLED`, before pricing/consumption. Public request schemas reject injected capabilities, policies and allow flags. There is no alternate HTTP order route, public test bypass or runtime activation setting.

Successful synthetic workflow is available only through `prepareGiftBoxCheckoutForDisposableTest` and `placeGiftBoxOrderForDisposableTest`. They create a server-only capability registered in a private WeakMap and bound to the verified-format owner and current MongoClient. Every use rechecks `NODE_ENV` and runtime environment, local target, empty merchant/import URIs, exact loopback `tap_wrap_catalog_test` database and the disposable-target guard. Capability creation also verifies replica-set topology. A JSON object cannot forge this capability; changing owner, connection or environment invalidates it. Ordinary global checkout authorization remains required for a new internal purchase, enabled only in isolated fixture memory during successful tests.

The private checkout quote path reuses the existing cart/Phase 5B.1 quote preparation, aggregate stock validation and promotion engine. It creates executable builder inventory claims only after a valid internal capability. Public cart responses retain no executable gift claims, configuration hash, approval actors or placement details. Existing committed-order recovery remains owner/key/hash scoped and runs before reevaluating current flags, settings, prices, stock or policy. Recovering an already committed owned order performs no new purchase or stock operation.

The connected fixture entry point remains explicitly non-runtime and refuses merchant URIs/preload options. At startup it creates an Alice synthetic mixed order through these internal helpers, restores the requested fixture checkout setting, and exposes only its order ID for real customer/admin GET tests. Its HTTP purchase routes retain the public fence, including when synthetic policies and a prepared internal intent exist.

## Immutable order line contract

New ordinary snapshots explicitly use `kind: product`. Historical lines with no kind remain ordinary products, including existing legacy customization/quotation records. Unknown kinds fail new-order validation. A configured gift is **one** `kind: gift_box_v2` order line with completed-box quantity, configured unit price and line total; it has no fabricated Product identity or legacy component-charge rows.

`giftBoxOrderLine` prepares the strict `gift-box-order-v1` snapshot:

```js
{
  kind: 'gift_box_v2',
  name: 'Build Your Gift Box',
  quantity: 2,
  unitPricePiastres: /* one completed gift */,
  lineTotalPiastres: /* completed gift × quantity */,
  giftBox: {
    snapshotVersion: 'gift-box-order-v1',
    configuration, configurationId,
    components: [/* one row for each selected box/item/ribbon/card */],
    fulfillment: { policyReference, directCommerceEligible: true,
      physicalFitCertifiedByGeometry: false },
    inventoryClaims: [/* per-line builder source/mode/consumed amounts */],
    artwork: { status: 'unavailable' }
  }
}
```

The canonical configuration retains all supported contract/catalog/asset/geometry/draft versions, selected box/items/ribbon, optional card/message and per-instance arrangement tuples. Component rows save immutable names/units/categories, per-box and full-line quantities, unit prices, per-box and full-line subtotals, paid/complimentary approval mode, approval actor/time, loaded settings revision and independent inventory owner/mode/demand. Ribbon color is saved. Per-line consumed amounts are tracked demand for tracked stock, zero for Made to Order/status only.

The snapshot validator checks strict fields, canonical identity, exact selected identities/quantities, component/source/category agreement, approval modes, all safe-integer arithmetic, complete sum equality and matching policy/reference versions. Gift line quantity is 1–99; existing configuration/placement/message bounds remain. A card message is literal well-formed Unicode, capped at 500 code points through the existing strict configuration contract. Missing prices do not become free; explicitly approved complimentary zero remains supported.

`Order.lines`, totals and aggregate inventory claims retain their existing immutable storage behavior. State/accounting changes update only mutable fields and never rewrite purchase snapshots. Reading order DTOs uses allowlisted saved values and version-independent structural checks, not current business prices, stock, policy or catalog queries. Malformed historical gift details become an honest unavailable snapshot rather than crashing or exposing unrestricted Mixed data.

## Mixed pricing, payment and delivery

Ordinary products continue through existing eligibility/variant/customization pricing. Configured gifts use current approved builder settings. Every completed gift line contributes its authoritative line total once; component subtotals are not charged again as extra rows or legacy customization fees. Mixed-order promotions preserve Product-only bundle/code eligibility, qualification thresholds and allocation; gift merchandise is never discounted.

Checkout review fingerprints include canonical gift identity/configuration, completed quantity, full component prices/revisions/approval metadata, policy reference and policy content hash. Approval dates are serialized explicitly for fingerprinting. This catches equal-and-opposite component price changes even when the complete gift price is unchanged, and policy rule changes under the same visible ID/version. Any change requires a fresh review before a new order. Operational setting revisions also fence stock/mode/availability changes; a changed revision can require renewed review even if the displayed amount stays the same.

Any configured gift makes the website order personalized. It retains **InstaPay only** under the existing personalized-order policy; selecting COD fails with a gift-specific unavailable-method error, not a new quotation prerequisite. No new payment method or owner COD exception was granted. Orders use `orderChannel: website`, order-first proof submission, private owned proof, manual receiving-account/settlement reconciliation and existing refund safeguards. A screenshot alone never marks Paid. Free merchandise retains the existing explicit-zero accounting behavior.

Shipping/delivery remains a separate pending charge with null amount, and `shippingPiastres: null`. No fixed fee is reinstated, no missing delivery amount becomes zero, and no unknown fee is included in the merchandise total. Existing charge acceptance and dispatch/payment protections remain in force. The owner must separately approve any future different payment-method policy for builder orders; direct merchandise purchasing itself requires no manual quotation.

## Inventory aggregation and atomic consumption

Inventory handling is exhaustive:

| Claim kind | Source | Consumption |
| --- | --- | --- |
| `product` | Ordinary Product/variant | Existing tracked/Made-to-Order behavior and eligibility fences. |
| `component` | Existing legacy ComponentOption | Existing customization stock behavior. |
| `gift_box_component`, `tracked` | GiftBoxComponentSetting | Aggregate quantity, conditional numeric decrement and revision advance. |
| `gift_box_component`, `made_to_order` | GiftBoxComponentSetting | Availability/approval/mode/revision fence; no numeric decrement. |
| `gift_box_component`, `status_only` | GiftBoxComponentSetting ribbon | Exact available status-only/null quantity fence; no numeric decrement. |

Unknown kinds, invalid source identities, conflicting same-source metadata, unsupported modes and unsafe quantities fail closed instead of falling through to Product. Aggregate keys include source kind and variant. All configured lines share one builder demand map per component ID; per-box quantities are multiplied by completed-box line quantity first. Ordinary retail chocolate and builder chocolate remain completely separate even when names/SKUs/external IDs match. All 20 builder chocolate identities use the dedicated settings source, never Product stock or duplicate Product records.

Each builder conditional update checks loaded `__v`, enabled/manual availability, mode, exact approved price/approval actor/time and sufficient tracked quantity (or exact null ribbon quantity). Every mode advances `__v`, preventing stale admin drafts from restoring old stock/status. Tracked stock is decremented once by the aggregate amount. Returned aggregate claims record `consumedQuantity`: tracked requested amount or zero for nonnumeric modes. Per-line snapshots retain the corresponding immutable per-line evidence.

No inventory changes occur when adding to a cart. Consumption/restoration helpers require an active transaction and recheck the connected target before writes. Concurrent final-stock checkouts cannot both commit. A concurrent admin price/availability/mode edit conflicts with the order's conditional stock/revision write; retry re-quotes and fails/requires renewed review when appropriate.

## Transactional fulfillment-policy fence

An in-memory policy lookup alone cannot serialize a withdrawal against order commit. `GiftBoxFulfillmentPolicyFence` therefore stores only an operational box/policy ID/version/content-hash/status/revision boundary, with a unique box index. This record **cannot grant physical approval**: the quote must independently match a trusted reviewed policy, whose real registry is still empty.

Gift checkout reads the matching approved fence inside its snapshot, then conditionally increments its revision in the same transaction as inventory and the order. The predicate includes status, ID, version, hash and loaded revision. Withdrawal/content change before the fence causes conflict/retry and a closed revalidation; a withdrawal after the transaction obtains its write fence serializes after that accepted order. This is an actual database conflict boundary, not a visual-fit assertion or last-moment in-memory check.

Normal startup only verifies the new collection/index read-only when the builder backend is enabled. Model auto-create/index creation are disabled. No runtime caller creates fence records. Positive tests explicitly create/update them through `setGiftBoxCheckoutPoliciesForDisposableTest` after the exact disposable guard; withdrawal is likewise a guarded fixture operation. Real schema preparation, reviewed policy publication/withdrawal tooling, audit/release procedure and existing-order handling need separate authorization before deployment. No persistent schema initialization or policy publishing was performed here.

## Shared atomic order transaction and recovery

The existing transaction coordinates current prices and eligibility, aggregate ordinary/legacy/builder inventory, policy fences, the immutable order, allowed Product discounts/redemption, existing upload retention, consumed checkout intent, removed cart, notification outbox and sanitized tracking event preparation. Either all commit or all roll back. Existing snapshot/majority transaction settings, bounded public-number collision handling and driver retries remain.

The unique owner/checkout-key index and immutable normalized request hash remain the recovery boundary. Matching retries recover the saved order before touching current approval/stock; changed bodies conflict. Concurrent identical keys commit one order/consumption. A lost-response hook after commit verifies recovery after prices/policies change without a second stock deduction, order or charge. Concurrent cart mutations conflict with the transaction's Cart deletion and force another current quote, rather than silently omitting or ordering changed lines.

Only exact-target test hooks can inject failures/races at internal lifecycle boundaries. They are connection-bound, have no request/flag entry point and do not run for public calls. Tests use external admin changes before consumption and policy withdrawal before the policy fence; a late failure after stock/order/intent/cart/outbox/tracking work verifies complete rollback. No hook or test error authorizes ambiguous automatic payment/provider retry.

## Cancellation, inspected returns and restocking

Existing owner accounting operations and mutable order revisions remain authoritative. Early reviewed cancellation can restore unprepared tracked stock once; InstaPay cancellation still requires reconciliation of potentially received transfers. A prepared personalized gift is **not** assumed resellable. Prepared cancellation or returned/failed-delivery reconciliation requires explicit inspection and one actual resellable quantity per saved aggregate inventory claim, bounded by original consumption. Refunds and financial reductions remain separately reviewed ledger operations.

Only actually consumed tracked builder quantities return to their original component ID. Source absence, changed incompatible mode or numeric overflow requires `RESTOCK_REVIEW_REQUIRED`; no other pool receives the quantity. Original nontracked claims never create inventory, even if the merchant later changes modes. Made-to-Order/ribbon inspected inputs must be zero, and their UI fields are disabled at zero. Zero claims are still validated so an unknown source cannot be hidden by inspection input zero. The immutable consumed claim evidence is not rewritten by partial returns.

The existing once-only `restockedAt` boundary, transactional state/revision updates and inspection/audit history prevent duplicate restoration. Partial inspected quantities restore only those units. Ordinary Product/ComponentOption restoration keeps its existing behavior, with explicit source dispatch replacing the unsafe catch-all. No automatic expiration, automatic gift resale, refund promise or new cancellation policy was introduced.

## Customer/admin presentation and privacy

The existing order pages render a gift as one purchased item with completed quantity, immutable configured unit/line price, selected saved box, flower/plush/chocolate quantities, ribbon swatch/name, card selection and collapsed literal card message. A separate disclosure itemizes saved component prices and per-box/full-line subtotals. Ordinary product and legacy customization presentation remains intact.

Customer DTOs omit canonical identity/configuration, placements, approval actors and internal source claims. Admin DTOs add saved arrangement coordinates/regions/layers, policy identity/version, reference versions, original component settings revisions, approval metadata and inventory source/mode/consumption. Administrative restoration labels come from immutable saved component names, never current settings. Native disclosures, safe text rendering, private session queries and existing proof-on-explicit-View behavior remain.

Verified production artwork is unavailable, so both views use an honest preview placeholder. The saved arrangement list is visual metadata and explicitly does not certify physical fit. No Product media URL, local DEV asset path, storage key or public proof URL is fabricated. Tests exercise 320px, 390px, tablet and desktop widths, keyboard/private-message disclosures, inner detail reflow, inspection fields and no horizontal overflow/page errors. Real API tests verify Alice ownership, Bob/unrelated guest denial and admin access.

## Tracking and notifications

`orderMonetaryParameters` preserves complete merchandise value while supplying only genuine ordinary Product content IDs/contents; content counts describe that represented Product subset. Gift-only events contain EGP/value/payment method without fabricated catalog IDs. Unknown line kinds fail closed. Existing Product ObjectId validators are unchanged. Messages, configuration hashes, positions, source IDs and other private arrangement fields never enter tracking parameters.

InstaPay placement creates OrderSubmitted, not Purchase. Existing paid qualification, consent, unique order-based Purchase deduplication, browser acknowledgements and outbox recovery remain. Transactional tracking preparation is mandatory when verified applicable consent exists, so a transactional failure rolls back with the order. Optional consent lookup defaults to no unverified tracking on failure; optional post-commit record/receipt lookups and adapters cannot return a false failed-order response. Tests recover the same order/stock/Purchase after an optional receipt or consent lookup failure.

Customer notification snapshots use escaped saved gift summaries once per parent order line, with per-box component quantities and card-selection state. They omit the private message, canonical identity and placements. Existing bounded summary sizes, durable event keys, recipient allowlists, Gmail/backend credentials, leases/retries and ambiguous-SMTP review remain. No live provider call, worker apply or notification activation was performed.

## Verification and actual results

All positive order workflows use new disposable loopback MongoDB replica sets. Browser tests use intercepted APIs or the guarded real local API fixture; only external storage is mocked where needed. No developer credentials or merchant database is used.

| Working directory / command | Actual result |
| --- | --- |
| `server`: `npm.cmd test` | **762 passed**, zero failed, skipped or cancelled. Includes ordinary commerce regressions and the new inventory, checkout, snapshot and tracking suites. |
| `server`: `npm.cmd run check` | **230 JavaScript files passed** syntax checks. |
| `client`: `npm.cmd run test:contracts` | **18 passed**, all **5/5** isolated per-file fixture batches, clean API/database shutdown. |
| `client`: `npm.cmd test -- --output test-results-gift-box-phase5b3-legacy --reporter list` | **377 passed**, zero failures, original command exit 0 after completed-server cleanup. |
| `client`: `npm.cmd test -- --config=.cache/playwright-gift-box-phase5b3-verify.config.js` | **59 passed**: prior builder/cart regressions plus the nine new order cases, on isolated port 5193. |
| `client`: same isolated browser config with `--grep='customer purchased mixed order\|admin purchased mixed order' --output=test-results-gift-box-phase5b3-orders-final` | **8 passed** at 320px, 390px, 768px and 1440px; corrected full-page screenshots reviewed. These repeat the presentation cases, rather than adding distinct coverage. |
| `client`: `npm.cmd run lint` | **Passed**, exit 0, after completed browser teardown. No lint configuration or rules were changed. |
| project root: `node server/.cache/phase5b3-client-build.mjs` | **Passed**, Vite production build of **1,810 modules** plus offline SEO generation: **22 routes**, **zero indexable**, checkout offers disabled. |
| project root: `git diff --check` | Passed; Git's existing LF/CRLF conversion notices are informational. |

The ignored build helper invokes the same Vite production build and SEO generator as `npm run build`, with an allowlisted OS-only environment, no dotenv loading, loopback API, tracking/indexing/builder flags disabled and no publication input. It writes to `client/test-results-gift-box-phase5b3-build/`, preserving the existing `client/dist/`. It neither reads a merchant database nor publishes output.

The full browser run and 59-case combined gift run overlap in the nine order cases: **427 distinct browser cases passed**, plus 18 connected API/browser cases. The extra eight screenshot cases repeat existing coverage. No failing test was skipped or removed.

Evidence logs are under `server/.cache/`: `phase5b3-backend-final.log`, `phase5b3-syntax.log`, `phase5b3-connected-full.log`, `phase5b3-client-legacy.log`, `phase5b3-client-lint.log` and `phase5b3-client-build.log`. Browser artifacts are under `client/test-results-gift-box-phase5b3-legacy/`, `client/test-results-gift-box-phase5b3-combined/` and `client/test-results-gift-box-phase5b3-orders-final/`. The dedicated tracked order-only runner is `client/playwright.gift-box-orders.config.js`; the ignored combined runner changes only isolated port, test selection and fixture-only builder visibility.

Initial focused transaction tests had two assertion mismatches: immutable-line saving correctly rejected a tamper, and gift COD correctly returned its dedicated unavailable-method code. The assertions were aligned to those required protections; no guard was relaxed. An initial UI selector matched a duplicate hidden component name and was narrowed to the intended visible detail. A subsequent review found that a pre-placement optional consent lookup could block recovery of a committed order; it now denies unverified tracking while permitting normal recovery, with a new HTTP regression. A separate same-ID/version policy-content test verifies that a changed hash still requires renewed review.

The first full-page screenshots captured a sticky header after a disclosure had scrolled into focus. Screenshot setup now scrolls to the top before capture; all eight responsive presentation cases were rerun successfully. No application behavior or assertion was removed. On Windows, the isolated port-5193 and default port-5191 runs completed their assertions but Vite's process teardown lingered. Only each verified run's owned Vite listener was stopped after all cases completed and no test worker remained; the original commands then exited successfully. Default-run cleanup needed read/stop escalation because sandboxed CIM access was denied; a PowerShell `Stop-Process` internal error was resolved by terminating only the same verified PID with `taskkill`. No running test worker, unrelated listener, runtime guard or rate limit was bypassed.

## Remaining launch blockers and recommended Phase 5B.4

Public gift checkout is still closed independently of global checkout flags. The real fulfillment registry remains empty for all 12 boxes. Actual policy review, conservative compatibility/capacity/Box 11 compartment rules, authoritative geometry, BOX-1 corrected artwork approval and verified deployable media remain missing. No photo-based geometry was approved. Real inventory/settings and media/provider/operational configuration still need separately authorized review; no persistent provisioning, production MongoDB operation, R2 upload, deployment, commit, push or merge occurred.

The recommended Phase 5B.4 is a bounded release-readiness and approval workflow: finalize and review real physical policies, immutable publication/withdrawal versioning and fence/audit operations; review source-aware cancellation and financial operations with the owner; approve actual media/geometry and payment-method policy; and verify guarded staging end to end under a new explicit authorization. Add operational recovery/withdrawal runbooks and a reviewed migration/schema plan before any deployable rollout. Preserve the public fence until those approvals and a separate public-launch instruction exist. This phase stops for review with internal transaction integration complete.
