# Release remediation 3 — permanent URLs, SEO routing and regression reliability

Date: **17 October 2026**, following local work across 16–17 October. Production remains **NO-GO and unchanged**.

## 1. Verdict and scope

**F06, F07, the seven historical F10 cases and F18 are locally resolved within the tested scope.** The service-video root cause remains **unverified**. Fix Pass 3 is ready for code/review of these corrections, not an unconditional release approval. Physical-device, real-provider, Cloudflare-runtime/topology, data, legal and other audit prerequisites remain open.

Preflight recorded **199 Git status entries and 416 non-secret baseline file hashes** in ignored `client/test-results/remediation-3/baseline.json`. Existing batches, Fix Passes 1/2, audit and historical work were preserved. `.env` files were excluded from inspection/hashing. No commits, pushes, merges, deployments, environment changes, production/staging database operations, real R2 operations, communications, payments, refunds or migrations occurred. Synthetic records existed only in new disposable loopback databases.

## 2. Exact changed-file manifest

Modified against this pass's already dirty baseline:

```text
client/connected-e2e/commerce-edge-contracts.spec.js
client/connected-e2e/contracts.spec.js
client/connected-e2e/operations-contracts.spec.js
client/e2e/media-experience.spec.js
client/playwright.contract.config.js
client/scripts/run-contract-tests.js
client/scripts/seo/generator.js
client/scripts/seo/generator.test.js
client/scripts/seo/publication.test.js
client/scripts/seo/worker.test.js
client/src/seo/metadata.js
client/vite.config.js
client/worker/seo-worker.js
docs/PRODUCT_ALIAS_ACTIVATION.md
server/scripts/export-seo-catalog.js
server/src/catalog/product-addresses.js
server/src/catalog/service.js
server/src/routes/catalog.routes.js
server/test/batch1-inventory-revision.test.js
server/test/helpers/connected-api-server.js
server/test/product-addresses.test.js
shared/product-url-compatibility.mjs
```

New files:

```text
client/connected-e2e/enabled-checkout.spec.js
client/scripts/contract-vite-server.js
server/test/product-routing.test.js
shared/product-seo.mjs
docs/RELEASE_REMEDIATION_3.md
```

This is **27 paths: 22 modified and five new**, not the complete accumulated release diff. Ignored runners, fixtures, logs, screenshots and build output under `client/test-results/remediation-3/` and `server/.cache/` are verification artifacts. No baseline file was removed. Previous batch/audit/remediation reports, financial/inventory/image-integrity implementations, dependencies/lockfiles, Wrangler configuration and the nine baseline video/poster files were preserved.

## 3. F06 — reproduced failure and selected architecture

Original unchanged audit probe, `worker-original-baseline.log`:

| Scenario | Before | After, same inputs with isolated authority and new ordinary shell |
| --- | --- | --- |
| Fresh registered legacy URL | 308 | 308 |
| Fresh public friendly URL | 200 | 200 |
| Legacy URL after former map expiry | **503** | **308** |
| Friendly URL after former map expiry | **503** | **200/noindex** |
| Public unindexed product with indexing enabled | **404** | **200/noindex** |

Root cause: the Worker treated a reviewed, expiring prelaunch map as the permission to route Draft products, while SEO manifests represented approved exports only. Ordinary builds omitted that map. Publication expiry was also applied broadly to public browsing.

Selected design: a **small authoritative read-only contract on the existing Express API**, not another service, static daily registry export, KV store or new payment/catalog system. Static registry distribution would still require atomic withdrawal publication and refreshing on every merchant change. Keeping expired positive permissions would revive restricted products. The existing API already owns the registry and public visibility rules, so it is the authority on every product-document request.

`server/src/routes/catalog.routes.js:23` adds:

```text
GET /api/v1/public/product-addresses?slugs=one,two
{ ok: true, data: { version: 1, products: [
  { requestedPath, canonicalPath, seoSignature },
  { requestedPath, notFound: true }
] } }
```

One to twenty validated slugs, bounded input, no extra query keys. The response contains no product names, IDs, prices, stock counts, images, private files, customer information or tracking receipts. It uses public display/category eligibility and authoritative registered ownership. `getPublicProduct` can omit related-product reads and internally include the routing version; normal product DTOs do not expose that version (`server/src/catalog/service.js:185`). No mutation, approval, address backfill or production SEO export occurs through this endpoint.

`client/worker/seo-worker.js:48` implements deadline/byte/schema checks. `shared/product-url-compatibility.mjs` validates exact response coverage, paths and fingerprints. All aliases resolve directly to the registered canonical path, preserving the query. GET/HEAD share statuses/headers, and HEAD bodies are empty. Invalid/unknown product paths return real HTTP 404; no identifier suffix is stripped or guessed.

## 4. Permanent ownership, renames and ordinary builds

`server/src/catalog/product-addresses.js` now respects existing reservations even if new canonical allocation is disabled. The flag cannot make a reserved address belong to a different product. Registered products keep their canonical address on rename and reserve the new stored slug in the same transaction. With allocation disabled, unregistered records are not automatically backfilled. Keep `PRODUCT_ALIASES_ENABLED=true` operationally for new production products and schema readiness; do not delete registry rows or use direct writers.

Existing unique ownership/canonical indexes, immutable registry identity and transaction/revision guards remain in force. Deleted/hidden owners stay unavailable. A direct writer creating a conflicting stored slug results in a closed conflict, not resolution to the wrong product.

`generator.js:312` always writes a **neutral `spa.html`** without product data or a shop canonical. It also writes the runtime-routing declaration. The normal build needs no `--product-compatibility` file or daily mapping operation. Public noindex products receive their actual canonical URL in HTML/HTTP Link metadata. Conditional/range/credential headers are not forwarded to document assets; rewritten bodies discard obsolete encoding/length/ETag headers.

Historical maps remain accepted only by the old offline input-validation interface; the Worker does not use them for routing or withdrawal permission. Ordinary map-free builds, cold starts and missing/invalid SEO manifests still route known public products through the authority. Missing shell assets are an artifact failure and deliberately return 503 rather than stale HTML. The API, Worker and generated assets therefore must ship compatibly.

## 5. F07 — indexing is separate from public access

| Current authoritative state | HTTP document behavior |
| --- | --- |
| Public Draft/Hold or enquiry-only product | 200, noindex/no-store shell; live React product data; no static Product/Offer |
| Approved product, fresh reviewed publication, matching fingerprint | 200, approved static metadata; offers only under the publication's verified checkout gate |
| Approved product but absent/unindexed/stale/mismatched publication | 200, neutral noindex shell, correct canonical; no old price/schema |
| Unknown, hidden, withdrawn, deleted or category-restricted product | 404, noindex; aliases cannot expose another owner |
| Registered noncanonical public address | 308 to its canonical address, query preserved |
| Authority unavailable/corrupt/conflicting/cached unexpectedly | 503, no-store/noindex, retry guidance; no stale-product fallback |

The approved fingerprint binds shared public SEO content, the current checkout gate, and product/category write revisions. `shared/product-seo.mjs:5` supplies the revision tuple; its public SEO signature also covers the full rendered description. Revisions prevent hide/reopen or category withdrawal/reopening from restoring an old publication merely because visible text/prices match again. They use existing write fences, not wall-clock expiry or inferred approvals.

The approved exporter carries routing revisions; `generator.js` hashes the same tuple and rejects explicit publication from old exports without routing revisions. Tests compare the real API fingerprint with the export/generator fingerprint. Zero-priced normal products cannot become approved Product/Offer publications. Unpriced components' separate quotation/Free rules are unchanged.

Fresh publication IDs, origin, media approval/expiry, indexable-route membership and source-managed legal-page approval are still required. Older artifacts lacking fingerprints downgrade safely. This revision binding is intentionally conservative: bookkeeping/commerce revision changes can require a reviewed SEO refresh even when some displayed fields are unchanged. **Browsing and permanent redirects remain available without that refresh.** Authorized SEO refresh operations must be proven before indexing activation; no production-export prohibition was bypassed here.

Catalog aggregate snapshots check their displayed product dependencies before serving approved content. Stale publication alone downgrades public browsing to a noindex shell. Category redirects and fixed-page gates remain supported. Robots disallow all indexing during prelaunch.

`sitemap.xml` is an index of bounded `sitemaps/N.xml` pages. Each child handles at most twenty advertised routes and verifies current product dependencies in batches of twenty. Missing/withdrawn/mismatched products are omitted; authority failure returns a retriable 503 for that sitemap, without advertising stale product URLs. This avoids one catalog-wide serial authority scan. Disabled indexing returns an empty sitemap. A child may verify up to 400 product dependencies, plus the separately bounded emergency list, under one four-second deadline.

## 6. Withdrawal, caching and outage policy

- **No positive or negative product-permission cache**, no stale-if-error, no background refresh authorization. Each product response uses the current authority.
- API and resulting documents/redirects use no-store. Fetch uses `cache: no-store` plus negative status-based Cloudflare TTLs; positive Age or HIT/STALE/UPDATING authority replies are rejected. No visitor cookies, authorization, customer queries or identifiers are forwarded.
- API fetch, streaming and batch checks are bounded by a four-second deadline and 16 KB response limit per twenty-address response. Requests/readers are cancelled on completion/failure.
- Routine withdrawal is the merchant's existing product visibility/category control. Emergency `SEO_WITHDRAWN_PATHS` works with canonical or registered alias paths, even when no static map contains the alias. Configured product withdrawals are resolved through the same live authority and apply to other aliases, customization paths, aggregate snapshots and sitemap entries. Prefer canonical emergency entries for clarity; wide lists add bounded verification cost.
- An authority outage produces 503 rather than revealing a stale product. Private admin/account/order shells remain available independently; order/proof/request recovery and financial history are not cancelled or gated by product resolution.
- No system can erase pages already loaded in a visitor's browser or copies held by search engines. These guarantees apply to fresh HTTP/authority decisions and this application's caching policy.

Cloudflare option semantics were checked against its official [Request documentation](https://developers.cloudflare.com/workers/runtime-apis/request/) and [Fetch documentation](https://developers.cloudflare.com/workers/runtime-apis/fetch/). Actual zone Cache Rules, bindings, cache bypass and cold/warm Render latency remain unverified. They must not override no-store or introduce stale serving.

## 7. F10 — original failures and corrected contracts

Before editing: `batch1-inventory-revision.test.js` **7/11 passed, four failed**; the six original connected case bodies **3/6 passed, three failed**, followed by the teardown hang. Logs: `.cache/remediation-3-f10-baseline.tap`, `connected-baseline.log`.

Corrections preserve safeguards:

- Customer cancellation requests leave stock allocated. Concurrent authorized cancellations produce one success and one revision conflict; eligible tracked stock restores exactly once. Repeated cancellation cannot restore again. Made by Request remains null, without invented stock.
- Personalized component COD attempts explicitly fail `QUOTATION_REQUIRED`. The inventory/revision scenario then exercises the permitted InstaPay order-first route. No approval/quotation guard was relaxed.
- Gift Box/Engraving tests now submit accountless requests, validate optional fixed components/manual reference fallback, immutable retries, guest isolation, no upfront order/stock claim and no upload signing for a text-only request. The retained generic template API still tests quantities, unavailable options and required fields; featured-service template purchase attempts remain rejected.
- Hidden fixture records stay hidden; distinct explicitly public Draft/Hold fixtures exercise enquiry-only browsing. A new draft remains 404 until explicit display approval, after which its unapproved price stays hidden. Mixed catalogs, paging, filters/history and wrong-Origin/stale edits remain covered.
- The broader connected suite also contained retired engraving/template and manual image-path controls. Its ordinary personalization test now checks one private upload, fixed price, cart snapshots/quantity and checkout-disabled denial. The component test uses the real chooser/upload/verified receipt flow with a separate in-memory public provider. Its existing provisional ten stays **unapproved**, not confirmed stock or request eligibility.
- Parallel assertions are scoped to the request's own upload-sign activity; another customer's legitimate upload must not fail a global no-upload counter assertion.

The original seven failures now pass within the **11-case default connected suite** and the **11-case backend inventory suite**. No original F10 case was deleted/skipped and no production safeguard was weakened. Enabled-checkout cases run in a separate explicit isolated mode, not by changing production flags.

## 8. F18 — teardown diagnosis and correction

The installed Playwright web-server launcher uses shell process trees and explicitly cannot perform graceful Windows web-server shutdown (`client/node_modules/playwright/lib/runner/index.js`, Windows graceful-shutdown branch). Cases completed while cleanup stalled. Keeping the old npm/shell topology and increasing timeouts would not repair ownership/lifecycle.

`client/scripts/run-contract-tests.js` now owns API/Vite children directly, waits for IPC readiness, runs Playwright without its shell-managed webServer, requests IPC shutdown and awaits child exits. The API closes HTTP connections and awaits Mongoose/disposable replica-set cleanup. `contract-vite-server.js` closes Vite/HTTP resources. Normal successful runs need neither taskkill nor forced parent termination. Shutdown errors return failure rather than pretending a clean gate.

The launcher scrubs inherited configuration, allocates distinct loopback ports and rejects reuse; readiness is from the owned child, not an arbitrary listener's health response. Direct unguarded config execution is rejected. Each invocation has its own browser-output directory and Vite cache. Separate invocations own separate replica sets; two-worker cases preserve session/owner isolation within their fixture API.

Executed clean exits include default sequential, two-worker, explicit enabled-checkout, two simultaneous independent launchers and an intentional failing-test probe. The failure probe returns **exit 1 as expected** and still logs clean fixture shutdown. Earlier baseline interruption was limited to the owned old runner; it is not counted as a clean exit.

## 9. Service-video investigation

Inspected `ServiceFilm.jsx`, `useVideoPlayback.js`, source/intersection lifecycle, play rejection, media errors, posters and existing footage. Their implementation/footage was not replaced in this pass.

Concrete observation: Vite logged full page reloads for generated `test-results-contracts/.../traces/resources/*.html` during the earlier runner. Generated test artifacts should not reload an active storefront. `client/vite.config.js` now excludes all `test-results*` directories. Diagnostic coverage writes trace-style HTML during playback, checks no navigation/error, and repeats decode, scroll, manual pause/resume and navigation-related behavior.

However, the attempted negative control with the watcher exclusion disabled also passed. **That does not establish the cause of the earlier detached Pause control/unavailable-media fallback.** No genuine React/source race or asset incompatibility was proven. The earlier HTTP 206/decoder failure remains an explicitly unverified risk, not dismissed as HMR or random flakiness.

The repeated media/admin run passed **54/54 (18 cases × three repetitions)**, including actual local Edge MP4 decoding, both service films, chooser/preview/replacement, protected-flow mocks, hero pointer/keyboard/touch emulation, dynamic motion, simulated autoplay failure and error fallback. Physical Safari/iPhone, Android Chrome, Samsung Internet, OS media pickers and live R2 remain mandatory. Carry forward the physical-device checklist in Remediation 2; no all-device claim is made. Accepting a recoverable poster/link fallback remains an explicit owner/release decision if the failure cannot be diagnosed first.

## 10. Targeted regression matrix — actual results

Logs below are ignored local artifacts; counts from overlapping runs are not summed as new coverage.

| Check | Result / evidence |
| --- | --- |
| Original Worker expiry/indexing probes | Reproduced 503/503 and 404 before correction; after correction 308/200 and 200/noindex with isolated authority, `worker-original-baseline.log` / `worker-original-after.log` |
| Original backend F10 baseline | 7 pass / 4 fail, `.cache/remediation-3-f10-baseline.tap` |
| Original connected baseline | 3 pass / 3 fail case bodies; teardown stalled, `connected-baseline.log` |
| Final routing/address/export/inventory/Fix Pass 1 integrity group | **65/65 PASS**, `.cache/remediation-3-backend-final.tap` |
| Final checkout/request/personalization/storage/media/operations group | **89/89 PASS**, `.cache/remediation-3-business-final.tap`; includes controlled 0/9/12-hour obligations and private provider mocks |
| Complete SEO generator/publication/Worker suite | **63/63 PASS**, `seo-release-gate.log` and later `seo-closure-verified.log` after emergency alias/sitemap hardening |
| Actual HTTP Worker lifecycle integration | Six cases in `product-routing.test.js`: Node HTTP bridge running the actual Worker handler, real Express API, disposable MongoDB. Includes registered creation/rename/withdraw/delete/conflict, GET/HEAD/query status, visibility/stock, malformed input, checkout/revision invalidation and export/API fingerprint agreement |
| Last HTTP closure after withdrawal/cancellation hardening | **6/6 PASS**, `.cache/remediation-3-http-closure.tap` |
| Default connected suite | **11/11 PASS**, `contracts-acceptance.log`, clean exit |
| Two-worker default connected suite | **11/11 PASS**, `contracts-parallel-acceptance.log`, clean exit |
| Enabled checkout connected acceptance | **3/3 PASS**, `enabled-connected-final.log`, clean exit; COD, fixed-price personalization → InstaPay/proof → protected admin file, both services → quotation/acceptance/order |
| Two simultaneous independent launchers | **1/1 each PASS, exit codes [0,0]**, `runner-concurrent-1.log`, `runner-concurrent-2.log`, `runner-concurrent-summary.log` |
| Intentional test failure cleanup | Expected **1 failure / exit 1**, with clean fixture shutdown, `runner-failure-cleanup.log`; not an application regression PASS |
| Media/admin repeatability | **54/54 PASS**, `media-repeat.log`; actual Windows Edge, responsive/touch emulation and provider fixtures |
| Frontend lint | PASS, `lint.log` |
| Server syntax | PASS, 172 JavaScript files, `.cache/remediation-3-syntax.log` |
| Isolated Vite production bundle plus ordinary no-input SEO generation | PASS, `build.log`; indexing false, zero exported products, no network/database reads; outputs under ignored remediation build directory |

HTTP lifecycle integration is more than a helper return-value assertion, but it is **not a deployed Cloudflare binding/runtime smoke test**. No live provider or merchant database was used. Browser engine was installed Microsoft Edge 155.0.4283.45; responsive/touch modes are not physical phones.

Intermediate failures were investigated and retained in the audit trail: newly strict revision fields required synthetic SEO fixture updates; invalid fixture lifetime arithmetic was corrected with one captured clock; the noindex canonical assertion was updated to allow the required public canonical, not financial/schema leakage; request network timing uses a submission window while exact deadlines remain controlled-clock tests; collapsed Price accordion and retired image controls were updated; a provisional component default was initially incorrectly expected as zero and corrected without approving it; parallel global upload counters were correctly owner-scoped. An added emergency-alias test exposed a sitemap omission in the first implementation; the final filter now checks expanded withdrawals. None required weakening price, stock, image, payment, Origin or ownership guards. No blanket claim that every historical command passed is made.

## 11. Schema/configuration and compatibility

No new database collection, index, migration, dependency or live setting is required specifically by this pass. Existing product-address indexes and all earlier batch schema/data requirements remain mandatory. Registry rows are never automatically migrated, deleted or reassigned.

Approved SEO export DTOs add category revision input and product `routingVersion`; generated manifests add `productRouting`, `productSignatures`, `routeProducts`, and builds add `spa.html`. Older approved exports need a new separately authorized review before explicit publication. Old artifacts without compatible evidence downgrade to noindex browsing. The production SEO-export ban and default offline behavior remain intact.

Optional **Worker-only** `PRODUCT_ADDRESS_API_ORIGIN` is an exact HTTPS origin; default `https://api.tapandwrap.net`. It is public configuration, not a secret or VITE credential. No new service binding is required. `ADDRESS_SERVICE` is an injectable fixture/service-binding interface; normal operation uses HTTPS fetch. Test-only port/checkout variables belong solely to the scrubbed local launcher, never Render/Cloudflare activation.

Revision checks are conservative. A viable, separately authorized approved SEO refresh process and representative-volume latency checks are indexing prerequisites. They are not reasons to reintroduce a daily URL map or bypass approved export permissions.

## 12. Remaining production/deployment dependencies

Do not execute these from this report:

1. Review/freeze the accumulated source under separate authorization, including Render connected-branch auto-deploy risk. No source-control/release operation occurred here.
2. Complete the separately reviewed Batch 1 display transition, all prior schema/index and historical-order compatibility requirements. Missing visibility must not be automatically approved. Counts/data are not freshly production-verified.
3. In an authorized environment, verify the compatible API endpoint, registry ownership/indexes, strict public visibility and latency before switching to the matching Worker/assets. Preserve the alias-aware API and new shell during recovery.
4. Verify actual Workers Static Assets deployment, origin/DNS routing, cache bypass, CSP, GET/HEAD/query behavior, canonical metadata, unknown/withdrawn 404, outage handling and ordinary builds. Do not assume the current Pages/Workers topology is correct from repository settings.
5. Keep checkout, custom intake, indexing and tracking activation separately gated. Verify actual public/private R2, cookies/CSRF, sender/owner mailbox, scheduling, merchant price/availability review, legal/operator/language and retention sign-off as required by the final audit.
6. Before indexing, separately authorize a current eligible export/media review/publication and refresh/recovery operations. The new paginated sitemap is intentionally verified live; measure page latency and failure recovery.
7. Complete the physical iPhone Safari/Android/Samsung/tablet acceptance and authorized real-provider tests from Remediation 2, including media failure/fallback acceptance.

API dependency/outage tradeoff is explicit: valid public product documents can return 503 if the authority cannot respond within the budget, but **not because an arbitrary routing map expired**. No stale permission cache masks that outage. Cold-start/availability testing is a release gate.

## 13. Remaining defects and uncertainty

- Service-video root cause remains unproven despite repeated local passes; physical devices and broader engines remain unverified.
- Actual Cloudflare runtime/bindings/cache rules, deployed API behavior, production data/index readiness and all real providers remain unverified.
- Conservative revision-bound SEO can downgrade metadata after commerce/bookkeeping changes; approved refresh operations and capacity must be validated before indexing.
- Existing F08/F11–F17 release prerequisites/limitations from the comprehensive audit are not silently marked solved by this remediation.
- No full unrelated browser/server suite, penetration test, live load test or new dependency advisory audit was substituted for the focused scope.

## 14. Closure

The four requested URL/testing blockers have concrete local corrections and passing focused acceptance. **Qualified local readiness for review; overall production NO-GO remains.** The remaining video uncertainty is explicit and has not been waived.

Closure comparison checked all **416 baseline hashes**: 22 intentional modifications, zero baseline files missing, five new files including this report. The manifest matches all 27 paths. The seven batch reports, final audit, Remediation 1/2 reports, fixed public content and nine baseline video/poster files remain unchanged. There are **212 accumulated entries with `--untracked-files=all`**, nothing staged. `git diff --check` passed, as did explicit syntax checks for the Worker/shared modules, launcher, Vite child, exporter and API fixture. Final process verification found **zero listeners on the twelve recorded fixture ports and zero mongod processes**. Current default build evidence remains noindex with no database/network export.

Stop after this pass: no deployment, migration, activation or next remediation phase was performed or authorized.
