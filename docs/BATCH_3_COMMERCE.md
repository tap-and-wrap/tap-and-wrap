# Batch 3 commerce, private uploads and background actions

This records safe local implementation, not staging/provider activation. Current JavaScript architecture and Batch 1/2 authentication, revision, privacy and transaction contracts remain in force. No existing database, merchant records, credentials, SMTP/R2/Meta provider or payment service was accessed. Tests create new loopback-only disposable replica sets and synthetic records; providers use test-only adapters.

## Finding reconciliation

| Finding | Local result | Root cause and implemented behavior | Remaining action |
| --- | --- | --- | --- |
| F13 | PARTIAL: policy-independent code complete | Rejected InstaPay proof previously exposed state/history without a clear next step. Customer DTO now includes `paymentAttention`, explicit public reason only, instructions to contact the store before another transfer, and `receiptReplacementEnabled:false`. Legacy/internal notes remain private. Existing unpaid cancellation/restocking remains available; rejected→paid and unverified fulfillment remain forbidden. | Owner must choose rejected-proof handling and refund rules; no replacement/refund transition was invented or enabled. |
| F14 | PASS: bounded execution/diagnostics tested | Count-only worker bounds did not constrain slow providers, independent stages could starve, cleanup failures could retry indefinitely, and runs had no durable operational journal. Shared deadline/cancellation budget, provider timeouts, independent stage reporting, persisted safe run counters, interrupted-run recovery, authenticated paginated diagnostics and bounded cleanup retry/review are implemented. SMTP ambiguity remains uncertain/manual review, never blind resend. | Explicit scheduling, alert destinations, reviewed live-provider configuration and separately authorized staging checks. No scheduler is activated. |
| F28 | PASS | Each cart line independently read the same product, categories, template, components and files. `createPricingContext` batches dependencies once per quote/transaction attempt and owner; no cross-request cache. Sequential transaction operations preserve snapshot semantics. Current component mode travels in validated server claims, avoiding a redundant inventory read; conditional writes still reject changes. | Observe real workload after approved isolated staging validation; no production latency claim. |
| F29 | PASS for measurement/correctness; scaling risk retained | Checkout writes shared shipping/category/template eligibility fences. Synthetic six-way tests demonstrate retries; removing fences would reintroduce write skew when merchants edit eligibility/pricing. Existing fences remain. The independently measured dependency-read improvement reduces transaction work without sacrificing correctness. | Establish owner-approved expected peak load and run a separately authorized load test. Higher-throughput fence redesign needs an independently proven eligibility consistency model; no throughput promise. |
| F30 | PASS | Carts persist 30 days while private temporary uploads expire after the existing 24 hours. Cart responses now report earliest temporary attachment expiry and replacement-required state on missing/expired files. Invalid rows retain safe product identity/slug and configured field keys for deliberate replacement, never storage keys. Repeated reads do not extend expiry or retain files indefinitely. | Approve customer-facing retention wording and any future retention changes. Existing durations were preserved. |
| F31 | PASS | Independent count-then-save activations could both see 99 and commit a 101st active rule, later failing pricing. A narrow transactional `CommerceControl` activation fence serializes capacity decisions only. Concurrent create/edit tests enforce 100 active rules and one audited winner. First singleton initialization either commits or returns a safe 409. | Initialize declared collections/indexes only through separately authorized guarded schema workflow. Existing active records are not rewritten/deactivated. |
| F49 | PASS for backend/local contracts | Storage header deadlines did not bound response-body consumption, admin proof pipes continued after disconnect, and uncertain checkout responses lacked an ownership-safe lookup. Adapter calls/private streams are bounded and aborted where supported; disconnect destroys private proof/file streams. Owned UUID submission lookup confirms an accepted immutable order without creating/replaying it. Missing result is explicitly not proof that an in-flight submission cannot commit. Failed/timed-out cleanup retains records/quotas for recovery. | Root report covers corresponding frontend uncertain-response and browser-storage behavior. Live direct-upload CORS, provider cancellation and slow-network behavior still require authorization. |
| F50 | PARTIAL: safe controls/runbook complete | Operational retention lacked a reconciled matrix and restore acceptance procedure. Existing approved/configured expiries are retained; no new legally significant deletion period is introduced. Cleanup preserves retained evidence, retries within bounds, and retains dead-letter records for operator review. | Merchant/legal retention decisions, backup product/tier/access selection, actual backup/restore drill and RPO/RTO acceptance. |

The original numbered audit file was not present in the available documentation. Finding meanings above were reconciled against the current user instructions, Batch 1/2 reports and actual source; no absent audit text was fabricated.

## Contracts and safety

- `GET /api/v1/commerce/checkout/submissions/:checkoutKey`: strict UUID/empty query, exact current owner + checkout key, indexed read, three-second database deadline, independent 30-request/five-minute limiter, private/no-store. Response `{order:null|customerDTO,tracking:null|ownedReceipt}`. Another customer, administrator acting as their own cart owner, or guest cookie cannot access another owner's order. The lookup does not authorize checkout, infer failure, create a new key, attach guests by phone, or replay requests.
- `GET /api/v1/admin/commerce/jobs`: existing session/admin authorization, validated page 1–200 and limit 1–20, safe run summaries and counts of notification dead/uncertain, tracking dead and upload cleanup review. Private/no-store; no recipient, proof, artwork, private key or provider error body.
- `CommerceControl`: `_id:'bundle-activation'`, integer revision; written only within authenticated/audited bundle transactions. It does not serialize unrelated catalog/cart/order work.
- `CommerceJobRun`: unique UUID, run state/timestamps/lease and safe stage counters. Interrupted expired runs are labelled without blindly replaying a provider dispatch. No invented TTL/audit retention.
- Upload cleanup metadata: tokenized leases, attempts, next-attempt backoff and manual-review flag. Six failures, or a worker crash after its sixth claim, require operator review; there is no seventh automatic attempt. Private verified order objects are never removed by temporary cleanup. Signed temporary order sources are removed only after the signing safety window.
- Shared work budget defaults to 60 seconds, configurable CLI `--max-duration-ms 1000..600000`; database and provider operations have their own bounds. The budget starts after safe connection/readiness, and stops new claims/stages. It is a cooperative deadline, not permission to interrupt a committed transaction mid-write.
- Production worker configuration is prepared but disabled: `--once --target production --confirm-writes --confirm-production-writes` additionally requires terminal `PRODUCTION_WORKER_AUTHORIZED=true`, `NODE_ENV=production`, the independently authorized database contract and exact approved production host/name/TLS. Offline synthetic tests reject each missing/mismatched gate. This does not expand catalog-import targets or authorize actual production use; provider/checkout launch gates remain separate.
- Notification provider calls are bounded to 45 seconds or remaining budget. Non-idempotent ambiguous SMTP dispatches become `uncertain` and erase terminal action secrets. Idempotent-provider retries keep stable keys and existing ceilings. Installed Nodemailer pool source confirms busy SMTP sends ignore abort and pool closure waits for them. The CLI finalizes durable state, waits at most five seconds for database disconnect, then arms an unref five-second residual-handle exit timer. Healthy processes exit naturally; a lingering socket produces one generic diagnostic and exits without resending. External delivery cannot be proven by a local timeout.
- R2 API calls retain 15-second abort deadlines. Image inspection adapter calls have 15-second bounds, private body consumption 30 seconds (inspection 15 seconds); consumers disconnecting abort/destroy streams. Timeout after a copy may leave an object to clean; no successful upload is fabricated. No SDK credentials were configured or live request performed.
- Pricing context loads at most cart-referenced products (cart maximum 30 lines), required categories/templates/components and bounded referenced files. No persistent cache, parallel operations inside a transaction, full-catalog fetch, client price trust or approval bypass.

## Verification actually executed

The final affected regression command passed **141/141**, zero failures/skips, including **29 new Batch 3 commerce cases**:

```powershell
node scripts/run-tests.js test/batch3-commerce.test.js test/commerce-storage.test.js test/commerce-orders.test.js test/commerce-configuration-api.test.js test/commerce-configuration.test.js test/batch1-notification-retention.test.js test/phase3-email.test.js
```

Tests cover real schema/API serialization, owner/guest isolation, disabled checkout, lost-response lookup, private proof cancellation, exact monetary results, request-scoped reads, expired files, deadline/worker crashes, bounded cleanup review, concurrent bundle creation/activation, production-worker offline target/approval matrices and a synthetic child process with a hanging handle. A prior standalone commerce run passed 26/26 before the three final CLI/production matrix cases were added.

Earlier affected runs passed 95/95, 136/136 and 139/139 as cases were added. The first 95-case run had one failing fixture that incorrectly supplied unsupported `personalization.enabled`; the fixture was corrected to the real strict schema, and the same 95-case run then passed. Validation was not loosened. The final complete cross-batch run and browser/build results belong in the root Batch 3 report.

An additional connected Gift Box acceptance case was subsequently added at the root's request in `client/connected-e2e/commerce-edge-contracts.spec.js`, with narrow guarded fixture seeds/state. It runs React against actual service listing, normalized template DTO, component quantity/pricing, required message, cart serialization and disabled-checkout APIs. Browser external requests are blocked and no login/provider is used; unavailable/unconfigured/over-limit options and missing fields are rejected. The root's coordinated final connected run passed **10/10 in 33.2 seconds**, including this new case and all nine prior connected contracts. Together with the 29 new backend commerce cases, this scope added 30 focused acceptance/regression cases. The root's earlier complete isolated backend run passed 388/388; a later post-freeze regression run passed 387/388 because the residual child test conflated concurrent Mongoose/module startup with the command-finalized shutdown timer. That test now gives setup a separate 30-second hard ceiling and measures the actual child exit phase after finalization: 15 milliseconds to less than one second for its 20-millisecond timer, plus the durable-finalization marker, expected sanitized diagnostic and zero exit status. Runtime deadlines were unchanged. The corrected focused file passed **30/30 in 10.219 seconds** (29 scoped cases plus the root's checkout-owner-scope case). The final complete rerun and browser/build details belong in the root report.

Measured locally with actual Mongoose reads: three personalized customization lines required **15** product/category/template/component reads before batching and **4** after, a **73.3% reduction** for that dependency workload. Every quote was deeply equal, including 12,617-piastre unit price, identity, customization snapshot and claims. The cart-document read is additional on both paths; upload queries apply only to file-bearing lines. Current component inventory claims use **zero** extra component reads during consumption while a changed mode still rejects atomically.

Final isolated six-way same-category/shipping contention sample: **34 transaction callback executions (28 retries), median 108 ms, maximum 130 ms**; all six orders' inventory claims committed exactly once. These are synthetic local measurements, not Atlas/Render benchmarks, SLA values or field Core Web Vitals. Retry counts/timings vary per run; tests assert correctness rather than brittle latency thresholds. No correctness fence was removed.

## Retention matrix

| Record/object | Existing lifetime/control | Enforcement/recovery | Policy still pending |
| --- | --- | --- | --- |
| Guest cart cookie/cart | 30 days; cart expiry refreshed on deliberate cart changes | Secure owner boundary and existing MongoDB cart TTL; no stock reservation | Final abandoned-cart/customer messaging |
| Customer photos/artwork/proof before order | Existing 24-hour temporary lifetime; signed PUT 300 seconds | Temporary cleanup only after signing/verification safety windows; ownership/quota; retry/review | Approve retention wording; changing duration is separate work |
| Verified private order files/proof | Retained on successful transactional order creation | Not deleted by temporary cleanup; authenticated explicit viewing and audit | Legal/order/dispute retention duration and erasure exceptions |
| Sessions/account-action tokens | Existing model TTL/configured expiries | Revocation/single use, terminal encrypted-secret erasure | Account/security-log retention policy |
| Checkout intents | Existing ten-minute quote expiry | Owned/idempotent submission; expiry does not erase accepted order | Operational intent-record pruning policy |
| Notification action secrets | Expiring account action, consumed/replaced links and terminal sent/dead/uncertain records | Batch 1 maintenance retained; no automatic ambiguous SMTP resend | Operator uncertain-delivery procedure |
| Notification/tracking outbox and purchase dedup | Existing bounded attempts/stale-event rules; Purchase dedup durable | Leases, backoff, safe diagnostics; consent/revocation gates remain | Audit/dedup retention and erasure policy |
| Orders/customers/admin audit/job runs | No new deletion period or TTL | Immutable order snapshots, private DTOs, authorized diagnostics | Legal retention, backup expiry and deletion approval |
| Original catalog/images | No rewrite/import/delete | Source identities/order untouched | Future authorized media import |

## Rejected InstaPay proof: owner decisions, not activated code

1. **Contact/manual resolution with existing unpaid cancellation:** current safe behavior; no repeat transfer instructions or new paid transition.
2. **Receipt replacement:** requires approved customer eligibility window, replacement limit, immutable versioned evidence, fresh owner-only upload intent, audited rejection reason and revision/idempotency design. Original receipt remains retained; never overwrite it. New proof would return to awaiting verification only after a separately approved transition.
3. **Refund/dispute handling:** requires owner-approved paid-order refund policy, payment ledger/audit and settlement verification. An uploaded receipt must never grant refund/paid status automatically.

Until policy is selected, replacement is false, rejected→paid remains disallowed and checkout stays globally disabled.

## Separate authorized operational integration procedure

These are future instructions. Do not execute against an existing database or provider during this batch.

1. Finalize target/topology/retention/payment policy and catalog/media approvals; keep checkout, email, storage and Meta flags false.
2. Run offline target/schema checks. Separately authorize guarded collection/index initialization, including the two new commerce models and upload cleanup index. Ordinary API/job startup must not create schema or run an import.
3. Provision least-privilege worker permissions and allowlisted synthetic staging recipients only when explicitly authorized; review monitoring access. First dry-run `npm.cmd run commerce:jobs` is offline, no dotenv/database/writes/provider calls. Future one authorized bounded staging batch: `npm.cmd run commerce:jobs -- --once --target staging --confirm-writes --batch-size 20 --max-duration-ms 60000`. This command writes and can call configured providers; it requires separate permission and private terminal configuration. Production remains a separate approval: the equivalent exact production target also needs `--confirm-production-writes`, default-false `PRODUCTION_WORKER_AUTHORIZED`, and the reviewed production database contract. No such command or production connection was executed.
4. Inspect authenticated `/admin/commerce/jobs` plus existing email diagnostics. Alert on partial/interrupted/stopped runs, dead/uncertain delivery and cleanup review. Scheduling frequency, platform process budget and alert contacts must be approved; no scheduling is configured here. Never automatically resend uncertain SMTP or clear a dead-letter flag without reviewed evidence and authorization.
5. For backup selection, establish merchant-approved RPO/RTO and retention before picking Atlas backup/export arrangements; free-tier availability must be verified separately. Keep encrypted backups and key custody outside source/Git. Do not put URI/passwords in shell history or reports.
6. Conduct a separately authorized restore drill into a **new disposable restore database**, never overwrite staging/production. Verify safe target before collection/index operations, checksum/manifests and record counts; test order snapshot consistency, inventory totals, unique IDs, privacy, receipt-file references, outbox dispatch/dedup and audit revisions using synthetic canaries. Keep checkout/providers disabled during restore.
7. Restoring older data can resurrect sent outbox entries and superseded inventory. Reconcile notification/provider evidence and idempotency before enabling workers; quarantine uncertain records rather than blindly resend. Coordinate R2 private-object recovery with restored references without making them public. Record actual achieved RPO/RTO; this batch does not claim a backup exists or recovery has been tested live.
8. Perform separately authorized slow-network/provider failure and expected-load validation with synthetic records. Only after code, policy, catalog and infrastructure gates pass may the owner authorize launch flags/deployment independently.

## Exact scoped file manifest

Created:
- `server/src/commerce/pricing-context.js`
- `server/src/commerce/work-budget.js`
- `server/src/models/CommerceControl.js`
- `server/src/models/CommerceJobRun.js`
- `server/test/batch3-commerce.test.js`
- `client/connected-e2e/commerce-edge-contracts.spec.js`
- `docs/BATCH_3_COMMERCE.md`

Modified:
- `server/src/commerce/cart.js`
- `server/src/commerce/pricing.js`
- `server/src/commerce/customization.js`
- `server/src/commerce/inventory.js`
- `server/src/commerce/configuration.routes.js`
- `server/src/commerce/models.js`
- `server/src/commerce/notifications.js`
- `server/src/commerce/orders.js`
- `server/src/commerce/order-presentation.js`
- `server/src/commerce/routes.js` (preserves root tracking changes)
- `server/src/commerce/storage.js`
- `server/src/commerce/uploads.js`
- `server/src/commerce/uploads.routes.js`
- `server/src/models/Upload.js`
- `server/scripts/run-commerce-jobs.js`
- `server/test/commerce-configuration.test.js`
- `server/test/helpers/connected-api-server.js` (narrow synthetic Gift Box seeds/state)

Pre-existing Batch 1/2 dirty work was retained. Shared configuration/schema/server, frontend tracking/commerce and SEO are handled by the root/other Batch 3 agents and reported in the final root manifest. No source workbook, original image/logo, merchant record, credentials, package dependency, commit or deployment was changed by this scope.
