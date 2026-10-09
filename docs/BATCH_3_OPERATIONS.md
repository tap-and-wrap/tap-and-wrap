# Batch 3 operations and deployment safety

This is prepared code and isolated verification. No existing MongoDB database, credentials, DNS provider, R2, Gmail, Meta, deployment or merchant records were accessed. No live configuration was enabled. Checkout and integrations retain their existing disabled launch gates.

## Confirmed roots and changes

| Finding | Confirmed source root | Implemented local correction | Pending external step |
| --- | --- | --- | --- |
| F09 | Database guards accepted only local/staging, leaving no independently approved production contract. | Prepared exact `tapandwrap_production` candidate, gated by production runtime, explicit production authorization and an exact approved URI seed host; TLS, credentials, auth source, connected name and write-time URI checks remain strict. Staging importer/exporter targets were not expanded. | Owner/infra approval of name, cluster and scoped user; separate provisioning and authorized connectivity test. |
| F10 | Host-only `SameSite=Lax` cookies cannot authenticate ordinary cross-site workers.dev → onrender.com requests. | Production startup validates an explicitly approved HTTPS same-site apex/www storefront + API subdomain, or a reviewed same-origin API route. Cross-site provider hosts, unapproved topology, HTTP and local production topology fail closed. Remote topology requires production runtime so existing session, cart and CSRF cookies remain Secure, host-only and Lax. Exact CORS and CSRF Origin checks remain unchanged. | Domain ownership/registrable-site review, HTTPS/DNS setup, actual secure-cookie browser verification. No proxy or custom domain was deployed. |
| F11 | No explicit trusted-proxy contract meant proxy clients could share the immediate-peer IP; blindly enabling proxy trust would allow spoofing. | Blank defaults to no proxy trust. Only bounded explicit IP/CIDR allowlists accepted; no booleans, hop counts, wildcard or unrestricted ranges. Untrusted forwarding headers are ignored; malformed trusted chains rejected; closest untrusted hop drives the existing limiter. | Verify actual immediate proxy addresses and whether the provider sanitizes/appends forwarding headers; test the real ingress after authorization. |
| F12 | Initial connection attempted once; failure left an unavailable API without bounded recovery. | At most 1–5 attempts (default three), 6-second driver selection/connect budgets, hard 12-second connect and six-second aggregate schema deadlines, bounded exponential backoff+jitter, sanitized attempt/status diagnostics. Configuration, target, auth/TLS, missing schema, timed-out uncertain attempts and uncertain cleanup stop immediately. Shutdown cancels pending retry sleeps. | Authorized Atlas transient-failure/reconnect and operator-alert verification. |
| F36 | Every normal API/job connection created collections and indexes; startup had no graceful drain. | Ordinary startup performs read-only required-index verification with automatic DDL disabled. Missing/incorrect unique/TTL/partial/text indexes block readiness and database-dependent routes. Separate explicit schema command does guarded DDL without dropping indexes. Bounded admission stop, accepted-request drain, idle keep-alive closure, startup cancellation, driver disconnect and forced-stop diagnostics; server-generated request correlation IDs. | Review schema delta and separately authorize initialization of any new collections/indexes on staging/production; configure real termination/health checks. |
| F37 | Successful local SRV workaround relied on ad hoc process DNS changes. | Development/staging-only, opt-in, validated IP resolver list configured in the Node process before MongoDB driver operations. No DNS lookup in offline validation, no OS edits, no multi-host URI bypass. | Investigate local resolver/SRV failure and separately approve resolver use; no public DNS service was called during tests. |

## Runtime configuration

Safe placeholders are in `server/.env.example`; real secrets remain outside source control.

- `DATABASE_TARGET=local`: loopback and exact `tapandwrap_dev` only; production runtime cannot use local. Disposable test exception remains exact `tap_wrap_catalog_test`, loopback and test runtime.
- `DATABASE_TARGET=staging`: exact `tapandwrap_staging`; existing staging import/preview controls remain unchanged.
- `DATABASE_TARGET=production`: **prepared, not approved or activated**. Requires `NODE_ENV=production`, `PRODUCTION_DATABASE_AUTHORIZED=true`, exact `PRODUCTION_DATABASE_HOST`, authenticated TLS URI and exact `/tapandwrap_production`. Do not set these until the owner/infra operator independently approves the actual cluster, name and least-privilege credentials. Production imports remain prohibited.
- `PRODUCTION_WORKER_AUTHORIZED=false` is a separate default-off gate for any future reviewed production worker application; database authorization alone does not authorize provider delivery or scheduled work. The bounded worker command additionally requires its own explicit production confirmation.
- `DATABASE_CONNECT_ATTEMPTS=3` (1–5); `DATABASE_RETRY_BASE_MS=500` (1–5000); `SHUTDOWN_TIMEOUT_MS=15000` (100–30000). Cleanup uncertainty prevents another connection attempt.
- Connection work additionally has a hard 12-second startup deadline. Required-index verification shares a six-second aggregate deadline across all collections, with remaining `timeoutMS`/`maxTimeMS` supplied to the installed driver. A timeout is a terminal sanitized failure followed by bounded disconnect, never an automatic retry of an uncertain driver attempt.
- `AUTH_DEPLOYMENT_MODE=local` by default. Approved remote deployments require `same-site` or `same-origin`, `AUTH_TOPOLOGY_APPROVED=true`, `NODE_ENV=production` and valid exact HTTPS origins. No cookie Domain attribute or SameSite=None is introduced.
- `TRUST_PROXY_CIDRS=` by default. Set only provider-verified immediate peers/ranges, with public backend access reviewed. Do not infer trust from headers or use `true`/a numeric hop count. In-memory rate limits retain their current per-process semantics; multiple backend replicas require a separately reviewed shared-store strategy.
- `MONGODB_DNS_OVERRIDE_ENABLED=false`, `MONGODB_DNS_SERVERS=` by default. Only development + staging SRV connections can opt in. A resolver list alone is rejected. This is not permission to connect to staging or to change Windows DNS.

Illustrative **synthetic** topology, not a real approved domain:

```text
NODE_ENV=production
CLIENT_ORIGIN=https://shop.synthetic.test
API_PUBLIC_ORIGIN=https://api.shop.synthetic.test
AUTH_DEPLOYMENT_MODE=same-site
AUTH_SITE_DOMAIN=shop.synthetic.test
AUTH_TOPOLOGY_APPROVED=true
```

The real storefront must be the approved domain apex or `www` thereof, with the API as its HTTPS subdomain. This validator is deliberately narrow; it is not a public-suffix database or proof of domain ownership. An operator must confirm the chosen domain is an owned registrable site, not a shared hosting suffix. A same-origin alternative requires equal HTTPS client/API public origins and an independently reviewed API proxy with private responses uncached, untrusted forwarding headers stripped, original permitted Origin preserved, and backend access constrained. Proxy deployment is not performed by this batch.

## Offline check and explicit schema procedure

`npm.cmd run operations:check` reads **explicit terminal settings only**, never `.env`, connects nowhere and performs no DNS resolution. It validates target, topology, proxy/retry configuration and optional DNS override. Its output contains only non-secret booleans/counts and target identifiers. A successful offline result proves syntax/policy agreement, not credentials, permissions, connectivity or provider topology.

`npm.cmd run schema:init` defaults to an offline dry-run without importing runtime/provider modules or loading `.env`. Normal API/job startup no longer initializes the database. Missing collections/indexes return `DATABASE_SCHEMA_NOT_READY`, readiness 503 and unavailable database-dependent APIs. `/health/live`, `/api/v1/status` and CSRF acquisition remain available.

Unexpected TTL options on a declared non-TTL index also block schema readiness; matching index keys alone cannot permit unintended automatic record deletion. The API readiness gate preserves sanitized rejected-target diagnostics before returning the generic schema-not-ready response for a correctly connected target.

**Future, separately authorized initialization only:**

1. Review declared schema/index changes and current database indexes through a separately authorized inspection. Resolve incompatible existing indexes with a reviewed migration; this command never drops or renames them. No category identity backfill is included.
2. Configure terminal-only URI and exact target privately, with a scoped database user. Do not print the URI or paste it into reports. Production additionally requires independent name/host/authorization approval.
3. Run the offline configuration check and default schema dry-run. Confirm checkout, email, R2 and Meta stay disabled.
4. Only after explicit write permission, run `npm.cmd run schema:init -- --apply --target staging --confirm-schema-writes` for staging, or `--target local` for an authorized dedicated local database. Production additionally requires `--confirm-production-schema` and every prepared production guard. These apply commands were **not executed on an existing database** during this batch.
5. Verify read-only schema readiness, index options, application health and denied unauthorized operations. Review sanitized initialization errors; do not bypass failed uniqueness or target checks.
6. Clear terminal URI/credential values privately when finished. Do not import, publish or enable checkout as part of schema setup.

A mismatch observed during an authorized initialization stops before the next write. Already completed DDL may remain; there is no destructive automatic rollback. The optional existing-category metadata backfill remains a separate operation and was not performed.

## Health, recovery and shutdown

- Liveness starts while the bounded connection attempt runs. Readiness stays 503 until connection, exact target and declared indexes are verified.
- Transient selection/network errors are retried; auth, TLS certificate failures, unsafe URI/target, malformed config and schema errors are not. Diagnostics never include driver messages, hosts, URIs, usernames or credentials.
- A driver-disconnected connection reports `DATABASE_CONNECTION_LOST`, not a stale ready status. Driver reconnection must again pass the live target guard before operations are eligible.
- Exhausted initial retries leave readiness false. Monitor/alert and restart only after inspecting the sanitized cause; do not loop indefinitely or clear safety guards.
- SIGINT/SIGTERM stop new API work, abort retry sleep, drain accepted HTTP work, close sockets that become idle, then disconnect. At deadline, remaining HTTP connections are closed and a bounded disconnect is attempted; uncertain cleanup is logged and process exit is non-success. Commerce retry/idempotency and transaction correctness are not bypassed.
- `X-Request-Id` is a locally generated UUID. Client-supplied IDs are not reflected. Unexpected request diagnostics contain only event, correlation ID and a stable error code, never URL query strings, bodies, cookies, private files or credentials.

## Actual isolated verification

- Initial focused operations + existing database connection/safety/staging suite: **41/41 passed**, zero failed/skipped; 20 new operational tests and 21 legacy regressions. After final readiness/deadline/TTL corrections, the focused operations + legacy connection rerun passed **28/28** (23 operational and five legacy connection tests), zero failures/skips.
- Actual disposable local replica-set schema/startup suite: **3/3 passed**. Actual MongoDB command monitoring observed one `listIndexes` per registered model and **zero create/createIndexes/drop/dropIndexes commands** during ordinary startup. A synthetic removed Session unique index blocked readiness; unauthorized repair was denied; explicit guarded disposable initialization restored it.
- Proxy tests used real loopback Express requests and the existing rate-limiter implementation: independent synthetic clients, shared-IP limits, spoofed left-side forwarding, malformed chains and correlation sanitization.
- Retry/DNS/production topology/auth/TLS failure tests use synthetic configuration and injected adapters. No SRV query, production connection, DNS service or provider was contacted.
- A meaningful initial shutdown test failed because active requests became keep-alive idle after the first drain call; the bounded shutdown-only idle drain corrected the root cause and the complete focused rerun passed.
- Backend test runner now allowlists only OS process variables, disables `.env` loading through its existing explicit non-file path, blanks provider/database configuration and prohibits MongoDB binary downloads. All database tests use cached binaries and new project-owned disposable directories.
- Full cross-batch backend/frontend/connected/SEO/build results belong to the final Batch 3 reconciliation report; these focused results do not claim live Atlas, real proxy/cookie deployment or real signal orchestration verification.
- Five additional connected React → actual local Express/Mongoose cases cover diagnostics/guest denial, real 20-item paging/filtering and EGP/history, stale product/category forms, approval/Origin rejection and owner-private checkout submission lookup. They preserve the existing four connected cases and use only new disposable synthetic records. The coordinated connected browser run passed **9/9**, with external requests blocked and `.env` loading disabled.

## Exact authored operations files

Created:

- `server/src/config/deployment.js`
- `server/src/config/database-dns.js`
- `server/src/config/schema.js`
- `server/src/config/shutdown.js`
- `server/src/middleware/operations.js`
- `server/scripts/check-operations.js`
- `server/scripts/initialize-schema.js`
- `server/test/batch3-operations.test.js`
- `server/test/batch3-schema-integration.test.js`
- `docs/BATCH_3_OPERATIONS.md`
- `client/connected-e2e/operations-contracts.spec.js`

Modified:

- `server/src/config/database-safety.js`
- `server/src/config/db.js`
- `server/src/config/env.js`
- `server/src/server.js`
- `server/src/app.js`
- `server/scripts/run-tests.js`
- `server/test/database-connection.test.js`
- `server/package.json`
- `server/.env.example`
- `server/test/helpers/connected-api-server.js`

Existing Batch 1/2 edits are preserved. No dependencies were added or installed.
