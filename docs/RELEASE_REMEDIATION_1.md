# Release remediation 1 — financial, inventory and backend safety

Date: 16 October 2026. Scope: **F01, F02, F05 and F09 only** from `FINAL_RELEASE_READINESS_AUDIT.md`. Locally implemented and verified; **not deployed**. The overall release remains **NO-GO** for the other audit findings and production prerequisites.

## 1. Result and preservation

**Fix Pass 1 is locally ready for review.** Direct API inventory approvals cannot infer stock; one refund settlement can allocate one actual transfer across its original collection's merchandise/delivery scopes; new public/private images require complete bounded decoding; independently authorized custom intake defaults closed while existing obligations remain recoverable.

Preflight captured 170 changed Git status paths and SHA-256 hashes for 403 non-secret existing files in ignored `client/test-results/remediation-1/baseline.json`. This builds on the existing uncommitted work; it is not a clean-checkout diff. Actual secret files were excluded. The original audit, batch reports and Cloudflare routing work were preserved. Only the files listed below changed in this pass; verification logs/build output are ignored artifacts.

Closure comparison found 33 modified baseline files, seven new files including this report, plus the explicitly documented `.env.example` edit (excluded from the non-secret hash inventory by its filename rule): **41 report-listed paths**. No baseline file disappeared, no existing audit/batch/shared/Cloudflare routing file changed, nothing is staged, and `git diff --check` passed. No test listeners remained on ports 4092/5191/5192 at the final check.

No production/staging database access, real provider operations, emails, WhatsApp messages, payments/refunds, migrations, environment activation, commits, pushes or deployments occurred. `server/.env.example` is documentation with **false defaults**, not an actual environment modification. Tests use scrubbed child environments, disposable loopback replica sets and synthetic provider adapters.

## 2. Exact changed-file manifest

### Inventory

- `server/src/catalog/inventory-input.js` — new shared approval-aware input merge.
- `server/src/catalog/service.js` — product create/edit and variant handling use that merge.
- `server/src/catalog/fields.js` — new embedded inventory records cannot approve a model-default quantity.
- `server/src/commerce/configuration.routes.js` — component create/edit use the same validation and preserve revisions/configuration approval rules.
- `server/test/catalog-api.test.js` — explicitly resubmit actual quantity for approval; expect unapproved zero instead of invented ten after an unspecified tracked-mode transition.
- `server/test/commerce-configuration-api.test.js` — explicitly resubmit the confirmed component quantity when renewing approval.

### Refund accounting

- `server/src/commerce/accounting-validation.js` — bounded explicit refund allocations.
- `server/src/commerce/order-accounting.js` — per-original-allocation refundable limits, exact transfer sum, transactional multi-scope settlement and payment-state handling.
- `server/src/models/OrderSettlement.js` — validate nonempty allocation sets while retaining historical single-scope compatibility.
- `client/src/commerce/OrderFinancials.jsx` — refundable per-scope amounts, one transfer/reference, local sum validation, recoverable local errors and allocation history.
- `client/e2e/checkout-foundation.spec.js` — mobile combined-refund editor regression and mock refund response.

### Image integrity and valid synthetic fixtures

- `server/src/media/image-integrity.js` — new bounded child-process validation boundary.
- `server/src/media/image-decoder-process.js` — new isolated Sharp decoder.
- `server/src/commerce/storage.js` — complete bounded conditional GET, full decode before verification/copy, test-adapter equivalent.
- `server/src/catalog/media-storage.js` — async full validation before public storage or receipt creation.
- `server/src/commerce/uploads.routes.js` — helpful unsupported-format/HEIC validation feedback.
- `server/package.json`, `server/package-lock.json` — exact Sharp 0.35.5 and locked native/transitive packages.
- `server/test/image-integrity.test.js` — new public/private decode, corruption, size, pixel, provider, concurrency and deadline regressions.
- `server/test/catalog-media.test.js` — valid PNG fixture and async validator assertion.
- `server/test/commerce-storage.test.js` — valid fixture and failed-verification/fresh-retry regression.
- `server/test/checkout-foundation.test.js` — valid image fixture.
- `server/test/commerce-orders.test.js` — valid image fixture.
- `server/test/product-personalization.test.js` — valid image fixture.
- `server/test/phase3-tracking.test.js` — valid image fixture.
- `client/e2e/commerce-fixtures.js` — valid image fixture.
- `client/e2e/admin-media.spec.js` — valid image fixture.

### Independent request intake

- `server/src/config/env.js` — centralized two-flag request-intake authorization, independent of checkout.
- `server/src/commerce/request-intake.js` — new fail-closed assertion.
- `server/src/commerce/service-requests.js` — gate new submissions while preserving immutable accepted retries.
- `server/src/commerce/service-request.routes.js` — authoritative availability in options response; existing status/admin routes remain accessible.
- `server/src/commerce/uploads.js` — stop new service-reference signing when intake closes.
- `server/src/website/routes.js` — expose non-secret read-only intake status in admin settings.
- `server/.env.example` — document both request flags as false.
- `client/src/pages/ServiceRequestPage.jsx` — fail-closed availability display, maintenance/reopening/status recovery.
- `client/src/pages/AdminWebsitePage.jsx` — read-only request-intake status, distinct from checkout.
- `server/test/service-requests.test.js` — explicitly opt isolated fixtures into intake; valid image fixture.
- `server/test/operational-readiness.test.js` — explicit isolated intake authorization; preserve contact-sequence coverage.
- `client/e2e/service-requests.spec.js` — availability contract, closure during draft, safe reopening and receipt recovery.

### Shared verification/report

- `server/test/release-remediation-1.test.js` — new direct API/database integrity regressions for inventory, refunds and intake.
- `docs/RELEASE_REMEDIATION_1.md` — this report.

Nine existing test-fixture files contained PNG bytes that the strict decoder correctly rejected. Replacing those bytes is necessary test-data repair, not relaxing validation or changing catalog media. Existing merchant images, retained evidence and imported image references were not rewritten.

## 3. Original failures and exact corrections

### F01 — inferred approved stock

Original reproduction: an approved Made by Request product, null quantity, patched with `{inventory:{mode:'tracked',approved:true}}`, saved **approved quantity 10**. Components had an equivalent mode-change fallback. An unapproved imported ten could also be approved by supplying only `approved:true`.

Correction: `catalog/inventory-input.js:5` validates the inventory patch before merging. Any newly approved tracked inventory, including a transition from Made by Request, must contain an explicit nonnegative safe-integer quantity. Missing/null/undefined/string/fractional/negative values cannot become approved model defaults. Explicit zero and explicit ten are valid. Product creation uses no prepopulated model inventory as approval evidence. Variants match previous records only by their existing keys; a new/renamed variant requires its own quantity. Components use the same merge, not a separate fallback.

Previously approved tracked quantities survive unrelated edits or repeated unchanged approval. An unapproved mode transition without quantity stays unapproved with zero, never an approved invented ten. Made by Request normalizes quantity to null and never decrements tracked stock. A Mongoose new-record default guard provides defense in depth; persisted-record revision/transaction checks remain the authority for API edits.

Tests directly exercise product/component create and PATCH APIs, the dedicated product inventory endpoint, variants, legacy unapproved ten, explicit zero/ten, invalid values, stale revisions, and unchanged verified quantities. Existing public visibility, enquiry-only, variant and stock contention tests pass.

### F02 — one truthful multi-scope refund

Original reproduction: a 540 EGP collection allocated 450 merchandise / 90 delivery could not receive a 540 refund in one scope. Recording 450 and then 90 under the same bank reference correctly hit the global reference fence but left the refund unrepresentable.

Correction: refunds may carry `allocations: [{scope, amountPiastres}, ...]`, linked to one selected original collection through `refundOf`. The positive, distinct allocations are capped at 31, must sum exactly to the actual transfer, and each must fit its original collection's unrefunded allocation. Existing historical collections/refunds with empty allocation arrays retain single-scope fallback. The service validates these conditions even for direct calls, in addition to the API schema/model validation.

One append-only `OrderSettlement` stores the entire transfer and one normalized reference. Existing globally unique method/reference and order/operation-key indexes remain unchanged. Retries return the same accepted operation; changed retries, stale revisions, reused references and concurrent over-refunds cannot commit twice. Order, financial summary, audit and notifications commit in the same transaction. Combined collection allocations are consolidated by scope so existing excess-payment credit remains compatible with the stricter model check.

The admin selects an actual collection, sees each remaining refundable amount, and enters the single actual transfer plus its merchandise/delivery breakdown. Zero excludes a scope from this refund. Mismatched sums produce an editable local error before an API request; uncertain dispatched requests still retain their exact immutable retry. The server independently enforces all bounds. Settlement history displays the saved allocation breakdown.

Tests cover one 540 EGP transfer with 450/90 allocations, exact immutable source preservation, partial refunds, no payable reduction versus explicit remedy reduction, invalid/duplicate/unknown scopes, excessive refunds, repeated operations/references, concurrent refund attempts, and cancelled/returned orders. Existing discount reversal, cancellation inspection, COD collection and late/excess transfer tests remain passing. Screenshots still cannot mark payment Paid.

Boundary: this command allocates a refund against **one selected original collection**, which can contain multiple scopes; it does not silently combine unrelated original collections. Historical accounting-version guards are unchanged; no existing financial record is migrated.

### F05 — full public/private image integrity

Original reproductions: a 33-byte PNG header passed private verification; a corrupted PNG passed public validation. The old private path read only a prefix. Complete-looking containers did not prove decodable pixels.

Correction: both verification paths call `media/image-integrity.js`. It allows only JPEG/PNG/WebP signatures, bounds compressed bytes, checks complete static PNG/WebP/JPEG containers, and delegates actual pixel decoding to **Sharp 0.35.5**. The decoder checks actual format against the requested MIME, dimensions/channels/pages and pixel budget, then forces full raw decoding with strict warnings. Metadata parsing alone is not considered verification.

Limits:

| Resource | Bound |
|---|---|
| Compressed bytes | 10 MiB maximum; existing smaller field/proof limits still apply |
| Dimensions | At most 12,000 per side |
| Pixels | At most 40 million |
| Channels / decoded samples | At most four channels; at most 160 million decoded sample bytes, accounting for 16-bit input |
| Frames | Single-frame uploads; animated WebP/APNG are rejected rather than partially verified |
| Native concurrency | Two decoder child processes per API process, no unbounded queue |
| Decoder work | Three-second Sharp processing deadline |
| Overall process deadline | Eight seconds including startup/metadata; hard kill, slot retained until close |
| Decoder JS heap/cache | 64 MiB old-space, native concurrency one, Sharp cache disabled |
| Decoder output | Metadata JSON only, capped at 1 KiB; no decoded image transmitted back |

Pixel/sample limits bound image work; the JS heap limit is **not** an OS RSS limit on native libraries. Native overhead, compressed input copies and the API must also fit the deployment memory budget. Measure representative full-resolution photographs and concurrent uploads on the intended isolated Linux/Render-equivalent runtime before release; do not assume a particular hosting plan can accommodate the maximums.

Private verification now downloads the complete object through a bounded stream with `IfMatch` against the inspected ETag, and retains the existing conditional copy plus destination verification. Failed decoding never marks the upload complete. Public validation finishes before PUT; successful full readback/hash verification still precedes a catalog receipt/reference. Busy/missing/crashed/timed-out decoders fail recoverably; provider details and decoder stderr are not exposed.

Uploaded original bytes are preserved. No metadata stripping, re-encoding, historical revalidation/rewrite, retained-file deletion or garbage collection was introduced. HEIC and unsupported formats receive export-to-JPEG/PNG guidance; conversion/physical iPhone compatibility remains outside this pass.

Dependency review: exact Sharp version pinned; lockfile includes native platform packages/integrities. npm installation reported **174 packages audited, zero vulnerabilities at that check**; this is not a full client dependency/security audit or a permanent advisory guarantee. Sharp is Apache-2.0; the inspected Windows native bundle declares Apache-2.0 AND LGPL-3.0-or-later. Preserve applicable license/notices, review the corresponding Linux bundle and keep security updates in release maintenance. No unrelated dependency upgrades were requested.

Primary inputs: [Sharp constructor limits](https://sharp.pixelplumbing.com/api-constructor/), [output/timeout API](https://sharp.pixelplumbing.com/api-output/), [security guidance](https://sharp.pixelplumbing.com/security/). Local Windows native decoding was actually exercised; Linux packaging and live R2 remain unverified.

### F09 — independent fail-closed intake

Original reproduction: a new Gift Box request succeeded with checkout disabled and no separately authorized request-intake control.

Correction: `CUSTOM_REQUESTS_ENABLED=true` **and** `CUSTOM_REQUESTS_LAUNCH_AUTHORIZED=true` are required. Both default false, independently of the two checkout flags. `assertRequestIntakeOpen()` protects new service submissions and new service-reference signing. New submission checks occur before starting creation and again within its transaction. Direct API calls cannot bypass the gate.

An already accepted owner/key/hash retry resolves before the new-intake check, so closing intake cannot strand a lost successful response or create another request. Altered retries remain rejected. Existing owned submission lookup, admin history/review/quotations/contact actions, retained file viewing, existing order/proof/payment reconciliation and worker reminders are not gated. Closure does not modify requests, images, reservations, quotes or deadlines.

The options API returns `intakeEnabled` without exposing secret configuration. The frontend waits for explicit true before rendering a new form. Missing/error/false states show availability/retry information and continue checking the saved submission first. A draft receiving `REQUEST_INTAKE_CLOSED` refreshes availability and shows maintenance instead of an endless submit loop. Admin settings show separate read-only intake status; no new admin bypass exists.

Guest tests verify closure, real owned receipt recovery and immutable retry, wrong-owner isolation, protected admin access, blocked reference signing, no quota/upload records, restart/default settings and reopening without duplicates. Existing twelve-hour processing uses original submission timestamps and remains unchanged: immediate owner event, one eligible nine-hour reminder, dashboard-only overdue at twelve hours, contact suppression and retained audit history.

## 4. Financial, inventory and privacy invariants

- Prices, discounts, quantities, variant eligibility and totals remain server-authoritative integer piastres. No placeholder approvals, deposits or new payment methods.
- Original merchandise totals and accepted quotations remain immutable. Shipping starts null/pending, separate from add-ons; no invented free delivery.
- Ordinary InstaPay remains order first with order-bound private proof; owner quotations retain WhatsApp evidence and independent actual-account reconciliation. Destination remains 01060673073.
- Inventory allocation/restoration, discount reversal, request conversion and financial writes remain transactional and revision-fenced. Request submission itself reserves no stock.
- Existing visibility/aliases, CSRF/Origin, roles, owner/generation isolation and protected private views remain intact. No new public private-file URL exists.
- Provider/decoder/notification failure cannot erase an accepted order/request or silently overwrite financial evidence.

## 5. Verification actually executed

All database tests use new disposable local replica sets, not a running developer/merchant database. Browser tests use installed headless Edge with isolated API/storage fixtures and their own Vite server. Mobile dimensions are emulation, not physical devices. No real email/payment/R2 verification is implied.

| Check | Actual result / evidence |
|---|---|
| Original unchanged audit probes, before editing | **5/5 reproductions executed**, `.cache/remediation-1-baseline.tap`; passing probes reproduced the defects |
| Original unchanged audit probes, after corrections | **2 pass / 3 expected old-assertion failures**: header-only PNG now INVALID_IMAGE, inferred stock now INVALID_INVENTORY, unauthorized request now REQUEST_INTAKE_CLOSED. Scale and legacy single-scope/ref-dedup probes still pass. This old script does not submit the new combined-allocation command |
| Main focused backend selection, 16 files | **235/235 PASS**, `.cache/remediation-1-final.tap` |
| Existing commerce order suite | **27/27 PASS**, `.cache/remediation-1-orders.tap`; includes guest/account cart ownership, last-unit/sufficient-stock concurrency, variants, Made by Request, failed persistence rollback and order snapshots |
| Latest direct API/config restart recheck | **12/12 PASS**, `.cache/remediation-1-gates-final.tap`; after helpful HEIC schema feedback and shared settings parser changes |
| Additional catalog/config/provider/image boundary selection | **110/110 PASS**, `.cache/remediation-1-verified.tap`; overlaps the main selection, not an additional unique total |
| Focused Edge browser selection | **34/34 PASS**, `client/test-results/remediation-1/browser-final.log`; checkout/payment/refund editor, private personalization fixtures, media admin, request/quotation and attention flows, including 320px refund/intake checks |
| Frontend lint | **PASS**, `client/test-results/remediation-1/lint.log` |
| Server syntax | **171 files PASS**, `.cache/remediation-1-syntax.log` |
| Scrubbed isolated Vite build | **PASS, Vite exit code 0**, `client/test-results/remediation-1/build.log`; no `.env`, noindex/Meta off, ignored output, no SEO export/publication |

Main backend files: `release-remediation-1`, `image-integrity`, `checkout-foundation`, `service-requests`, `catalog-media`, `commerce-storage`, `permanent-visibility`, `permanent-visibility-service`, `product-personalization`, `operational-readiness`, `batch3-commerce`, `phase3-tracking`, `catalog-api`, `catalog-models`, `commerce-configuration-api`, `commerce-provider-contracts` (all under `server/test`, suffix `.test.js`). Run through `node scripts/run-tests.js` from `server/` to preserve scrubbed configuration/DB guards.

Controlled decoder tests cover actual JPEG/PNG/WebP decoding, incomplete headers/tails, corrupt compressed data, forged MIME, empty/unsupported/oversized files, a genuine over-40-million-pixel image, unchanged original bytes, failed provider operations, bounded concurrency and simulated hard-deadline process kill/recovery. Mocked clock/process tests are labeled tests, not live resource-exhaustion measurements.

### Intermediate failures and known remaining failing tests

The first new regression run passed 79/80: an embedded Mongoose default marker incorrectly rejected an existing verified quantity. The model guard was narrowed to new records; subsequent verified preservation tests pass. Additional runs exposed old implicit-approval expectations in catalog/component tests, invalid old PNG fixtures and an undefined-versus-null assertion in a new fixture. These were corrected explicitly, not by weakening guards. New browser checks initially used inappropriate select-label locators and an initial receipt fixture without its submission key; corrected tests use accessible combobox names and a real synthetic submission/reload. Final scoped runs pass.

**F10 remains outstanding:** `batch1-inventory-revision.test.js` was actually rerun in `.cache/remediation-1-boundaries.tap` and still has four known failures: tracked product and variant cases expect stock restoration on customer *request* cancellation (8/4 actual versus 10/6 expected); tracked/Made by Request component cases expect personalized COD without authorized quotation (409 versus 201). The same boundary run initially had four other failures described above, now corrected and passing in the 110-test recheck. F10's production safeguards and legacy test file were not altered.

The audit's three failing connected browser contracts also remain outstanding: old Gift Box template/cart selector and two obsolete draft visibility expectations in `commerce-edge-contracts.spec.js` / `operations-contracts.spec.js`. They were **not rerun or fixed in this pass**. Connected harness shutdown reliability (F18) also remains outside scope. Do not describe the full release gate as green.

No unnecessary full suites, live load testing, production export or provider smoke command was run. An initial npm request was blocked by sandbox network access; the reviewed local dependency download then succeeded through the approval mechanism. One fixture-repair command used the wrong working directory and made no edits; corrected locally. The initial build command printed Vite success but PowerShell treated stderr timing warnings as a command error; a scrubbed artifact runner captured the actual Vite exit code **0**, including on the final build.

## 6. Configuration, compatibility and rollout prerequisites

**No database migration, collection or index change is required by this pass.** Existing Batch 1–6 schema/index preparation and reviewed catalog/legacy-order procedures still apply. No migration was executed.

| Setting / dependency | Default / location | Future authorized preparation |
|---|---|---|
| CUSTOM_REQUESTS_ENABLED | false, backend Render API environment | Operational open/close switch; leave false during dark deployment and provider/data checks |
| CUSTOM_REQUESTS_LAUNCH_AUTHORIZED | false, backend Render API environment | Separate explicit authorization after storage, contact staffing, owner notifications, abuse/security and request acceptance checks |
| Existing CHECKOUT_ENABLED + COMMERCE_LAUNCH_AUTHORIZED | unchanged, false by default | Independent normal ordering/conversion gates; neither opens custom intake |
| Sharp/native packages | pinned server dependency/lockfile | Reproducible server install including native optional packages for target Linux architecture; verify native load/decode, child-process execution, limits and memory on isolated runtime |
| Public/private R2 and email/worker settings | unchanged, unverified live | Existing separate authorization/configuration/provider acceptance requirements remain |

No new frontend environment flag or secret is needed. The frontend uses the backend availability contract and treats older/missing `intakeEnabled` as closed. Deploy compatible API/UI together under the separately approved release plan, with both request flags false. No deployment is authorized here.

The API reads environment settings at process startup. A future authorized closure requires updating the intended setting and restarting/redeploying the intended API instances through the approved operational process. It is not an instantaneous dashboard toggle; reconcile in-flight requests that committed before closure. Existing accepted receipts/obligations survive restart. Reopening requires both flags and the same prerequisite review; it does not replay old submissions or reset contact clocks.

Rollback/recovery: close new checkout and custom intake separately, preserve accepted orders/requests/files/ledger and owned recovery routes. Do not roll back to the pre-fix inventory/validation API while intake is open. Old financial records are not rewritten, and old single-scope refund commands remain supported. Restoring code/environment cannot undo an actual transfer. Do not drop collections, reset stock or delete evidence to recover.

## 7. Remaining risks and release decision

- F03 chooser/device requirements, F04 video controls, F06/F07 durable routing/indexing and other audit findings remain unresolved; Fix Passes 2/3 were not started.
- Real R2 full-object conditional GET/copy/CORS, public delivery, email/owner mailbox/worker scheduling, exact auth/deployment topology, Linux native packaging/memory and physical devices remain unverified.
- The full release still needs a reviewed source freeze, current authorized schema/data inventory/backups, merchant-confirmed display/prices/availability, legal/operator/retention sign-off and controlled activation acceptance.
- This refund operation is bounded to its selected original collection. Bank disputes, cross-collection reconciliation and historical-order conversion still require their existing reviewed procedures rather than fabricated references or rewritten totals.
- Decoder saturation returns a recoverable error instead of growing an unbounded queue. Retrying creates/uses the existing safe upload workflow; retained order evidence is not deleted. Monitor verification latency/busy/failed counts without logging image contents or signed URLs.

**Conclusion: F01/F02/F05/F09 meet this pass's local acceptance conditions. Fix Pass 1 is locally ready for review; Tap & Wrap is still NO-GO for production release. Stop here for review and explicit authorization of further work.**
