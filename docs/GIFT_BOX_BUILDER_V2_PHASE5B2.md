# Gift Box Builder V2 — Phase 5B.2: mixed shopping cart integration

Implemented locally on `feature/gift-box-builder-v2`, 28 October 2026. Existing uncommitted Phases 1–5B.1 work is preserved. This phase adds configured-gift cart persistence and presentation, with real fulfillment policies still absent and gift-box checkout unconditionally blocked. It does not implement gift-box order placement or stock consumption.

## Exact files changed in this phase

Created (10):

- `server/src/commerce/cart-contract.js`
- `server/src/gift-box/cart-pricing.js`
- `server/test/gift-box-cart-contract.test.js`
- `server/test/gift-box-cart.test.js`
- `server/test/helpers/gift-box-cart-fixtures.js`
- `client/src/commerce/GiftBoxCartSummary.jsx`
- `client/src/gift-box/commerce-payload.mjs`
- `client/e2e/gift-box-cart.spec.js`
- `client/playwright.gift-box-cart.config.js`
- `client/connected-e2e/gift-box-cart-contracts.spec.js`

Also created: `docs/GIFT_BOX_BUILDER_V2_PHASE5B2.md` (this report).

Modified (15):

- `server/src/models/Cart.js`
- `server/src/commerce/cart.js`
- `server/src/commerce/pricing-context.js`
- `server/src/commerce/promotions.js`
- `server/src/commerce/routes.js`
- `server/test/helpers/connected-api-server.js`
- `server/test/product-addresses.test.js` — uses a valid opaque guest owner in its existing read-only presentation fixture; assertions unchanged.
- `server/package.json`
- `client/src/pages/CartPage.jsx`
- `client/src/commerce/CartContext.jsx`
- `client/src/commerce/commerce.css`
- `client/src/pages/GiftBoxBuilderPage.jsx`
- `client/src/pages/AuthPage.jsx`
- `client/playwright.config.js`
- `client/scripts/run-contract-tests.js` — default command gives each connected specification a fresh guarded fixture; explicit selectors retain the existing lifecycle.

Total: **26 source/test/config/report files**. No dependency/lockfile, environment file, source artwork, asset manifest, authoritative geometry, Product/Order/ServiceRequest model, inventory-consumption/restocking service, payment/notification provider or checkout launch flag changed. Ignored `.cache/` wrappers/logs, disposable databases and test/build artifacts are verification evidence, not application changes.

## Cart contracts and persistence

Cart requests now use a strict Zod discriminated union. Unknown kinds and cross-kind fields are rejected. Only an absent kind is normalized to historical `product`; null, an empty string or a misspelled kind is not a product fallback.

Ordinary product request:

```js
{
  kind: 'product', // optional for backward compatibility
  productId: '<Product ObjectId>',
  quantity: 1,
  // Existing optional operationKey, variantKey, personalization and customization.
}
```

Configured gift request, using the existing `POST /api/v1/commerce/cart/items`:

```js
{
  kind: 'gift_box_v2',
  operationKey: '<stable UUID>', // required for configured gifts
  configuration: { /* strict Phase 5B.1 gift-box-commerce-v1 object */ },
  quantity: 1 // completed identical gift boxes, integer 1–99
}
```

The configuration retains its exact supported catalog/asset/contract/geometry/draft reference versions, selected box, individual quantity lines, required ribbon, optional card/message and individual placements. Phase 5B.1 validation and canonical identity remain authoritative. Browser prices, totals, configuration hashes, policy/approval data, Product fields and unknown fields cannot be included. Validated serialized configuration is bounded to **65,536 UTF-8 bytes**, in addition to the existing 100 KB JSON request limit, 30 cart lines, 99 completed units per line, bounded selections/placements and 500-Unicode-code-point card message limit.

Mongoose uses strict embedded line discriminators. The base preserves historical Product fields and absent-kind rows; explicit product lines use the same product behavior. Only products require a Product ObjectId. Gift lines have no fabricated Product identity or product-only fields and persist:

```js
{
  id: '<server UUID>',
  kind: 'gift_box_v2',
  identity: 'gift-box-configuration-v1:<server SHA-256>',
  configurationId: 'gift-box-configuration-v1:<same SHA-256>',
  configuration: { /* server canonical configuration, including references */ },
  name: 'Build Your Gift Box',
  quantity: 1
}
```

Owner, expiry, optimistic revision and bounded add-operation receipts stay on the Cart. No gift price or component charge is persisted as an authoritative amount. New/changed gift configurations must be canonical, match both server identity fields and satisfy the strict contract. Existing stale configuration fields are not silently rewritten: unchanged hydrated rows can survive removal of another line, while reads mark them invalid and gift quantity/add/merge operations validate them again. Invalid/missing stored gift-line UUIDs and mismatched stored identities fail repricing; corrupted records without a usable ID can still be removed through Clear Cart.

Embedded rows/operation receipts explicitly have `versionKey: false`: they share the Cart's revision and have no own `__v` path. The root Cart still retains `__v`, `optimisticConcurrency: true`, strict validation and transaction retries. This fixes a race where Mongoose's transaction rollback tried to set an unknown embedded `__v` under strict discriminator schemas.

## Pricing and aggregate stock validation

Gift cart pricing uses `prepareGiftBoxV2CommerceQuote` from Phase 5B.1. No starting-price fallback is imported. The service loads the selected current `GiftBoxComponentSetting` documents in one bounded query per quote/transaction attempt and resolves policies only through trusted server configuration. Normal product dependencies stay in the existing Product/Category/CustomizationTemplate/ComponentOption/upload pricing context; gift lines are excluded from those queries.

Mixed-cart gift reads use a read-only snapshot transaction, so cart rows, saved builder settings and product dependencies are coherent for that response. Mutations and merges use the existing guarded transaction framework with snapshot reads. Settings are not cached across owners, requests or transaction retries. Saved approved prices, explicit complimentary zero, enabled/manual availability and inventory modes remain fail-closed requirements.

Each gift is priced as one completed unit, with its component quantities multiplied by completed-box quantity. After all eligible gift lines are quoted, their requirements are summed by immutable builder component ID. Two different arrangements with three red roses each require six roses from the **single builder rose pool**. The same aggregate validation runs before saving gift adds, quantity updates and proposed guest merges. If saved stock later drops below aggregate demand, every affected otherwise valid gift line becomes an honest unavailable row with null amounts, while valid ordinary products retain their own prices. Invalid rows remain visible and removable; they contribute no invented amount to the displayed subtotal.

| Inventory source/mode | Cart behavior |
| --- | --- |
| Ordinary Product/variant | Existing pricing/eligibility/stock path; independent of builder settings. |
| Builder tracked | Must cover aggregate component quantity across all configured gift lines. |
| Builder Made to Order | Requires availability and approved pricing; no numeric stock limit. |
| Ribbon status only | Requires available status, exact status-only mode and null numeric quantity; priced once per completed box. |

Chocolate remains independently allocated builder inventory. Product names, SKUs, external IDs and images never synchronize pools. Tests change either ordinary chocolate stock or builder chocolate stock and verify the other remains independently eligible. Complete builder setting and ordinary Product documents remain unchanged after cart preparation.

No cart operation reserves, deducts or restocks inventory. Gift quotes expose no executable old-style inventory claims; the unconditional strict checkout fence prevents them reaching inventory/order execution. Internal descriptive builder requirements are used solely for validation. Mixed subtotal safely sums each current line total exactly once; the gift component subtotal is not added separately.

## Fulfillment, runtime closure and checkout fence

The real `GIFT_BOX_FULFILLMENT_POLICIES` registry remains empty for all 12 boxes. No capacities, compatibility rules, geometry approval or artwork approvals were invented. A real gift add cannot succeed without a current trusted approved compatible policy; no body field or test flag supplies one. Missing, withdrawn, stale or incompatible policies remain blocked by Phase 5B.1 validation. Draft coordinates never certify physical fit.

Positive tests use `setGiftBoxCartPoliciesForDisposableTest` only after the guarded fresh fixture starts. That setter and every use verify test process/environment, empty merchant URI settings, local target, the exact loopback `tap_wrap_catalog_test` database and existing disposable-target guard. Policies are bound to that fixture's MongoClient; reconnecting cannot carry them into another target. No runtime HTTP endpoint, environment switch or public builder flag installs synthetic policies. The real registry is never mutated.

The connected browser helper is already a separate, guarded, non-runtime entry point. It creates approved synthetic settings/policies after its disposable schema/admin setup, then calls the real cart APIs through normal Origin/CSRF/session middleware. It does not mock business pricing or change application policy approval.

Any cart containing a `gift_box_v2` line reports `checkoutEnabled: false` and `giftBoxCheckoutBlocked: true`. Independently, `quoteCart(..., { strict: true })` throws `GIFT_BOX_CHECKOUT_DISABLED` before pricing or inventory work whenever any gift line exists. The existing checkout/order services already require that strict quote. This fence is unconditional, including synthetic approved policies and enabled checkout in isolated tests; there is no partial checkout that drops gift lines. Root checkout flags, final order creation, order snapshots, cancellation/restocking, payments and legacy quotation restrictions are unchanged. Ordinary product-only checkout retains its existing path.

## Operations, canonical merging and idempotency

The existing add/read/PATCH quantity/DELETE line/DELETE cart/POST merge endpoints now dispatch by line kind. Removing and clearing remain owner-scoped. Product behavior and private upload attachment/ownership lifecycles stay intact. Gift configs, messages and placements never create uploads or service requests.

Gift input is canonicalized before request hashing. Reordering supported arrays or regenerating editing UUIDs cannot create a different identity for an equivalent arrangement. Different selections, card messages or arrangement tuples remain distinct. Identical configurations merge only when line kind, server hash, configuration ID and the complete canonical configuration match, then the resulting quantity and aggregate stock are revalidated. A browser-supplied hash is rejected.

Gift add operation keys are required. The immutable receipt hashes canonical configuration, quantity and operation key. Matching retries recover the existing cart without adding units or repeating tracking; conflicting reuse returns `CART_OPERATION_CONFLICT`. Concurrent identical operations are covered by a real replica-set race test. Product hashes deliberately exclude the newly explicit kind so historical add receipts remain recoverable after rollout. Receipts have the existing Cart lifetime: explicit Clear Cart or expiry ends that cart's recovery history; these keys are not perpetual order-idempotency credentials.

Guest merges require the current guest and verified account owners, preserve the existing authenticated route and cookie rotation, and use one transaction. Eligible distinct configs stay separate; equal configs can combine only after current aggregate validation. Changed/unavailable/malformed source gifts are skipped with an explicit count, while current target rows remain. Login and CartContext feedback now disclose skipped guest items. No unverified phone/email linking is introduced; another account's cart cannot expose a card message.

Operation receipts transfer with the source cart, so an explicit retry under the receiving account cannot resurrect an already merged add. Receipt count remains bounded to 60. If the same key already exists in both carts, merge fails closed even when hashes match: historical receipts lack sufficient per-line provenance to safely subtract an already represented quantity. Both carts remain unchanged. A combined receipt count over 60 similarly fails for review. Skipped source receipts transfer too, so retrying an old skipped add does not silently re-add it; a reviewed deliberate new add needs a fresh key. Repeating a successful merge after cookie rotation leaves target quantity unchanged.

## Customer presentation and builder preparation

The existing ordinary cart article keeps its image/link/options/price/control behavior. A configured gift renders as one article with the approved presentation name “Build Your Gift Box”, selected saved box name, flowers/plush/chocolates with per-completed-box quantities, selected ribbon name/color swatch, card selection, authoritative configured unit/line price, completed-box quantity and Remove. A literal card message is inside collapsed keyboard-accessible native details within the owned cart. No HTML interpretation, tracking payload or browser persistence is introduced.

No production gift artwork has separately verified delivery approval, so the gift line uses an honest “Gift box preview unavailable” placeholder. It does not guess media URLs, infer Product images or publish local DEV assets. Stale/malformed historical details use safe unavailable wording. Gift-only CSS prevents narrow mobile content/placeholder clipping without changing ordinary product layouts. Responsive tests cover 320/390/768/1440 widths, visible keyboard controls, literal text, private-message disclosure, unavailable rows, quantity/removal and no horizontal overflow or browser page errors.

`prepareGiftBoxCommerceConfiguration` and `prepareGiftBoxCartPayload` serialize the existing builder selections and per-instance placements into the direct-commerce contract, using the existing visual scene transform. They emit no amounts, stock claims or configuration hash, and keep the caller's immutable operation key in memory. The final builder review invokes configuration preparation only to report readiness. The CartContext helper is prepared for a future approved caller; no real public button calls it. The existing disabled review submission control remains disabled, and tests verify that review sends no cart or request mutation. The visual builder and assets were not rebuilt.

## Promotions and tracking compatibility

Promotion calculations retain the complete mixed merchandise subtotal but exclude gifts from candidate products, bundle allocation, code eligibility, minimum-subtotal thresholds and percentage/fixed discount allocation. Only eligible ordinary product merchandise can receive discounts. Product-only rules retain their behavior; no builder discount policy is introduced.

Gift AddToCart callbacks return no receipt **before** Product-ID parameter construction or Product URL lookup. Builder IDs, configuration hashes, placements and card messages never reach Product tracking. `monetaryParameters`/`sanitizeParameters` keep their existing strict Product-ID rules. Consent, receipt validation, Purchase deduplication and provider settings are unchanged. Because gift checkout is closed, there is no new mixed Purchase/OrderSubmitted adaptation in this phase.

The entire optional `onAdded` callback, including parameter construction and path resolution, is now caught after a successful cart transaction; an optional failure returns successful cart data with an omitted/null receipt. Client tracking emission and optional animation are also isolated from successful mutation feedback. A fault-injection test persists an add, throws from tracking, then retries the same immutable operation and verifies one persisted quantity and one callback attempt. No live tracking-provider call was added or enabled.

## Verification and actual results

All database tests use fresh disposable loopback replica sets through the environment-scrubbed runners. Browser fixtures intercept APIs or use the guarded real local API/disposable database. No developer `.env`, merchant database or live provider is used.

| Final command/check | Actual result |
| --- | --- |
| `server/npm.cmd test` | **701 passed**, 0 failed/cancelled/skipped, including all existing commerce/request/order regressions and the final new contract/cart/guard cases. |
| `server/npm.cmd run check` | Passed for **222 JavaScript files** after final model edits. |
| `client/npm.cmd test -- --output test-results-gift-box-phase5b2-legacy --reporter list` | **368 passed**, 0 failed; complete default regression, including ordinary cart/customization/checkout, engraving, legacy/V2 owner requests, account/session isolation, accessibility, media and website behaviors. Original command exited 0 after its verified Vite teardown. |
| `client/npm.cmd test -- --config ../server/.cache/phase5b2-gift-browser.config.mjs --reporter list` | **50 passed**, 0 failed: all 39 existing gift builder/admin cases plus 11 new mixed-cart/serializer/feedback cases. Isolated port 5193; command exited 0. |
| `client/npm.cmd run test:contracts` | **15 passed**, 4/4 specification batches; real API plus fresh disposable database per specification, no business-pricing mock, all fixtures stopped cleanly, exit 0. |
| `client/npm.cmd run lint` | Passed after browser trace cleanup, exit 0, with the normal lint configuration. |
| `node --check client/scripts/run-contract-tests.js` and `node --check client/src/gift-box/commerce-payload.mjs` | Passed. |
| Isolated production Vite build + `writeSeoOutput` | Passed, **1,809 modules**, explicit child exit 0, **22 noindex routes**, 0 indexable routes and checkout offers disabled. |
| `git diff --check` | Passed; existing LF/CRLF notices are informational. |

The isolated build uses ignored `server/.cache/phase5b2-client-build.mjs`, the same Vite build and SEO APIs used by the npm build command, production compilation, scrubbed inherited configuration and disabled dotenv. Output stays in `client/test-results-gift-box-phase5b2-build/`, preserving existing `client/dist`. No catalog export, database read or live publication input is involved. Standalone SEO/exporter/Worker sources are unchanged.

The first new concurrent-add regression exposed the embedded Mongoose `__v` rollback failure. Explicitly disabling unused embedded version keys fixed it while preserving the parent revision and strict guards; focused cart/ordinary order tests then passed 58/58 and product personalization 9/9. Further model tests exposed nested configuration edits marked on either an embedded row or its parent bypassing the unchanged-row exception; exact configuration-path change detection now rejects those edits with an unchanged identity while retaining stale-row removal. A negative policy test also verifies that both installation and lookup reject a changed runtime environment/target or inherited merchant URI after a synthetic policy was installed.

The first full backend run passed 698/699: an older read-only Product address fixture used `guest:isolated-alias-fixture`, which the cart owner-format check correctly rejected. Its synthetic owner now uses a valid 64-hex guest hash, with every existing presentation/immutability assertion retained. The next complete run passed 699/699; the final expanded acceptance run additionally includes the policy guard and nested-edit regressions.

An early connected case expected `/cart` after customer login, while the existing contract intentionally navigates to `/my-orders`; its test helper was corrected to follow the actual route, then navigate to the cart. No application redirect or authentication behavior was weakened.

A combined 15-case connected run hit existing per-IP shopping/login limits across independent cases (10 passed, 5 failed with real 429 responses and resulting navigation errors). An initial ignored verification wrapper proved that all 15 passed when **each specification receives a fresh disposable fixture**. That isolation is now part of the normal `client/npm.cmd run test:contracts` command, which discovers every connected specification and runs the same guarded selected-spec lifecycle per file. Explicit selectors/flags retain their existing path; default batches continue after failures and return a nonzero aggregate exit if any file fails. It retains safe environment handling, randomized dedicated ports, graceful fixture shutdown and signal forwarding. No counter is reset, no limit is increased/bypassed and no assertion is skipped.

The final combined gift regression passed **50/50**: 39 existing builder/admin cases and 11 new mixed-cart/serializer/login-feedback cases. It used an ignored configuration on independent port 5193 with same-origin intercepted API fixtures, preserving the concurrently running default suite's 5191 server and security settings. Four earlier responsive reruns after fixing gift-only placeholder sizing and screenshot scroll position are not additional distinct cases. The known Windows Playwright teardown issue required stopping only the reverified completed-test Vite process; the original gift and legacy commands then exited 0. For the legacy run, all 368 pass records and the exact Vite listener/ancestor/current test command were verified before stopping that one process. No test was removed or skipped to hide a failure.

A lint run concurrent with the full browser run encountered temporary Playwright trace resource JavaScript with third-party inline rule directives. Those generated resources were outside application source and referenced unavailable lint plugins. Browser completion removed the transient resources; lint was rerun afterward with the normal configuration. No lint rule or source guard was disabled to avoid those diagnostics.

Final evidence is under ignored `server/.cache/phase5b2-backend-acceptance.log`, `phase5b2-syntax-final.log`, `phase5b2-client-legacy.log`, `phase5b2-gift-browser-regression.log`, `phase5b2-official-connected-tests.log`, `phase5b2-client-lint-acceptance.log` and `phase5b2-client-build-final.log`. Final mixed-cart screenshots are in `client/test-results-gift-box-phase5b2-regression/`; real-API screenshots/traces are in `client/test-results-contracts/`. The 320px/1440px screenshots were visually inspected for logo alignment, coherent gift grouping, readable unavailable artwork, collapsed private message and no overflow. Earlier focused runs overlap these final totals and are not additional passing cases.

## Remaining blockers and Phase 5B.3

Real gift cart adds remain blocked by missing approved fulfillment policies. All 12 physical policies, authoritative geometry and BOX-1 corrected artwork remain unapproved; production media serialization/delivery is still absent. No persistent provisioning, migration, production MongoDB connection, R2 upload, commit, push, merge, deployment, provider send, real payment or public gift-box activation was performed.

After a separate Phase 5B.3 authorization, implement the complete transaction path: exhaustive inventory claim kinds, aggregate independent Product/ComponentOption/builder demands, conditional tracked builder decrements plus approval/revision/status fences for Made to Order and ribbon, immutable configured order-time snapshots and allowlisted customer/admin display. Preserve idempotent order recovery, atomic discounts/uploads/cart/intent/outbox writes, safe once-only or inspected restocking/cancellation/returns, and historical orders. Resolve mixed/fully configured order tracking before any Purchase event can assume Product IDs. Preserve existing payment/proof/settlement restrictions and separately pending delivery charges; obtain the owner decision for configured-gift payment-method eligibility. Builder promotions remain excluded pending a reviewed policy.

Do not remove the checkout fence or activate the public builder merely because cart integration tests pass. Real physical policies, geometry/artwork/media approval, reviewed operational setup and explicit public launch authorization remain prerequisites. Phase 5B.2 stops with this cart foundation for review.
