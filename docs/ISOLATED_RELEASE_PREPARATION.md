# Isolated release preparation — Tap & Wrap

Preparation only, 17 October 2026. **Production remains NO-GO. No external change is authorized by this document.**

## 1. Decision and first approval

The accumulated source is **complete enough for a reviewed freeze candidate**, with no drift against the prior 214-path release manifest. It is **not yet an approved immutable release or a verified deployment artifact**. Required untracked modules are present, both dependency locks match their package declarations, and literal runtime relative imports resolve. Final secret review, explicit staging review, deployment isolation, Linux packaging, target configuration and synthetic provisioning remain gates.

The first specific owner-approved action should be **a read-only inventory of production deployment triggers**, limited to GitHub repository/organization automation, Render service build settings/hooks, and Cloudflare Pages/Workers build/branch/domain settings. Record setting names and identifiers, not tokens, deploy-hook URLs, environment values or credentials. This run did not access those account settings. If no appropriately scoped interface is available, the owner should inspect them privately and supply a sanitized settings checklist. Do not ask the owner to paste credentials.

After that inventory, separately approve a nonproduction repository, exact isolated resource names/domain/budget and local freeze commands. Do not push until **all** connected production paths are identified and isolated, even when the proposed destination is a new repository. Any disabling or changing of live automation is a separate approved action; it can itself affect deployments.

There is no newly established financial/security code blocker in this preparation. The **Edge native decoder failure remains unresolved** (8/9 in the completed prior repetition); reliable decorative fallback needs explicit owner acceptance plus physical-device verification. No footage or playback logic was changed. Missing isolated seeding/admin bootstrap and deployment-resource definitions are preparation deliverables, not evidence that live testing has already happened.

## 2. Exact source inventory and preservation

Machine-readable companion: [ISOLATED_RELEASE_FILE_INVENTORY.json](ISOLATED_RELEASE_FILE_INVENTORY.json). It classifies **every existing nonignored tracked/untracked file**, rather than only the dirty delta, and records `changedOrUntracked`, proposed `include`, review requirement and SHA-256. It covers unchanged base modules/assets that the prior delta manifest did not list. Its own hash is deliberately null to avoid a recursive self-hash; record that hash externally at freeze.

Preflight before these preparation documents: **215 Git status entries; zero staged files**. All **214 prior manifest hashes match**, no missing records; the only delta outside its records was the prior manifest file itself, intentionally excluded from its own hash. These new preparation documents are additional proposed review files; neither previous manifest nor previous source/report was rewritten.

Final inventory including these two documents: **428 files** — 265 required runtime, 100 required test, 11 required configuration, 41 documentation, six backups and five special operational scripts. **409 proposed inclusions; 19 preserved exclusions** (six backups, five scripts, eight historical handoffs). Final working tree has **217 status entries**, still on the same `main`/HEAD, with no staged files. Counts describe Git-visible source, not ignored provider/merchant/generated files. Every inclusion remains subject to staged-content and secret review.

Classification policy:

| Classification | Release treatment |
| --- | --- |
| Required runtime source | Include complete `client/src`, `server/src`, `shared`, approved public footage/posters/logo and supporting operational runtime modules. Preserve existing paths and imports. |
| Required test | Include test source, fixtures, Playwright configs, guarded connected/API runners and regression evidence specifications. Do not deploy test mocks as real provider adapters. |
| Required configuration | Include both package manifests/lockfiles, Vite/ESLint/Wrangler configuration, ignore rules and **example** environments only. Actual target-specific settings need separate reviewed nonproduction configuration. |
| Required documentation | Include current runbooks, batch/remediation/audit reports and both release inventories. Historical root handoffs below are explicitly excluded pending separate review. |
| Obsolete backup | Preserve locally; exclude the six `.before-admin-media.bak` files. “Obsolete” describes release use, not permission to delete. |
| Generated temporary artifact | Exclude `node_modules`, `dist`, `.cache`, `test-results*`, traces/screenshots, coverage and merchant `local-data`. These are ignored; a zero count in the Git-visible inventory does not mean they are absent on disk. Retain useful evidence locally. Build new artifacts from the frozen revision. |
| Potential secret or unsafe inclusion | No real `.env`, credentials, provider keys, private customer files or signed URLs in source/artifacts. Five special untracked operator scripts are excluded for separate safety review, not accused of containing secrets. Filename/manifest checks are not a comprehensive credential leak certification. |

Explicit exclusions, preserved untouched:

- Backups: `client/src/components/HomeCatalog.jsx.before-admin-media.bak`, `ProductCard.jsx.before-admin-media.bak`; `client/src/pages/AdminProductFormPage.jsx.before-admin-media.bak`, `AdminWebsitePage.jsx.before-admin-media.bak`, `ProductPage.jsx.before-admin-media.bak`; `server/src/routes/admin.routes.js.before-admin-media.bak`.
- Historical root handoffs: `BATCH2_CATALOG_PREVIEW_FAQ_README.txt`, `BATCH2_CONTENT_STAGE_README.txt`, `BATCH2_ENGRAVING_README.txt`, `BATCH2_REFINEMENTS_README.txt`, `BATCH2_TEST_BLOCKER_FIX_README.txt`, `PATCH_README.md`, `README_READ_FIRST.txt`, `REVIEW_CATALOG_DIAGNOSTIC_README.txt`.
- Separate operational review: `server/scripts/audit-catalog-r2-readonly.mjs`, `audit-production-catalog-transfer-readonly.mjs`, `staging-schema-migration-only.mjs`, `transfer-catalog-safe.mjs`, `upload-catalog-r2.mjs`. Do not substitute them for the guarded isolated schema procedure or automatically execute them.

Critical untracked release dependencies include `server/src/media/image-integrity.js` **and its spawned** `image-decoder-process.js`; public media storage/receipt modules; `inventory-input.js`; accounting, request/intake, owner notification modules/models; frontend shared chooser, playback hook, media galleries, financial/request/personalization modules; all new `shared/*.mjs`. A partial commit could pass an unrelated build but break uploads, startup, routing or financial operations. Include the whole reviewed candidate, not only modified tracked files.

Static checks this preparation: both npm locks are v3 with matching root dependency/devDependency declarations; package engines both `>=22.12.0`; local Node `v22.23.2`. Server Sharp is pinned `0.35.5`; Linux glibc/musl optional variants are locked. Client lock also contains Sharp transitively; no dependency/lock changes were made. Linux execution is unverified. Literal relative-import scan found no unresolved runtime dependency; its single test-string hit in `server/test/batch3-commerce.test.js:215` is an intentionally executed child script relative to the server working directory, not a broken module import. No `.github` workflow is tracked in this tree; that does not exclude external GitHub Actions, organization workflows, apps or hooks.

No repeated general tests/install/build were needed for documentation preparation. Previous 302 backend, 63 SEO, 50 browser, connected, syntax/lint/build evidence is retained in the post-remediation gate; it is not relabeled as newly executed here.

## 3. Git and deployment trigger isolation

Confirmed locally:

| Item | Actual value |
| --- | --- |
| Branch | `main` |
| Upstream | `origin/main` |
| Remote | `origin`, fetch/push `https://github.com/tap-and-wrap/tap-and-wrap.git` |
| HEAD | `e1ac0be781c865409202bdac0d92ebc63de2e25d` |
| Last subject | Polish account pages and testimonials, prepare product aliases |
| Line-ending policy | `core.autocrlf=true`; staged blobs may normalize LF/CRLF, so compare reviewed staged content in addition to raw working-file hashes. |

No fetch, remote mutation, branch switch, staging, commit or push occurred. Local remote-tracking state is not proof of current remote branch contents.

Before **any** future push, privately record:

1. Render production service/project IDs, linked repo/branch, auto-deploy mode, build filters, root/build/start/predeploy commands, PR previews/Blueprint syncs, deploy hooks and external API/CI deploy callers. Check cron and other services linked to the repository too.
2. Cloudflare actual product (**Pages versus Worker**), project/Worker/account IDs, production and preview branches/wildcards, Workers Builds/Git integration, build/deploy commands, preview URLs, custom domains/routes, build hooks and API-token CI callers.
3. GitHub Actions in the remote repo, organization/reusable workflows, installed apps, webhooks, environments, deploy keys and repository dispatch integrations. Do not trigger a PR or tag to discover behavior.
4. Whether source-control approval can use a completely separate **private test repository** whose integrations are nonproduction only. This is recommended over pushing a new branch into the existing connected repo. Preview branches can deploy too; a branch name is not isolation.

Render documents branch-based automatic deployment and says changes to build settings/manual deploys can bypass build filters; filters are not an isolation boundary. Files outside a configured root directory are unavailable. [Render root/build filters](https://render.com/docs/monorepo-support), [deploy behavior](https://render.com/docs/deploys). Cloudflare also supports Git-triggered Worker builds; check those independently of Pages. [Cloudflare Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/).

### Future local freeze commands — NOT executed; separate authorization required

First revalidate all inventory hashes, review exclusions and run a local secret scan whose output reports paths/rule names only. Review new nonproduction configuration/fixtures before staging them; refresh inventory for any such changes. Stop on any unexplained difference. No `git add .`, `git add -A`, resets, cleans or automatic deletions.

```powershell
# Only after explicit local source-control authorization and isolation review.
git switch -c release/isolated-20261017
$releaseInventory = Get-Content docs/ISOLATED_RELEASE_FILE_INVENTORY.json -Raw | ConvertFrom-Json
$releaseCandidates = @($releaseInventory.records | Where-Object { $_.include -and $_.changedOrUntracked })
foreach ($releaseFile in $releaseCandidates) {
  if ($releaseFile.sha256 -and ((Get-FileHash -LiteralPath $releaseFile.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $releaseFile.sha256)) {
    throw "Release inventory changed; review before staging."
  }
}
# Review the printed paths; compare the final inventory's separately recorded hash.
$releaseCandidates.path
# Existing ignored evidence directory; no credentials in this file.
$releasePathBytes = [Text.Encoding]::UTF8.GetBytes(($releaseCandidates.path -join "`0") + "`0")
[IO.File]::WriteAllBytes((Join-Path (Get-Location) 'client/test-results/post-gate/release-paths.nul'), $releasePathBytes)
git --literal-pathspecs add --pathspec-from-file=client/test-results/post-gate/release-paths.nul --pathspec-file-nul
git diff --cached --name-status
git diff --cached --check
git diff --cached --stat
# Review full staged diff and exact file set privately; scan staged blobs for secrets.
# STOP if unexpected staged content, missing files, or secret scan failures occur.
git commit -m "Freeze reviewed Tap and Wrap isolated release candidate"
git rev-parse HEAD
git status --short --untracked-files=all
```

The final status may retain the explicitly excluded files; this is expected and must be journaled, not cleaned. The immutable unit is the reviewed **commit SHA**, not a moving branch or an unchanged dirty-file count. Inspect the commit tree for every required file. No tag/PR is needed in this phase. Do not change this candidate after provider testing without a new SHA and impacted rechecks.

Only after separate remote-publication approval and verified isolation:

```powershell
# Replace privately with the separately approved empty PRIVATE test repository URL.
# Do not substitute the production-connected origin URL.
$isolatedRepositoryUrl = '<APPROVED_PRIVATE_TEST_REPOSITORY_URL>'
git push $isolatedRepositoryUrl HEAD:refs/heads/release/isolated-20261017
```

A future authorized operator must bind isolated services explicitly to this reviewed SHA/branch and capture deployed SHA plus artifact/config hashes. Never push `main`, merge into it, invoke a production deploy hook, or reuse a production CI token. Publishing to any repository remains an external action requiring approval.

## 4. Smallest practical isolated architecture

**Proposed, not provisioned:** one non-sleeping Render Node API, one Cloudflare Worker with Static Assets, one separate Atlas test project/cluster with synthetic data, two separate R2 test buckets, one restricted provider inbox, and initially manual bounded jobs. Add one Cron Job only after manual job acceptance and scheduling approval. No Redis, Docker, new framework or second order/payment system.

Use a separately owned and approved **registrable nonproduction domain**, denoted `TEST_SITE_DOMAIN` below (a documentation placeholder, not an environment variable or an acquired domain): frontend `https://TEST_SITE_DOMAIN`, API `https://api.TEST_SITE_DOMAIN`, public media `https://media.TEST_SITE_DOMAIN`. The first real physical-phone URL will be that HTTPS frontend after authorized provisioning; none exists or is claimed prepared/live now.

`validateAuthTopology` (`server/src/config/deployment.js:24`) permits same-site only for an approved apex/www and its API subdomain. Do not assume `preview.tapandwrap.net` plus a provider API host satisfies the contract. Do not point the test Worker at production `api.tapandwrap.net`. A same-origin reverse proxy is an alternative only after its own review (uncached private responses, forwarded Origin/header handling, backend restriction); it is not the existing deployed architecture and is not being created here. Choose/approve the domain topology before resource setup.

New Atlas project/cluster: exact database **`tapandwrap_staging`**, dedicated test user scoped only to that database, network allowlist limited to reviewed test-service/operator ingress. `DATABASE_TARGET=staging`, `NODE_ENV=production` gives the deployed runtime Secure cookies without authorizing production database access. The exact-name guard (`database-safety.js:1`) rejects arbitrary `tapandwrap_release_test` names. **Never reuse an existing staging cluster/database.** Record unique project/cluster identity in the approval because the name alone cannot distinguish them. Test credentials must have no production or existing staging roles; no production URI/data copied. Production database and worker authorization flags stay false.

Use two new R2 buckets, for example `<approved-run>-catalog` and `<approved-run>-private`, with independent bucket-scoped credentials and no permissions on production buckets. Dedicated buckets are safer than namespace sharing because private keys use `temporary/commerce` and `verified/commerce` without an environment prefix. Public catalog URL/prefix must map exactly to its bucket; private bucket has no public custom domain/r2.dev exposure. No provider credential belongs in Vite, Git, screenshots or reports.

Nonproduction frontend/API may use a reviewed tester-only access layer, but test the actual browser cookie/Origin flow and allow the Worker resolver's server-to-server request appropriately. A browser login wall alone can break resolver requests; do not solve it with production credentials or by disabling app security. Public test media contains synthetic harmless images only. Noindex is mandatory but is not access control.

## 5. Build, runtime and configuration contracts

### Commands and packaging

All commands below are **future approved-target steps**, not instructions to execute now. Pin one exact reviewed Node 22 patch satisfying both `>=22.12.0` engines across frontend/API/cron; `22.23.2` matches the tested local runtime, subject to availability/security review. Do not let a provider choose an unknown major from an open engine range.

| Component | Reviewed contract |
| --- | --- |
| API Render root | Repository root (blank/default root), not `server/`. Runtime imports `../../../shared/*.mjs`; Render explicitly excludes outside-root files. Build filters must cover `server/**` and `shared/**`; offline export tooling also imports `client/src/seo/media-verification`. Keep the complete repository available. |
| API build/start | `npm ci --prefix server --include=optional`; `npm --prefix server start`. No automatic schema/migration/predeploy writes. PORT supplied by Render. Health check `/health/ready`, not merely `/health/live`. `live` only proves process life. |
| Frontend build | Repository checkout, `npm ci --prefix client --include=dev --include=optional`, then `npm --prefix client run build`. Vite needs dev dependencies. Explicit isolated public Vite values supplied before build; do not load developer `.env`. Regenerate noindex SEO with `npm --prefix client run seo:generate -- --site-origin https://TEST_SITE_DOMAIN` without `--publish`, export inputs or compatibility map. Verify neutral `spa.html`, `404.html`, assets and `seo-manifest.json`. |
| Worker | Main `client/worker/seo-worker.js`, imported `browser-policy.js` plus repository `shared/product-url-compatibility.mjs`; `ASSETS` points to matching `client/dist`. Deploy Worker and assets together using locked client Wrangler. **Pages dist-only upload does not execute this Worker.** |
| Worker isolation | Create a separately reviewed `client/wrangler.isolated.jsonc` or equivalent explicit external config before deployment. Unique Worker name; no production routes/name, no implicit inherited production environment. Preserve compatibility date `2026-10-09`, asset binding/routing/404 settings; use isolated origins below. Existing `wrangler.jsonc` names `tapandwrap-frontend`, so **do not run bare `wrangler deploy` with it**. `workers_dev`/preview URLs are disabled there and no custom isolated route is supplied. |
| Future Worker command | From `client/`: `npx --no-install wrangler deploy --config wrangler.isolated.jsonc`, only after the file/account/domain/routes/assets are reviewed and deployment is authorized. Local draft/dry-run bundle inspection is a separate future preparation check; it is not deployed workerd acceptance. |
| Jobs | Repository-root `npm ci --prefix server --include=optional`; bounded command below. No infinite loop in web API. Batch 5's old suggestion of a `server/` root is superseded by shared import requirements. |

Cloudflare deploys Worker code and static assets in one operation; `run_worker_first` controls whether route logic precedes assets. Preserve the current worker-first document routes rather than adding blanket SPA fallback. [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/), [asset binding/routing](https://developers.cloudflare.com/workers/static-assets/binding/).

Sharp must install Linux-native packages on the target. Do not copy Windows `node_modules`, omit optional packages or set `NODE_ENV=test` to get fake storage. Run valid/corrupt/maximum-size JPEG/PNG/WebP checks on Linux; measure memory with two child decoders plus API overhead, verify child spawn/SIGKILL/deadline behavior and native library loading. V8 heap limits are not native RSS limits. [Sharp installation requirements](https://sharp.pixelplumbing.com/install/). No exact safe instance memory size has been demonstrated yet.

### Exact setting groups — enter securely, never paste credentials into the report

All actual live values remain unknown. These are proposed isolated values/dependencies, not changes made here.

| Location / names | Isolated requirement and activation |
| --- | --- |
| Render `NODE_ENV`, `DATABASE_TARGET`, `MONGODB_URI`, `PORT` | `production`, `staging`, secret URI for the **new** cluster/exact `tapandwrap_staging`; provider PORT. Identity/role/network approval first. |
| Render `PRODUCTION_DATABASE_AUTHORIZED`, `PRODUCTION_WORKER_AUTHORIZED`, `PRODUCTION_DATABASE_HOST` | false, false, blank; test resources do not need production authority. |
| Render `CLIENT_ORIGIN`, `API_PUBLIC_ORIGIN`, `AUTH_SITE_DOMAIN`, `AUTH_DEPLOYMENT_MODE`, `AUTH_TOPOLOGY_APPROVED` | Exact frontend origin, exact API origin, approved nonproduction registrable domain, `same-site`, reviewed true **only on isolated service after approval**. No trailing paths/slashes. |
| Render `SESSION_SECRET` | Fresh isolated random secret ≥32 characters, separate from production; also protects account-action secrets. Private service secret UI only. Plan rotation invalidates relevant sessions/links. |
| Render `TRUST_PROXY_CIDRS` | Exact verified immediate ingress proxy addresses/CIDRs; not true, a hop count or world range. Verify forwarding guards and real client-rate-limit isolation. Blank is not proof Render ingress works. |
| Render `DATABASE_CONNECT_ATTEMPTS`, `DATABASE_RETRY_BASE_MS`, `SHUTDOWN_TIMEOUT_MS` | Reviewed defaults 3/500/15000; validate via `operations:check`; readiness/index failures are not repaired by raising budgets. `MONGODB_DNS_OVERRIDE_ENABLED=false`, no DNS workaround without specific evidence. |
| Render `CHECKOUT_ENABLED`, `COMMERCE_LAUNCH_AUTHORIZED` | Both false for dark deploy. Separate later approval may enable both **only in isolated target**, after data/storage/jobs readiness. No real funds; these are not production launch approval. |
| Render `CUSTOM_REQUESTS_ENABLED`, `CUSTOM_REQUESTS_LAUNCH_AUTHORIZED` | Both false initially; independently approved isolated request tests later. Closing intake preserves existing requests/proofs/admin/history and 12-hour obligations. |
| Render `PRODUCT_ALIASES_ENABLED` | False until isolated ProductAddress schema prepared; true only for synthetic registry lifecycle tests under authorization. No production registry export/backfill. |
| Render `CATALOG_BROWSE_PREVIEW_ENABLED`, `STAGING_PREVIEW_ENABLED` | False initially; use explicit synthetic public visibility, not accidental legacy-preview exposure or blanket stock approval. |
| Render `CATALOG_MEDIA_BASE_URL`, `CATALOG_MEDIA_UPLOADS_ENABLED`, `CATALOG_R2_ACCOUNT_ID`, `CATALOG_R2_ACCESS_KEY_ID`, `CATALOG_R2_SECRET_ACCESS_KEY`, `CATALOG_R2_BUCKET` | Exact test media origin/prefix, false initially, isolated public bucket account/secret read-write credentials/bucket. Enable only under public-upload test approval after CatalogMedia indexes. Credentials backend only; no public writes/deletion authority. |
| Render `STORAGE_ENABLED`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | False initially; new private bucket with scoped secret read/write/copy/delete-temporary permissions. Enable only under authorized private-provider tests. No public GET URLs or retained-evidence lifecycle deletion. |
| Render `EMAIL_PROVIDER` and sender | Choose one: Resend with verified sending identity: `RESEND_API_KEY`, `NOTIFICATION_FROM`, `NOTIFICATIONS_ENABLED`; or Gmail with authorized sender/app password: `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME`, `EMAIL_ENABLED`. Delivery flags false initially. Enter secrets in isolated API/worker settings only. Recommendation remains Resend; actual sender/account approval decides. |
| Render `NOTIFICATION_SAFE_RECIPIENTS`, `NOTIFICATION_LIVE_DELIVERY_ENABLED`, `NOTIFICATION_DELIVERY_NOT_BEFORE` | Exact approved synthetic inbox allowlist; live delivery false; reviewed UTC cutoff set before new test events. Never move cutoff backwards or flush historical events. Staging target stays recipient-restricted even with `NODE_ENV=production`. |
| Render `OWNER_NOTIFICATIONS_ENABLED`, `OWNER_NOTIFICATION_RECIPIENT`, `OWNER_NOTIFICATION_RECIPIENT_CONFIRMED` | False initially; later approved test operations recipient explicitly confirmed and allowlisted. Not inferred from public support address. These and the cutoff exist in code but are absent from the current server example; document them in the isolated configuration checklist. |
| Render `EMAIL_SMOKE_TEST_ENABLED`, `SITE_ORIGIN` | Smoke flag false until narrowly authorized; site origin exact test frontend for applicable services. Default email smoke is offline; provider send needs explicit permission and safe recipient. |
| Frontend `VITE_API_BASE_URL`, `VITE_SITE_URL` | `https://api.TEST_SITE_DOMAIN/api/v1`, `https://TEST_SITE_DOMAIN`; public compile-time values, never secrets. Rebuild if changed. Never leave localhost or production API in the test bundle. |
| Frontend `VITE_CHECKOUT_ENABLED`, `VITE_META_ENABLED`, `VITE_SEO_INDEXING_ENABLED` | false for dark deployment; checkout client gate only later for isolated enabled tests in sync with server. Meta/indexing remain false throughout. |
| Worker `PRODUCT_ADDRESS_API_ORIGIN` | **Must explicitly equal isolated API HTTPS origin**. Code defaults to production API if omitted, so omission is a hard isolated-deployment failure. No secret/service binding needed. `ADDRESS_SERVICE` is test injection, not a real binding to create. |
| Worker `SEO_INDEXING_ENABLED`, `SEO_EXPECTED_PUBLICATION_ID`, `SEO_WITHDRAWN_PATHS` | false, empty, empty baseline; test-only emergency withdrawal list when specifically rehearsing it. No production publication/approved catalog export. |
| Worker `BROWSER_API_ORIGINS`, `BROWSER_MEDIA_ORIGINS`, `BROWSER_UPLOAD_ORIGINS`, `BROWSER_CSP_MODE`, `BROWSER_TRACKING_ALLOWED` | Exact isolated API origin, public media origin, actual private presigned S3 endpoint origin; report-only then separately reviewed enforce after observing violations; tracking false. No wildcard upload/media origins, no camera-policy relaxation. |
| API/cron Meta flags | `META_ENABLED=false`, `META_POLICY_APPROVED=false`, `META_CAPI_ENABLED=false`; omit pixel/access token/API/version/consent config. Worker/browser tracking false. |

## 6. Authoritative URL deployment acceptance

Source: `seo-worker.js:48`, `catalog.routes.js:23`, `product-addresses.js`, `shared/product-url-compatibility.mjs`. Registry authority is the isolated API, with no positive/negative visibility cache, no cookies/query forwarding and a shared four-second deadline. Normal rename/visibility changes do not require maps, builds or daily operator work. An API outage deliberately returns 503/noindex; it must not serve stale withdrawn products. Configure an adequately available/warm API and monitor resolver latency/errors. No stale permission cache may be added at the CDN.

Canonical public products: 200/noindex in this environment. Registered old aliases: permanent 308, current canonical destination and query preservation for GET/HEAD. Hidden/withdrawn/deleted/unknown: genuine 404, no source details. Expired former maps and approved SEO snapshot expiry must not remove valid public browsing. No suffix-stripping ownership guesses. SEO publish remains off, robots disallow, sitemap empty/not indexable; legal-page approval remains independently false. Real indexed-publication tests remain isolated fixtures, not provider indexing activation.

Before public phone testing, verify actual Cloudflare HTTP, not Vite or only a Node bridge. Browser and Worker must point to the same isolated API and commit. Sanitize logs: never capture cookies, proof URLs, customer content or provider query signatures. Test server resolution even if a tester access layer is installed; do not accidentally query production as a fallback.

## 7. Dependency-ordered synthetic/provider acceptance

**All rows are planned, NOT EXECUTED here.** Separate authorization is required for resources, schema/fixtures, deployments, each real provider, schedule and isolated flags. Record deployed SHA/config hash, resource identity, test ID, time, expected/actual status and sanitized evidence. Restrict the test site to approved testers where practical.

### Phase A — resources, schema and fixture review (no customer/provider delivery)

1. Freeze candidate and isolate triggers; obtain budgets/resource/domain approval. Create only new test resources, secure secrets separately and verify no production roles/URIs/domains/buckets in the effective configuration. No copied production catalog/customer data.
2. Review exact `databaseModels` declarations/index options, including OrderSettlement, ServiceRequest, uploads/outbox/job run, sessions/account tokens, optional CatalogMedia and ProductAddress. The latter two depend on their flags at module load; prepare them in a **separate authorized operator process** using the reviewed optional schema selections, without casually enabling live API uploads/aliases to obtain DDL. Current schema CLI does not expose a model-selection flag. This procedure must be reviewed before execution.
3. Offline operator checks with securely injected isolated settings: `npm --prefix server run operations:check`, `npm --prefix server run schema:init`, `npm --prefix server run email:check`. First two default validation/dry-run; no `.env` loading/provider traffic. Then, **only under isolated schema-write authorization**, `npm --prefix server run schema:init -- --apply --target staging --confirm-schema-writes`. Inspect actual index options/unique constraints and transaction-capable topology; runtime startup itself must perform no DDL. Failure => stop, not weaken guards.
4. Prepare a reviewed bounded isolated fixture/bootstrap procedure: one admin, two separate guest sessions and test customer accounts, active synthetic categories, tiny synthetic products: approved tracked last-unit, zero-stock, unapproved price, Made by Request, variants, required personalization; component confirmed/pending/explicit Free; engraving eligibility with deliberately configured supported choices. Confirm every price/quantity is labeled synthetic and explicit. No merchant imported stock. Current `server/test` bootstraps are test-only and install memory providers; **do not deploy/run them as the live seeder**. No general safe deployed-admin/fixture bootstrap CLI was found; public signup always creates a customer. Authorize a reviewed one-off script/procedure against only the new cluster before tests requiring admin. Never add a public role-promotion API.
5. Rehearse transaction commit/abort and last-unit contention, unique idempotency/settlement/address references, readiness with missing schema and safe restart. Use existing targeted isolated tests for destructive/fault timing that cannot safely be injected into a real provider. Do not simulate transaction support by using a standalone MongoDB.

### Phase B — dark deployment and HTTP/auth checks

6. Build/install on Linux, inspect native Sharp and complete artifact/imports, verify no secrets/mock adapters/prod endpoints in bundle/config. Deploy API and unique test Worker/assets only with separate authorization and intake/provider delivery closed. Check `/health/live`, `/health/ready`, `/api/v1/status`, private no-store headers, media ranges, robots and noindex. Readiness must be 200 before route/provider cases.
7. Test new-account/guest/admin isolation, strict Origin and CSRF rejection, Secure host-only SameSite=Lax cookies, no leakage between two phone/browser sessions, role denial and logout/expired-session behavior. A successful CORS preflight alone does not prove authenticated cookies work. Verify forged forwarding headers and correct proxy trust with actual ingress; do not clear rate limits to make test cases pass.
8. Configure synthetic aliases only after schema/fixture approval. Execute canonical/legacy/query/HEAD, rename, hidden/withdrawn/deleted, unknown, public enquiry/unpriced and purchase-ready cases. Restore isolated fixture state through reviewed admin operations, not production data writes. Rehearse resolver outage only in the test service/config under approval; expect bounded 503 and recovery without map rebuild. Check immediately after withdrawal to prove no stale cache.

Example PowerShell HTTP probes, **future isolated URL only**, no credentials or provider signatures printed:

```powershell
$testFrontend = 'https://TEST_SITE_DOMAIN'
$testApi = 'https://api.TEST_SITE_DOMAIN'
curl.exe --fail --silent --show-error "$testApi/health/ready"
curl.exe --silent --show-error -I "$testFrontend/products/<SYNTHETIC_CANONICAL>"
curl.exe --silent --show-error -I "$testFrontend/products/<SYNTHETIC_ALIAS>?source=isolated"
curl.exe --silent --show-error -o NUL -w '%{http_code}' "$testFrontend/products/unknown-isolated-reference"
curl.exe --silent --show-error "$testFrontend/robots.txt"
curl.exe --silent --show-error -o NUL -w '%{http_code}' -X POST "$testApi/api/v1/commerce/service-requests" -H 'Origin: https://unapproved.invalid' -H 'Content-Type: application/json' --data '{}'
```

Expected: ready 200; canonical 200/noindex/no-store; alias 308 with exact canonical/query; unknown 404; robots disallow; unapproved-origin mutation denied with no new request. Confirm actual GET body and empty HEAD body too; do not follow redirects in the first status check. Use captured fixture references, not angle-bracket placeholders. Browser/API negative tests with the appropriate synthetic session/CSRF cover unauthorized content access and closed-intake direct bypasses.

### Phase C — public/private R2

9. After public-upload authorization, admin chooses Gallery/Camera/Files, uploads harmless JPEG/PNG/WebP through `/api/v1/admin/media` (raw binary API upload), verifies readback before reference/save, primary/reorder/save/reload, category and component replacement, duplicate retry and stale revision. Public file loads from the **test** media domain with correct MIME/cache and new immutable URL after replace. Remove reference and prove other references/history still work; no physical object deletion. Reject no-session/nonadmin/CSRF, corrupt/forged/truncated/oversize files. Simulate provider outage in local tests or specifically authorized isolated fault, ensure no broken saved reference.
10. Private-upload approval: exact frontend-origin CORS allowing PUT and actual signed request headers; normally Content-Type, expose ETag only if used. Backend handles read/copy/view; no public browser GET bucket permission needed. Signed PUT uses a five-minute URL and signed content-length/type: inspect actual browser behavior on all target devices. Cloudflare requires CORS in addition to valid signatures; expired signatures may appear as CORS failures, so recover by obtaining a new signed upload rather than interpreting the browser error body. [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [presigned URL contract](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
11. Through actual UI sign → PUT → complete/verify → attach: personalization, two service references, website proof. Confirm correct verified private copy and protected admin view after order/request acceptance; direct object access/foreign session/random ID denied; no private keys/URLs in page DTOs/email. Cancel/retry/refresh/expires/incorrect MIME/corrupt/empty/10MB limit and decoder-busy/error paths preserve prior references/form fields. Do not edit/delete retained evidence. Expired URL check waits past five minutes using synthetic temporary data; don't change shared clocks or production expiry settings.

### Phase D — enabled isolated customer journeys, no transfers/messages to customers

12. Separately approve **isolated** checkout/client gates and request gates; never activate production. Normal guest/account COD → pending shipping null → recorded contact → fee/customer acceptance → simulated COD collection/fulfillment. Unavailable and unpriced items stay enquiry-only; no WhatsApp message sent by test automation.
13. InstaPay order-first → reference and approved receiving number `01060673073` → synthetic image clearly marked **TEST — NO TRANSFER** → awaiting reconciliation. Do not transfer funds. Screenshots never mark Paid. To exercise settlement/fulfillment in the isolated ledger, explicitly authorize synthetic reconciliation records labeled simulated; do not misrepresent them as actual bank verification. Real receiving-account operations are outside this test.
14. Required personalization preserves variant price/quantity → chooser/images → Edit/reload → cart → checkout → admin correct private attachment. Bypass required fields directly and confirm server rejection. Existing cart item made unavailable must fail authoritative quote/order safely.
15. Gift Box and Engraving accountless requests work with zero approved templates, owner-approved component eligibility/confirmed-pending-Free semantics, optional email, protected references. Admin quotation → open prefilled WhatsApp **without sending** → separately record synthetic sharing/acceptance evidence → immutable accepted version → actual isolated order/inventory allocation. InstaPay default, COD only if explicitly authorized before acceptance. No stock reserved merely on request submission. Shipping and unknown add-ons separate, acceptance before payable balance.
16. Synthetic cancellation request leaves allocation intact; authorized cancellation restores once; paid/return cases use simulated collections and one multi-scope refund reference, no actual refund. Test retries/duplicates/concurrent last unit/foreign access and accounting history. Clear test-only labels in every financial evidence record; this does not verify real banking.

### Phase E — email and bounded jobs

17. Choose/verify sender privately and allowlist the approved synthetic inbox **and** test owner recipient. Validate with `email:check`; set a new cutoff before submissions. Under explicit email-send approval enable only chosen provider on isolated API/worker. Verify real received HTML/plain text, escaping, order/reference/pending-shipping language, no private attachments/internal notes/tracking pixels, provider ID and inbox/spam result. Queue-before-cutoff record remains held. Missing optional email must not block requests. Provider failure cannot erase accepted orders.
18. Manual authorized worker from repository root: `npm --prefix server run commerce:jobs -- --once --target staging --confirm-writes --batch-size 20 --max-duration-ms 45000`. Fresh secret configuration for this target only. Default `npm --prefix server run commerce:jobs` stays offline dry-run. Inspect job journal, counts/lease/retry/uncertain/held states; deliberately failing provider retry is tested with mocks or a reviewed isolated fault, **not** blind repeated real sends. Ambiguous acceptance requires reconciliation/manual review, never automatic resend.
19. Contact sequence: submit new synthetic order/request after cutoff → one owner immediate event/send; leave one uncontacted for **real nine hours** → one reminder; at **twelve hours** dashboard overdue and **no third initial-contact email**. Separate case: mark contacted before nine hours suppresses unsent reminder; late contact clears active overdue but retains history. Do not backdate accepted provider records or alter system clocks to shorten this test. Controlled-clock local tests already cover exact boundaries; live acceptance adds actual scheduling/inbox evidence. Other transactional/payment notifications are separate event sequences.
20. After manual jobs pass, separately approve test Cron Job only, repository root/same SHA/build command, proposed UTC `* * * * *`, same bounded command. Monitor heartbeat, oldest due event, failed/partial/interrupted/dead/uncertain counts, provider bounce/inbox and temporary-upload cleanup. No public-media GC; retained attachments stay retained. Cron non-overlap does not replace application leases across manual runs/other instances. Render manual trigger cancels an active run, so don't trigger it over in-flight real email delivery. [Render cron lifecycle](https://render.com/docs/cronjobs).

## 8. Physical-device and video evidence sheet

Test URL: **pending authorized creation**, `https://TEST_SITE_DOMAIN`; do not use the production storefront for these test orders/uploads. Record actual device/model, OS/browser version, network, build SHA, file format/size, expected/actual, PASS/FAIL/NOT VERIFIED and sanitized screenshot/error. No platform is marked physically passed by this preparation.

| Platform | Required executed checks before acceptance |
| --- | --- |
| iPhone Safari (plus iPhone Chrome where supported) | Website chooser first; Gallery/Camera/Files; allowed/denied/previously denied native camera behavior/fallback; cancel, reopen, same file, replace/multiple files; actual HEIC output and compatible JPEG recovery preserving text. Product personalization, both services, proof and admin gallery save/reload. |
| Android Chrome | Same full flows, actual camera/gallery, multiple large photos, keyboard/Back/focus, network interrupt, reload and ownership. |
| Samsung Internet | Repeat on actual supported Samsung device; Chrome pass is not equivalent. |
| Desktop Edge / Chrome | Mouse/keyboard upload, same-image cancellation/replacement, all financial/customer/admin journeys and real native media events. Compare same original files under default browser settings. |
| Tablet portrait/landscape; Firefox/macOS Safari as available | No overflow/clipped modals, software keyboard, focus/escape/return, primary-image/reorder controls, financial actions, video crops and navigation. Mark unavailable engines/devices NOT VERIFIED. |

All four footage assets (desktop hero, mobile hero, Gift Box, Engraving): fresh navigation, actual decode, pause/resume mouse/touch/keyboard, rapid controls, scroll in/out/fast scroll, autoplay rejection, reduced motion initial/change, background/return, history/refresh, rotation and slow/failed ranges. Posters/text/CTA/request forms/checkout must remain usable when decoding fails. Record native camera/OS prompts truthfully; the website cannot force an OS Gallery UI or permission dialog. Only explicit camera input has capture; do not weaken CSP/Permissions-Policy globally.

HEIC/HEIF remains unsupported by the authoritative decoder. Recoverable instructions/export/alternate JPEG are a limitation, not an all-iPhone pass. No destructive payment-proof conversion introduced. If a normal iPhone cannot complete required personalization with an understandable fallback, this is a failed device gate needing correction before launch.

Edge investigation evidence from the gate: MediaError 3 `PIPELINE_ERROR_DISCONNECTED`, reproduced with identical assets in plain HTML using D3D11VideoDecoder; software FFmpeg control and Chrome pass. This **does not establish an application race** or universal driver cause. Future deployed diagnostics may record only video label/path without query, browser/OS, error code/message, ready/network state, current time and HTTP media status; no cookies/referrer/private fields. Do not add production telemetry or re-encode footage without evidence/approval. Owner must explicitly accept any remaining decorative fallback limitation; otherwise retain the gate.

## 9. Costs, approvals, recovery and cleanup

Costs cannot be quoted as a total: current accounts/plans/regions/billing are unverified. Budget for warm Render API memory sufficient for native decode, Atlas replica-set service, Cloudflare Worker requests/assets, two R2 buckets/storage/operations, email sends/sender/domain and monitoring. Existing shared free allowances are not guaranteed to cover an isolated test. Render documents cron active-time billing and a **$1 monthly minimum per cron service**; actual cost depends on chosen compute/runtime. [Current cron billing](https://render.com/docs/cronjobs). Obtain a capped test budget and expiry review before provisioning; no paid purchase authorized here.

Separate explicit approvals required in order:

1. Read-only deployment-trigger inventory (first action); no secrets copied.
2. Exact local freeze/staging/commit/branch and private test-repository publication, after isolation is proven.
3. Resource IDs/domain/network/roles/budget and nonproduction configuration; new isolated schema/index/fixture/admin writes.
4. Unique dark API/Worker deployment and real target smoke checks; Linux installation/native capacity verification.
5. Public/private test R2 operations; approved sender/synthetic inbox delivery; manual bounded worker writes.
6. Isolated checkout/intake only and explicitly simulated accounting; later cron scheduling and nine/twelve-hour acceptance.
7. Physical-device outcomes and video fallback decision. Production reads/backups/migrations, production release, indexing and marketing remain outside all of these approvals.

Rollback for test failures: close **isolated** new checkout and custom intake independently, stop/suspend isolated scheduled dispatch, retain owned receipts/proofs/admin access and quarantine ambiguous provider outcomes. Capture logs/SHA/config/DB state before changing anything. Revert only to a schema-compatible isolated artifact; do not run older financial writers over new ledger records or restore a stale backup over accepted records. API authority outage must fail closed without stale visibility fallback. Rollback must never repoint the test Worker to production API/media.

Cleanup is a separately reviewed inventory, not an automatic TTL: record test repository/Worker/domains/Render API/cron/Atlas project/users/buckets/keys/provider events and evidence. Revoke isolated credentials, remove test routes/resources and delete synthetic data/objects **only with explicit deletion/retention approval** and verified exact targets, after acceptance evidence is retained. No retained order/proof deletion, production data cleanup, local backup deletion or public-media garbage collection is authorized by this plan.

## 10. Go/no-go and preparation results

**GO to request isolated deployment authorization:** reviewed immutable complete source, isolated publication/deploy paths, approved exact resources/domain/budget, fail-closed effective settings, schema/fixture/admin procedure, Linux build and target configuration plan. Current status is preparation complete, those external approvals/settings still pending.

**NO-GO for customer launch:** no physical devices or actual R2/email/domain/Cloudflare runtime/Atlas/production data have passed this preparation; video limitation remains open; legal/operator/contact/retention sign-offs and merchant data transition/history reconciliation remain required. Do not infer current product/component counts or approvals. Production SEO/Meta/intake/checkout flags remain unchanged.

Verification executed here: local Git/manifest SHA comparison, complete Git-visible inventory/classification, lock root consistency, Node version, relative-import existence and source deployment/guard review. Official provider documentation was read publicly; no account/provider operations were performed. No extensive regression rerun was justified for documentation-only changes. Git's existing LF/CRLF warnings are informational; stage-content review remains mandatory.

Exact preparation deliverables: this file and `docs/ISOLATED_RELEASE_FILE_INVENTORY.json`. The classifier helper/evidence are ignored under `client/test-results/post-gate/`; no existing application source/config/dependency/report was changed. All prior work is preserved. Stop here for review and explicit authorization.
