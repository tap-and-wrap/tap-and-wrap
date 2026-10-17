# Post-remediation release gate

17 October 2026, Africa/Cairo. Local verification only. Production remains unchanged and **NO-GO**.

## 1. Executive decision

**PASS within the isolated functional scope:** the original inventory, refund, upload validation/chooser, hero controls, permanent routing, mixed indexability, independent request intake and repaired business-contract assertions. These were rerun against actual current code, not accepted from previous reports.

**FAIL for unconditional media acceptance:** default Edge reproduced a service-video failure. The investigation now has a concrete decoder diagnostic and a plain-HTML reproduction, but does not establish universally reliable native-device playback. The existing loaded-poster/service-link fallback passes. Owner acceptance of that limitation and physical-device checks remain required; passing software-decoder tests cannot close this gate.

**NOT VERIFIED:** actual Cloudflare hosting/bindings, Render packaging/capacity, Linux native decoding, Atlas state, providers, real domain authentication, physical devices, owner/legal approvals and production data transition. F08 was a deployment prerequisite, not a code defect fixed by Remediation 3.

No reproducible P0/P1 application integrity defect was found in the executed financial, inventory, authorization and URL tests. This is a bounded acceptance finding, not an assertion that the entire application is error-free. Initial overlapping browser runs failed and were interrupted; they are explicitly retained below. Successful later runs do not erase them.

**An authorized isolated deployment test is a reasonable next diagnostic stage after source freeze, isolation and configuration review. It is not permission to deploy this working tree, connect it to production, or enable customer intake.** Final customer launch acceptance remains FAIL until the release gates in sections 9–12 pass.

## 2. Preservation and exact changes in this pass

Preflight: **212 status entries**, **421 non-secret existing file hashes**, zero staged changes. Evidence: ignored `client/test-results/post-gate/baseline.json` and `release-status.txt`. Real `.env*` files were excluded; no secret values or provider settings were read. Previous implementation reports, remediation reports, routing work and original media were preserved.

New deliverable files only:

| File | Purpose |
| --- | --- |
| `client/e2e/service-video-reliability.spec.js` | Three diagnostic regression scenarios: mobile/desktop lifecycle repetitions and delayed/failed network fallback; event attachments retain actual media state/errors. |
| `docs/POST_REMEDIATION_RELEASE_GATE.md` | This acceptance report. |
| `docs/POST_REMEDIATION_RELEASE_MANIFEST.json` | Explicit proposed accumulated release delta, grouped for review, with non-secret file hashes. |

**No existing application source, dependency, configuration, footage, poster, database model, prior test or report was modified.** The new diagnostic tests retain their failing native-browser result; no timeout was raised, assertion skipped, force click added or source replaced. Temporary control pages, test configurations, build output and logs are ignored verification artifacts, not proposed runtime changes.

No database outside new disposable loopback fixtures was accessed. No real R2, email, WhatsApp, payment, migration, environment change, commit, push or deployment occurred. Test child processes used synthetic, scrubbed configuration; enabling checkout in a disposable fixture is not production activation.

## 3. Every original finding

| Finding | Current decision | Independent evidence / boundary |
| --- | --- | --- |
| F01 inferred stock | **PASS locally** | `server/src/catalog/inventory-input.js:5` requires an explicit safe integer for newly approved tracked stock. Direct product/inventory/variant/component APIs reject missing/null/invalid quantities and imported placeholder approval; explicit zero/ten, approved preservation, Made by Request and revision conflicts are tested in `release-remediation-1.test.js`, `catalog-api.test.js`, `commerce-configuration-api.test.js`. |
| F02 combined refunds | **PASS locally** | `order-accounting.js:136`, `OrderSettlement.js:8`: one append-only refund against one original collection, exact positive allocations, per-scope remaining bounds, method/reference uniqueness, immutable retry and transaction/revision fences. Full/partial/multi-scope, concurrent, cancellation and return cases pass; mobile editor passes. This does not combine unrelated source collections or execute bank refunds. |
| F03 upload source chooser | **PASS for tested UI; native devices NOT VERIFIED** | Only active source file-input implementation is `ImageSourceChooser.jsx:36`. Customer fields and admin gallery reuse it. Chooser first, zero early native events, Gallery/Camera/Files, same-file replacement, multi-select, cancel/back/focus and retries pass. See entry-point table below. |
| F04 hero control | **PASS in Edge** | `home-media.css:47`, `PublicContent.jsx:27`, `useVideoPlayback.js:12`: pointer, keyboard and emulated touch pause/resume; reduced motion, source switch, visibility and poster fallback pass. Physical touch and native media lifecycle remain unverified. |
| F05 corrupted images | **PASS locally** | `server/src/media/image-integrity.js:8`, `image-decoder-process.js:15`, public/private storage integration: complete bounded decode rejects corrupt/truncated JPEG/PNG/WebP, wrong MIME, empty/huge inputs and provider failures. Original bytes/evidence remain unchanged. Linux/native memory capacity and actual R2 are separate gates. |
| F06 permanent URLs | **PASS for local actual HTTP** | `server/test/product-routing.test.js` runs the real Worker handler through an HTTP server backed by real Express/disposable MongoDB. Registry creation, rename, ownership conflicts, deletion, visibility, queries/HEAD and outage are exercised. Worker suite verifies old-map expiry, ordinary builds/cold starts and no-map routing. |
| F07 browsing vs indexing | **PASS locally** | Worker HTTP tests prove public unindexed products remain 200/noindex with indexing on/off; current approved fingerprints can serve reviewed snapshots, stale/missing snapshots downgrade, hidden/withdrawn records 404, and sitemap omits invalidated products. No draft Product/Offer export or live indexing activation. |
| F08 deployment topology | **NOT VERIFIED / P1 release prerequisite** | Current `wrangler.jsonc` is Workers Static Assets, not a Pages `_worker.js` artifact. Render must include repository `shared/`. See section 5. A passing Node HTTP bridge does not prove a deployed Worker. |
| F09 independent intake | **PASS locally** | `env.js:5`, `request-intake.js:4`, submission/upload services require both request flags independently of checkout. Direct bypass denied; accepted immutable retry/owned receipt/admin/history/contact deadlines survive maintenance and reopen. |
| F10 historical contracts | **PASS in completed fresh runs** | All eleven corrected connected contracts pass with checkout off; three enabled-checkout cases also pass. Backend cancellation request leaves stock allocated; concurrent authorized cancellation restores eligible stock once. Personalized component COD still requires quotation authorization. Interrupted overlapping-run failures remain documented. |
| F11 data/schema | **NOT VERIFIED / P1 release prerequisite** | Declared schemas validated in disposable tests only. No current Atlas snapshot, historical-order reconciliation, visibility transition or production index evidence. |
| F12 providers/operations | **NOT VERIFIED / P1 release prerequisite** | Real R2/public CDN, sender/owner mailbox, jobs/monitoring and same-site auth have not been exercised. |
| F13 legal/business | **NOT VERIFIED / P1 publication prerequisite** | Operator identity/disclosures, English-only Egyptian compliance, returns, privacy/retention and contact ownership need external sign-off. Source content approval remains false. |
| F14 image performance/metadata | **OPEN P2** | Originals remain intact; no responsive derivative system or approved EXIF handling. Ten large previews/gallery photographs need physical memory/slow-network measurement. |
| F15 retention | **OPEN P2 / operating-policy gate** | Submitted evidence and public leftovers are intentionally retained; no approved disposal schedule or public garbage collector. |
| F16 merchant workflow | **OPEN handoff limitations** | Reviewed visibility executor absent; technical variant/template controls and legacy reconciliation need operator training. Ordinary personalized-product COD exception is not demonstrated through a generic quotation UI. Do not fabricate a service request to bypass it. |
| F17 capacity/security | **PARTIALLY VERIFIED** | Targeted ownership/Origin/CSRF, transactions, bounded queries and 41-row attention pagination pass. Distributed limits, real proxy chain, production load, current registry advisory scan and comprehensive penetration/accessibility assessment remain unverified. |
| F18 connected teardown | **PASS in completed runs; interruption boundary disclosed** | Repeated one-worker, enabled and two-worker runs exit cleanly through IPC. Deliberate assertion failure also stops fixtures cleanly. Interrupted early workloads cannot be counted as clean exits. No successful connected run required forced process termination. |

### Upload entry points and formats

| Entry point | Actual source chain / executed coverage |
| --- | --- |
| Required product photo/reference and replacement | `ProductPersonalizationDialog` → `ConfiguredFields` / `LocalFileField` → shared chooser; real connected upload/cart/order/admin view plus isolated edit/recovery tests. |
| Gift Box / Engraving references | `ServiceRequestPage` → `LocalFileField`; both connected service requests retain two private images and convert accepted quotations. |
| Website InstaPay proof/replacement | `OrderFinancials.jsx:36` → `LocalFileField`; connected order-bound proof remains awaiting reconciliation; backend foreign-owner/rejection/replacement checks pass. |
| Product gallery/add/replace/primary/reorder | `AdminProductFormPage` → `AdminImageGallery` → chooser; direct API media integrity plus browser save/reload/retry/conflict cases. |
| Category/subcategory | `AdminWebsitePage` → same gallery, one image; relationships/revisions retained. |
| Component/packaging | `AdminEditors` → same gallery; connected component save plus isolated component image cases. |

JPEG, PNG and static WebP are supported. HEIC/HEIF, SVG, GIF/animated images and arbitrary files are not silently accepted. Browser rejection preserves previous valid files and unrelated fields; a corrupt preview can be replaced with a valid same-name file. Server validation remains authoritative. Compressed byte, dimension/pixel/sample, concurrency and process-deadline bounds remain in place.

Only the explicit camera input has `capture="environment"`; there is no getUserMedia stream or camera-policy relaxation. Native capture is a browser/OS hint. Gallery and Files may produce similar pickers. Physical permission allowed/denied/previously denied is **NOT VERIFIED**. An iPhone returning HEIC could block completion until a compatible JPEG/PNG/WebP is selected/exported; do not promise automatic conversion or ordinary-camera compatibility without the physical test.

## 4. Service-video diagnosis and repeatability

### What was established

1. Existing Gift Box and Engraving sources remain attached after first intersection (`ServiceFilm.jsx:10`); scrolling pauses rather than replacing/reloading the source. Effect cleanup guards stale automatic play promises, manual pause intent persists, and media errors intentionally replace the video/control with a poster (`useVideoPlayback.js:24`, `ServiceFilm.jsx:17`). No new application lifecycle race was established.
2. The initial expanded run reproduced a Pause control that resolved, became unstable, then detached. The retained trace contains **MediaError code 3**, `PipelineStatus::PIPELINE_ERROR_DISCONNECTED: video decode error!`, on the mobile hero and Gift Box close together. The source was attached and metadata loaded before the error. This explains control removal through the existing error fallback; HTTP 206 alone did not establish decoding success. No Vite reload explained that trace.
3. A separate loopback plain-HTML page served the same three original MP4s with valid byte-range responses, with **no React, observer, hook, navigation or HMR**. All three produced the same decoder disconnect. CDP Media reported **D3D11VideoDecoder / platform decoder true**. This is positive evidence that the captured failure can occur outside the application lifecycle.
4. The same plain control, with the diagnostic browser flag `--disable-accelerated-video-decode`, used **FFmpegVideoDecoder / platform decoder false**, played all three through the observation period, and recorded zero media errors. This narrows the captured issue to the native decoding environment/path. The underlying driver/utility-process failure, and whether other customer devices reproduce it, remain unverified.
5. A fresh default Edge application repetition completed **8/9 PASS, 1 FAIL**. The mobile lifecycle case passed two of three repetitions and failed once; desktop passed three of three, and delayed/failed network fallback passed three of three. This is an intermittent failure, not zero problems. Tests use normal 30-second limits and trusted clicks; the failed case was not weakened.

Diagnostic evidence under ignored `client/test-results/post-gate/`:

- `initial-video-evidence/` and `video-repeat.log`: four reported failures before interruption; eleven selected repetitions have no final result, not eleven passes or deliberate skips.
- `sequential-video-evidence/` and `video-sequential.log`: completed native Edge 8/9 result, 1.7 minutes.
- `raw-video-sequential.log`: plain HTML native decoder error/property events.
- `raw-video-software.log`: plain HTML software decoder success/property events.
- `video-software.log`, `software-browser/`: application A/B diagnostic results, recorded in the final matrix.
- `chrome-video.log`: separate installed Chrome comparison, recorded in the final matrix.

The first raw-control attempt waited for the whole document `load` and timed out while media stalled. The diagnostic was corrected to observe DOMContentLoaded and explicit media events; no application timeout or acceptance assertion changed. One ignored helper command initially used the wrong working-directory prefix and was corrected without touching source.

### Acceptance consequence

No approved footage, browser security policy, production flags or playback source was changed. Automatically retrying an uncertain decoder crash or suppressing error events would obscure evidence and could worsen resource pressure. A website cannot force visitors to disable hardware decoding. Software-decoder success is diagnostic only.

Posters load and service CTA links remain accessible during deliberate media failure, blocked autoplay and delayed/failed requests. Essential order/request content does not depend on the footage. Accept the decorative fallback only through an explicit owner decision plus physical-device acceptance; otherwise retain the media release gate. Hero offscreen resource use and concurrent native decoders are optimization/investigation candidates, not a proven application root cause or a silently implemented redesign.

## 5. Authoritative URLs and exact deployment dependencies

Current entry: `client/wrangler.jsonc:4` → `worker/seo-worker.js` with Static Assets `ASSETS`, `html_handling:none`, 404 handling and worker-first document routing. A Pages-only upload of `dist/` would omit this runtime contract. No Pages wrapper exists in the reviewed artifact. Actual live project type/build command/DNS/rules remain unknown.

Every product GET/HEAD calls the bounded public endpoint (`catalog.routes.js:23`). Only requested/canonical paths and an opaque approved-content/revision/checkout digest are returned, or notFound. There are no names, IDs, prices, inventory, images, private keys or customer values in that contract. It neither exports SEO records nor writes registrations. API and Worker responses are no-store; no visitor cookie/auth/query is forwarded to the authority.

Registered ownership is preserved across rename, hiding and deletion; new stored slugs for existing registered owners become aliases, never new canonical owners (`product-addresses.js:18`, `:30`, `:41`). Normal merchant edits need **no URL map export, daily rebuild or developer intervention**. The aliases flag should remain enabled operationally for new allocations; disabling it does not reassign existing reservations.

Worker resolution uses at most twenty slugs per call, bounded JSON bytes, exact response coverage, a shared four-second deadline and no positive/negative permission cache (`seo-worker.js:48`, `:75`). Unexpected cached authority results are rejected. Unknown/restricted paths 404; aliases 308 preserving queries; canonical public enquiry paths 200/noindex. API outage, conflict, invalid response or timeout intentionally returns generic 503/noindex rather than stale exposure. This deliberate outage policy differs from the removed arbitrary map expiry.

The default authority is `https://api.tapandwrap.net`. Optional Worker-only `PRODUCT_ADDRESS_API_ORIGIN` must be an exact HTTPS origin. It is not a credential. `ADDRESS_SERVICE` is an injected fixture capability, not a required production binding. No new registry service, KV, cron refresh or paid infrastructure component was introduced by Remediation 3.

**Render must provide reliable response time below the four-second budget**, including cold starts. Do not assume a sleeping/undersized service is suitable. Verify Cloudflare-to-API HTTPS, WAF/bot/cache rules, query handling and representative load before activation. Zero-cache correctness increases live API/Atlas dependency and query cost. No production capacity was measured here.

Ordinary map-free generation always writes `spa.html` (`generator.js:312`), distinct from an approved SEO snapshot. Fresh current approved exports/media/publication IDs plus matching product/category revisions and checkout gate authorize indexing; missing/stale/mismatched publication downgrades browsing to noindex. Withdrawal cannot be reversed by an old static snapshot. Paginated sitemap children validate current dependencies; an authority failure can 503 that child without advertising stale product URLs. Private order/admin shells do not depend on address resolution.

SEO refresh still requires the existing separate approval process. Bookkeeping/stock revisions conservatively invalidate fingerprints. **Public URLs keep working without refresh; indexable static metadata may require an operator refresh.** The production SEO-export prohibition remains intact. Establish a permitted reviewed publication source and refresh procedure before enabling indexing; do not invent a production export workaround. Legal pages retain `contentPublicationApproved=false` and independent noindex gates.

Deploy-compatible API first, then the matching Worker/assets as one reviewed artifact, under future authorization and closed intake. Validate actual Workers Static Assets execution, GET/HEAD/query/404/308/200, asset ranges, headers, robots and outage behavior on the isolated target. The local Node HTTP bridge is genuine HTTP behavior but **not the Cloudflare workerd or deployed edge runtime**.

## 6. Cross-batch acceptance matrix

All records are synthetic; external integrations are mocked/in-memory. No actual WhatsApp sending or bank reconciliation occurs in a fixture.

| Journey | Executed evidence | Result / remaining boundary |
| --- | --- | --- |
| A Product → personalization → chooser → cart → InstaPay order → admin file view | Enabled connected case 2, real React/Express/disposable DB; media/personalization/storage suites | **PASS locally**, fixed price, correct retained attachment, explicit private view. Real R2/device not verified. |
| B COD → shipping → contact → collection/fulfillment | Enabled connected case 1 creates actual fixture order; real backend foundation/operations tests verify charges/acceptance/contact/dispatch/COD; browser shipping/accounting editor uses intercepted API | **PASS in complementary layers**, not one complete real-browser-to-API fulfillment scenario. Shipping remains null/pending initially. |
| C InstaPay → proof → reconciliation | Connected order-first/proof/admin-view; real foundation API/service verifies rejection/replacement and actual-collection command | **PASS in complementary layers**. Proof alone remains awaiting verification; actual receiving account is unverified. |
| D Gift Box → two images → quotation → recorded share/acceptance → order | Enabled connected case 3 with actual API/DB and private admin image | **PASS locally**, no account/payment at request; no real message. |
| E Engraving → artwork → quotation → accepted order | Same connected case separately executes engraving; backend option/variant/withdrawal tests | **PASS locally**, manual-reference fallback and zero templates supported. |
| F Multi-scope refund/history | Real HTTP/API/transaction regressions plus mobile financial editor | **PASS locally**, one reference/settlement, exact allocations, concurrency/over-refund protection; UI provider response mocked. |
| G Rename → alias redirect → canonical | Actual local Worker HTTP → real resolver/DB, plus registry/Worker cases | **PASS locally**, ownership remains reserved after deletion; deployed edge not verified. |
| H Admin upload/save/reload/replace/reorder | Connected component upload/save, browser product/category/component gallery suite, real backend public storage validation | **PASS in complementary layers**. Imported references/revision conflicts preserved; CDN/R2 not verified. |
| I Immediate/9-hour/12-hour contact | `operational-readiness.test.js:56` controlled clocks for orders and requests, concurrent claims, suppression after contact, dashboard browser | **PASS locally**, at most two initial-contact email events; no third at 12 hours. Actual mailbox/scheduling not verified. |

Full reload deliberately cannot retain unsaved private File objects under the approved memory-only design. Opaque owned submission keys recover accepted requests/orders; expired/missing attachments require explicit replacement. This is a documented privacy behavior, not a promise of file persistence across reload.

## 7. Frozen regression results

Results are from this pass, not summed from prior reports. Overlapping rechecks are reported separately.

| Execution / evidence | Result | Kind |
| --- | --- | --- |
| `server/.cache/post-gate-backend.tap`, thirteen selected backend files | **181 passed, 0 failed/skipped/cancelled**, 35.5s | Actual loopback Express/Mongoose replica sets; storage/email mocked, real local Sharp decoder. |
| `server/.cache/post-gate-boundaries.tap`, seven additional files | **121 passed, 0 failed/skipped/cancelled**, 32.5s | Catalog/config direct APIs, approved export contracts, visibility, operations/topology/schema. Disjoint files: **302 backend cases total**. |
| `node --test scripts/seo/*.test.js`, `seo.log` | **63 passed, 0 failed/skipped/cancelled**, 4.7s | Generator/publication/Worker Response tests, no live API/export. Real HTTP routing also covered by backend suite. |
| Default connected initial `contracts.log` | **11/11 PASS**, 34.1s, clean shutdown | Real React/API/disposable DB. |
| Enabled `enabled.log` | **3/3 PASS**, 48.1s, clean shutdown | Includes both services within case 3 and secure private images/proof; memory storage. |
| Final one-worker `contracts-final.log` | **11/11 PASS**, 38.7s, clean shutdown | Fresh DB/ports, same historical contract assertions. |
| Final two-worker `contracts-parallel-final.log` | **11/11 PASS**, 25.4s, clean shutdown | Concurrent cases with isolated ownership and revision safeguards. |
| `failure-cleanup.log` | **1 deliberately failing assertion**, fixtures stop cleanly | Expected `EXPECTED_LOCAL_CLEANUP_PROBE`; verifies failure cleanup, not a product failure or passing business test. |
| Seven-file storefront/admin browser selection, `browser-regression.log` | **50/50 PASS**, 2.0min, no skipped cases | Edge; isolated API/provider fixtures. Includes chooser, proof, hero, services, galleries, operations, financial editor and six fixed pages. |
| Completed default native Edge video repetition, `video-sequential.log` | **8 PASS / 1 FAIL / 0 skipped**, 1.7min | Three scenarios × three repetitions. Preserve the mobile native-decoder failure. |
| Software-decoder Edge / installed Chrome comparisons | **9/9 PASS each**, 1.0 minute / 53.9 seconds; zero skipped | Same three scenarios repeated three times. Edge uses a diagnostic decoder flag; Chrome uses its default configuration. Neither replaces native Edge/device acceptance. |
| Server syntax, `post-gate-syntax.log` | **PASS, 172 JavaScript files** | No runtime provider/database operation. |
| Isolated Vite + ordinary SEO output, `build.log`, `build-result.log` | **PASS**, bundle 1.92s; noindex, zero approved export products, no network | Scrubbed configuration, ignored output, `spa.html` included; no production `dist` replacement. |
| Frontend lint, `npm.cmd run lint` | **PASS**, final process exit 0 | Initial attempt found a syntax error in an ignored manifest-generation helper; corrected without application changes, then full lint rerun successfully. |

Initial stress/overlap evidence is **not discarded**: `video-repeat.log` selected fifteen repetitions, reported four failures, then was interrupted with eleven lacking final results. `contracts-repeat.log` reported two passes/four failures of eleven, five without final results, and no clean shutdown footer. By resumed inspection the owned sessions/processes were gone; do not infer clean teardown or count these as completed suites. Video traces demonstrate native decoder disconnects; not every connected timeout has a proven cause. Later sequential/two-worker results bound this uncertainty but do not erase it. No product assertion or security gate was relaxed to obtain them.

No full unrelated test suite, current network dependency-advisory audit, Cloudflare deployment, real-provider test, load test against production or physical-device run is claimed. The generic `npm test` Playwright webServer wrapper was not requalified; the repeated F18 evidence concerns the repaired connected launcher. The browser fixture helper owns/stops its local Vite child after tests; that is distinct from the connected launcher's graceful IPC proof.

## 8. Source freeze and proposed commit/release manifest

`POST_REMEDIATION_RELEASE_MANIFEST.json` lists exact accumulated changed/untracked paths, role, review decision and hash. It is a **proposal**, not approval or staging. All unchanged tracked files must also remain in a complete checkout/artifact. Do not copy only the proposed delta into Render.

Required runtime includes the currently untracked `server/src/media/image-integrity.js`, `image-decoder-process.js`, public media adapter/receipt, `inventory-input.js`, accounting/request/intake/owner-notification modules and models, frontend chooser/playback/media/accounting/request/personalization modules, and all referenced `shared/*.mjs`. Omitting an untracked child decoder or shared import can break an apparently successful partial release. Tests/harnesses, source-managed content, guarded worker/email/export scripts, package manifests/lockfiles and updated runbooks belong in explicit review groups.

Preserve but exclude from the proposed application release pending separate review:

- Six `*.before-admin-media.bak` files: historical backups, not active imports or runtime modules. Do not automatically delete them.
- Eight root historical handoff text/Markdown files: review/supersede stale operating instructions before deciding whether to archive them.
- Five untracked audit/transfer/upload/staging-schema scripts: separate operator/security review and approval; not API startup, release migration or permission to access providers.
- Ignored `test-results`, `test-results-contracts`, `server/.cache`, `node_modules`, generated bundles, merchant `local-data` and every real `.env`/credential: not release source.

No suspicious application mutation or unexpected missing baseline file was established in this pass. The accumulated tree remains a major review risk: it spans frontend/backend/shared contracts and many untracked modules. A partial commit/deploy can fail startup, mix financial versions or omit the Worker. Review one complete source snapshot, then create bounded logical commits **only after authorization and isolation of automatic deploys**. Never `git add .` or push a connected branch to discover what deploys.

Render and Cloudflare automatic branch/build triggers must be disabled or redirected to a separately approved isolated target **before any future push**. That platform action has not been performed here. Source-control preparation needs explicit authorization; no commit, branch mutation or release preparation was started.

## 9. Offline deployment/dependency audit

| Dependency | Required preparation / safe verification | Status |
| --- | --- | --- |
| Render repository packaging | Repository root; reviewed `npm ci --prefix server --include=optional` build and `npm --prefix server start`; include `server/**` and `shared/**` in change filters/artifact. No root npm workspace. `server`-only root is unsafe if outside-root files are omitted. Export tooling additionally imports client media-verification code. | **NOT VERIFIED live**. No `render.yaml` deployment resource exists in reviewed source. |
| Cron packaging | Same complete repository revision/root and server-prefix install/run. Existing Batch 5's proposal saying `server/` root is stale for outside-root shared imports. Do not copy that root setting blindly. | **NOT VERIFIED**; no cron created. |
| Sharp/Linux | Exact Sharp 0.35.5 lock includes Linux x64/arm64 and matching libvips optional packages; Node engine >=22.12. Install on intended Linux target, preserve native packages/licenses, run valid/corrupt/max-resource fixtures and measure decoder/API RSS/concurrency. Do not upload Windows node_modules. | **Windows decoder PASS; Linux packaging/capacity NOT VERIFIED**. |
| Cloudflare | Workers Static Assets entry, ASSETS binding, complete generated `spa.html`/404/assets/manifest, worker-first routes, exact domains and compatible API. Confirm actual Pages/Workers product before release. | **Local logic/build PASS; native deployed runtime NOT VERIFIED**. |
| Atlas/schema | Exact target guards, approved backup/read/index diff, additive required collections/unique/partial/TTL options; startup stays read-only. Preserve existing reservations and historical data. | **Disposable schema PASS; current production unknown**. |
| Public R2 | Separate catalog bucket/backend credentials, correct `CATALOG_MEDIA_BASE_URL`, immutable content-addressed URLs, readback/receipt before save; no public write or object deletion. | **Mocks PASS; actual upload/CDN NOT VERIFIED**. |
| Private R2 | Separate nonpublic bucket, exact signed PUT origin/header CORS, verification/copy/stream/expiry, owner/generation isolation and evidence retention. | **Mocks/ownership PASS; actual R2/CORS NOT VERIFIED**. |
| Email/outbox | Sender/provider validation, verified internal mailbox, synthetic recipient allowlist, new reviewed `NOTIFICATION_DELIVERY_NOT_BEFORE`, no historical flush or ambiguous resend. Gmail/Resend adapters remain behind existing gates. | **Mocked delivery/retry/templates PASS; real delivery NOT VERIFIED**. |
| Jobs/monitoring | Bounded explicit commerce job, leases/idempotency, proposed once-per-minute polling and reviewed batch budget; external heartbeat/queue/error monitoring. A queued immediate event is not instantaneous inbox delivery. | **Isolated reliability PASS; scheduler/real inbox NOT VERIFIED**. |
| Auth/ingress | Approved HTTPS same-site apex/www + API subdomain or approved same-origin proxy; Secure host-only Lax cookies, exact Origin/CORS, reviewed proxy CIDRs and CSP API/media/upload origins. Native capture does not authorize relaxing camera policy. | **Local policy/denials PASS; real topology/CSP NOT VERIFIED**. |
| Commerce/intake | `CHECKOUT_ENABLED` AND `COMMERCE_LAUNCH_AUTHORIZED`; independently `CUSTOM_REQUESTS_ENABLED` AND `CUSTOM_REQUESTS_LAUNCH_AUTHORIZED`. Repository defaults stay false. Existing proof/history/admin obligations survive closure. | **Isolated enabled/closed contracts PASS; no live activation**. |
| Production worker | Exact database/topology authorization plus `PRODUCTION_WORKER_AUTHORIZED`, explicit bounded production-write confirmation, sender/cutoff and provider authorization. | **Not enabled or authorized by this report**. |
| SEO/Meta | Keep all indexing/marketing gates off. Match reviewed publication IDs/media/fingerprints and legal approval before SEO; consent and separate browser/CAPI/CSP approvals before tracking. | **No activation**. |

This is offline source/lockfile review; live settings and mutable provider behavior were not retrieved or assumed. Confirm current official provider instructions during authorized preparation. Historic runbooks describing fixed 90/120 shipping, pre-order proof, template-to-cart featured services, database-editable legal content or map-expiry 503 are historical, superseded by current batch/remediation contracts. Checkout copy at `CheckoutPage.jsx:103` still says contact within twelve hours “to agree the fee”; train/review this as initial contact, not guaranteed final agreement. It was not rewritten during verification.

## 10. Data, owner and legal requirements

1. Separately authorize exact-target snapshot/backup and restoration rehearsal; reconcile current counts instead of assuming 1,595 products/85 components still match. Include all unique indexes, orders/reservations, uploads, events and address registry.
2. Review additive OrderSettlement, ServiceRequest, CatalogMedia, notification/job/upload fields/indexes before code rollout. No new schema delta was introduced by this verification. Ordinary startup must fail closed on missing schema; do not enable flags to work around it.
3. Prepare a guarded, revision-aware display-only transition from merchant-reviewed groups using the existing offline planner. A reviewed resumable executor remains absent. Preserve identities/aliases, independent price/inventory/review gates and all previous approvals. Do not approve imported ten or all Draft/Hold records.
4. Reconcile any historical non-version-1 orders individually from evidence; retain totals, proofs, actual collections/refunds and stock/discount history. New accounting deliberately rejects silent conversion. No generic historical financial migration is approved or implemented here.
5. Merchant verifies a small real purchasable cohort, variants and genuine tracked/Made by Request/unavailable states; components remain explicit opt-in with confirmed/pending/Free prices. Manual-reference custom sourcing must be reviewed before accepting money.
6. Confirm public WhatsApp +201508216472, support email tap.wrap22@gmail.com, Instagram/domain, and independently the separate InstaPay destination 01060673073. Confirm the operations recipient separately, not by copying the public email.
7. Obtain legal operator/address/registration/tax/disclosure facts, Egyptian legal review including English-only language concerns, returns/cancellation/refund procedures, privacy requests/processor disclosures and retention/legal holds. Six source-managed pages and policy FAQ cannot be edited through admin/API; their approval marker remains false.
8. Approve unpaid reservation review, actual account reconciliation, unique receipt/reference procedure, exception/refund/return responsibility, 12-hour contact staffing, failed-job escalation and manual WhatsApp evidence recording. Opening WhatsApp is never contact/share/acceptance.
9. Approve differentiated retention for temporary abandoned uploads, submitted/declined requests, accepted-order/payment evidence and public leftovers. Do not add destructive TTL/lifecycle deletion or convert historical proof bytes to recover space.
10. Accept the video fallback explicitly or keep the media gate closed pending target-device diagnosis. Large image performance, practical HEIC recovery, attention queue scale, trusted ingress and recurring security/dependency maintenance need evidence, not assurances.

## 11. Mandatory physical-device and target-browser plan

Record OS/browser/version, actual device, network, input format, screenshot/video/error evidence, expected/actual result and PASS/FAIL for every row. Responsive viewport and synthetic visibility are not physical-device tests.

| Target | Required acceptance |
| --- | --- |
| Actual iPhone Safari; iPhone Chrome additionally where relevant | Gallery/Files/camera chooser, camera permission allowed/denied/previously denied, native Cancel/Back/reopen/same file, JPEG and actual HEIC output, recoverable rejection preserving text, full required-personalization checkout/proof and custom requests. |
| Actual Android Chrome | Same chooser/upload/payment/request flows; multiple large photos, camera/gallery, keyboard, network interruption and reload recovery. |
| Actual Samsung Internet | Repeat supported phone flows; do not infer success from Chrome. |
| Actual tablet portrait/landscape | Dialog visibility/focus/keyboard, gallery order, service video orientation and administrative financial actions. |
| Desktop Chrome/Edge/Firefox and macOS Safari | Complete core flows and keyboard/focus; media decode, poster/error/autoplay/reduced-motion/background return. Only Edge/Chrome engines were exercised here. |

For all physical targets: hero and both service films fresh load, rapid play/pause, fast scroll, navigation/back/refresh, motion changes, tab background/return and slow/failed media; no black unusable content or overlapping controls. Verify native images upload to an **authorized isolated real R2 target**, persist on the correct order/request, remain private to other sessions, and can be explicitly viewed by admin. Verify admin product/category/component gallery replacement/reorder/save/reload/public CDN delivery. Perform approved synthetic COD/InstaPay/account/guest acceptance without actual customer funds unless separately authorized.

## 12. Minimum safe sequence and go/no-go

1. Review this report and preserved failures. Resolve any newly reproducible P0/P1 issue; approve the reliable decorative fallback only explicitly. Keep the native-video failure in the gate until that decision and physical checks.
2. Freeze/review the complete manifest, include every untracked runtime dependency, preserve excluded backups and isolate all automatic deployment triggers. Obtain separate source-control and isolated-target authorization before any commit/push/deploy.
3. Approve isolated topology, repository-root packaging, matching API/Worker/assets, Linux Sharp capacity, dedicated disposable/restored test data, and default-off commerce/intake/email/Meta/indexing settings. Never reuse production/staging data or credentials implicitly.
4. Under new authorization, deploy the dark isolated artifact; verify readiness/schema, real Worker HTTP/asset/cache behavior, four-second resolver latency/outages, secure cookies/Origin/CSP and native decoder/fallback behavior.
5. Separately authorize restricted synthetic provider tests, actual public/private R2, verified test inbox/operations recipient, queue cutoff, bounded worker/scheduler/monitoring and private evidence access. Fail closed on missing dependencies. Test failure/restart recovery without resending ambiguous emails or duplicating orders.
6. Complete physical-device acceptance and the owner/legal/data decisions. Authorize any production read/backup/migration separately, rehearse first, journal exact outcomes and retain a compatible rollback.
7. Only after objective acceptance and a further release authorization: prepared schema/data, compatible API then Worker/assets, closed intake smoke tests, owner alerts/jobs ready, reviewed custom intake, then commerce for the verified cohort. Existing obligations remain accessible if either intake closes. SEO/Meta stay separately off until their own approvals and current publication/consent evidence.

**GO for first real order requires all of:** no open reproducible P0/P1 defect; complete reviewed source/artifacts; prepared/reconciled data/indexes/history; real R2/auth/payment/provider checks; owner contact/alerts/scheduling; legal/public facts approval; physical-device completion and explicit video decision; successful target-topology synthetic end-to-end acceptance; a tested compatible recovery plan. None is satisfied merely by changing false flags.

Recovery: close new checkout and request intake independently, stop new provider dispatch/scheduling as appropriate, retain owned receipt/proof/admin access, record uncertainty, preserve aliases/evidence/ledger and reconcile outstanding funds. Do not deploy an old writer over new financial records or restore an old backup over accepted orders. Disable indexing separately if publication is unsafe. Never fix a decoder problem by weakening image validation, private ownership or CSP.

### Closure results

The application comparison completed with **9/9 PASS in software-decoder Edge** and **9/9 PASS in default installed Chrome**, zero skipped. Chrome exited with code 0. These do not change the retained default Edge result of **8 PASS / 1 FAIL** or prove physical-device compatibility. The deliberately failing cleanup probe ended with `Connected fixtures stopped cleanly.` No forced termination was needed for the completed connected runs.

Final preservation comparison: all **421** baseline file hashes match, with **zero missing or changed existing files**, **215** current status entries and **zero staged files**. The difference is exactly the three new deliverables listed above. No `mongod` process or listener on fixture ports 5191, 5192 or 4092 remained at the final resource check; unrelated Node processes were not terminated. `git diff --check` passes, with existing Git LF/CRLF normalization advisories only. The new diagnostic test passes `node --check`.

The proposed accumulated delta lists **214 paths** (excluding the manifest's own self-hash): 112 runtime, 58 tests/harnesses, 9 build/routing/guarded operations, 14 documentation/evidence, 2 dependency/lockfiles, 5 separately reviewed operational scripts, 6 preserved backups and 8 historical handoffs. Every entry still requires review; classification is not staging or release approval. Unchanged tracked files remain essential parts of the complete repository artifact.

Process-owner inspection through Windows CIM was denied by the local permissions; no escalation or unrelated process termination was attempted. The process/port observations above are narrower than a complete machine-wide child-process audit.

No release action is authorized by closure of this local report.
