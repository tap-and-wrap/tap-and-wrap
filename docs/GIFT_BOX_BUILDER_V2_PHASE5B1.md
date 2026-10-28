# Gift Box Builder V2 — Phase 5B.1: Launch B commerce foundation

Implemented locally on `feature/gift-box-builder-v2`, 28 October 2026. This phase supersedes the earlier proposed V2 quotation direction: the intended destination is a normal mixed cart and direct website order. Legacy gift-box and engraving requests retain their existing contracts. No cart/order persistence or public ordering is added here.

## Exact Phase 5B.1 files

Created:

- `shared/gift-box/commerce-contract.mjs` — direct-commerce/version/visual-reference constants.
- `server/src/gift-box/commerce-contract.js` — strict configuration validation and canonical identity.
- `server/src/gift-box/fulfillment-policy.js` — strict policy contract, empty real policy registry and pure compatibility validator.
- `server/src/gift-box/commerce-quote.js` — pure saved-settings quote preparation and independent builder inventory requirements.
- `server/test/gift-box-commerce-contract.test.js` — strict payload and identity cases.
- `server/test/gift-box-fulfillment.test.js` — isolated policy, compatibility and compartment cases.
- `server/test/gift-box-commerce-quote.test.js` — arithmetic, quantity, inventory, approval and legacy-compatibility cases.
- `docs/GIFT_BOX_BUILDER_V2_PHASE5B1.md` — this implementation and integration contract.

Modified from the preserved Phase 4 working tree:

- `server/scripts/lib/gift-box-initial-settings.js` — corrected create-only initial prices and provisioning version.
- `server/test/gift-box-inventory.test.js` — corrected expected prices, null-setting preservation and actual independent Product/builder inventory fixtures.
- `server/package.json` — adds the three new suites to `test:giftbox`; the default test runner already discovers them.

Earlier uncommitted work is preserved. No client source, dependency/lockfile, Product/Cart/Order/ServiceRequest model, route, authoritative geometry, asset manifest, source artwork, `.env` or launch setting is changed by this phase. Logs, disposable fixtures and the isolated build helper/output are ignored verification artifacts.

## Direct-commerce configuration contract

`giftBoxV2CommerceInput` validates the following strict object. This example describes structure only; it does not approve a real layout or component availability.

```json
{
  "kind": "gift_box_v2",
  "contractVersion": "gift-box-commerce-v1",
  "catalogVersion": "gift-box-v2.3",
  "assetVersion": "2026-10-28.2",
  "geometryVersion": "gift-box-geometry-v1-draft",
  "draftGeometryVersion": "gift-box-photo-study-2026-10-28.1",
  "coordinateSystem": "normalized-scene",
  "selection": {
    "boxId": "box-2",
    "items": [{ "componentId": "rose-red", "quantity": 1 }],
    "ribbonId": "ribbon-navy",
    "giftCard": { "componentId": "gift-card-1", "message": "For you" }
  },
  "placements": [{
    "instanceId": "10000000-0000-4000-8000-000000000001",
    "componentId": "rose-red",
    "x": 0.5,
    "y": 0.5,
    "zone": "inside",
    "regionId": "customer-visual-trace",
    "layer": 0
  }]
}
```

The implementation's shared version constants are authoritative; every version field must equal its supported literal. Geometry metadata never adopts draft polygons as approved physical geometry. The scene reference remains `{ x: -0.05, y: -0.03, width: 1.5, height: 1.12 }`; placement x/y are finite normalized coordinates in `[0,1]` against that scene. Layer is an integer from 0 through 1,000. A bounded region identifier is only visual metadata until explicitly allowed by a trusted fulfillment policy.

Exactly one recognized box and one recognized ribbon are required. `items` defaults to an empty array and permits only recognized individual roses, plush toys and complete chocolate retail units. Each component occurs once with an integer quantity from 1 through 100; there are at most 100 item lines and 200 additional units. These are computation/abuse limits, never packing capacities. Gift card defaults to null; a selected recognized card defaults its message to an empty string. Card text preserves the existing 500-Unicode-code-point limit, well-formed Unicode and control-character restrictions, with ordinary tabs/newlines allowed. Text is literal customer text.

Each selected rose, plush or chocolate unit requires exactly one placement of the matching identity. Instance UUIDs must be distinct, including case-equivalent UUIDs. Box, ribbon and card do not receive placements. Only plush may use `beside`; a policy may restrict it further. Duplicate item lines, missing/extra/mismatched placements, unknown IDs, wrong categories, invalid quantities, unsupported versions and unknown fields at every object level are rejected. Browser amounts, stock/approval assertions, configuration hashes, fulfillment policies, customer/contact details and request keys cannot enter this configuration.

This contract does not reuse or extend the `kind: gift-box-v2` / `gift-box-request-v2.1` ServiceRequest contract. No new HTTP endpoint or customer submission is registered. The old V2 request endpoint remains unconditionally closed.

## Canonical configuration identity

`canonicalizeGiftBoxConfiguration(raw)` validates and freezes an explicit normalized object. It sorts item lines by component ID and placements by complete tuples of component ID, zone, region, x, y and layer. It normalizes omitted supported defaults and negative zero. It preserves the exact gift-card message, including whitespace and Unicode; no customer text is trimmed or silently rewritten.

Placement UUIDs are editing handles. They are replaced, after complete tuple sorting, by deterministic valid UUIDs. Regenerating handles or permuting arrays therefore produces the same canonical configuration. A component's position/zone/region/layer stays associated with that component; swapping different components' positions changes identity. Multiplicity is retained even when two identical units occupy the same coordinates. Canonical output can be validated and canonicalized again without changing it.

`identifyGiftBoxConfiguration(raw)` returns `{ configuration, configurationId }`. The ID is `gift-box-configuration-v1:<sha256>` over the identity-version prefix and deterministic canonical JSON. Changes to selections, card selection/message or supported arrangement fields remain distinct. Contract/catalog/asset/geometry reference versions are part of the meaning and identity. Quantity of identical completed boxes is outside configuration identity.

Stock quantities, live prices, setting revisions and fulfillment approval are excluded from permanent configuration identity. `quoteId`, described below, is a separate current quote fingerprint. A hash is an equality key, not an authorization token or secrecy mechanism; do not publish it to tracking or logs containing customer text. Future merging should compare the server-derived canonical configuration as well as its versioned hash.

## Approved initial prices and create-only provisioning

| Category | EGP per unit | Integer piastres | Initial inventory |
| --- | ---: | ---: | --- |
| Every box | 200 | 20,000 | Tracked, 10 each |
| Every plush toy | 500 | 50,000 | Tracked, 10 each |
| Each individual rose/color | 30 | 3,000 | Tracked, 50 per color |
| Every complete chocolate retail unit | 100 | 10,000 | Tracked, 10 each |
| Every ribbon | 50 | 5,000 | Status only; null numeric quantity |
| Gift card | 50 | 5,000 | Tracked, 10 |

The explicit plan version is now `gift-box-owner-initial-2026-10-28.2`, still pinned to the existing 74 recognized identities. These values exist only in the provisioning script library. Runtime pricing has no import of that library and no starting-price fallback.

`npm.cmd run giftbox:settings:plan` remains an offline no-connection plan. Applying still requires the existing explicit non-production target, write authorization, verified current administrator, prepared schema and guarded transaction-capable local/staging database. No persistent apply or schema preparation was run.

Every existing setting is skipped completely, even an existing chocolate/ribbon with null price. No name, approval, timestamp, revision, availability, mode or quantity is backfilled. Repeating a successful provision produces no changes or extra audit event. The updated version identifies newly created settings only; it does not migrate version-.1 records. Existing admin name/price/order/availability/quantity/mode editing and revision conflicts remain unchanged.

## Pure server-authoritative quotes and inventory isolation

`prepareGiftBoxV2CommerceQuote({ configuration, quantity = 1 }, savedSettings, { fulfillmentPolicy })` accepts a strict quote envelope; completed-box quantity is an integer from 1 through 99. `savedSettings` must be one coherent server-loaded snapshot of existing business settings, with unique identities. Selected settings require saved names/revisions, enabled/manual availability, internally consistent paid or explicitly complimentary pricing, valid approval actor/date and valid inventory. The policy argument is trusted server input, never a browser payload field.

The function reuses `calculateEstimate`, `approvedPrice`, guarded piastre multiplication/addition and the existing inventory validator. Each component records its saved name/unit, quantity per box, quantity for the whole cart line, saved unit price, per-box subtotal, full-line subtotal, approval mode, setting revision and inventory requirement. A single completed-box `unitPricePiastres` is the sum of its component subtotals. `lineTotalPiastres` multiplies that amount by completed-box quantity exactly once. All money uses safe nonnegative integer piastres; unsafe prices, multiplication and sums fail closed. Approved complimentary zero remains valid; missing price never means free.

Inventory ownership is always `GiftBoxComponentSetting`, keyed by immutable builder component ID. This expressly includes chocolate. Ordinary retail KitKat and a builder KitKat have independent allocated pools even when names/artwork match or an ordinary Product SKU resembles a builder ID. Neither a name match nor a stock change creates a relationship. No Product records are created for builder components. The isolated database regression gives the ordinary Product a matching name and external ID/SKU equal to the builder component ID, and verifies changes in either pool leave the other unchanged. Builder settings have no SKU-based stock relationship.

| Builder mode | Full-line validation | Prepared tracked demand |
| --- | --- | ---: |
| `tracked` | Saved quantity covers component quantity per box × completed-box quantity | Multiplied quantity |
| `made_to_order` | Enabled, priced and manually available; no numeric stock ceiling | 0 |
| Ribbon `status_only` | Available, exact status-only mode and null numeric quantity | 0 |

The quantity multiplication applies to boxes, roses, plush, complete retail chocolates and cards. Ribbons are priced per completed box but never consume numeric stock. No preparation reserves, decrements, synchronizes or restocks anything. Output requirements are descriptive and are deliberately **not** executable claims for the existing inventory handler.

The returned object is deeply frozen. It includes the canonical configuration, current component snapshots, policy reference, separate `quoteId`, EGP currency, delivery `{ status: pending_confirmation, pricePiastres: null }` and promotion exclusion. The quote fingerprint covers the constructed current quote including configuration ID, quantity, item prices/revisions and policy reference; it is neither a signed price guarantee nor a checkout/idempotency credential. Future checkout must load current settings/policy again.

Missing, pending, withdrawn or incompatible fulfillment policies cause quote preparation to fail. Existing nonbinding component estimates remain available under their old contract. Even an isolated approved-policy quote reports `directCommerceEligible`, `addToCartAllowed`, `checkoutAllowed`, `physicalFitCertified`, `inventoryReserved` and `inventoryDeducted` as false. Existing geometry/artwork blockers plus `GIFT_BOX_V2_DIRECT_COMMERCE_DISABLED` remain explicit. No carts, orders, intents, uploads, requests, payment calls or notifications are created.

## Fulfillment policy contract and validator

`giftBoxFulfillmentPolicyInput` is strict and versioned as `gift-box-fulfillment-policy-v1`. A policy contains:

- `policyId`, `policyVersion`, one recognized `boxId`, and exact current catalog/asset/geometry/draft reference versions.
- `status: pending | approved | withdrawn`, explicit `approvedBy`, `approvedAt`, `withdrawnAt`; active approval requires review metadata and no withdrawal.
- Distinct regions `{ regionId, zone, compartmentId }`, each inside/beside permission explicit; only inside regions can refer to one known compartment.
- Distinct compartments `{ id, maxUnits }` and per-component rules `{ componentId, maxQuantity, allowedRegionIds, oversizedPlush, allowOversizedInside }`. Ribbons/cards require an explicit compatibility rule but no placement regions.
- Required overall and flower/plush/chocolate count limits plus reviewed mixed-category sum limits. Mixed rules apply when at least two listed categories are present.

`assertGiftBoxFulfillment(configuration, trustedPolicy)` reparses configuration, validates policy and checks selected box, every selected component (including finishing choices), component limits, total/category/mixed limits, region/zone permissions, oversized plush restrictions and compartment counts. No rule is inferred from names, images, draft footprints or dimensions.

Box 11 policies require exactly two distinct compartments, each with its own inside region. Every inside region belongs to exactly one compartment. Each placement has one approved region and counts against that region's compartment. Shared/unassigned inside regions, unknown bridge aliases, extra multi-region fields and disallowed compartment associations fail. These checks prevent unauthorized association/bridging descriptions; they cannot establish whether an actual item's footprint bridges the physical wells. Dimensions, orientations, clearances and conservative packing restrictions still require owner review. Coordinates never certify fit.

The real `GIFT_BOX_FULFILLMENT_POLICIES` registry is frozen and empty; `getGiftBoxFulfillmentPolicy` therefore returns null for every real box. Positive policies exist only in isolated tests. An approved-policy validator result means compatibility with those explicit rules, with `physicalFitCertifiedByGeometry: false`; it cannot activate public commerce. Versioned policy storage/editing, concurrency fencing and the rollout of actual reviewed policies remain future work. Withdrawal must cause fresh cart/checkout validation to fail, while historical snapshots remain immutable.

## Future mixed-cart and order integration — design only

All integrations below require a subsequent authorization. None is implemented here.

| Existing integration point | Required later behavior |
| --- | --- |
| `server/src/models/Cart.js` | Add an explicit strict line-kind union: `product` or `gift_box_v2`. Missing historical kind means `product`. Product fields remain required only for products; do not invent a Product ObjectId for a builder line. A gift line stores one canonical configuration, server identity and completed-box quantity, never client-authoritative amounts. |
| `commerce/routes.js`, `cart.js`, `pricing.js`, `pricing-context.js` | Parse discriminated add inputs and dispatch pricing by kind. Product lines retain the current product/customization path. Resolve selected builder settings plus current trusted policy from one bounded coherent read/session, then use this quote foundation. Bound line/cart payload size as well as the existing 30 lines per cart and 99 units per line. Safe-sum both line kinds once; keep errors associated with their line. Product URL/image helpers must only receive product lines. |
| Add and quantity update | One completed gift box becomes one configured line. Different identities remain distinct. Merge only within the verified same owner, same line kind, same identity version/hash and equal canonical configuration; validate the proposed combined quantity and aggregate cart demand against current saved settings/policy before saving. Configuration is immutable on quantity updates; an edit creates/replaces a separately validated configuration. Never merge using a browser hash or a price. |
| Guest merge | Preserve the existing verified guest/customer ownership transaction, upload transfer, cookie rotation, session generation and bounded retry behavior. Resolve/revalidate builder configurations under the receiving owner, merge only the same canonical configuration and validate aggregate demand across both carts. Report invalid/skipped lines honestly; never transfer solely by phone or return a stale other-owner response. |
| `commerce/promotions.js` | Exclude builder lines from bundles, coupons, eligible subtotal/threshold calculation and discount allocation until a reviewed builder discount policy exists. Product promotions can continue over their eligible product partition. Sum discounted product merchandise plus undiscounted gift merchandise once; mixed totals must never duplicate the component subtotal. |
| `commerce/orders.js`, `CheckoutIntent` | Preserve both launch flags, owner-bound checkout keys, immutable request retries, current quote review, expiry, unique owner/key index and unknown-outcome recovery. Digest explicit kinds, canonical configurations, quantities, current price snapshots and policy references. A changed price/approval/policy demands a refreshed reviewed quote. Recover an already committed order before new validation/stock operations; a retry must not consume stock or charge again. |
| `commerce/inventory.js` | Add exhaustive source handling before introducing gift claims. Current code treats every kind except `component` as Product, so passing a builder kind to it now would be unsafe. Aggregate ordinary demand by Product/variant independently, existing customization demand by ComponentOption, and builder demand by GiftBoxComponentSetting/component ID across **all** configured lines. Distinct source kinds must never coalesce by name/SKU or ID string alone. Reject unknown kinds instead of falling through. |
| Atomic checkout stock | In the existing guarded transaction, revalidate all prices, availability, modes, policy/version/withdrawal and product/category approvals; use conditional saved revision/mode/approval/quantity predicates and increment builder settings revisions so stale admin forms conflict. Tracked builder demand uses atomic `quantity >= summed demand` decrements once. Made to Order uses no numeric decrement but still requires an availability/approval fence. Ribbons use status-only availability fences and no numeric decrement. Ordinary Product inventory remains on its existing path. Inventory, order, discount usage, upload retention, intent consumption, cart removal and outbox events must all commit or all roll back. Add races involving multiple different gift configurations sharing one component. |
| Order snapshots and display | Persist one immutable `gift_box_v2` line with canonical configuration/identity, completed-box quantity, item quantities/names/units/prices/subtotals, line total, chosen ribbon/color, literal card message, arrangement metadata, policy reference and source-specific consumed inventory claims. Preserve reference versions and the visual-only/physical-policy distinction. No live setting edits may rewrite that record. Extend allowlisted customer/admin DTOs, customer order pages and existing admin dashboard to render the new kind without Product assumptions or legacy quotation/base-charge rows. Private messages remain owned customer/admin data. |
| Cancellation/restocking | Extend `restockInventory` **and** the current cancellation/return reconciliation services and admin claim labels for the independent builder source. They currently assume Product/ComponentOption claim sources. Preserve once-only restock markers, per-claim inspected resellable quantities after preparation, partial returns and review of potentially received transfers/refunds. Restore only actually consumed tracked builder quantities to the original independent source; never restore Made to Order or ribbon numeric stock, never duplicate a restoration and never alter historical claims. Missing sources or changed modes require explicit review. Advance admin revisions on operational stock writes. |
| Payments and delivery | Retain accounting-version-1 immutable merchandise totals, allowed payment methods, InstaPay proof ownership/manual receiving-account reconciliation, append-only settlements and refund review. Delivery remains a separate pending charge agreed after order creation; do not reinstate historic fixed shipping rates or include unknown fees as zero. Gift-box direct purchase does not imply COD authorization: explicitly review how it inherits the existing personalized-order InstaPay restriction before integration. No quotation prerequisite is added for builder merchandise. |
| Notifications | Reuse the existing transactional order outbox and safe immutable line snapshots, with bounded/ambiguous SMTP handling unchanged. Templates must render both line kinds as escaped text, itemize the configured box once and keep delivery pending. No messages/files/private arrangement text go into audit or tracking. No worker sends are authorized by this phase. |

### Tracking and post-commit response safety

`tracking/service.js:monetaryParameters` currently requires every content ID to be a 24-hex Product ID and falls back to `line._id`. `sanitizeParameters` imposes the same ID assumption. The cart AddToCart callback in `commerce/routes.js` builds parameters **before** its protected `captureAction` call and resolves a Product URL; `addCartItem` invokes that callback after the cart transaction. A gift line passed through unchanged could therefore commit successfully and then fail its response. Order tracking builds product-shaped parameters inside the transaction, while order response/receipt paths run again after commit. These paths all need deliberate integration.

The recommended initial mixed-cart policy is to omit builder content IDs/contents and any builder AddToCart receipt until the owner approves a public builder tracking namespace. For mixed checkout/order events, keep the approved aggregate merchandise value and payment method, include only genuine Product content IDs/contents, and treat product-content counts as the represented subset. Builder-only events can use approved aggregate monetary parameters without inventing a Product ID. Review this value/content distinction with the tracking policy before release; do not put component IDs, configuration hashes, messages, positions or private data into Meta payloads.

Implement one kind-aware sanitized server event adapter and validate its result before dispatch. Both the parameter construction and optional receipt path must be covered by failure isolation; a post-commit tracking failure returns a successful commerce response with an omitted receipt, never a false mutation failure. Required durable Purchase events must preserve existing transaction/deduplication/consent-revocation/acknowledgement semantics. Add explicit tests for tracking enabled/disabled, refusal, malformed optional tracking, builder-only and mixed lines, a lost response and identical retry: the order/cart result must remain recoverable and no Purchase may duplicate. Do not globally relax Product-ID validation to accept arbitrary strings.

## Verification and evidence

All backend database fixtures use the existing environment-scrubbed runner and fresh disposable loopback replica sets. Browser fixtures use their own Vite server on 5191 and isolated APIs. No merchant database or live provider is used.

- New configuration/identity suite: `node scripts/run-tests.js test/gift-box-commerce-contract.test.js` — **10 passed**.
- New fulfillment suite: `node scripts/run-tests.js test/gift-box-fulfillment.test.js` — **10 passed**.
- Updated inventory/provisioning suite: `node scripts/run-tests.js test/gift-box-inventory.test.js` — **13 passed**.
- New quote suite after saved-metadata hardening: `node scripts/run-tests.js test/gift-box-commerce-quote.test.js` — **12 passed**.

| Final command/check | Actual result |
| --- | --- |
| `server/npm.cmd test` | **668 passed**, 0 failed/cancelled/skipped; includes all new suites and existing engraving, personalization, requests, checkout, inventory and historical-order regressions. |
| `server/npm.cmd run check` | Passed for **217 JavaScript files** after the final edit. `node --check shared/gift-box/commerce-contract.mjs` also passed. |
| `server/node scripts/provision-gift-box-settings.js` | Offline plan passed: 74 settings, version `.2`, `connected: false`, `writes: false`, existing policy `skip-without-modification`. |
| `client/npm.cmd run lint` | Passed. No client source changes. |
| `client/npm.cmd test -- --config playwright.gift-box-phase4.config.js --output test-results-gift-box-phase5b1 --reporter dot` | **39 passed**, 0 failed; existing builder/admin behaviors at 320/390/768/1440 widths, overflow, controls, stock/mode edits, conflicts, geometry blocking, touch/keyboard and reduced motion. |
| `client/npm.cmd run test:seo` | **64 passed**, 0 failed/skipped. No metadata/exporter/Worker source changes. |
| Isolated production Vite build + `writeSeoOutput` | Passed, **1,806 modules**, confirmed child exit 0. Outputs **22 noindex routes**, 0 indexable routes, checkout offers disabled; no DB connections or publication inputs. Existing `client/dist` is preserved. |

The isolated build uses ignored `server/.cache/phase5b1-client-build.mjs`: it scrubs inherited merchant variables, disables dotenv through the existing Vite isolated setting, invokes the same Vite build and SEO generation APIs as the npm build script, sets production compilation explicitly, and writes only `client/test-results-gift-box-phase5b1-build/`. The first verification wrapper compiled and generated SEO but returned an inconsistent shell exit after a Vite chunk warning; it used a test-mode React build. The corrected wrapper uses production compilation, separate output and an explicit recorded child status; the final run exits 0 without that chunk warning. No application setting or build source was changed for this correction.

The browser assertions completed but Windows Playwright teardown waited on its own Vite process, a previously documented local issue. The exact current test process/parent/port command was reverified, only that Vite process was stopped, and the original command then exited 0 with **39 passed**. No test assertions, rate limits, timeouts or runtime guards were bypassed. The default full legacy browser suite and real-API connected cart suite were not rerun: client/cart/checkout integration is unchanged. These focused browser results do not establish real-device or live-provider readiness.

Evidence is under ignored `server/.cache/phase5b1-backend-final.log`, `phase5b1-client-giftbox.log`, `phase5b1-client-seo.log`, `phase5b1-client-build-final.log` and `client/test-results-gift-box-phase5b1/`. The first complete backend run passed 667 tests; the final 668 includes the added malformed saved-metadata case, so these are not additive totals.

The 320px and 1440px finishing screenshots were also visually inspected: the existing logo, white-led layout, ribbon/card controls and preview-only warning remain readable, with no horizontal overflow. Displayed prices/names are explicitly isolated API fixtures, not merchant settings. `git diff --check` passed; the runtime source search found no provisioning-library imports. No commit, push, merge, deployment, persistent provisioning/migration, production database operation, R2 upload, real payment, provider send or public checkout activation was performed.

A one-off Node inline whitespace check failed because Windows PowerShell removed its nested quotes. The equivalent native PowerShell check then passed for all new source/test/document files; this was a verification-command quoting error and made no application changes.

## Remaining owner approvals and limitations

All 12 real boxes lack reviewed fulfillment policies. Owner review must supply conservative compatibility/count rules, inside/beside permissions, oversized plush restrictions and Box 11 compartment assignments/clearance evidence. No physical dimensions or capacities were invented. Authoritative geometry remains unapproved, and the BOX-1 correction candidate is neither adopted nor approved. Approved physical policies, geometry and separately verified deployable artwork must be reviewed together before public acceptance.

Initial prices are approved as listed; existing saved null/unapproved prices still require explicit admin edits or a separately authorized reviewed operational procedure. Persistent provisioning, policy publication/storage, database/schema work, public media, mixed-cart checkout integration, builder payment-method treatment, promotions, tracking policy and production launch remain separate authorizations. Cart quantities and inventory requirements here are pure calculations, not a checkout reservation or persistent order snapshot.

## Recommended Phase 5B.2

Implement the bounded mixed-cart foundation next under a new authorization: strict backward-compatible line kinds, kind-aware server cart repricing, configured line persistence/add/update/remove, safe same-configuration merging, owned guest merge, cross-line builder-demand validation and matching cart display. Keep checkout/public builder activation closed while that work is fixture-tested. Include kind-aware URL/promotion/tracking adapters at the first point gift lines can enter a cart so a successful add cannot fail after commit.

Then separately authorize checkout transaction/stock consumption, immutable mixed order snapshots, source-aware cancellation/restocking, admin order rendering, payment/delivery/notification integration and race/idempotency tests. Real physical policies and artwork/geometry approvals remain prerequisites for public direct commerce; no phase designation alone opens ordering.
