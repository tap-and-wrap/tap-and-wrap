# Tap & Wrap — final comprehensive release-readiness audit

Audit date: **16 October 2026, Africa/Cairo**. Scope: the actual accumulated working tree, not a deployed release. **AUDIT ONLY. No application source was changed.**

## 1. Executive verdict

**NO-GO for the requested full production launch and owner handoff.** There is substantial working local functionality, including real React → Express → disposable MongoDB order creation, personalization retention and protected admin file viewing. However, independent checks reproduced important defects that the prior passing focused suites do not cover:

1. An admin inventory update can invent **approved tracked stock of 10** when no quantity was supplied.
2. A single actual refund covering a combined merchandise/delivery collection cannot be allocated across its original scopes under one real refund reference.
3. Customer and merchant image inputs bypass the newly required website-controlled Gallery/Camera/Files chooser.
4. The autoplaying homepage hero's pause control is deliberately invisible and rejects pointer events.
5. Incomplete private PNG data and corrupt public PNG data pass server image verification.
6. Registered product paths still become **HTTP 503 when their prelaunch map expires**. The map is limited to 24 hours. The permanent compatibility problem is **not resolved** in this tree. Indexing activation also has no route for publicly browsable but unindexed products.

Further release blockers are the unreviewed large source bundle, failed older connected contracts, unverified deployment topology/providers/current production data, required schema/index preparation, missing independent custom-request launch control, legal/operator/language/retention sign-off and physical-device acceptance. No new production facts were established. The owner-supplied 1,595 products/85 components/3,190 addresses snapshot is history, not a fresh audit count.

No P0 exploitable breach was established in the exercised scope. This is **not** a claim that no P0 exists: no penetration test, current dependency vulnerability scan, production configuration inspection or physical-phone test was performed.

### Evidence terms

- **PASS (isolated)**: actually executed against fixtures/local files. External storage/email/payment remain mocked or disabled.
- **CODE REVIEW**: traced source; not equivalent to live success.
- **FAIL**: observed mismatch with the requested business/acceptance requirement.
- **NOT VERIFIED**: requires another environment, physical device, provider or authorization.
- Passing a **defect reproduction** means it reliably reproduced the defect; it is not a business acceptance PASS.

## 2. Preflight, preservation and accumulated-change risk

Initial working tree: **169 changed paths: 91 modified tracked files, 78 untracked, zero staged**. Tracked diff alone: **1,300 additions / 985 deletions**; those totals exclude the substantial new untracked implementations. Six preexisting untracked `.bak` files sit alongside application source. The complete preflight path inventory appears in Appendix C.

Read the README, actual implementation/contracts, seven current reports (1, 2, 3, 4A, 4B, 5, 6), phase/deployment/SEO/alias runbooks and earlier `docs/BATCH_3_RELEASE.md` F01–F52 reconciliation. No separate original comprehensive commerce-audit file was located; do not confuse the older reconciliation with a newly verified production audit. Older README/phase text describes the retired global browse-preview/CMS workflows and cannot be used as current release instructions.

Preservation evidence: preflight SHA-256 inventory of existing non-secret project files, plus Git status/diff inventories, stored under ignored `client/test-results/release-audit/`. Final comparison checked **402 baseline files with zero changes**. Git status changed from 169 to 170 paths solely by adding this audit report; no preexisting status entry disappeared. No isolated runner listeners remained on ports 4092, 5191 or 5192 at closure. `.env` files and actual secret values were not inspected. A narrow offline credential-pattern check on non-secret source found no unexpected embedded MongoDB credential lines; that is not an exhaustive secret scan.

Risks: untracked runtime modules may be omitted from a commit; `git add .` may unintentionally include backups/obsolete scripts; several schema/API/UI changes need to ship together; prior test baselines include obsolete assertions; there is no immutable release SHA or reviewed deployment artifact. There is no checked-in Render Blueprint/CI workflow proving the live service settings. **A push to the connected branch can deploy automatically.** Do not push to “save work” before isolating deployment.

## 3. P0/P1/P2 findings

| ID | Priority / evidence | Finding / launch impact |
|---|---|---|
| F01 | **P1, reproduced** | Tracked-stock approval silently supplies 10 when quantity is omitted. Financial/catalog integrity blocker. |
| F02 | **P1, reproduced** | Full combined-payment refunds cannot retain one truthful reference across scopes. Refund operations blocker. |
| F03 | **P1, browser + source** | No required website image-source chooser at customer/admin upload or replacement controls. Explicit device/UX acceptance failure. |
| F04 | **P1, browser + CSS** | Hero pause hidden from pointer/touch users while autoplay runs longer than five seconds. Accessibility/UX blocker. |
| F05 | **P1, reproduced** | Image “verification” accepts incomplete/corrupt payloads. Files can be accepted without being usable images. |
| F06 | **P1, Worker probe** | 24-hour routing evidence expiration makes known aliases **and friendly URLs** return 503. Ordinary builds omit the mapping. Permanent-URL blocker. |
| F07 | **P1 for indexing, source + probe** | Indexing-on rejects unindexed public products; indexed publication expiry can 503 other public routes. SEO activation blocked independently of commerce. |
| F08 | **P1 release prerequisite, unverified live** | Pages versus Workers deployment and Render root/shared-file availability are unresolved. Wrong deployment can bypass routing or fail API startup. |
| F09 | **P1 controlled-release gap, reproduced** | Checkout off does not stop custom-request creation. No independent request-intake gate for deployment, outage or rollback. |
| F10 | **P1 validation gap, executed FAIL** | Three of six existing connected contracts and four of 90 additional backend boundary cases fail; new enabled flows do not replace the need to repair the stale baseline. |
| F11 | **P1 data/schema prerequisite, live unknown** | New collections/indexes and reviewed visibility transition are required; no current production reconciliation exists. |
| F12 | **P1 provider/operations prerequisite, live unknown** | Real public/private R2, email sender/owner recipient, cron/monitoring and same-site auth remain unverified. Checkout flags alone do not validate these dependencies. |
| F13 | **P1 publication prerequisite** | Seller identity/address/registration, Egyptian disclosure/language review, refunds and privacy/retention sign-off remain unresolved. |
| F14 | **P2, source/coverage limitation** | Public originals retain metadata and can be large; real mobile memory/slow-network/image-heavy behavior not measured. |
| F15 | **P2, source** | Submitted/declined custom attachments and unreferenced public objects have no approved disposal policy; retained evidence is intentionally not automatically deleted. |
| F16 | **P2, source** | Merchant workflow still has technical/advanced controls and no reviewed bulk-display executor; personalized ordinary-product COD exception path needs explicit scope confirmation. |
| F17 | **P2, source + environment limitation** | Single-process rate limits, bounded-but-full attention aggregates, no current vulnerability/physical-device evidence. Capacity/security conclusions are limited. |
| F18 | **P2, actual runner behavior** | Connected browser harnesses stalled during shutdown after cases completed; terminated only the owned isolated test runs. Repair fixture lifecycle before a reproducible release gate. |

### F01 — inferred approved stock

Evidence: `server/src/catalog/service.js:228–244` (`mergeInventory`), especially line 239; `server/src/catalog/validation.js:15–20` allows partial inventory objects. A disposable Ready Made by Request product with null quantity was updated through `updateProduct` using `{ inventory: { mode: 'tracked', approved: true } }` and its loaded revision. **Saved result: tracked, approved, quantity 10.** No quantity was supplied. This is admin-only, not a customer authorization bypass, but violates the no-placeholder-stock contract. The normal editor's blank quantity protection does not repair the backend API.

Minimal proposed fix, not applied: require an explicit valid actual quantity when newly approving tracked inventory or changing its mode to tracked; do not use the placeholder default as approval evidence. Preserve unchanged previously verified quantities on unrelated edits. Apply equivalent checks to new records, variants and component write paths. Test omitted/null/zero/actual ten, transition from Made by Request, legacy unapproved ten, stale revision and concurrent purchase. No merchant decision is needed to reject fabricated stock.

### F02 — combined refund accounting

Evidence: `server/src/commerce/order-accounting.js:136–159`; `server/src/models/OrderSettlement.js:12–23`; `client/src/commerce/OrderFinancials.jsx` refund source/allocation selection. Collections support multiple allocations, but refunds validate against one `input.scope`, create one allocation, and globally reserve a transfer reference.

Reproduction: a synthetic 540 EGP collection allocated 450 merchandise / 90 delivery. A 540 refund to merchandise was rejected; a 450 refund succeeded; the remaining 90 using the same actual refund reference was rejected with `PAYMENT_REFERENCE_USED`. Do not work around this by inventing suffixed bank references or pretending two transfers occurred.

Minimal fix: one immutable refund settlement with bounded explicit allocations across the original collection's remaining refundable scopes; validate sum/method/reference and per-scope limits atomically, preserving global transfer deduplication and `reducePayable` semantics. UI should allow a full or chosen allocation breakdown. Tests: full/partial/multi-charge refunds, retries/concurrency, over-refund rejection, payable reduction, excess funds and cancelled/returned orders. Owner/legal review decides actual remedies; code must be able to record them truthfully.

### F03 — required app-controlled chooser absent

Evidence: `client/src/commerce/ConfiguredFields.jsx:27–57`, `client/src/admin/AdminImageGallery.jsx:73–79`. Direct native `<input type="file">` controls are reused by product photos, Gift Box/Engraving references, website payment proof, admin products/categories/components and replacement controls. There is no Gallery / Take a Photo / Browse Files website dialog. Browser observation: clicking the product photo input fired `filechooser` immediately with zero app source-choice buttons. Generic `capture` is absent, which is good, but does not satisfy the chooser requirement.

Minimal fix: one shared accessible website chooser, followed only on explicit selection by the appropriate native input. Generic Browse/Gallery inputs must not force capture; explicit camera action may request native capture where supported, with a reliable file fallback. Preserve previews, validation, same-file reselection, remove/replace, cancellation and upload-on-submit. `camera=()` in `client/worker/browser-policy.js:21` and `client/public/_headers` would prohibit a new `getUserMedia` implementation; native input capture and OS gallery access are different mechanisms. Choose that architecture deliberately; do not blindly relax policy or claim the website controls OS permissions. Test every reuse and permission state on physical devices.

### F04 — inaccessible hero control

Evidence: `client/src/home-media.css:47–48` explicitly sets hero controls to `opacity: 0; pointer-events: none`, restoring only on `:focus-visible`. Pointer click failed in desktop Edge with the video intercepting events. Keyboard focus/Enter paused/resumed successfully. Actual hero duration is about 11 seconds and loops. Proposed fix: visible, reachable pause/play control above overlays on mouse and touch, with keyboard access, without changing the approved footage. Verify all breakpoints, forced autoplay rejection, reduced motion and tab/visibility changes. A keyboard-only escape does not satisfy touch/mouse accessibility.

### F05 — accepted unusable image data

Evidence: `server/src/commerce/storage.js:116–171` checks metadata and a prefix/header; `server/src/catalog/media-storage.js:12–31` checks container shape but not complete image decode/integrity. A 33-byte PNG header with no image data passed `inspectStoredImage`; a corrupted PNG passed `validateCatalogImage`. These are synthetic local buffers, not merchant files. No claim of arbitrary code execution is made.

Minimal fix: bounded full-image integrity validation before marking a private copy or public receipt verified. Keep byte/pixel/dimension bounds, safe MIME handling, immutable/private copy protection and provider timeouts. A reviewed image decoder or appropriately complete format validation is justified here; do not add an unbounded decompression step. Test truncated/corrupt PNG/JPEG/WebP, empty bytes, wrong MIME, oversized/decompression-heavy images, metadata and provider failures. Public metadata sanitization is a separate privacy decision; private payment evidence must not be destructively rewritten without a retention/evidence policy.

### F06–F07 — permanent URL compatibility remains temporary

Evidence: `shared/product-url-compatibility.mjs:15` limits reviewed evidence to 86,400,000 ms; `client/worker/seo-worker.js:73` returns 503 for an expired mapped product; lines 93–109 restrict compatibility redirects/React-shell fallback to indexing off. `docs/PRODUCT_ALIAS_ACTIVATION.md:37–85` documents expiry and ordinary-build omission. Indexed snapshot expiry at Worker line 92 is another deliberate fail-closed 503 path.

Executed Worker probe, no network/database:

| Condition | Registered legacy URL | Friendly public draft URL | Business result |
|---|---:|---:|---|
| Current reviewed prelaunch map | 308, query preserved | 200, noindex | PASS for current evidence only |
| Same registered map after expiry | 503 | 503 | **FAIL permanent compatibility** |
| Indexed approved-only snapshot, no compatible draft route | Not supplied by approved export | 404 | **FAIL mixed public catalog HTTP routing** |

The existing tests correctly pass the current expiry behavior; that does not make it suitable for permanent production routing. Removing expiry alone would leave stale visibility/withdrawal evidence. Enabling indexing cannot require hiding legitimate public enquiry-only products or exporting their prices/schema.

Minimal design to review next: separate immutable registered alias ownership, current public visibility and indexable SEO publication. An authoritative minimal runtime address-resolution contract, or another reviewed durable registry delivery mechanism, must maintain old-owner reservations, deleted/withdrawn 404, friendly 200, legacy 308, GET/HEAD/query semantics and noindex for unindexable products. Never infer aliases by stripping suffixes and never bypass the production-export prohibition. Cached routing must have an explicit withdrawal/invalidation and API-outage policy. Until fixed, hourly reviewed refreshes are a temporary operational workaround requiring separate read/deployment authorization, not a permanent owner-friendly solution.

Approved-product indexing remains independently blocked until current approved exports, media verification, publication IDs, expiry/refresh and search access are proven. Legal pages remain source-gated noindex (`shared/storefront-content.mjs:4`). Product registry code (`server/src/catalog/product-addresses.js:39–58`) retains the existing canonical URL on rename and never reassigns reservations; the admin slug-help sentence claiming every slug change changes the URL is misleading when aliases are enabled.

### F08–F09 — controlled deployment boundaries

`client/wrangler.jsonc:4–14` targets Workers Static Assets. There is no Pages `_worker.js` wrapper or Pages Functions implementation. The owner's production description says Pages; current hosting type/build/deploy command was not inspected live. Uploading `dist` to Pages alone is not proof that `client/worker/seo-worker.js` runs. Current Cloudflare documentation supports the declared Static Assets options; live project compatibility still needs verification.

Server modules import `shared/` outside `server/` (for example `server/src/website/service.js:1` and product-path/personalization modules). Render documents that files outside a configured service root are unavailable. A `server`-only root is unsafe unless a separately verified packaging arrangement supplies `shared`. Repository-root build/start commands with npm prefixes are a suitable minimal option; shared-file changes must also trigger the intended release.

Custom-request creation (`server/src/commerce/service-requests.js:20–30`, `service-request.routes.js:36`) is independent of checkout, while order conversion at line 124 is gated. A synthetic request succeeded with checkout off. This separation is useful business behavior but means checkout-off is not a deployment/rollback kill switch. Add a reviewed independent request-intake/maintenance boundary, or an explicitly approved ingress maintenance strategy, before dark deployment. Preserve owned status recovery/admin follow-up for previously accepted requests.

### F10 — connected validation baseline is stale

Executed `commerce-edge-contracts.spec.js` plus `operations-contracts.spec.js`: **3 pass / 3 fail**. Gift Box still expects `Gift box type / size` and the old template-to-cart flow (`client/connected-e2e/commerce-edge-contracts.spec.js:28`). Catalog expects 27 records although two fixtures lack explicit public visibility (`operations-contracts.spec.js:46`; `server/test/helpers/connected-api-server.js:71–73`); actual count is 25. A newly created hidden draft is expected to be public at test line 109, but is correctly 404.

These failures primarily demonstrate obsolete tests/fixtures, not evidence to restore the removed preview bypass. Update them to reviewed visibility and quote-first requests, then retain a real enabled-checkout connected gate. The audit added only ignored synthetic harnesses, not source-test fixes. The new enabled guest COD flow passed; personalization → private upload → cart → InstaPay order → proof → explicit admin photo/proof viewing passed after correcting an audit-harness login-navigation race. These still use memory storage and do not verify R2.

Additional backend boundary selection: **86 pass / 4 fail out of 90** across `product-addresses.test.js`, `seo-export.test.js`, `batch1-inventory-revision.test.js`, `batch3-commerce.test.js` and `batch3-operations.test.js`. All four failures are in `server/test/batch1-inventory-revision.test.js:78–116`: tracked product/variant cases expect immediate restoration after the customer cancellation endpoint (actual stocks 8/4 versus expected 10/6), while tracked/Made by Request component cases expect personalized COD to create an order without owner quotation (`QUOTATION_REQUIRED`, 409 versus 201). Current `server/src/commerce/routes.js` `/orders/:id/cancel` intentionally routes accounting-version-1 orders to `request_cancel`; `order-accounting.js:169–184` separates the customer request from authorized cancellation/restocking. These failures are consistent with stale expectations, not proof of inventory loss. Repair the cases to assert unchanged stock after request, then authorized cancellation and exactly-once restoration; use the approved payment path for component cases. Do not restore automatic customer cancellation or weaken personalized COD guards just to make them pass. The frozen release regression gate remains failed until corrected and rerun.

### F11–F18 — remaining prerequisites and material limitations

- **Data:** missing `visibility` does not match the public query; new records default hidden (`Product.js:67`). Retired `catalogBrowsePreviewIsEnabled()` returns false (`catalog/service.js:67`). Deploying code does not approve existing records. A reviewed display-only transition is mandatory where needed. Never approve placeholder ten or guess prices. Components remain opt-in by service, availability and fixed/pending/free policy; food ingredients must not be bulk-enabled for gift boxes.
- **Schema:** startup uses read-only verification and `autoCreate/autoIndex: false` (`config/db.js:85`, `config/schema.js:45`). New collections are required even with checkout off. `CatalogMedia` and `ProductAddress` readiness additionally depend on their flags. An old database can make the API unready immediately after deployment. See migration order below.
- **Providers:** `checkoutEnabled` is only the two commerce flags (`config/env.js`). Public checkout can advertise InstaPay while private storage is off; accepted orders then cannot complete mandatory website proof submission. Validate dependency readiness before offering that method/activating commerce, and document the outage/reconciliation procedure. Do not bypass proof ownership or invent permission to use WhatsApp evidence for normal website orders.
- **Retention:** temporary private uploads have a current 24-hour lifecycle; carts can outlive them and surface replacement feedback. Submitted request files are retained (`uploads.js:226–239`), including requests later declined/cancelled, and public orphan deletion is disabled. Approve differentiated retention/legal holds before cleanup changes. No automatic evidence deletion was added.
- **Image performance/privacy:** no responsive rendition pipeline is shown for uploaded originals (`ProductCard.jsx:21`, `ProductPage.jsx:133–138`). Public uploads allow 10 MB/40 million pixels; ten client previews or a large gallery can stress phones. Original public bytes can include EXIF/location metadata. Actual merchant-media distribution and slow-mobile memory were not examined.
- **Merchant gaps:** no authorized display-transition executor or first production data review exists. Advanced templates and technical variant keys remain; clarify labels/training. The generic ordinary personalized-product COD authorization path is not demonstrated: website checkout requires InstaPay and the available owner-quotation UI is Gift Box/Engraving-oriented. Do not invent a false engraving/gift request to change a normal product's payment method. Confirm whether a generic owner quotation is required before offering that exception. Specialized legacy-order reconciliation, uncertain email investigation, exhausted private cleanup and bank disputes still need trained operations/developer help.
- **Performance/security:** catalog scale passed locally, but attention uses a union/lookup/sort/count before its 20-row limit (`operations.js:26–52`). Test at representative active order/request volume and inspect real query plans. Rate limits are process-local; verify a correct trusted-proxy chain and instance topology. No current vulnerability scan, MFA deployment or exhaustive penetration/accessibility audit was performed.
- **Claims/content:** coded contacts match repository values; ownership/reachability is unverified. Homepage statistics/review provenance are owner attestations in source, not independently verified sales data (`client/src/content/developer-content.js:18`, `owner-confirmed-reviews.js`). Obtain sign-off rather than invent or silently remove claims. Minor remaining copy says “agree the fee within 12 hours” at `CheckoutPage.jsx:103`; correct to initial contact when fixes are authorized.

## 4. Cross-batch functionality and merchant matrix

| System / journey | Current implementation and independent evidence | Readiness |
|---|---|---|
| Homepage/header/footer | Real assets, navigation, fixed contacts; browser pages and local videos exercised | PARTIAL: pause defect, claims sign-off, physical devices |
| Categories/search/filter | Server queries cap 20; nested identities; 1,595/209 fixture and full-text query executed | PASS isolated; live data/media/query plans unknown |
| Mixed browse/checkout catalog | Explicit visibility independent of Ready/price/stock; checkout-on fixture retains 1,276 visible records from mixed synthetic catalog | PASS isolated; production transition required |
| Unpriced/unavailable enquiries | Approved positive prices only; unavailable variants cannot order; WhatsApp enquiries do not grant ordering | PASS isolated; contact/device verification pending |
| Product price/availability editor | Positive price confirms; blank/unverified stock stays unapproved in normal UI; variants supported | PARTIAL: F01 backend, technical variant keys |
| Cart / stale items | Server repricing, no inventory reservation for cart add, owned keys, expiry feedback, reload/retry handling | PASS isolated |
| Guest COD | Actual React/API/replica-set order; unpaid, merchandise-only total, shipping null, reload owned | PASS isolated; live fulfillment/collection procedure pending |
| Website InstaPay | Order first, reference/destination, secure proof, manual ledger reconciliation; actual local connected flow | PASS isolated, except F02; real R2/payment acceptance unverified |
| Authenticated accounts/orders | Hashed sessions, role enforcement, owner/generation caches, order list and recovery code; auth regressions | PASS exercised isolated subset; full enabled authenticated order/device/provider matrix pending |
| Customize This | Required configured fields before cart; same product/variant price; private snapshots and order retention | PASS exercised integration; chooser/corrupt-file/device gates fail or unknown |
| Gift Box | No account/template/base product required; optional references/components; quote-first | PASS fixture/backend/browser; live provider/device/request launch gate pending |
| Laser Engraving | Owner-enabled products/options; unpriced eligible product or truthful manual fallback | PASS fixture/backend/browser; live options/data/device unknown |
| Component eligibility/prices | Service opt-in; fixed positive / null pending / explicit free; inventory at order conversion | PASS isolated; merchant review of all real records pending |
| Request → quote → order | Versioned saved quotation, explicit manual sharing/WhatsApp acceptance, selected methods, conversion reserves stock | PASS backend/mocked browser; full real-provider acceptance pending |
| Normal delivery/add-ons | Null pending shipping; offered/accepted separate charges; immutable merchandise settlement | PASS isolated; owner/legal process sign-off |
| Collections/refunds/returns | Authorized append-only settlement/history, receipt rejection/replacement, inspected restock | PARTIAL: combined-refund defect; bank/provider/legal verification pending |
| Inventory/idempotency | Atomic claims, variants, last-unit contention, cancellation fencing, retry keys | PASS existing isolated tests; F01 admin approval defect remains |
| Public admin images | Multi-upload, ordering, primary replacement, duplicate hash, safe failed save/stale revision | PASS mocks; chooser and real R2/metadata/performance gates pending |
| Category/subcategory/component images | Same gallery adapter, loaded revisions, imported references preserved | PASS mocks; live catalog domain/provider unknown |
| Private files | Owner/purpose/product/order/request binding, protected explicit admin stream, no public object key | PASS isolated/connected memory provider; actual private R2 not verified |
| Owner attention | Original timestamps; explicit contact, sharing and acceptance; overdue clears on contact | PASS controlled-clock and mobile fixtures; volume/production worker unknown |
| Emails/jobs | Existing outbox, Gmail/Resend adapters, safe cutoff, leases, retries/uncertainty and diagnostics | PASS mocked subset; sender/recipient/scheduler/inbox not verified |
| Six fixed English pages | Code-managed, no CMS override, API writes 403, readable semantic routes/metadata | PASS isolated rendering/API; legal publication NO-GO |
| Product aliases | Registry preserves owner and canonical on rename; fresh mapping 308/200, GET/HEAD/queries/withdrawal tests | PARTIAL: permanent HTTP durability fails |
| SEO / Meta | Conservative publication and consent gates; approved exports only; deduplication code/tests | DISABLED by repository default; live values not independently verified |

### Owner operations versus developer setup

After release prerequisites pass, routine work is through admin: enter verified prices, enter real quantity or explicitly choose Made by Request/unavailable, approve display, configure personalization, manage photographs, opt components into the right services, review requests, save quotations, manually send WhatsApp, separately record sharing/contact/acceptance, quote delivery, reconcile funds and progress fulfillment/returns.

Not routine owner duties: Render/GitHub/Cloudflare changes, schema DDL, R2/CORS/DNS, provider credentials, worker authorization/scheduling, SEO publication or migration scripts. Current design still requires developer/operations help for routing-map refresh, bulk visibility transition, legacy financial reconciliation and certain payment/email/storage exceptions. Resolve or explicitly staff these before calling handoff complete. Do not give the owner MongoDB access as a substitute for missing admin workflow.

## 5. Financial, inventory, security and communication review

### Positive contracts retained

- Server prices/quantities/variants/discounts use integer piastres; unapproved values do not become selling prices. Quote expiry is ten minutes (`orders.js:55`) and order creation re-quotes inside a transaction. Inventory, retained attachments, discount redemption and notification records commit together. Cart add does not reserve stock.
- Owner+checkout/request/operation keys and immutable fingerprints reject altered retries. Last-unit and variant tests pass; category/template/promotional fences prevent concurrent eligibility changes. Cancellation/returned-stock inspection uses `restockedAt` and actual claims. Discount reversal is explicit after reviewed cancellation/return, not automatic repeated restoration.
- Website InstaPay records an awaiting-transfer order before giving instructions. Proof submission/replacement never marks Paid. Actual collections/refunds require admin, amount/reference/reconciliation and audit. Partial/excess/late funds are supported, with manual review; F02 remains a missing multi-scope refund capability. No automatic cancellation of potentially paid orders was introduced. Unpaid allocations require an owner-approved review/escalation procedure, not an invented expiry.
- Cookies are host-only, HttpOnly, Secure in production, SameSite=Lax (`middleware/auth.js:6`; `commerce/ownership.js`). Exact Origin plus signed double-submit CSRF and session generation isolation remain. Signup role is fixed customer. Wrong-owner files/requests/orders fail. Order DTOs allowlist customer-visible fields; operational notes stay admin-only. Upload streams are bounded, no-store/nosniff, and explicit admin views are audited.
- Normal tracking requires both order number and normalized phone with a five-per-15-minute limiter and returns only status, not address/files (`commerce/routes.js:150–156`). It does not attach a guest order to a user using an unverified phone. Authenticated lists use stored user ownership.
- Email templates escape HTML and include plain text, pending charges, no private attachments/URLs and no marketing pixel. Optional custom-request email does not prevent submission. A notification/provider failure after acceptance does not erase the accepted order.
- Meta requires policy, consent and separate browser/CAPI flags; sanitized server receipts share IDs, Purchase is deduplicated and revocation is supported. These tests do not authorize tracking activation.

### Exact initial-contact email obligation

`owner-notifications.js:10–51`: initial deadline is original `createdAt + 12 hours`; owner event key is unique by source/record/type. Creation queues the immediate event and one event eligible at nine hours when owner alerts are configured. It does not automatically send WhatsApp. Contact recording suppresses undispatched reminder work; dispatched/ambiguous provider delivery cannot be unsent. At 12 hours there is only dashboard overdue, no third email. Late contact retains history and clears active overdue. Converted requests keep the original obligation. Both sources' exact 0/9/12 boundaries and concurrent/restarted processing were executed in the 157-test selection.

“Immediate” is queued immediately, not guaranteed inbox arrival: worker/provider polling must be healthy. If a worker misses the whole 9–12-hour window, it must not send a misleading late reminder. Owner alerts are independent of other legitimate transactional/payment emails. Missing/unusable custom customer email suppresses that email, not the request or WhatsApp follow-up.

`notifications.js:137+` requires `NOTIFICATION_DELIVERY_NOT_BEFORE` for actual worker dispatch; older queued messages are held. Never move that cutoff backwards to flush history. Durable dispatch-start markers/leases stop blind SMTP or ambiguous provider resend. Sent/dead/uncertain/suppressed account secrets are cleaned separately. An uncertain message requires provider reconciliation and a recorded disposition, not a “retry everything” button.

### Security limitations requiring release evidence

Repository defaults are not live security configuration. Verify correct API custom domain, exact Origin/CORS, Secure cookie host scope, verified proxy CIDRs, Atlas TLS/least-privilege/egress allowlists and readiness. A provider-domain cross-site frontend/API topology is intentionally rejected. CSP is report-only by default; explicit API/media/upload origins must be tested before enforcement. Do not infer R2 privacy from a bucket name: public access/domain bindings must be checked on the actual private bucket. Current file integrity and stock defects remain independent of otherwise sound authorization.

Lockfile root dependency declarations match package manifests in both folders. Tested Node is 22.23.2; the project requires >=22.12.0. Vite build used 8.3.4. No dependency updates/installation or current registry vulnerability audit was performed. A frozen-lock advisory/license review is still a GO gate; no “zero vulnerabilities” claim is made. Admin access/recovery and optional MFA policy need owner security sign-off. Process-local limits require explicit single/multiple-instance capacity planning. Logs reviewed use safe codes/request IDs; actual provider/production logs were not accessed.

## 6. MEDIA, DEVICE COMPATIBILITY & END-TO-END UX ACCEPTANCE

### Executed evidence matrix

Browser used: **headless installed Microsoft Edge 155.0.4283.45 on Windows**, actual Chromium engine. Mobile/tablet sizes below are viewport emulation, not physical devices. Bundled Playwright Chromium/Firefox/WebKit executables were absent; agent-browser/ffprobe were unavailable. No browser installation was attempted. Local MP4 boxes were inspected directly and actual decoding was tested in Edge.

| Capability / file evidence | Test and expected result | Actual result / status | Launch impact / environment |
|---|---|---|---|
| Product upload chooser; `ConfiguredFields.jsx:51` | Click image control; app chooser should precede native picker | Native `filechooser` immediately; no Gallery/Camera/Files buttons: **FAIL** | P1, Edge actual event; no OS-photo interface claim |
| Gift Box / Engraving references; `ServiceRequestPage.jsx:14`, same LocalFileField | Guided chooser, previews, multiple references, retry | Direct input: **FAIL chooser**; mocked request/image retry tests PASS | P1, source + Edge fixtures |
| Website proof; `OrderFinancials.jsx:35` | Correct order, private upload, preview/replace and no auto-Paid | Direct input: **FAIL chooser**; real API/memory-storage proof and admin view PASS | P1 chooser; live R2 NOT VERIFIED |
| Admin product add/replace; `AdminImageGallery.jsx:73–79` | App chooser; multiple images, primary/order/replace/save/reload | **FAIL chooser**; duplicate/stale-save/provider-failure/gallery tests PASS | P1; Edge + API/storage mocks |
| Category/subcategory/component/packaging images | Same gallery control and authorized reference save | **FAIL chooser by shared source**; category/component mocked save PASS | P1; no live image upload |
| Same-file selection / remove / empty selection | Local preview can clear and select the same file again | PASS programmatically in Edge | Not a physical native-picker cancellation/reopen test |
| Generic capture attribute | Generic input must not force camera | No `capture`: PASS source/browser | Does not implement an explicit camera option |
| Camera allowed / denied / previously denied | Clear app error/fallback and recoverable source choice | **NOT VERIFIED**; camera flow absent | Mandatory physical gate after F03 fix |
| Private corrupted image | Reject incomplete image before verification | Header-only PNG accepted: **FAIL** | P1; real validator, memory object adapter |
| Public corrupted image | Reject unusable file before public receipt | Corrupt PNG accepted: **FAIL** | P1; direct validator, no provider |
| Ownership / immutable order retention | Product photo → cart → InstaPay order → private admin photo/proof | PASS real React/API/disposable replica set; original price preserved | Storage memory adapter; no live payment/email |
| COD / mobile reload | Product → cart → checkout → order; shipping null, unpaid, reload owned | PASS at 390×844 with real API/disposable DB | Not a real phone or real order |
| Gift request → quote → acceptance → conversion | Preserve submitted refs/components/version/payment methods/stock | PASS backend and mocked Edge integration | Full same-browser real-API/provider chain still NOT VERIFIED |
| Hero desktop/mobile decode; `PublicContent.jsx:25–59` | Correct source, dimensions, muted/inline, one initial hero source | PASS actual local MP4 decode and initial source observation | Edge only; mobile viewport emulated |
| Hero pause / play | Pointer and touch can pause repeating video | **FAIL pointer**; keyboard focus/Enter PASS | P1; `home-media.css:47–48` |
| Gift Box / Engraving service films; `ServiceFilm.jsx:5–37` | Visible files decode, dormant offscreen, manual control available | Both actual files decoded; initial offscreen source logic reviewed | Edge decode PASS; touch/manual state across visibility NOT VERIFIED |
| Video failure / poster | Failed MP4 must leave readable content and working poster | PASS forced local MP4 request failure, loaded poster and heading | Isolated network failure; no production CDN check |
| Reduced motion | Initial autoplay suppressed | PASS hero initial pause in Edge | Service preference changed during playback is not subscribed; P2 follow-up |
| Portrait/landscape and video source switch | Correct source after breakpoint, no simultaneous initial hero downloads | PASS source switch 390 portrait → 844 landscape, no decode errors | No physical rotation/backgrounding/keyboard claim |
| Six fixed pages and footer | Render without CMS, metadata/noindex, readable sizes and links | PASS at 320/390/768/1440 | Edge fixtures; owner/legal approval separate |
| Mobile admin attention / media / quotations | Controls usable, no horizontal overflow, explicit protected files | PASS selected Edge fixture layouts and dialogs | Native keyboard, OS permissions, touch and physical memory NOT VERIFIED |
| Live signed PUT, CORS, expiry, verify/copy/readback | Actual browser ↔ R2 ↔ API round trip, private access fails externally | **NOT VERIFIED** | P1 activation gate; mocks do not prove R2 |

Actual asset observations:

| Local file | Bytes | AVC configuration / dimensions | Edge duration |
|---|---:|---|---:|
| `tap-wrap-desktop-hero.mp4` | 864,016 | `avc1.64001f`, 960×570 | 11.375 s |
| `tap-wrap-mobile-hero.mp4` | 835,807 | `avc1.64001e`, 480×854 | 10.958 s |
| `tap-wrap-gift-box.mp4` | 873,964 | `avc1.64001e`, 480×854 | 13.583 s |
| `tap-wrap-laser-engraving.mp4` | 844,812 | `avc1.64001e`, 480×854 | 9.625 s |

All four are MP4/H.264 sample entries, below the original 1 MB target, with `moov` before `mdat`. This is not a complete ffprobe codec/color/audio analysis or a Safari/Android compatibility certification. Posters exist locally. Hero switches one source according to width; service videos load as visible. There is no measured slow-mobile-data bandwidth, decoded-memory or real Core Web Vitals result. Product cards/thumbnails reuse originals with lazy loading, not responsive optimized derivatives.

### Required device/browser acceptance — all physical rows currently NOT VERIFIED

| Platform | Required verification |
|---|---|
| Desktop Chrome | Native chooser/cancel/same-file, upload/proof, keyboard, playback/autoplay rejection |
| Desktop Edge | Repeat patched chooser/pointer controls in interactive browser; headless subset already executed |
| Desktop Firefox | Actual Gecko engine, upload/CORS/retries/modal focus, H.264 availability/playback |
| Desktop Safari | Actual Safari/WebKit, upload/signed PUT, videos/posters, background return |
| iPhone Safari | Physical iPhone, gallery/camera/files, permission histories, HEIC behavior, keyboard/rotation/background |
| iPhone Chrome | Physical app behavior, native picker/permissions/session cookies; no assumption of desktop Chrome parity |
| Android Chrome | Physical Android, gallery/camera/files, denied permissions, large photos, low-memory/slow network |
| Samsung Internet | Physical device/browser, same complete upload/checkout/video path |
| Tablet portrait/landscape | Touch, dialogs and software keyboard; playback/source changes; admin forms and gallery |

For **each** supported physical platform record model/OS/browser/version, date, network, PASS/FAIL, evidence and approver:

1. Initial Upload Image opens the app chooser, not native UI. Test Gallery, explicit Camera and Files separately. Unsupported choices have a fallback; generic action has no forced capture.
2. Camera allowed, denied and previously denied; photo-library selection/cancellation; native picker cancel/reopen; same image again; replace/remove; focus returns. Do not describe OS-controlled prompts as app-controlled permissions.
3. JPEG/PNG/WebP, unsupported HEIC/PDF/SVG, empty/corrupt/oversized files; useful validation without losing other entered text. Decide HEIC conversion/fallback explicitly; it is not implemented now.
4. Multiple full-resolution photos with keyboard open, orientation change, background/foreground and low-memory pressure. Verify decoded preview memory, dialog visibility and touch targets.
5. Slow/interrupted/expired signed PUT, verification failure, retry, duplicate click, back/reload; no duplicate cart/order/request and no wrong-owner file. New attempt must not lose an already accepted order.
6. Product photo → Edit → cart → checkout → accepted order → admin private view of the correct image/instructions. Then website proof rejection/replacement and independent reconciliation.
7. Gift Box and Engraving: multiple references, no available components/templates, optional email, saved quote, manual sharing, recorded acceptance, order conversion and private file view.
8. Admin product/category/subcategory/component upload, reorder/primary/replace/save/reload; failed upload and stale revision preserve the saved record and draft.
9. All four videos: poster before playback, normal/denied autoplay, visible pause/play by touch/keyboard, reduced-motion initial and changed preference, offscreen/background behavior, orientation/navigation return, MP4 failure with meaningful fallback.
10. Ordinary COD and InstaPay, unavailable/unknown-price enquiries, variants/last unit, stale cart, pending charges, tracking/account isolation and all six public pages. Check overflow, focus/Escape/backdrop, menu, contrast, console and failed critical requests.

A recoverable decorative-video failure can be accepted only with a working poster/content/navigation and recorded owner approval. Required upload failure, private exposure, wrong attachments, broken mobile checkout/request or serious uncaught errors are NO-GO. **Real R2 remains mandatory before production activation.**

## 7. Production data and database transition order

The index specification in Appendix B is extracted offline from the current Mongoose models, including optional CatalogMedia/ProductAddress, not from Atlas. No migration was run. Collection/index creation is DDL and requires separate permission even when additive.

1. **Freeze target and recovery material.** Obtain explicit read/backup authorization; confirm cluster host, exact `tapandwrap_production`, transaction-capable topology, least-privilege roles and all API/job egress. Privately capture current collections/index definitions, product/category/component/address counts, visibility/status/approval distribution, legacy order/payment state and queued jobs/uploads. No inference from historical counts. Back up data and relevant object inventories; test restore in isolation. Record immutable backup IDs privately.
2. **Prepare a dry-run delta, no automatic production repair.** Compare Appendix B and schema fields to the authorized read snapshot. Review duplicate/missing unique values before index builds. Include `ordersettlements`, `servicerequests`, `catalogmedias`, `commercejobruns`, `commercecontrols`, existing upload/outbox/account/tracking collections and optional address registry. Review TTL indexes carefully: no TTL may delete orders, settlements or retained upload evidence. Existing extra indexes are not permission to drop them.
3. **Authorize additive schema initialization explicitly.** The current `server/scripts/initialize-schema.js` requires `--apply --target production --confirm-schema-writes --confirm-production-schema`, appropriate exact-target settings and separate human permission. Review its entire model list first; it initializes the declared schema, not a narrow automatic migration. Do not use the old staging-only six-index script for production. Ordinary API/job startup must continue read-only schema verification. Optional media/alias model inclusion must match the reviewed intended feature settings at initialization, not be forgotten because flags are off.
4. **Preserve identities and historical state.** Never rerun catalog import, regenerate aliases, move address ownership or clear components. Verify existing canonical/legacy registry uniqueness and retention after deletion. Do not backfill immutable category source identity automatically. New optional fields should have reviewed compatibility defaults, not approved prices/stock. Model defaults in application memory are not a reviewed persisted migration.
5. **Plan reviewed display-only transition.** Use `displayReviewDigest` / `planDisplayTransition` (`catalog/display-transition.js`) on an authorized full snapshot. Owner reviews meaningful groups and explicitly includes/excludes/withdraws every record. Patch only visibility with captured revisions and the exact reviewed snapshot. A guarded resumable executor/journal still needs implementation/review; no production apply exists in this audit. Price/inventory approvals, availability and aliases are separate. Newly unsafe/inappropriate records stay hidden/withdrawn. Do not batch-approve all Draft/Hold.
6. **Review actual sale eligibility separately.** Owner enters verified positive prices and actual stock/zero/unavailable or deliberately approved Made by Request; variants get their own approved counts/prices. Resolve review flags and active category relationships before Ready. Fix F01 first. The owner can approve display in reviewed groups without making 1,595 technical purchasing approvals; only products actually offered for sale need their commercial facts confirmed. Leave the remainder as honest enquiries.
7. **Components.** Keep all existing identities, quantities and catalog references. No mass eligibility/stock approval. Owner chooses service eligibility and availability; food ingredients do not become gift-box contents automatically. Positive verified request prices, pending zero/null, and explicit Free stay distinct. Conversion checks/reserves applicable real stock, not request submission.
8. **Legacy orders.** Inventory `accountingVersion != 1` separately. Existing totals, paid/refunded states, proofs and restock history remain authoritative evidence. Current API blocks ledger/payment mutation until reviewed reconciliation. Do not set version 1 with an empty ledger, invent collections or force all old orders unpaid. If any exist, approve an itemized reconciliation procedure/tool with statements, allocations, audit/provenance and rollback journal; if none exist, record that verified fact. New orders use the new accounting model from creation.
9. **Outbox/jobs/uploads.** Preserve queued, processing, uncertain, failed and retained states. Review old dispatch markers and potential paid reservations before starting jobs. Select a new immutable delivery cutoff to hold history, configure the exact operations recipient, then authorize bounded processing. No blanket replay, automatic unpaid cancellation, retained-file deletion or public garbage collection.
10. **Verify before release.** Read-only schema readiness passes; unique index/delta counts match; no product/component/address loss; no price/stock approval changed except explicitly approved edits; all display group counts/IDs and rejected stale revisions journaled honestly. Rehearse the same plan on an isolated restored fixture first.

Recovery: before commerce writes, reverse reviewed visibility patches only if their revisions still match and preserve independent owner edits; leave safe additive collections/indexes unless a separately reviewed drop is necessary. After real orders/payments exist, **never restore an old backup over them**. Close new intake, retain keys/ledger/files, reconcile and forward-fix or use a tested compatible rollback. Database/index rollback does not undo a transfer or email. New data format compatibility must be a release artifact, not an assumption.

## 8. Environment inventory and dependency-driven activation

**Actual live values are UNKNOWN in this audit**, including settings that the owner previously reported working. No Render/Cloudflare settings or secret values were read. Defaults below are repository examples or explicit code defaults; a blank example is not proof of missing production configuration. Appendix A lists every runtime setting plus relevant script/test-only names.

Activation stages used in that appendix:

- **R0**: source freeze and approved isolated infrastructure/settings review; no production effects.
- **R1**: separately authorized production identity/topology/schema/provider preparation; public intake closed.
- **R2**: approved restricted synthetic provider tests and exact recipient restrictions; delivery cutoff recorded.
- **R3**: approved worker/owner alerts and maintenance scheduling; history held; no new commerce until healthy.
- **R4**: reviewed display data/public media + authorized custom-request boundary; owner staffed.
- **R5**: checkout authorization only after prices/inventory/storage/payment/email/rollback acceptance pass.
- **R6**: SEO publication and optional Meta independently, after legal/privacy/consent and routing refresh fixes.

Verification/recovery families (each appendix row refers to one):

| Family | Safe verification before activation | Recovery behavior |
|---|---|---|
| DB | Offline exact-target check, then separately authorized Atlas read/index verification and readiness; transaction test in isolated restored data | Keep API/jobs unready on mismatch; stop intake/jobs, preserve all financial writes; no automatic schema repair |
| AUTH | Same-site test origins; guest/login/logout/reset, wrong-Origin/CSRF/role, real proxy IP observation and cookies on approved domains | Restore reviewed topology; new secret invalidates sessions/recovery material, so rotation needs a plan |
| MEDIA | Exact domains/buckets/credentials scope/CORS; restricted actual public upload/readback and private sign/PUT/verify/stream/expiry tests | Disable new uploads, preserve references/evidence/objects; do not delete to recover |
| EMAIL | Offline `email:check`, verified sender/recipient and cutoff; one approved synthetic inbox test, retries and uncertainty observation | Stop delivery flags/job dispatch; hold queued history; never blindly resend uncertain messages |
| JOB | Offline dry-run; isolated restart/lease/budget tests; authorized once-only synthetic run and monitor heartbeat | Stop future schedule/dispatch; recover leases by documented rules; retain evidence and uncertain deliveries |
| CATALOG | Authorized read of reviewed visibility/approval/registry; sample public/hidden paths with checkout off and on | Correct reviewed visibility only; no approval or stock reset; preserve addresses |
| CHECKOUT | Real isolated enabled journey, last unit/retries/ledger; approved actual-provider smoke without real customer funds | Close new order intake while owned status/proof/admin settlement and recovery remain available |
| BROWSER | Isolated enforcing-CSP topology, private blob view, signed PUT origins and all public/mobile paths | Return to reviewed report-only mode only as approved; never broaden to `*` to bypass errors |
| SEO | Offline generator/Worker tests, reviewed input/media/publication IDs, exact route/query/HEAD/withdrawal/expiry behavior | Disable indexing; restore compatible artifact/routes. Robots/noindex are not a payment kill switch |
| META | Consent opt-in/out, sanitized receipts, shared event IDs and approved test-event procedure | Disable browser/CAPI delivery and preserve deduplication/history; never replay Purchase blindly |

## 9. Provider, scheduler and legal approval checklists

### R2 / media — separately authorized live tests required

- Confirm a public catalog bucket/domain and a **different private bucket** with no public domain, `r2.dev` access or public read policy. Use least-privilege separate credentials; no public writes.
- Public admin uploads travel through the API, not a browser public PUT. Confirm API body limits/timeouts, R2 conditional put/readback, deterministic content keys, unchanged imported URLs, immutable cache headers and record-save revisions. A new replacement uses a new hash URL; same bytes may safely deduplicate.
- Private browser PUT uses the S3 API origin, not a custom public-media domain. CORS must allow the exact approved storefront origin, PUT and required signed headers. Test preflight, content-length/type signing compatibility, expiry/network error, verification copy/ETag fence, private admin streaming and wrong-owner denial. Record only sanitized success evidence, never signed URLs or keys in public logs.
- Test content failure, provider timeout/ambiguous put, duplicate retry, refresh/account change, source-object cleanup after signed URL expiry and retained-object protection. Existing public media deletion stays disabled; no bucket-wide GC authorization is implied.

Cloudflare documents that browser presigned URLs require CORS and use the S3 API domain: [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/). These docs do not verify this account's permissions.

### Email / owner alerts / jobs

Choose one provider, do not enable both flag families indiscriminately. Gmail is the smallest setup if the owner deliberately uses the existing Gmail sender: backend-only app password, 2-Step Verification, matching authorized sender, quota/operational review and inbox tests. Resend is preferable for a dedicated branded transactional sender and independent delivery logs, but requires an owner-controlled verified domain/sender/DNS. It cannot authenticate `gmail.com` as this merchant's domain. Disable provider-side open/click tracking for these transactional messages unless separately approved.

Relevant official inputs: [Google app passwords](https://support.google.com/accounts/answer/185833), [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction). No credentials were requested or tested.

Confirm a **separate internal operations recipient**; never assume the public customer email is it. Cover order received/awaiting transfer/proof review/rejection/verified payment; shipping offer/acceptance; preparing/dispatch/delivered/cancelled/returned/refund; custom received/shared/accepted/closed; account verification/reset/security. Current templates/outbox support these families; actual deliverability is NOT VERIFIED. Ensure source snapshots, not frontend amounts or private notes/files, populate messages.

Proposed Render Cron service: same frozen compatible source, repository-root shared-file access, dedicated authorized DB identity/egress and reviewed Node version, a once-only bounded worker command. **Future template only, not executed:** `npm --prefix server run commerce:jobs -- --once --target production --confirm-writes --confirm-production-writes --batch-size 20 --max-duration-ms 60000`. Confirm current parser options before use. A one-minute UTC schedule (`* * * * *`) supports prompt polling if measured job time/capacity and platform scheduling permit it. Batches are bounded; a 20-message batch must be capacity-tested against peak events, not assumed sufficient. Notifications, optional Meta and temporary-upload cleanup share budget partitions; disabled Meta must stay disabled.

Render requires a separate cron resource and describes UTC scheduling: [Cron Jobs](https://render.com/docs/cronjobs). This is a proposal, not an authorization to create one. Worker must have both production-target and worker-write authorization. Alert on job absence/partial/interrupted runs, overdue queues, uncertain/dead messages, upload cleanup review and exhausted quota. External monitoring must reach a confirmed operator independently of a failed email provider; dashboard alone does not wake the owner.

### Owner / Egyptian legal sign-off

- Legal operator/seller name, address and applicable registration/tax/invoice disclosures; none may be invented.
- Confirm website/Instagram/public email and **+201508216472** support WhatsApp. Independently confirm **01060673073** as the InstaPay receiving destination. They are different roles/numbers.
- Appropriate Egyptian professional review of Law No. 181 of 2018, ordinary/distance-sale rights, genuine conforming personalized-goods exceptions, cancellation/production stages, damaged/incorrect goods, statutory refund method/deadline and the merchandise-first/separately confirmed delivery policy. No blanket no-refunds rule.
- Review English-only publication against required Arabic and seller disclosures. Implementing English as requested is not evidence of legal compliance. Source pages explicitly remain under owner/legal review.
- Confirm privacy/operator/provider processing/transfer disclosures, cookies/Meta consent, privacy requests/identity verification, temporary versus submitted/accepted-order retention, financial/legal holds and WhatsApp handling of evidence. No invented deletion period.
- Approve support staffing, 12-hour initial-contact procedure, bank statement reconciliation, refusal/late payment/cancellation/returns handling, operational escalation and claims/testimonial provenance.

Official legal-reference starting point: [CPA legislation library](https://cpa.gov.eg/en-us/Legislations) and [CPA returns guidance](https://cpa.gov.eg/ar-eg/%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA-%D8%A7%D8%B9%D9%84%D8%A7%D9%85%D9%8A%D8%A9/ArtMID/654/ArticleID/6790). This audit is not legal approval.

## 10. Exact dependency-ordered release and rollback runbook

Every infrastructure/data/live-test step below requires the separate explicit authorization appropriate to that step. **Nothing in this document executes or authorizes release.**

| Stage | Required work / GO evidence | NO-GO / recovery |
|---|---|---|
| **A — critical fixes** | Fix F01–F06, independent request gate and connected baseline; review F07 before indexing. Add regression cases including failed requirements, not just current implementation. | Any reproducible financial/stock/private-file/required-upload/mobile blocker remains: no launch. No disabling safeguards to pass tests. |
| **B — freeze/review tree** | Owner/developer review full 169-path preflight scope plus later fixes; classify every untracked script/backup; approve exact source manifest and lockfiles; independent review, complete passing frozen tests/advisory scan. | Missing runtime file, unexplained source change, secret or failing critical contract: stop. Preserve work; do not reset or bulk-add. |
| **C — source/deploy isolation** | Under separate approval, disable automatic deploys/hooks or use a verified isolated unconnected release branch/service; check both Render and Cloudflare Git integrations. Only then prepare reviewed commits/PR and immutable release SHA/artifact IDs. | No push/merge to a deploy-connected branch until isolation is verified. Keep prior deploy IDs and flags recorded privately. |
| **D — infrastructure/data plan** | Resolve Workers versus Pages, repository-root `shared`, exact auth/proxy/domain/Atlas target, schema delta, backup/restore rehearsal, journal and cutoff/retention plan. | Wrong root/host/schema/backup: no API release. Do not infer live values from examples. |
| **E — isolated provider environment** | Separately authorized isolated DB/buckets/safe mailboxes; actual signed PUT/public readback/email/inbox, enforcing CSP and physical devices; enabled end-to-end COD/InstaPay/custom quotation/refund/concurrency with synthetic records. | Mock-only provider results or failed supported device: no full launch. Correct/retire fixtures, not production guards. |
| **F — production migration** | With specific read/write approval, verified backup and intake closed: additive schema delta, registry verification, reviewed display-only patches and any explicitly approved legacy reconciliation. Read-only readiness and counts pass. | Conflict/uncertain result: stop and journal; do not retry an unverified batch or drop evidence. Reverse only captured compatible patches. |
| **G — dark deployment** | Deploy compatible API first with checkout closed **and custom intake independently closed**, delivery/Meta/indexing off; then exact frontend + Worker/assets + approved durable address routing. Health, aliases, account security and noindex smoke pass. | Frontend/API/Worker mismatch, missing shared import or unexpected request intake: revert compatible artifacts or maintain intake closed. No schema DDL at API startup. |
| **H — actual-provider synthetic smoke** | Authorized synthetic-only production tests: public/private R2 privacy/CORS/readback; sender/inbox/owner alerts; exact domains/cookies/CSRF/CSP; idempotent mock/manual payment-record scenarios with **no real customer money**. Decide whether synthetic order records are permitted before creating any. | Do not call configuration booleans provider proof. Hold queues/history; preserve any accepted synthetic records and evidence according to approved cleanup plan. |
| **I — dependency activation** | Confirm staffed owner, sender/cutoff/scheduler/monitoring; display data and public media; private storage; independently approve request intake; activate checkout flags only after product/inventory/method eligibility and rollback pass. | Any dependency off/unready: leave dependent feature off. Do not set every false flag true. Turning checkout off must preserve owned order lookup/proof/settlement recovery. |
| **J — live acceptance** | Separately approved controlled end-to-end test on the real domain for every supported device/payment/order/request path, including actual provider evidence and any explicitly authorized payment reconciliation. Owner proves contact/share/accept/payment/fulfillment distinctions. | No uncontrolled real order/payment/email. Failed supported flow: close affected new intake and reconcile accepted activity, never erase it. |
| **K — SEO/optional systems** | Legal approval, durable mixed-catalog routing, approved-only SEO records/media/current publication + refresh/withdrawal monitor; verify robots/sitemap/canonicals/real HTTP. Meta separately requires approved policy, consent and deduplication test. | Keep SEO/Meta disabled until their own gates pass; they are not required to take the first commerce order. Do not publish drafts/prices/stock through approved SEO exports. |
| **L — handoff/monitoring** | Owner signs an actual-task acceptance session; has support procedures, least-privilege admin access, recovery contact, dashboard/alert monitoring and approved runbook. Record release SHA/settings/deploy IDs privately. | Unstaffed contact obligation or owner needs DB/developer for ordinary tasks: handoff not complete. Continue controlled intake/monitoring, not an unreviewed full rollout. |

Current official deployment inputs: [Render automatic deploy controls](https://render.com/docs/deploys), [Render root-directory rules](https://render.com/docs/monorepo-support), [Render rollback behavior](https://render.com/docs/rollbacks), [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/). Platform settings were not read or changed. “Root repository with `npm ci --prefix server` / `npm start --prefix server`” is a proposed compatible command arrangement, not evidence of today's Render configuration. Pin reviewed Node and artifact versions; avoid relying on a moving latest CLI.

### Rollback detail

1. Stop new checkout and custom-request intake separately; suspend optional marketing/notification dispatch if compromised. Keep owned status recovery and safe admin reconciliation available. Announce any interruption through approved manual procedures, not automated unapproved messages.
2. Record the last accepted order/request/settlement/event and deployment/settings IDs. Determine whether new schema/state writes occurred before choosing a code rollback.
3. Roll back API/frontend/Worker as a tested compatible set using immutable artifacts. An older deployment may not understand new orders/ledger/requests. Prefer forward-fix or a compatible read-only operational mode if rolling back would lose access to paid work.
4. Do not drop new collections, delete aliases, reset inventory, reverse discounts or restore yesterday's DB over accepted orders. Restore backups only through a separate recovery plan that reconciles every later payment/write. Public/private object evidence stays retained.
5. For email uncertainty, inspect actual provider acceptance; close/reconcile rather than replay. Preserve Purchase and settlement dedupe records. Do not move notification cutoff backwards. Re-enable only after the original failure and new intake gates are revalidated.

## 11. Objective GO / NO-GO and post-launch monitoring

**GO for full commerce only when:** no unaccepted P0/P1 remains; F01/F02 financial regressions pass; required chooser and touch pause work; corrupt files are rejected; permanent routes survive expiry and ordinary rebuild; current schema/data transition is reviewed; supported physical devices pass; real R2/private access and email/owner alerts are verified; the owner can reconcile/fulfil/refund and meet initial contact; frozen connected enabled contracts pass; legal/operator/retention publication sign-off and deployment/backup/rollback approval are recorded. Ordinary positive-price products and pending/Free components must behave honestly. No actual live readiness is implied by this report.

**NO-GO if:** a required upload cannot complete; any private file is public/wrongly attached; stock is inferred; a truthful refund cannot be recorded; known friendly routes regularly expire to 503; real R2 is unverified; supported mobile checkout/request is blocked; notifications/contact obligations are unstaffed; schema/target/readiness is wrong; or the release can deploy unintentionally. Indexing and Meta have separate later GO gates and can remain off.

Post-launch operations, after separately authorized release:

- Watch API readiness/error/latency, deployment version, failed checkout/quote/idempotency/stock conflicts and rate-limit/proxy anomalies. Use safe request IDs, no customer text/secrets in alerts.
- Check new orders/requests, uncontacted age, 9-hour reminder eligibility, 12-hour overdue, payment review, pending delivery/acceptance and refund exceptions. Initial-contact email sequence remains maximum two; monitor dashboard-only overdue and late contact clearing.
- Monitor cron completion/heartbeat, queue age, failed/uncertain/dead messages, provider quotas/inbox and R2 verification/cleanup-review/quota errors. Confirm the first scheduled cycles and an actual restart recovery. Alert through an independent confirmed operations channel if email itself fails.
- Track accepted/collected/refunded/outstanding allocations, bank-reference duplicates, unpaid reservations, returns/stock reconciliation and discount reversal. Reconcile against receiving-account/COD records; a screenshot is never the settlement.
- Probe legacy/friendly GET/HEAD/query/withdrawn routes, publication/registry freshness, real 404/503 and robots/noindex. For later indexing, review Search Console and rebuild/withdraw current approved snapshots when catalog/media/price/stock changes.
- Record incidents and operator decisions; rehearse backups/restores and access revocation. Review capacity and retention from observed traffic without inventing deletion periods. Owner/developer agree monitoring frequency and escalation coverage before enabling intake.

## 12. Tests actually executed during this audit

| Check | Actual result | Limits |
|---|---|---|
| Focused backend runner: checkout foundation, service requests, product personalization, catalog media, commerce storage, operational readiness, visibility service/policy, auth, website admin and Meta contracts | **157/157 PASS** | Fresh local replica sets; provider integrations mocked/disabled |
| Additional backend release boundaries: product addresses, SEO export, inventory revisions, earlier commerce and operations | **86/90 PASS; 4 FAIL** | Disposable local replica sets; four stale cancellation/COD expectations detailed in F10; log `server/.cache/release-audit-boundaries.tap` |
| New non-source audit probes | **5/5 reproductions/measurements executed** | Catalog scale PASS; stock/refund/corrupt-file probes intentionally demonstrate FAIL; request intake demonstrates independent boundary |
| Catalog-scale fixture | 1,595 products / 209 categories; checkout on, preview off; 1,276 explicitly public mixed records; 24 list/sort/range requests capped 20; one text query | Latest local p50 **23 ms**, p95 **44 ms**, max **50 ms**. Warm local DB measurements, not HTTP/CDN/mobile or production capacity |
| Focused frontend flows | **37/37 PASS** | Edge fixtures/mocked APIs: pages, mixed catalog, checkout, personalization, requests, media and attention; no physical phone/provider proof |
| Existing connected API/browser selection | **3 PASS / 3 FAIL** | Old Gift Box/visibility expectations; isolated API/DB, no production. Teardown stalled after all six cases; owned run interrupted |
| Added enabled connected guest COD | **PASS** | Actual React/API/disposable DB; guest ownership/reload; storage/email/payment not real |
| Added enabled connected personalization/InstaPay/admin file viewing | **PASS on focused recheck** | Initial audit harness raced admin login/navigation; fixed only ignored harness and reran. Actual API/DB/memory storage, no real transfer/R2/email |
| Actual local video/picker audit | Pointer-pause test **FAIL**; poster/reduced-motion and reselection checks PASS; keyboard-assisted decode continuation PASS | All four MP4s decoded in Edge; continuation does not change original pointer FAIL |
| Worker targeted probe | Fresh legacy 308/friendly 200 PASS; expired both 503 and indexed unindexed-draft 404 reproduced | Mock ASSETS binding, no deployment or data export |
| `npm run test:seo` | **65/65 PASS** | Current tests include expiry behavior that fails the permanent-production requirement |
| `npm run lint` from client | **PASS** | No source fixes made |
| Server syntax script | **165 JavaScript files PASS** | Syntax only, not production import/provider proof |
| Isolated Vite production build | **PASS**, Vite 8.3.4 | Scrubbed environment, no `.env`, Meta/indexing off, ignored output; no SEO export/publication/deploy |
| Offline package/model inventories | Manifest/lock root dependencies match; current model/index list extracted without connection | No current advisory scan or Atlas index inventory |

Audit artifacts: `client/test-results/release-audit/` and `server/.cache/release-audit-*`. These contain synthetic logs, screenshots, traces and test-only harnesses, not release source. Some first attempts had audit-harness path/API/fixture mistakes (wrong working directory, memory adapter method, missing fixture gallery, login navigation); corrected only ignored artifacts. These are distinguished from the reproduced application failures. Connected teardown interruption is disclosed rather than reported as a clean runner PASS. No test rate limit, source guard, production configuration or existing test expectation was modified to obtain results.

The initial picker automation and mocked R2 successes do not establish native-gallery/camera behavior or provider readiness. No physical device, live store/API/database, real email/WhatsApp/payment, actual R2 upload, production schedule or environment was accessed/changed. Official provider documentation browsing was read-only. No release was started.

## 13. What must happen before the first real order

Approve and fix the confirmed stock, refund, upload, hero-control, file-integrity and permanent-routing defects; repair the frozen connected acceptance gate. Isolate automatic deployment, approve backups/schema/display transition, complete legal/operator/retention sign-off, verify real private/public storage and transactional/owner notifications, and pass supported physical-device flows. Then authorize the coordinated release and staged commerce activation with accurate product prices/availability and an owner ready to contact, reconcile and fulfil. Keep indexing/Meta off until their separate gates pass. **Wait for review and explicit authorization before any fix, migration, provider test or release action.**

<!-- Generated offline reference appendices follow. -->

## Appendix A — exact runtime settings inventory

Every live value below is **UNKNOWN / not inspected**. `Where` describes intended ownership, not a verified service. `Family` refers to the explicit verification/recovery procedures in section 8; stage names are dependency gates, not instructions to change settings now. There are no secret values in this table.

| Variable | Where | Secret/sensitivity | Repository default | Required value / prerequisite | Earliest approved stage | Verify / recover family |
|---|---|---|---|---|---|---|
| NODE_ENV | API/jobs | No | development | production, after target/topology approval | R1 | DB |
| PORT | API | No | 4000 | Render-assigned port; bind public interface | R1 | DB |
| MONGODB_URI | API/jobs, server secret store | YES | loopback development URI | Approved Atlas TLS URI for exact production DB; never frontend | R1 | DB |
| DATABASE_TARGET | API/jobs | No | local | production only with exact host/name authorization | R1 | DB |
| PRODUCTION_DATABASE_AUTHORIZED | API/jobs | No | false | true only after approved production DB access/schema plan | R1 | DB |
| PRODUCTION_DATABASE_HOST | API/jobs | Private identifier | blank | Exact privately verified Atlas hostname matching URI | R1 | DB |
| PRODUCTION_WORKER_AUTHORIZED | Cron only | No | false | true only after separate production worker-write approval | R3 | JOB |
| DATABASE_CONNECT_ATTEMPTS | API/jobs | No | 3 | Reviewed 1-5; default 3 adequate unless measured otherwise | R1 | DB |
| DATABASE_RETRY_BASE_MS | API/jobs | No | 500 | Reviewed 1-5000 ms; default 500 | R1 | DB |
| SHUTDOWN_TIMEOUT_MS | API/jobs | No | 15000 | Reviewed 100-30000 ms, fits platform shutdown | R1 | DB |
| MONGODB_DNS_OVERRIDE_ENABLED | Development script/API only | No | false | OFF in production; code rejects remote production override | R0 | DB |
| MONGODB_DNS_SERVERS | Development only | No | blank | Blank in production; no OS DNS changes | R0 | DB |
| AUTH_DEPLOYMENT_MODE | API/jobs operational config | No | local | same-site for tapandwrap.net and api.tapandwrap.net; same-origin only if actually proxied | R1 | AUTH |
| AUTH_TOPOLOGY_APPROVED | API/jobs operational config | No | false | true only after domain/cookie/proxy acceptance | R1 | AUTH |
| API_PUBLIC_ORIGIN | API/jobs | No | blank | https://api.tapandwrap.net, exact approved origin | R1 | AUTH |
| AUTH_SITE_DOMAIN | API/jobs | No | blank | tapandwrap.net for reviewed same-site mode | R1 | AUTH |
| CLIENT_ORIGIN | API/jobs | No | http://localhost:5173 | https://tapandwrap.net, exact CORS/Origin allowlist target | R1 | AUTH |
| TRUST_PROXY_CIDRS | API | Private topology | blank | Only observed verified immediate proxy IPs/CIDRs; never true or a guessed hop count | R1 | AUTH |
| SESSION_SECRET | API/jobs, server secret store | YES | invalid REPLACE placeholder | Strong existing/random secret; review rotation/session/account-link impact | R1 | AUTH |
| STAGING_PREVIEW_ENABLED | Isolated staging API only | No | false | OFF in production; cannot replace permanent visibility | R0 | CATALOG |
| CATALOG_BROWSE_PREVIEW_ENABLED | API, obsolete compatibility setting | No | false | Retired: function returns false regardless; do not rely on it or flip it for launch | R0 | CATALOG |
| PRODUCT_ALIASES_ENABLED | API/schema/scripts | No | false example | Preserve owner-reported true after current registry/index verification; do not casually turn off | R1/R4 | CATALOG |
| CATALOG_MEDIA_BASE_URL | API, exporter | No | blank | Approved existing public catalog HTTPS base URL, including exact prefix; verify imported keys | R1/R4 | MEDIA |
| CATALOG_MEDIA_UPLOADS_ENABLED | API/schema | No | false | ON only after CatalogMedia schema, separate public bucket and provider checks | R2/R4 | MEDIA |
| CATALOG_R2_ACCOUNT_ID | API only | Private identifier | blank | Account for public catalog bucket; never private proof settings | R1 | MEDIA |
| CATALOG_R2_ACCESS_KEY_ID | API secret store | YES | blank | Least-privilege public catalog object credential | R1/R2 | MEDIA |
| CATALOG_R2_SECRET_ACCESS_KEY | API secret store | YES | blank | Matching scoped public catalog credential | R1/R2 | MEDIA |
| CATALOG_R2_BUCKET | API only | Private identifier | blank | Public catalog bucket distinct from private R2_BUCKET | R1 | MEDIA |
| STORAGE_ENABLED | API/jobs | No | false | ON only after private bucket/CORS/ownership/cleanup acceptance; before required-photo or InstaPay sales | R2/R4 | MEDIA |
| R2_ACCOUNT_ID | API/jobs only | Private identifier | blank | Account hosting genuinely private customer storage | R1 | MEDIA |
| R2_ACCESS_KEY_ID | API/jobs secret store | YES | blank | Least-privilege private-object PUT/HEAD/GET/COPY/DELETE capability reviewed for jobs | R1/R2 | MEDIA |
| R2_SECRET_ACCESS_KEY | API/jobs secret store | YES | blank | Matching private storage credential; never VITE | R1/R2 | MEDIA |
| R2_BUCKET | API/jobs only | Private identifier | blank | Private bucket; no public read domain or r2.dev access | R1 | MEDIA |
| CHECKOUT_ENABLED | API | No | false | ON only with all commerce GO criteria; AND gate with launch authorization | R5 | CHECKOUT |
| COMMERCE_LAUNCH_AUTHORIZED | API | No | false | Owner-approved true only at controlled commerce activation | R5 | CHECKOUT |
| EMAIL_PROVIDER | API/jobs | No | gmail example; resend code fallback | Select exactly gmail or resend after sender decision | R1/R2 | EMAIL |
| EMAIL_ENABLED | API/jobs, Gmail branch | No | false | ON only for approved Gmail delivery; does not enable Resend branch | R2/R3 | EMAIL |
| EMAIL_USER | API/jobs, Gmail | Private address | blank | Authorized Gmail sender account; not assumed equal to operations recipient | R1 | EMAIL |
| EMAIL_APP_PASSWORD | API/jobs secret store, Gmail | YES | blank | Google-issued app password after 2-Step Verification; never account password | R1/R2 | EMAIL |
| EMAIL_FROM_NAME | API/jobs | No | Tap & Wrap | Approved Tap & Wrap sender display name, no header injection | R1 | EMAIL |
| EMAIL_SMOKE_TEST_ENABLED | Explicit smoke command only | No | false | Leave OFF normally; one authorized restricted test only | R2 | EMAIL |
| NOTIFICATIONS_ENABLED | API/jobs, Resend branch | No | false | ON only for approved Resend branch; not a universal Gmail switch | R2/R3 | EMAIL |
| RESEND_API_KEY | API/jobs secret store, Resend | YES | blank | Scoped key for verified merchant sender domain | R1/R2 | EMAIL |
| NOTIFICATION_FROM | API/jobs, Resend | No | blank | Approved sender at verified merchant domain; cannot spoof Gmail domain | R1 | EMAIL |
| NOTIFICATION_SAFE_RECIPIENTS | API/jobs/smoke | Private recipient list | blank | Only approved synthetic mailboxes while testing; maintain explicit restriction until live authorization | R2 | EMAIL |
| NOTIFICATION_LIVE_DELIVERY_ENABLED | API/jobs | No | false | true only with production target and explicit real-recipient authorization | R3/R5 | EMAIL |
| NOTIFICATION_DELIVERY_NOT_BEFORE | API/jobs | No | absent; sending held | Reviewed UTC ISO cutoff; never move backwards to replay old queue | R2/R3 | EMAIL |
| OWNER_NOTIFICATIONS_ENABLED | API/jobs | No | absent; false | ON after staff mailbox/worker/contact process verification | R3 before intake | EMAIL |
| OWNER_NOTIFICATION_RECIPIENT | API/jobs | Private internal address | absent | Separately confirmed operations mailbox, not automatically public support | R1/R2 | EMAIL |
| OWNER_NOTIFICATION_RECIPIENT_CONFIRMED | API/jobs | No | absent; false | true only after actual owner confirmation/receipt test | R2/R3 | EMAIL |
| META_ENABLED | API/jobs | No | false | OFF until separate owner policy/consent activation; optional | R6 | META |
| META_POLICY_APPROVED | API/jobs | No | false | Owner/legal-approved consent/privacy policy before Meta enablement | R6 | META |
| META_CAPI_ENABLED | API/jobs | No | false | Optional ON after dedup/revocation/provider acceptance; never inferred from browser flag | R6 | META |
| META_PIXEL_ID | API/tracking public config | Identifier | blank | Actual approved pixel ID; unnecessary while off | R6 | META |
| META_ACCESS_TOKEN | API/jobs secret store | YES | blank | Scoped approved CAPI token; never browser/VITE | R6 | META |
| META_API_VERSION | API/jobs | No | blank | Explicit reviewed supported version, not guessed latest | R6 | META |
| META_CONSENT_POLICY_VERSION | API/jobs | No | blank | Approved stable policy/version used for current consent | R6 | META |
| SITE_ORIGIN | API/tracking/jobs | No | blank | https://tapandwrap.net for approved server tracking config | R6 | META |
| VITE_API_BASE_URL | Cloudflare frontend build | No | http://localhost:4000/api/v1 | https://api.tapandwrap.net/api/v1; build-time value, requires rebuild when changed | R0/R1 | AUTH |
| VITE_SITE_URL | Cloudflare frontend build | No | http://localhost:5173 | https://tapandwrap.net; matches SEO generator canonical origin | R0/R1 | SEO |
| VITE_CHECKOUT_ENABLED | Frontend example only | No | false | No runtime reader found; backend/cart/config gates are authoritative. Do not treat true as authorization | R0 | CHECKOUT |
| VITE_META_ENABLED | Cloudflare frontend build | No | false | OFF until separately approved browser tracking/consent and matching backend/CSP | R6 | META |
| VITE_SEO_INDEXING_ENABLED | Cloudflare frontend build | No | false | OFF until correct reviewed publication/routing/legal gate; cannot independently index a route | R6 | SEO |
| SEO_INDEXING_ENABLED | Cloudflare Worker runtime | No | false | OFF for commerce prelaunch; enable only after F06/F07 and reviewed publication | R6 | SEO |
| SEO_EXPECTED_PUBLICATION_ID | Cloudflare Worker runtime | No | blank | Exact current approved manifest publication ID, not arbitrary hash | R6 | SEO |
| SEO_WITHDRAWN_PATHS | Cloudflare Worker runtime | No | blank | Reviewed emergency product/category paths; bounded 500 entries, not an automatic admin invalidation system | R4/R6 | SEO |
| BROWSER_CSP_MODE | Cloudflare Worker runtime | No | report-only | Enforce after exact-origin/provider/private-blob tests; report-only alone is not protection | R2/R4 | BROWSER |
| BROWSER_API_ORIGINS | Cloudflare Worker runtime | No | blank | Exact https://api.tapandwrap.net origin | R1/R2 | BROWSER |
| BROWSER_MEDIA_ORIGINS | Cloudflare Worker runtime | No | blank | Actual approved public catalog-media origin(s), no private public URL | R1/R2 | BROWSER |
| BROWSER_UPLOAD_ORIGINS | Cloudflare Worker runtime | No | blank | Exact private signed-PUT S3 API origin(s), not a public custom-domain replacement | R1/R2 | BROWSER |
| BROWSER_TRACKING_ALLOWED | Cloudflare Worker runtime | No | false | OFF until matching Meta/consent approval and explicit script/connect origins | R6 | BROWSER |

Additional configuration owned outside environment variables:

- Workers Static Assets binding `ASSETS`, `assets.directory`, `main`, `html_handling`, `not_found_handling`, `run_worker_first`, domains/routes and compatibility date: current `client/wrangler.jsonc`; verify matching frontend/Worker artifact as a unit. No Pages wrapper is generated. DNS/TLS/custom domain/redirects are dashboard/DNS configuration, not proof from that file.
- Build-time generator arguments: `--input`, `--content` (legacy content bodies are now ignored), `--product-compatibility`, `--site-origin`, `--max-age-seconds`, `--minimum-category-products`, `--publish`. Approved export/media/publication inputs must be explicitly reviewed; default `npm run build` does not supply them. There is no authorized production SEO export implied by any flag.
- `contentPublicationApproved=false` is a code review/publication gate, not an owner admin switch. Change only after missing legal disclosures/sign-off; keep indexing separately controlled.
- Render branch, auto-deploy trigger/build filters/root/start/build commands, health path `/health/ready`, plan capacity and cron resources; Atlas roles/TLS/egress/index authorization; R2 bucket privacy/CORS/domain/cache and email-domain DNS are separate platform prerequisites. No actual settings were retrieved.

### Script-only / test-only environment names (not blanket production settings)

| Name | Purpose / sensitivity / default / activation & recovery |
|---|---|
| `CATALOG_IMPORT_STAGING_URI` | Secret, explicit staging importer URI only; blank/off ordinarily; never production fallback. Read/write/import authorization and exact staging guards remain mandatory. |
| `PRODUCT_ALIAS_MIGRATION_URI` | Secret terminal-only alias planner/executor target; absent normally. Separate read/backfill permission and production confirmations required; preserve all reservations on rollback. |
| `TAP_WRAP_CATALOG_WRITE_APPROVED` | Explicit guarded one-off transfer-script write authorization, not an API feature switch; absent normally. Do not set for ordinary runtime or run transfer scripts as release migration. |
| `TAP_WRAP_SKIP_DOTENV` | Operational/test scripts explicitly prevent developer `.env` loading; true in isolated/authorized script composition, not permission to use production. |
| `TAP_WRAP_ISOLATED_TEST` | Isolated frontend build/test signal preventing `.env` loading; never a public production activation setting. |
| `NODE_OPTIONS` | Node runtime options; no application-specific production default. Tests explicitly clear it; do not inherit unreviewed loaders/runtime flags. |
| `PLAYWRIGHT_CHANNEL` | Test browser selection; Windows defaults Edge. Does not prove Safari/iOS/Android support. |
| `MONGOMS_SYSTEM_BINARY`, `MONGOMS_RUNTIME_DOWNLOAD`, `MONGOMS_DOWNLOAD_DIR`, `MONGOMS_PREFER_GLOBAL_PATH` | Disposable test infrastructure only. Cached owned binary, no auto-download or arbitrary system-binary override in this audit. No Atlas target. |
| `DOTENV_CONFIG_PATH` | Test/operational no-env-file guard; not a production credential source. |
| `PATH`/`Path`, `SystemRoot`, `WINDIR`, `TEMP`, `TMP`, `COMSPEC`, `PATHEXT`, `USERPROFILE`, `LOCALAPPDATA`, `APPDATA` | OS-only whitelist forwarded by isolated launchers, not store feature flags or merchant settings. |

The source scan also covered configuration-object references, not only `.env.example`. Owner/cutoff settings missing from that example still exist and are required for notifications. Unknown/unlisted live secrets must be reviewed privately, never pasted into this report.

## Appendix B — current declared collection/index specification

Extracted offline from current models. **Not an instruction to create everything blindly.** Diff against a separately authorized current index read. Every collection also has MongoDB?s implicit `_id` unique index. Ordered keys matter; `UNIQUE`, `SPARSE`, `PARTIAL` and TTL seconds are part of the contract. Text indexes use the declared fields/weights; runtime verification accounts for MongoDB?s `_fts/_ftsx` representation. Default background build options are omitted here; no index was created on production.

| Model / collection | Declared indexes |
|---|---|
| OrderSettlement / `ordersettlements` | `{"referenceKey":1}` **UNIQUE**<br>`{"orderId":1,"operationKey":1}` **UNIQUE**<br>`{"orderId":1,"createdAt":1,"_id":1}` |
| Product / `products` | `{"externalCatalogId":1}` **UNIQUE** SPARSE<br>`{"slug":1}` **UNIQUE**<br>`{"name":"text"}`<br>`{"status":1,"featured":-1,"featuredOrder":1,"createdAt":-1,"_id":-1}`<br>`{"status":1,"bestSeller":-1,"bestSellerOrder":1,"createdAt":-1,"_id":-1}`<br>`{"status":1,"priceApproved":1,"inventory.approved":1,"categoryId":1,"createdAt":-1,"_id":-1}`<br>`{"status":1,"categoryId":1,"subcategoryId":1,"createdAt":-1,"_id":-1}`<br>`{"status":1,"pricePiastres":1,"_id":1}`<br>`{"status":1,"name":1,"_id":1}`<br>`{"createdAt":-1,"_id":-1}` |
| Category / `categories` | `{"slug":1}` **UNIQUE**<br>`{"parentId":1,"nameNormalized":1}` **UNIQUE**<br>`{"importCategoryKey":1}` **UNIQUE** PARTIAL `{"importCategoryKey":{"$type":"string"}}`<br>`{"active":1,"parentId":1,"order":1,"_id":1}` |
| ComponentOption / `componentoptions` | `{"externalCatalogId":1}` **UNIQUE** SPARSE<br>`{"slug":1}` **UNIQUE**<br>`{"categoryId":1,"createdAt":-1,"_id":-1}`<br>`{"name":"text"}`<br>`{"updatedAt":-1,"_id":-1}` |
| User / `users` | `{"email":1}` **UNIQUE**<br>`{"role":1,"createdAt":-1,"_id":-1}`<br>`{"role":1,"name":1,"_id":1}` |
| Session / `sessions` | `{"tokenHash":1}` **UNIQUE**<br>`{"userId":1}`<br>`{"expiresAt":1}` TTL 0 seconds |
| ServiceRequest / `servicerequests` | `{"reference":1}` **UNIQUE**<br>`{"owner":1,"requestKey":1}` **UNIQUE**<br>`{"state":1,"createdAt":-1,"_id":-1}`<br>`{"followUpDueAt":1,"state":1}` |
| Cart / `carts` | `{"owner":1}` **UNIQUE**<br>`{"expiresAt":1}` TTL 0 seconds |
| Order / `orders` | `{"orderNumber":1}` **UNIQUE**<br>`{"owner":1,"checkoutKey":1}` **UNIQUE**<br>`{"createdAt":-1,"_id":-1}`<br>`{"userId":1,"createdAt":-1,"_id":-1}`<br>`{"fulfillmentState":1,"createdAt":-1,"_id":-1}`<br>`{"paymentState":1,"createdAt":-1,"_id":-1}` |
| CheckoutIntent / `checkoutintents` | `{"owner":1,"checkoutKey":1}` **UNIQUE**<br>`{"expiresAt":1}` TTL 86400 seconds |
| DiscountRedemption / `discountredemptions` | `{"orderId":1,"discountId":1}` **UNIQUE**<br>`{"discountId":1,"userId":1}` |
| CustomizationTemplate / `customizationtemplates` | `{"key":1,"version":1}` **UNIQUE**<br>`{"kind":1,"status":1,"active":1,"updatedAt":-1}`<br>`{"updatedAt":-1,"_id":-1}`<br>`{"status":1,"kind":1,"updatedAt":-1,"_id":-1}`<br>`{"name":"text"}` |
| DiscountCode / `discountcodes` | `{"code":1}` **UNIQUE**<br>`{"active":1,"startsAt":1,"endsAt":1}`<br>`{"updatedAt":-1,"_id":-1}`<br>`{"name":"text","code":"text"}` |
| BundleRule / `bundlerules` | `{"active":1,"priority":1,"_id":1}`<br>`{"published":1,"active":1,"priority":1,"_id":1}`<br>`{"updatedAt":-1,"_id":-1}`<br>`{"name":"text"}` |
| ShippingConfig / `shippingconfigs` | `{"key":1}` **UNIQUE** |
| Upload / `uploads` | `{"owner":1}`<br>`{"state":1,"expiresAt":1,"cleanupLeaseUntil":1}`<br>`{"owner":1,"state":1,"createdAt":-1}`<br>`{"orderId":1,"purpose":1}`<br>`{"state":1,"signedExpiresAt":1}`<br>`{"cleanupReviewRequired":1,"cleanupNextAttemptAt":1,"expiresAt":1}` |
| UploadQuota / `uploadquotas` | `{"owner":1}` **UNIQUE** |
| NotificationEvent / `notificationevents` | `{"eventKey":1}` **UNIQUE**<br>`{"state":1,"nextAttemptAt":1,"leaseUntil":1}`<br>`{"state":1,"expiresAt":1,"_id":1}`<br>`{"state":1,"leaseUntil":1,"attempts":1}`<br>`{"orderId":1,"createdAt":-1}`<br>`{"requestId":1,"createdAt":-1}`<br>`{"userId":1,"createdAt":-1}`<br>`{"state":1,"createdAt":-1,"_id":-1}`<br>`{"createdAt":-1,"_id":-1}` |
| AdminAudit / `adminaudits` | `{"resourceType":1,"resourceId":1,"createdAt":-1}`<br>`{"actorId":1,"createdAt":-1}` |
| CommerceControl / `commercecontrols` | Implicit `_id` only; no extra declared index |
| CommerceJobRun / `commercejobruns` | `{"runId":1}` **UNIQUE**<br>`{"state":1,"leaseUntil":1}`<br>`{"startedAt":-1,"_id":-1}` |
| Review / `reviews` | `{"productId":1,"status":1,"approved":1,"createdAt":-1,"_id":-1}`<br>`{"status":1,"approved":1,"featured":1,"displayOrder":1,"_id":1}`<br>`{"updatedAt":-1,"_id":-1}`<br>`{"authorLabel":"text","text":"text"}` |
| SiteContent / `sitecontents` | `{"key":1}` **UNIQUE** |
| AccountActionToken / `accountactiontokens` | `{"tokenHash":1}` **UNIQUE**<br>`{"expiresAt":1}` TTL 0 seconds<br>`{"userId":1,"purpose":1,"consumedAt":1,"createdAt":-1}` |
| EmailRateWindow / `emailratewindows` | `{"key":1}` **UNIQUE**<br>`{"expiresAt":1}` TTL 0 seconds |
| TrackingConsent / `trackingconsents` | `{"tokenHash":1}` **UNIQUE**<br>`{"expiresAt":1}` TTL 0 seconds |
| MetaEvent / `metaevents` | `{"eventId":1}` **UNIQUE**<br>`{"dedupKey":1}` **UNIQUE**<br>`{"state":1,"nextAttemptAt":1,"leaseUntil":1}`<br>`{"consentId":1,"state":1}`<br>`{"expiresAt":1}` TTL 0 seconds |
| CatalogMedia / `catalogmedias` | `{"key":1}` **UNIQUE**<br>`{"createdAt":-1,"_id":-1}` |
| ProductAddress / `productaddresses` | `{"slug":1}` **UNIQUE**<br>`{"productId":1}` **UNIQUE** PARTIAL `{"canonical":true}`<br>`{"productId":1,"slug":1}` |

`config/schema.js:19?23` always includes commerce, requests and ledger structures; `CatalogMedia` is conditional on `CATALOG_MEDIA_UPLOADS_ENABLED`, `ProductAddress` on aliases. Schema initialization must deliberately include the reviewed future modules while public activation remains separate. Current stock/visibility/personalization/engraving/request-policy fields are data compatibility changes, not automatic price/inventory approval. Notification/job lease/dispatch/cutoff semantics are not satisfied by indexes alone. Historical orders, SiteContent documents, component identities and product addresses must remain intact. No evidence collection has an automatic retention TTL.

## Appendix C — complete preexisting changed-path manifest

Captured before writing this report: ` M` = tracked unstaged modification; `??` = preexisting untracked file. Zero staged entries. These paths are review scope, not instructions to add/delete/execute them. Audit adds only this report plus ignored non-source artifacts.

```text
 M client/e2e/batch2-admin.spec.js
 M client/e2e/catalog-browser.spec.js
 M client/e2e/catalog-fixtures.js
 M client/e2e/website-admin.spec.js
 M client/e2e/website-public.spec.js
 M client/scripts/catalog-form.test.js
 M client/scripts/generate-seo.js
 M client/scripts/seo/generator.js
 M client/scripts/seo/generator.test.js
 M client/scripts/seo/worker.test.js
 M client/src/App.jsx
 M client/src/admin.css
 M client/src/admin/AdminLayout.jsx
 M client/src/admin/catalog-form.js
 M client/src/admin/order-actions.js
 M client/src/commerce/AdminEditors.jsx
 M client/src/commerce/api.js
 M client/src/commerce/commerce.css
 M client/src/components/CatalogDialog.jsx
 M client/src/components/Footer.jsx
 M client/src/components/ProductCard.jsx
 M client/src/components/PublicContent.jsx
 M client/src/content/final-faq.js
 M client/src/pages/AdminCommercePage.jsx
 M client/src/pages/AdminOrderPage.jsx
 M client/src/pages/AdminProductConfigurationPage.jsx
 M client/src/pages/AdminProductFormPage.jsx
 M client/src/pages/AdminProductsPage.jsx
 M client/src/pages/AdminWebsitePage.jsx
 M client/src/pages/CartPage.jsx
 M client/src/pages/CheckoutPage.jsx
 M client/src/pages/HomePage.jsx
 M client/src/pages/OrdersPage.jsx
 M client/src/pages/ProductPage.jsx
 M client/src/pages/StaticPage.jsx
 M client/src/pages/TrackOrderPage.jsx
 M client/src/seo/metadata.js
 M client/src/services/website.js
 M client/worker/seo-worker.js
 M docs/PRODUCT_ALIAS_ACTIVATION.md
 M server/.env.example
 M server/package.json
 M server/scripts/email-smoke-test.js
 M server/scripts/export-seo-catalog.js
 M server/scripts/run-commerce-jobs.js
 M server/src/catalog/product-policy.js
 M server/src/catalog/public-presentation.js
 M server/src/catalog/service.js
 M server/src/catalog/validation.js
 M server/src/commerce/cart.js
 M server/src/commerce/configuration.routes.js
 M server/src/commerce/customization.js
 M server/src/commerce/models.js
 M server/src/commerce/notifications.js
 M server/src/commerce/order-presentation.js
 M server/src/commerce/orders.js
 M server/src/commerce/pricing-context.js
 M server/src/commerce/pricing.js
 M server/src/commerce/promotions.js
 M server/src/commerce/routes.js
 M server/src/commerce/uploads.js
 M server/src/commerce/uploads.routes.js
 M server/src/config/schema.js
 M server/src/email/settings.js
 M server/src/email/templates.js
 M server/src/models/Cart.js
 M server/src/models/ComponentOption.js
 M server/src/models/DiscountRedemption.js
 M server/src/models/NotificationEvent.js
 M server/src/models/Order.js
 M server/src/models/Product.js
 M server/src/models/Upload.js
 M server/src/routes/admin.routes.js
 M server/src/website/routes.js
 M server/src/website/service.js
 M server/test/batch1-inventory-revision.test.js
 M server/test/batch3-catalog-efficiency.test.js
 M server/test/batch3-commerce.test.js
 M server/test/catalog-api.test.js
 M server/test/catalog-models.test.js
 M server/test/catalog-phase1b.test.js
 M server/test/commerce-configuration-api.test.js
 M server/test/commerce-configuration.test.js
 M server/test/commerce-orders.test.js
 M server/test/commerce-storage.test.js
 M server/test/helpers/connected-api-server.js
 M server/test/phase3-account.test.js
 M server/test/phase3-tracking.test.js
 M server/test/product-addresses.test.js
 M server/test/seo-export.test.js
 M server/test/website-admin.test.js
?? BATCH2_CATALOG_PREVIEW_FAQ_README.txt
?? BATCH2_CONTENT_STAGE_README.txt
?? BATCH2_ENGRAVING_README.txt
?? BATCH2_REFINEMENTS_README.txt
?? BATCH2_TEST_BLOCKER_FIX_README.txt
?? PATCH_README.md
?? README_READ_FIRST.txt
?? REVIEW_CATALOG_DIAGNOSTIC_README.txt
?? client/e2e/admin-media.spec.js
?? client/e2e/checkout-foundation.spec.js
?? client/e2e/information-pages.spec.js
?? client/e2e/operational-readiness.spec.js
?? client/e2e/permanent-visibility.spec.js
?? client/e2e/product-personalization.spec.js
?? client/e2e/service-requests.spec.js
?? client/src/admin/AdminImageGallery.jsx
?? client/src/admin/ProductPersonalizationEditor.jsx
?? client/src/admin/RequestEligibilityEditors.jsx
?? client/src/admin/media.css
?? client/src/admin/notification-labels.js
?? client/src/commerce/OrderFinancials.jsx
?? client/src/commerce/PersonalizationSummary.jsx
?? client/src/commerce/ProductPersonalizationDialog.jsx
?? client/src/commerce/operations.css
?? client/src/commerce/product-personalization-drafts.js
?? client/src/commerce/service-requests.css
?? client/src/components/HomeCatalog.jsx.before-admin-media.bak
?? client/src/components/ProductCard.jsx.before-admin-media.bak
?? client/src/information-pages.css
?? client/src/pages/AdminAttentionPage.jsx
?? client/src/pages/AdminProductFormPage.jsx.before-admin-media.bak
?? client/src/pages/AdminRequestsPage.jsx
?? client/src/pages/AdminWebsitePage.jsx.before-admin-media.bak
?? client/src/pages/ProductPage.jsx.before-admin-media.bak
?? client/src/pages/ServiceRequestPage.jsx
?? docs/BATCH_1_PERMANENT_VISIBILITY.md
?? docs/BATCH_2_ADMIN_MEDIA.md
?? docs/BATCH_3_CHECKOUT_PAYMENTS.md
?? docs/BATCH_4A_PRODUCT_PERSONALIZATION.md
?? docs/BATCH_4B_CUSTOM_REQUESTS.md
?? docs/BATCH_5_OPERATIONS.md
?? docs/BATCH_6_PAGES_AND_HANDOFF.md
?? docs/SHOP_CATEGORY_COMPLETION.md
?? server/scripts/audit-catalog-r2-readonly.mjs
?? server/scripts/audit-production-catalog-transfer-readonly.mjs
?? server/scripts/check-email.js
?? server/scripts/staging-schema-migration-only.mjs
?? server/scripts/transfer-catalog-safe.mjs
?? server/scripts/upload-catalog-r2.mjs
?? server/src/catalog/display-transition.js
?? server/src/catalog/media-storage.js
?? server/src/catalog/media.js
?? server/src/commerce/accounting-validation.js
?? server/src/commerce/operations.js
?? server/src/commerce/order-accounting.js
?? server/src/commerce/owner-notifications.js
?? server/src/commerce/owner-settings.js
?? server/src/commerce/request-policy.js
?? server/src/commerce/request-validation.js
?? server/src/commerce/service-request.routes.js
?? server/src/commerce/service-requests.js
?? server/src/commerce/whatsapp-quotation.js
?? server/src/email/resend.js
?? server/src/models/CatalogMedia.js
?? server/src/models/OrderSettlement.js
?? server/src/models/ServiceRequest.js
?? server/src/routes/admin-media.routes.js
?? server/src/routes/admin.routes.js.before-admin-media.bak
?? server/test/catalog-media.test.js
?? server/test/checkout-foundation.test.js
?? server/test/operational-readiness.test.js
?? server/test/permanent-visibility-service.test.js
?? server/test/permanent-visibility.test.js
?? server/test/product-personalization.test.js
?? server/test/service-requests.test.js
?? shared/product-personalization.mjs
?? shared/product-url-compatibility.mjs
?? shared/storefront-content.mjs
```

Preflight non-secret file-hash inventory digest: `0146c569c66703f9e25c413bfd6cb2d3f57dec7be9cf706a1cbae0ddbdc9e481`. This is an audit preservation digest, not a release commit ID, provider attestation or SEO publication ID.
