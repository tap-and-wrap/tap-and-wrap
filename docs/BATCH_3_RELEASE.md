# Batch 3 — release reconciliation and isolated verification

## Assessment and scope

**Authorized local implementation: PASS. Production launch: NO-GO.** All final applicable code, browser, connected, SEO, lint, syntax and build gates passed. The owner/infrastructure/policy activation gates below remain mandatory; F13 and F50 are PARTIAL for those prerequisites. Local PASS does not mean Atlas, R2, Gmail, Meta, payments, real-domain authentication, search indexing or merchant data has been verified.

This batch preserves React/Vite JavaScript/JSX, Express/Mongoose, separate npm applications, the original logo, Batch 1 privacy/security/revisions and Batch 2 responsive design. Existing uncommitted user/Batch 1/2 changes were retained. No dependencies were added or installed.

The original numbered 52-finding audit file is absent from the available repository/docs inventory. The complete matrix therefore reconciles the exact finding definitions in the user's Batch 1/2/3 instructions, the implementation reports, current source and executed regressions. This does not claim that unavailable audit prose was read.

Existing catalog counts are user-confirmed history, not newly queried evidence: 1,595 products, 85 components, 209 categories, 4,139 image references and 423 flagged rows; reported 1,257 Draft/338 Hold/zero Ready. This batch did not query or alter those records.

## Final verification gates

These are actual final post-freeze isolated executions, not earlier phase totals. No failures, cancellations or skips remain in the final test gates.

| Gate | Final result |
| --- | --- |
| Full guarded backend suite — server/npm.cmd test | 388 passed; zero failed, cancelled or skipped; 19.026 seconds |
| Connected real React/Express/Mongoose contracts — client/npm.cmd run test:contracts | 10 passed; zero failed; 32.2 seconds |
| Full isolated frontend/browser suite — client/npm.cmd test | 255 passed; zero failed; 9.1 minutes |
| Offline SEO/generator/Cloudflare suite — client/npm.cmd run test:seo | 54 passed; zero failed/skipped |
| Frontend lint | Passed |
| Server syntax | 133 JavaScript files passed |
| Isolated production frontend build | Passed; Vite 8.3.4, 1,749 modules; 22 noindex development routes, zero catalog products/categories, zero indexable routes/offers, zero database/network requests |
| Local installed-dependency inspection | Client/server npm ls passed; no registry contacted |
| CRLF-aware whitespace/file manifest | Passed; 102 unique existing paths, no missing entries; no merge markers |
| Safe CLI defaults | Offline operations check/schema dry-run/worker dry-run passed in scrubbed child; no connection, write, dotenv loading or provider call |
| Original logo integrity | Working file and HEAD blob hashes identical: 4d65e01752fd7fa5f10e19e0a6beeb4a4fe1262a |

Backend test isolation uses OS-only inherited variables, no dotenv, blank merchant/provider configuration, cached MongoDB binaries with downloads prohibited, and fresh guarded loopback-only replica sets. Browser runners use their own local Vite/API ports, no environment-file loading, intercepted synthetic API content, no nonloopback requests and no third-party font preconnect/DNS hints. Connected tests exercise real auth, validation, serializers and persistence; only external storage is replaced by a test-only local adapter.

Connected coverage: Gift Box quantities/required message/unavailable options/server pricing/cart, actual normalized engraving DTO and one upload, strict configuration editor/exact money/revisions, order-note privacy and ownership denial, paginated category/component selection, readiness/correlation/guest admin denial, actual 20-item product queries/filtering/EGP/history, stale product/category drafts, publication/Origin rejection, and owner-private submission lookup with checkout disabled.

Broad frontend coverage includes all eight requested widths (320, 375, 390, 440, 768, 1024, 1440, 1920), 21 admin routes at each width (168 route-width assertions), guest/customer/admin navigation and transitions, sticky header/offsets, announcement/reduced motion, three filter accordions/price typing/history, drawers/modals, responsive footer, honest hero fallback and approval-gated statistics, button/control contrast, keyboard focus, field errors, upload timing, failed media, private cache races and checkout uncertainty. These are synthetic browser tests, not real-device or merchant staging screenshots.

Regenerated synthetic screenshots were visually reviewed: client/test-results/batch2-home-320.png, client/test-results/batch2-shop-1440.png and the 320px admin-products artifact under client/test-results/. They show retained branding, contained layouts and honest missing-content/media states; their fixture prices/products are not merchant approvals. The broad admin screenshot's fixture omits a publication field, so it verifies geometry rather than every table field.

The four final suites contain **707 passing cases/subtests** in total (388 + 255 + 10 + 54). This is a sum of distinct suite counts, not a claim of 707 independent end-to-end workflows; affected-suite reruns and the 168 nested geometry assertions are not counted again.

Failures were investigated rather than bypassed:

- Earlier auth assertions expected only X-Session-Expired in CORS exposure. They now verify the exact permitted header set including the new server-generated X-Request-Id and its UUID shape; no cookie/body/privacy assertion was removed.
- Readiness initially masked a rejected-target diagnostic. The real runtime order now validates the connected target before the generic schema-not-ready response; wrong targets still fail closed.
- The new SEO actual-component harness initially failed on installed Vite development module/preamble/CommonJS imports. The isolated harness now imports the real compiled component with exact intercepted loopback modules, blocks remote requests/WebSockets, and asserts real rendering/no page errors. The full eight-case SEO browser group and complete 255-case suite then passed.
- A deterministic delayed-writer test reproduced a missed SEO withdrawal caused by reading the baseline before obtaining the output lock. Reading the baseline inside the lock corrected it; all 54 offline SEO cases passed.
- A repeated complete backend run passed 387/388 because a two-second child cap included Mongoose import/setup while the browser suite was active. The test now separately bounds setup and measures the actual finalized-command phase inside the child: its 20ms timer must exit in 15–1,000ms with the real residual diagnostic, zero exit and finalized/disconnected marker. Runtime deadlines were unchanged. Focused 30/30 and final 388/388 passed.

## Complete F01–F52 reconciliation

**PASS** means the authorized local implementation/measurement/verification scope passes; external activation can remain pending. **PARTIAL** means a remaining business/operational part cannot be completed without approval. No unsafe step is hidden behind a local PASS. Prior Batch 1/2 PASS rows rely on the new cross-batch regression run and dependency review, not only old report totals.

| Finding | Status | Implemented/revalidated contract | Evidence |
| --- | --- | --- | --- |
| F01 | PASS | Owner/generation cache isolation | `batch1-auth.spec.js`; connected account/order isolation |
| F02 | PASS | Customer DTO/internal-note privacy | `batch1-order-presentation.test.js`; connected customer order page |
| F03 | PASS | Optimistic admin revisions | Catalog/configuration/website and inventory-revision tests; connected stale editors |
| F04 | PASS | Single normalized engraving field/upload | Connected actual engraving DTO, one upload, quote/cart/order snapshots |
| F05 | PASS | Supported component-option fields | Real strict configuration API/editor connected case |
| F06 | PASS | CSRF lifecycle and one eligible rejection retry | Backend/browser auth races and invalid Origin cases |
| F07 | PASS | Immutable category import identity | Synthetic import rename/slug/nested/backfill dry-run regressions; no existing backfill |
| F08 | PASS | Readable secondary anchors/buttons | Admin computed 4.5:1 contrast/hover/disabled assertions |
| F09 | PASS | Fail-closed production-target preparation | Operations/safety target matrix and actual local schema readiness |
| F10 | PASS | Explicit same-site/same-origin auth topology | Offline topology rejection matrix; Secure host-only Lax preserved |
| F11 | PASS | Bounded trusted proxy configuration | Actual loopback rate-limit/spoofed/malformed forwarding cases |
| F12 | PASS | Bounded safe startup recovery | Transient/fatal/timeout/cleanup/shutdown adapter failures |
| F13 | PARTIAL | Rejected InstaPay resolution | Customer public reason/contact guidance; forbidden paid transition; owner policy pending |
| F14 | PASS | Durable bounded worker operation | Synthetic leases/deadlines/crashes/diagnostics and ambiguous SMTP recovery |
| F15 | PASS | SEO synchronization and withdrawal | Atomic generation/diff/freshness/emergency withdrawal/failed commit fixtures |
| F16 | PASS | Connected full-stack contracts | Ten React → real Express/Mongoose → disposable replica-set cases |
| F17 | PASS | Strict customization/money boundaries | Actual configuration/field/engraving/artwork/quantity/exact-piastre contracts |
| F18 | PASS | Validated admin category search | Real paginated category/component picker connected case |
| F19 | PASS | Natural price inputs/clear/history | `batch2-shop.spec.js`; connected real query/filter/history case |
| F20 | PASS | Shared admin layout | 21 admin routes × eight widths, aligned gutters and contained overflow |
| F21 | PASS | Correct invalidation and read races | Admin mutation dependencies; delayed cart-read cancellation browser cases |
| F22 | PASS | Cairo promotion timezone | DST gap/repeated-minute and editor helper regressions |
| F23 | PASS | Invalid-session guest recovery | Expired/revoked-cookie recovery, protected denial and owner rotation |
| F24 | PASS | bcrypt UTF-8 byte limits | ASCII/Arabic/Unicode/emoji signup/reset and legacy login cases |
| F25 | PASS | Sanitized malformed JSON | Sensitive synthetic body fragments absent from response/log diagnostics |
| F26 | PASS | Terminal account-action secret erasure | Notification/action consumption, replacement, expiry, dead and uncertain tests |
| F27 | PASS | Actual qualifying tracking events | Explicit search UUID; successful payment-info receipt; consent/GPC/dedup tests |
| F28 | PASS | Request-scoped pricing dependency batching | Actual Mongoose 15 → 4 reads; deep-equal 12,617-piastre quotes |
| F29 | PASS | Measured transaction contention; correctness retained | Six-way synthetic fences, inventory once-only and retry observations |
| F30 | PASS | Cart attachment expiry/replacement feedback | Existing 24-hour temporary files/30-day carts; expiry tests and cart browser case |
| F31 | PASS | Bounded concurrent bundle activation | Real transactional 99 → 100 capacity and single audited winner cases |
| F32 | PASS | Admin order details/legal status choices | Order UI transition parity, contacts and explicit private-proof viewing tests |
| F33 | PASS | Transactional catalog audit records | Actor/revision/field-name redaction and rollback/concurrency tests |
| F34 | PASS | Category hierarchy concurrency | Product/component/category/import races and compatible public/checkout gates |
| F35 | PASS | Honest resumable import journals | Synthetic interruption/rollback/uncertain commit/resume tests |
| F36 | PASS | No ordinary startup DDL; bounded shutdown | Actual command monitoring zero DDL; strict indexes; active/idle HTTP drain |
| F37 | PASS | Opt-in process DNS configuration | Validated offline resolver cases; no DNS lookup or OS mutation |
| F38 | PASS | Verified-media indexability contract | Missing/expired/unsafe/conflicting attestation cases and actual exporter DTO |
| F39 | PASS | Thin-category noindex | 0–3 eligible counts; hierarchy retained; reviewed threshold applied at runtime |
| F40 | PASS | Truthful stock structured data | Tracked/Made by Request/mixed variants/global-unavailable schema cases |
| F41 | PASS | Bounded static/React handoff and metadata | Actual component boot/delayed/404/changed product metadata browser cases |
| F42 | PASS | Prepared browser security headers | Report-only default; isolated enforced CSP blocks foreign/inline/connection requests |
| F43 | PASS | Font discovery and stable intrinsic media | No CSS import waterfall; four-width synthetic font geometry assertions |
| F44 | PASS | Catalog/count work reduction | One eligibility graph read; optional counts omitted; 20-item approval parity |
| F45 | PASS | Boundaries, skip link, route focus/history | Loading/replaced/hidden heading, keyboard and route recovery regressions |
| F46 | PASS | Accessible field/array errors | Real validation paths, focus, aria-invalid/describedby and retained drafts |
| F47 | PASS | Native modal lifecycle | Escape/backdrop/Tab/restoration/stacked scroll-lock regressions |
| F48 | PASS | Visible control boundaries | Control contrast/44px targets and responsive admin/storefront cases |
| F49 | PASS | Upload/stream/uncertain checkout resilience | 60s upload bound, private disconnect, same-key retry, owned recovery/guest rotation |
| F50 | PARTIAL | Retention and recovery readiness | Existing lifetimes enforced; matrix/runbook; legal periods and real restore drill pending |
| F51 | PASS | Requested navigation/content alignment | Role menus, left logo, hero fallback, gated statistics, footer and three accordions |
| F52 | PASS | Current conventions/documentation | AGENTS/README/B1/B2/B3 override historical requirements; JavaScript stack unchanged |

## Confirmed roots and Batch 3 implementation

### Database, deployment, readiness and operations

The old target validator intentionally allowed local/staging only and had no independently gated production contract. Prepared production uses the exact candidate `tapandwrap_production`, production runtime, explicit authorization, exact approved seed host, authenticated TLS URI and connected-name/write-time checks. No credentials/domain/name were actually approved/configured. Staging importer/exporter guards were not widened.

Host-only SameSite=Lax cookies cannot support an ordinary workers.dev → onrender.com cross-site frontend/API arrangement. Startup now accepts only explicitly reviewed same-site HTTPS apex/www + API subdomain, or a reviewed same-origin proxy contract. Cookies remain host-only/Secure/Lax; exact Origin/CORS and CSRF checks remain strict. This is a narrow validator, not proof of domain ownership or a public-suffix database. Actual topology must be independently reviewed.

Trusted proxy defaults to none; bounded explicit IP/CIDR lists replace unsafe boolean/hop-count assumptions. Actual loopback limiter tests show untrusted forwarding ignored, closest untrusted hop used and malformed trusted chains rejected. Rate limits remain per-process; multiple Render replicas require a separate shared-store review.

Initial connections previously attempted once. New bounded attempts/backoff/jitter distinguish transient failures from terminal target/configuration/auth/TLS/schema errors. Connect work has a hard 12-second bound; required-index verification shares six seconds, with driver timeoutMS/maxTimeMS plus a hard fallback and bounded cursor close. A timed-out uncertain attempt stops instead of being retried. Target diagnostics are checked before the generic not-ready gate so rejected databases retain their specific sanitized cause.

Ordinary API/job startup no longer creates collections/indexes. Read-only schema verification checks actual unique/text/partial/TTL options, including rejecting an unexpected TTL on a non-TTL index. Missing/incompatible schema blocks readiness/database APIs. Explicit `schema:init` defaults offline; applying DDL requires separate authorization and exact target checks, never drops existing indexes, and is not performed here. New models/indexes therefore remain an integration prerequisite on existing databases.

Graceful shutdown stops admissions, drains accepted work/idle keep-alive connections, cancels startup sleeps and bounds driver disconnect. Correlation IDs are server-generated UUIDs; diagnostics omit URIs/hosts/body/cookies/tokens/private files. Development SRV DNS overrides are validated, opt-in and process-only before driver operations; no DNS resolution or Windows settings changes were performed.

### Commerce, private files and durable background work

Repeated cart lines previously resolved the same dependencies independently. A fresh request/transaction-attempt pricing context batches only referenced products/categories/templates/components/uploads. Operations remain sequential inside MongoDB transactions; no global cache, client totals or approval bypass. Current validated component modes avoid redundant reads while conditional writes reject changed modes.

Shared shipping/category/template fences remain because removing them would reintroduce eligibility write skew. Contention is measured below; no unproven high-throughput redesign was introduced. Bundle activation now uses a narrow transactional capacity fence, preventing concurrent 99→101 outcomes while preserving 100-rule selection/stacking constraints, revisions and audits.

Temporary files retain the existing 24-hour lifecycle while carts retain their existing 30-day lifetime. Cart DTOs disclose the earliest expiry and actionable replacement state, retaining only safe product/field identity when invalid. Reading a cart does not extend file retention. Customer proofs/artwork stay in browser memory until explicit Add to Cart/Place Order.

Private-upload signing/direct PUT/completion now share a bounded 60-second client workflow and auth-generation cancellation. Storage inspection/body reads and private streams are separately bounded; admin disconnect aborts/destroys streams. Failed uploads/copies never fabricate success and remain eligible for bounded cleanup. Cleanup uses UUID leases, backoff and six-attempt manual review; retained order files stay protected.

An uncertain order response previously lacked a safe recovery path. Checkout now stores only an opaque owner-scoped UUID/pending marker, tolerates blocked browser storage, locks mutable fields, and offers explicit owned status lookup or the same immutable submission/proof retry. No automatic network replay/new key/payment occurs. A null lookup is not proof that an in-flight request cannot commit. Confirmation does not depend on cart refresh/storage succeeding. A domain-separated SHA-256 owner namespace rotates with the actual guest cookie; it is not a bearer or authorization token and exposes no raw owner.

Rejected InstaPay DTOs expose explicit public reasons/contact guidance without internal notes. Receipt replacement remains false, rejected→paid remains forbidden and no refund/repeat-transfer policy was invented. This is F13's remaining owner decision.

Worker runs now have a durable safe run journal, bounded stage/provider budgets, interrupted/dead/uncertain diagnostics, retry ceilings and authenticated pagination. Ambiguous non-idempotent SMTP sends remain manual-review uncertain and erase terminal account-action secrets. Nodemailer cannot abort a busy pooled SMTP send: the CLI finalizes durable state, bounds disconnect, then allows at most five seconds for residual handles before exiting; no blind resend follows. Scheduling/provider delivery is not activated. New production worker gates are separate from database/provider launch authorization.

### Tracking and catalog efficiency

Search events were previously created on any q-filter request/refetch. Only an explicit user submission carries a validated UUID header; retries deduplicate that action and filter/page/sort/refetch/bookmarked URLs do not invent searches. Checkout quote emits InitiateCheckout only. AddPaymentInfo derives from an accepted order's actual method/totals with stable deduplication; Purchase keeps COD-placement versus manually verified InstaPay semantics. Consent/GPC/revocation, matching CAPI/browser IDs and disabled defaults remain enforced. Restricted storage cannot reverse an in-memory tracking denial; monetary receipts must be exact safe integer piastres.

Category eligibility previously required two reads. One fresh authoritative graph now supplies root/direct-child validity. Unneeded category count aggregates are explicitly omitted for selection controls; default counts remain for consumers that use them. Every normal product request remains indexed/server-filtered and capped at 20; Best Sellers remain capped at eight. Legacy range API compatibility is retained, while frontend consumers request no obsolete slider range aggregation.

### SEO, static publication and browser policies

Static exports previously overwrote flat files before switching manifests, had no bounded publication freshness, and accepted syntactically valid media URLs without existence evidence. Version-2 immutable generations, atomic manifest switching, output locks, SHA-256 fingerprints, added/changed/withdrawn reports and offline reconciliation now make changes/failed generation explicit.

Reviewed media attestations must match the exact approved URL/checksum/version/type/dimensions/size/expiry. This validates supplied evidence; it does not contact R2 or independently verify an object. Empty/thin categories keep hierarchy/URLs but default to noindex below three verified eligible products (reviewable 1–20). The runtime respects the same approved threshold when counts decline.

Made by Request schema uses PreOrder; tracked stock uses InStock only when eligible; unavailable parent/variants use OutOfStock; mixed modes avoid false shared availability. Checkout-disabled builds do not advertise offers.

Static/React boot preserves semantic fallback briefly while actual non-loading content is ready, with a six-second escape. Exact route/origin/publication freshness and normalized actual public/export product signatures prevent changed media/prices/stock inheriting stale indexing. Layout-phase metadata and a single expiry timer remove noindex flicker while pending and revoke stale JSON-LD. This is not SSR/hydration or a guarantee of zero CLS.

The Worker requires the exact reviewed publication ID and finite validity. Emergency withdrawals return genuine no-store/noindex 404 and disappear from sitemap; expired snapshots return generic no-store/noindex 503 with no prices/schema. CDN caches cannot outlive snapshot freshness. Real export/refresh scheduling/deployment/purge/indexing is pending authorization.

Browser headers include framing denial, nosniff, strict referrer and restricted permissions. CSP defaults report-only, with bounded exact API/media/upload origins and separately reviewed tracking allowance. Isolated enforcement blocks prohibited connections/scripts. Deploying enforced CSP is not authorized.

Original Cormorant Garamond/DM Sans discovery moves from nested CSS import into HTML, with optional font display and existing Georgia/Arial fallback. No font asset/license redistribution occurred. Real brand-font delivery/whole-page Core Web Vitals remain unverified.

## Actual isolated measurements and limits

- Three customized cart lines: dependency reads **15 → 4 (73.3% fewer)**, deeply identical 12,617-piastre unit quotes/claims/snapshots. Cart-document reads are additional on both paths; file-bearing lines have additional bounded upload reads.
- Public catalog listing: total Category.find calls **4 → 3**, eligibility reads **2 → 1**; unchanged 23 approved products with pages of 20 and three. Compact category selection **one → zero product-count aggregations**, without falsely returning zero counts.
- Final backend six-way shared-fence sample: **36 transaction callback executions/30 retries**, median **350ms**, maximum **405ms**; all six inventory effects committed once. Variance across synthetic runs is expected. This is evidence of retained contention, not a production latency/throughput improvement.
- Four synthetic font handoffs (320/390/768/1440): intrinsic logo/gallery width and height unchanged and no document overflow. Installed local substitute fonts/blocked remote fonts do not verify real brand-font rendering or whole-page CLS.
- Final build: entry JavaScript **339.93kB / 102.31kB gzip**, main CSS **74.69kB / 15.10kB gzip**, separate route/shared chunks retained. Compared with the historical Batch 2 build (335.00kB / 100.77kB gzip), entry JS grew by 4.93kB raw / 1.54kB gzip for the reliability/metadata work; no bundle-size reduction is claimed. These are chunk sizes, not total initial downloaded bytes or a real configured launch build.
- No field LCP, INP, CLS, Atlas/Render throughput, real hero-video bandwidth or production load benchmark was measured. A disposable Node resolver check confirmed dns.setServers also changes the Promise API resolver, with a documentation-only IP and zero DNS queries.

## New risks and controls

| Risk introduced/retained | Control and required follow-up |
| --- | --- |
| Existing databases may lack newly declared schema | Fail readiness; review/apply guarded DDL only under separate authorization; no automatic startup mutation |
| Wrong ingress/domain approval could undermine cookie/limiter assumptions | Narrow explicit topology/proxy gates plus real ingress/cookie tests before launch |
| Shared fences still contend | Query reduction measured; correctness retained; expected-load test before scaling |
| Partial local SEO generation or abandoned lock | Immutable commit state, explicit uncertain/finalization reports, review/rebuild ignored output; no arbitrary deletion |
| Expired SEO publication becomes unavailable | Monitor/schedule approved refresh; emergency withdrawal; no stale schema/price fallback |
| SMTP/R2 timeout can have a late external outcome | Uncertain/manual review and stable idempotency; no fake failure-success guarantee or blind replay |
| Lost checkout response/reload without original request | Owner-private lookup/contact; persisted opaque key only; no new UUID/order or PII persistence |
| Report-only CSP is not enforcement | Separate report review/approved exact origins/enforcement validation |
| Local dependency inventory is not a vulnerability scan | Public advisory-database/registry inspection remains separately authorized |

## Ordered launch/integration checklist

1. **Owner decisions:** choose rejected InstaPay proof/refund/dispute policy (F13), legal/privacy/order/audit/private-file retention and deletion exceptions, backup retention/RPO/RTO (F50), expected peak load and operational contacts. Do not enable unapproved transitions or add retention TTLs.
2. **Catalog and public content:** review all flagged classifications; approve exact prices/inventory/variants/personalization/templates/categories; select eligible homepage categories/exact eight Best Sellers; approve contacts/FAQ/policies/reviews with permission. Draft/Hold/provisional records stay private. No bulk import/backfill is included.
3. **Assets/claims:** approve optimized local hero/posters (under 1MB where feasible; exceptions explicitly reviewed), four claim evidence/wording, and public catalog photos. All four statistics remain unapproved and heroVideo remains null.
4. **Topology/database:** approve owned same-site HTTPS domain/API arrangement or reviewed same-origin proxy, provider ingress/IP sanitation, exact production database/host/least-privilege users and independent target gates. No real production configuration is present.
5. **Schema integration:** inspect schema/index delta and backup readiness under separate authorization; explicitly initialize new declarations on the exact permitted target; verify no automatic DDL, health/readiness, denied wrong targets/roles/Origins and real secure cookies. Optional category metadata backfill is a separate reviewed operation, not required by this batch.
6. **R2/media:** separately provision/configure public catalog versus private customer storage, least-privilege credentials/CORS, actual direct upload/copy/inspection/expiry/cleanup/proof authorization; verify public objects and reviewed attestation. No external upload was performed.
7. **Commerce integration:** synthetic authorized staging acceptance for both payment methods, idempotent retries/lost responses/stock races/promotion limits/cancellation/rejection and private files. Approve policy before new resolution actions. Checkout stays off until an explicit independent launch approval.
8. **Email/Meta:** privately configure Gmail/provider credentials and allowlisted development recipient smoke test; prove durable outbox/ambiguity behavior. Approve tracking policy/consent/GPC then configure matching Pixel/CAPI credentials and dedup validation with separate event permission. No real send/event was verified.
9. **Jobs/monitoring/recovery:** explicitly schedule bounded jobs; alert on readiness, partial/interrupted/dead/uncertain/review records and publication expiry; authorize encrypted backups and a restore into a new disposable target, reconcile inventory/idempotency/outboxes/files before workers.
10. **SEO/deployment:** authorize read-only approved export/media evidence, reconcile withdrawal report, build reviewed fresh publication, configure exact publication ID/canonical origin/threshold/freshness, validate CSP in report-only then reviewed enforcement. Prepare owned-domain Cloudflare/Render health/timeouts/private caching/secret injection; no deploy is performed here.
11. **Final release acceptance:** actual branded fonts/media/mobile devices/keyboard/assistive technology/physical 200% zoom, isolated expected-load tests and separately authorized vulnerability/advisory scan. Verify CDN headers/true 404/withdrawal/sitemap/robots/live secure-cookie topology and controlled provider receipts; no ranking/indexing guarantee.
12. **Launch and rollback:** owner authorizes deployment/integrations/checkout flags separately only after the above. Keep approved current artifact/config rollback, withdrawal overrides, database-safe forward migration/recovery and inventory/outbox reconciliation. Never roll back to expired/unapproved catalog snapshots.

Detailed future commands and guard prerequisites are in [operations](BATCH_3_OPERATIONS.md), [commerce/retention](BATCH_3_COMMERCE.md) and [SEO publication/withdrawal](BATCH_3_SEO_OPERATIONS.md). Commands labelled future writes/provider delivery must not be executed without new authorization.

## Exact Batch 3 file manifest

31 created + 71 modified = **102 unique paths**. This is the union of Batch 3 edits, not every existing dirty Git path from Batch 1/2. A file created by an earlier batch and edited here is classified as modified. Generated ignored .cache/test-results/dist artifacts are excluded.

Created:

- `client/connected-e2e/commerce-edge-contracts.spec.js`
- `client/connected-e2e/operations-contracts.spec.js`
- `client/e2e/batch3-commerce.spec.js`
- `client/e2e/batch3-seo.spec.js`
- `client/e2e/network-fixture.js`
- `client/scripts/reconcile-seo.js`
- `client/scripts/seo/publication.js`
- `client/scripts/seo/publication.test.js`
- `client/src/commerce/checkout-session.js`
- `client/src/seo/boot.js`
- `client/src/seo/media-verification.js`
- `client/worker/browser-policy.js`
- `docs/BATCH_3_COMMERCE.md`
- `docs/BATCH_3_OPERATIONS.md`
- `docs/BATCH_3_RELEASE.md`
- `docs/BATCH_3_SEO_OPERATIONS.md`
- `server/scripts/check-operations.js`
- `server/scripts/initialize-schema.js`
- `server/src/commerce/pricing-context.js`
- `server/src/commerce/work-budget.js`
- `server/src/config/database-dns.js`
- `server/src/config/deployment.js`
- `server/src/config/schema.js`
- `server/src/config/shutdown.js`
- `server/src/middleware/operations.js`
- `server/src/models/CommerceControl.js`
- `server/src/models/CommerceJobRun.js`
- `server/test/batch3-catalog-efficiency.test.js`
- `server/test/batch3-commerce.test.js`
- `server/test/batch3-operations.test.js`
- `server/test/batch3-schema-integration.test.js`

Modified:

- `AGENTS.md`
- `README.md`
- `client/e2e/catalog-fixtures.js`
- `client/e2e/commerce-fixtures.js`
- `client/e2e/commerce.spec.js`
- `client/e2e/seo.spec.js`
- `client/e2e/tracking.spec.js`
- `client/index.html`
- `client/public/_headers`
- `client/public/seo-static.css`
- `client/scripts/generate-seo.js`
- `client/scripts/run-contract-tests.js`
- `client/scripts/seo/generator.js`
- `client/scripts/seo/generator.test.js`
- `client/scripts/seo/worker.test.js`
- `client/src/commerce/AdminEditors.jsx`
- `client/src/commerce/CartContext.jsx`
- `client/src/commerce/api.js`
- `client/src/design-system.css`
- `client/src/main.jsx`
- `client/src/pages/AdminProductFormPage.jsx`
- `client/src/pages/AdminProductsPage.jsx`
- `client/src/pages/CartPage.jsx`
- `client/src/pages/CategoryPage.jsx`
- `client/src/pages/CheckoutPage.jsx`
- `client/src/pages/OrdersPage.jsx`
- `client/src/pages/ShopPage.jsx`
- `client/src/seo/PageMetadata.jsx`
- `client/src/seo/metadata.js`
- `client/src/services/api.js`
- `client/src/services/catalog.js`
- `client/src/tracking/client.js`
- `client/vite.config.js`
- `client/worker/seo-worker.js`
- `client/wrangler.jsonc`
- `docs/BATCH_2_FRONTEND.md`
- `docs/PHASE_3_SEO.md`
- `server/.env.example`
- `server/package.json`
- `server/scripts/export-seo-catalog.js`
- `server/scripts/run-commerce-jobs.js`
- `server/scripts/run-tests.js`
- `server/src/app.js`
- `server/src/catalog/service.js`
- `server/src/catalog/validation.js`
- `server/src/commerce/cart.js`
- `server/src/commerce/configuration.routes.js`
- `server/src/commerce/customization.js`
- `server/src/commerce/inventory.js`
- `server/src/commerce/models.js`
- `server/src/commerce/notifications.js`
- `server/src/commerce/order-presentation.js`
- `server/src/commerce/orders.js`
- `server/src/commerce/pricing.js`
- `server/src/commerce/routes.js`
- `server/src/commerce/storage.js`
- `server/src/commerce/uploads.js`
- `server/src/commerce/uploads.routes.js`
- `server/src/config/database-safety.js`
- `server/src/config/db.js`
- `server/src/config/env.js`
- `server/src/models/Upload.js`
- `server/src/routes/catalog.routes.js`
- `server/src/server.js`
- `server/src/tracking/service.js`
- `server/test/batch1-auth.test.js`
- `server/test/commerce-configuration.test.js`
- `server/test/database-connection.test.js`
- `server/test/helpers/connected-api-server.js`
- `server/test/phase3-tracking.test.js`
- `server/test/seo-export.test.js`

## Safety confirmation and remaining limits

No existing `tapandwrap_staging`, production or merchant database was accessed or mutated. Only new synthetic loopback disposable fixtures were connected. No real .env secrets were read/printed/modified; no existing-category backfill, persistent catalog import, merchant price/inventory/content edit, public catalog publication, checkout activation, external R2/Gmail/Meta/payment request, OS DNS change, registry lookup, other-project access, commit, push or deployment occurred.

Prepared external adapters were tested with isolated mocks; database contracts were tested with actual disposable MongoDB. Live connectivity/delivery/media/object existence/proxy/domain/security-header rollout, backup recovery and production search behavior are unverified. Physical browser zoom, real devices/screen readers and field Core Web Vitals remain later acceptance work. Source/tests cannot guarantee a bug-free or vulnerability-free application.

**Final reconciliation: 50 PASS, two PARTIAL (F13/F50), zero BLOCKED local implementation findings. All applicable final local gates passed. Production remains NO-GO.** The authorized local work is complete; no activation follows from this report.
