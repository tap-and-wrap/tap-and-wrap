# Batch 1 — Security, privacy and contract hardening

Local implementation report. Existing merchant/staging/production data was not accessed or mutated. No external providers, credentials, real email/payment/upload/tracking, import application, commit, push or deployment was used. Checkout and provider launch gates remain disabled. Batch 2 has not started.

## Verification

**Status: PASS for the entire authorized local Batch 1 scope.** All 17 findings below passed the applicable final verification gates. Existing-database inspection and the optional category metadata backfill remain separately authorized actions; neither was performed or claimed as verified.

| Final gate | Actual result |
| --- | --- |
| Full backend suite, `server/npm.cmd test` | **320/320 passed**, zero failed or skipped; baseline before edits was 242/242, so 78 additional backend tests |
| Full frontend/browser suite, `client/npm.cmd test` | **133/133 passed** |
| Connected React → real local Express/Mongoose → disposable replica-set suite, `client/npm.cmd run test:contracts` | **4/4 passed** |
| SEO/static Cloudflare regression suite, `client/npm.cmd run test:seo` | **27/27 passed** |
| Frontend lint | **Passed** |
| Isolated production build | **Passed**; 22 generated SEO routes, zero indexable routes, checkout offers disabled |
| Server syntax checks | **Passed**, 117 JavaScript files |
| Git whitespace/conflict review | **Passed**; no unresolved merge markers |

These are actual final executions, not earlier phase reports. Main frontend tests include desktop/mobile checks, auth and cache races, private-route gates, conflict retention, customization/upload behavior and existing commerce regressions. The connected suite uses real authentication, validation, serializers, persistence and React interfaces; only external storage is replaced with an isolated loopback adapter. Real Atlas, SMTP, R2, payment, Meta and deployment behavior were not exercised.

Regression failures were investigated before completion. Concurrent catalog tests exposed Mongoose document rollback bookkeeping incompatible with strict embedded schemas; catalog transactions now use driver sessions with fresh documents on retries, retaining strict validation. First singleton saves initially retained revision zero; their transactional revision fence now advances on initial creation. The final frontend run first passed 132/133 because an old preview fixture returned 401 while continuing to report an authenticated admin; the fixture now models session expiry consistently, the 25 affected tests passed, and the entire rerun passed 133/133 without weakening runtime authorization.

The offline workbook/schema validation independently verified 1,680 source entries, 1,595 product candidates, 85 components (80 customization options and five gift-packaging candidates), 12 roots plus 197 children = 209 categories, 4,139 image references, zero invalid rows and all 423 review flags. The workbook remained unchanged. Both default import and category-identity commands opened no database connection.

## Finding-by-finding implementation and regression evidence

All corrections below are implemented and locally verified. No existing database backfill has been performed.

| Finding | Status | Confirmed root cause | Correction | Regression coverage |
| --- | --- | --- | --- | --- |
| F01 | PASS | Shared private keys and incomplete transitions retained prior-account data. | Owner/generation-scoped caches, cancellation/removal, stale-response and pre-dispatch guards, verified-cookie login, cross-tab/focus recovery, optional-auth expiry signals, private-route remounts and in-flight private-upload cancellation. | batch1-auth browser tests; connected account isolation |
| F02 | PASS | Customer order responses exposed unrestricted history and Mixed snapshots. | Nested allowlisted customer DTOs; separate publicReason/internalNote; legacy reason stays admin-only. | batch1-order-presentation; commerce-orders; connected order pages |
| F03 | PASS | Forms sent patches without loaded revisions, and checkout/restock/redemption writes did not invalidate stale admin revisions. | Required expectedRevision and atomic optimistic concurrency across products/categories/templates/components/promotions/shipping/purchase configuration/site content/reviews; inventory/restock/redemption also advance the same revision; confirmed reload retains conflict drafts. | catalog-api; commerce-configuration-api; website-admin; batch1-inventory-revision; admin-revision browser tests |
| F04 | PASS | Client regenerated engraving fields already supplied by the normalized API DTO. | One server definition per control; upload-definition uniqueness checked before signing; quote/cart/order snapshots preserve the mapping. | real serialized engraving DTO API and connected tests; immutable order regression |
| F05 | PASS | Editor submitted option.available although the strict model supports active and server-derived eligibility. | Removed unsupported input/payload; strict model validation retained; availability derives from approved component/stock rules. | commerce-configuration-api; connected template editing |
| F06 | PASS | Every CSRF acquisition minted a different cookie, invalidating other tabs; expired tokens were not recovered. | Reuse valid shared tokens; deduplicate acquisition; one retry only after explicit INVALID_CSRF rejection before mutation; no network/Origin/authorization replay. | batch1-auth backend/browser CSRF races and rejection tests |
| F07 | PASS | Category reimports matched mutable merchant names and hierarchy. | Immutable importCategoryKey; compatibility resolution using original source metadata/stable IDs; fail closed on ambiguous identities or source grouping changes; optional reviewed metadata migration. | catalog-import identity/rename/slug/nested/migration tests |
| F16 | PASS | Separate mocks hid actual DTO, validation and editor contract mismatches. | Connected React + real Express validation/serializers + new local replica-set tests; external storage alone uses an isolated adapter. | client/connected-e2e/contracts.spec.js |
| F17 | PASS | Keys, text/file/quantity limits and floating-point money disagreed across layers. | Aligned hyphenated keys and limits, Unicode character counting, exact decimal-to-piastre parsing and strict invalid-boundary rejection. | configuration/model/editor helper tests; connected exact-money flow |
| F18 | PASS | CategoryPicker sent search to an API whose query schema rejected it. | Validated paginated admin-only category search, literal escaping, loading/error/retry states and real selection contract. | catalog-api search; connected category/component creation |
| F23 | PASS | Malformed/expired/revoked session cookies rejected legitimate guest recovery. | Clear invalid account and guest cookies, rotate a fresh guest owner, retain strict protected authorization and idempotent CSRF-protected logout. | batch1-auth backend/browser recovery and IDOR tests |
| F24 | PASS | Character-count limits permitted UTF-8 inputs beyond bcrypt's 72 bytes. | Shared byte-limit validation for signup/reset and matching frontend feedback; legacy login hashes remain compatible. | ASCII/Arabic/Unicode/emoji boundaries and reset/login regression |
| F25 | PASS | Generic HTTP error handling ran before malformed-JSON classification. | Classify entity.parse.failed first; constant INVALID_JSON response and no request-body logging. | malformed JSON tests with synthetic password/token fragments |
| F26 | PASS | Terminal/expired/replaced/consumed action secrets persisted; expired SMTP leases could be reclaimed after bounded cleanup. | Bounded cleanup even with delivery disabled; atomic account-action erasure; terminal schema support; uncertain SMTP dispatch never replayed, including cleanup-limit overflow. | notification-retention; account/auth lifecycle and crash/failure tests |
| F33 | PASS | Catalog mutations lacked transactional administrator audit records. | Audit actor/action/time/resource, before/after revision and changed field names only, in the same transaction as the mutation. | catalog-api redaction/rollback/concurrency audit tests |
| F34 | PASS | Cross-document relationship checks could race category reparenting. | Targeted category fences for product/component/category API writes and bounded import transactions; compatible public/checkout hierarchy predicates. | API product/component races; batch1-import-concurrency; invalid legacy relation tests |
| F35 | PASS | Interrupted imports lost batch progress and ambiguous-write information. | Atomic project-scoped JSON journals before/after each batch; distinguish committed, rolled-back and uncertain commits; safe insert-only resume and cleanup-failure reporting. | catalog-import and batch1-import-concurrency interruption/resume tests |

## Full-stack contracts and safeguards

- GET admin DTOs return `revision`. PATCH and explicit template revision creation require `expectedRevision`. Creates do not require a revision, except singleton shipping/site-content saves whose first-write revision is also fenced. Existing stronger order revisions remain intact. Atomic checkout stock changes, tracked restocking and discount redemption advance the same admin revision as well as their existing commerce counters; stale forms cannot reset those operational changes. Missing/malformed revisions return 400; stale submissions return 409 `EDIT_CONFLICT`. Old imported records without `__v` normalize only within the first authorized edit transaction, never on reads/startup. First singleton writes advance from zero so a second stale zero cannot overwrite them.
- Failed saves preserve local drafts. Reload is an explicit two-step action that warns it will discard the draft; background refetches do not automatically replace editor state. Homepage toggles/hide operations also send the loaded revision.
- Private caches use verified identity and a lifecycle generation. Existing admin/account/commerce key prefixes have captured-owner hashes, preserving existing prefix invalidation and public catalog caching. Account transitions cancel/remove private queries, reject stale responses and prevent mutations delayed during CSRF acquisition from dispatching under another identity. Cross-tab notifications trigger cookie verification, not trust in another tab's user object. Stable-user focus checks preserve checkout drafts and selected files. Optional-auth recovery signals invalid cookies without exposing an identity; the browser reverifies rather than trusting a late guest response. Selected-upload workflows carry their original generation through signing, direct PUT, completion and cart submission; an account transition aborts in-flight PUTs and prevents old workflows from issuing new-owner completion, cart or deletion requests. Incomplete old uploads expire through the existing lifecycle.
- Customer orders expose explicit nested DTOs. `publicReason` is safe customer-visible wording; `internalNote` and pre-existing ambiguous `reason` remain admin-only. No migration or deletion of historical notes is required. Private storage keys, proof IDs and operational claim/idempotency records do not enter customer DTOs. Admin proofs/files remain explicitly requested and authorized.
- CSRF recovery is limited to one explicit `INVALID_CSRF` middleware rejection. Invalid Origin, authorization failures, timeouts and uncertain commerce results are never replayed automatically. Requests preserve existing idempotency keys. A CSRF token remains bound to its signed cookie; no authorization is weakened.
- Signup and password reset enforce bcrypt's 72-byte UTF-8 limit. Existing long-password hashes can still be checked by login; hashes were not migrated.
- The normalized customization DTO is authoritative. No duplicate client engraving definitions are appended. Duplicate upload definitions fail before any upload is signed. Strict `active` option configuration and approved component availability replace unsupported client `available` fields. Price input uses exact integer piastres; excessive decimals, unsafe integers, invalid negative values and unsupported exponent/comma syntax are rejected.
- Category relationship changes use a hidden internal revision fence on only the referenced categories. Product/component insertion and reparenting contend on the same records inside transactions, preventing write-skew without locking unrelated requests. Catalog audit failure rolls back the business mutation. Audit summaries include field names/counts and revisions, never private field values or upload contents.
- Imports remain insert-only for catalog data. Each batch is bounded to 1–100 operations and requires a transaction-capable guarded database. Category relationship fences are internal metadata; merchant fields/timestamps/IDs/prices/configurations are preserved. All records are schema-validated before collection/index creation. Each acknowledged committed batch is journaled; aborted transaction prefixes count as zero. Unknown commit outcomes are labelled uncertain and must not be guessed. Session/report cleanup errors do not erase known committed progress. Re-running the same reviewed plan preserves committed records and resumes missing inserts.
- Account-action secrets are removed when sent/dead/uncertain/expired/consumed/replaced. Queued/failed action erasure shares the account transaction; active SMTP leases remain intact. Expired dispatched leases become uncertain and cannot be reclaimed for resend even when more leases exist than the maintenance batch limit. Retryable failures retain only the secret still needed for a valid bounded retry.

## Isolated verification workflow

Run commands from their respective folders. The backend runner removes inherited MongoDB/provider settings, disables dotenv/preload options and starts fresh loopback database fixtures under ignored `server/.cache/`. The fixture helper independently refuses inherited application/import URIs or an existing connection. Browser runners allowlist only OS/browser environment, use separate local ports, and disable Vite dotenv loading. The connected fixture endpoints/storage adapter are test-only, require explicit isolated flags and never run as part of the application.

```powershell
# server/
npm.cmd test
npm.cmd run check
npm.cmd run catalog:import       # offline default; no --apply
npm.cmd run catalog:identities   # offline default; no --inspect or --apply

# client/
npm.cmd test
npm.cmd run test:contracts
npm.cmd run lint
npm.cmd run test:seo
# For an isolated verification build, use a process without merchant variables:
$env:NODE_OPTIONS=''
$env:TAP_WRAP_ISOLATED_TEST='true'
$env:VITE_API_BASE_URL='http://127.0.0.1:4091/api/v1'
$env:VITE_META_ENABLED='false'
$env:VITE_SEO_INDEXING_ENABLED='false'
npm.cmd run build
```

Main browser fixtures use frontend 5191 and intercept API requests; connected tests use frontend 5192, real API 4092 and a new disposable replica set. Neither reuses existing servers. Outputs stay under ignored `test-results/`, `test-results-contracts/`, `.cache/`, `dist/` or `local-data/`. Real provider delivery, Atlas behavior and live merchant media remain unverified.

## Existing category identity compatibility and separately authorized procedure

No existing staging inspection or metadata migration was performed. Old categories can be matched safely using their original `catalogSource` relationships and stable product/component IDs even after merchant name/slug edits. Labels alone are not identity. Multiple candidates, changed original workbook grouping, inconsistent parents or unproven collisions fail closed for manual review.

An optional metadata backfill requires separate authorization for live inspection, then separate authorization for application. Do not execute the following commands under the current Batch 1 permission. Use a scoped staging principal, transaction-capable dedicated database named exactly `tapandwrap_staging`, a non-production command environment, a backup/recovery point and no concurrent merchant edits/import jobs. Supply `CATALOG_IMPORT_STAGING_URI` privately in the operator's terminal; these commands never load `.env` or fall back to `MONGODB_URI`.

1. Run the two offline defaults above. Preserve the source workbook and zero-invalid validation report.
2. **After separately authorized existing-database read**, from `server/`:

```powershell
npm.cmd run catalog:identities -- --inspect --target staging --confirm-staging --report local-data/category-identity-review.json
```

3. Review all proposals/IDs/source evidence, expected names/slugs/parents/revisions and workbook SHA-256. Any issue blocks application; do not edit reports to force a match. The compatibility resolver remains usable without backfilling keys.
4. **After separately authorized metadata write**, preserve the reviewed input and use a different output:

```powershell
npm.cmd run catalog:identities -- --apply --reviewed local-data/category-identity-review.json --target staging --confirm-staging --confirm-category-identities --report local-data/category-identity-applied.json
```

The guarded transaction rechecks the entire reviewed plan and updates only immutable source keys plus internal `__v`; merchant names/slugs/IDs/relationships/timestamps remain intact. Stale or ambiguous review aborts all metadata changes. Repeating an already applied reviewed mapping is idempotent. Index creation is explicit and guarded. Do not automatically run a catalog import afterward.

If a later, separately authorized insert-only reimport is interrupted, preserve its journal/workbook hash, distinguish uncertain commits from rollback, inspect the reviewed report and rerun the same validated workbook/flags/report through the guarded command. It rechecks stable identities and preserves existing merchant edits. It does not delete/roll back merchant data, publish drafts, approve prices/stock or upload images.

## Risks controlled and remaining actions

The revision requirement is an intentional API contract change: release matching frontend/backend together and reload pre-existing editor tabs. Hidden category fences add bounded transaction writes and can cause legitimate concurrent relationship changes to retry/conflict; this is covered by race tests. Imports now require replica-set transactions instead of standalone MongoDB. Owner-scoped legacy cache hashing preserves public keys and existing invalidation behavior, with actual QueryClient regression tests. Old internal notes remain stored but withheld from customers. Owner-stable revalidation preserves unsaved purchase inputs; real identity changes deliberately discard private account state.

No existing database behavior, migration, provider delivery or launch approval has been verified. Any live category backfill, staging smoke checks, deployments and launch activation need separate authorization. Batch 2 should begin only after review of these local gates and a separate instruction; its exact finding scope should be supplied rather than inferred.

## Exact source/test/documentation file manifest

**95 files: 29 created and 66 modified.** Ignored logs, browser traces, build output, disposable database files and offline reports are not source changes.

### Created

- `client/connected-e2e/contracts.spec.js`
- `client/e2e/admin-revision.spec.js`
- `client/e2e/batch1-auth.spec.js`
- `client/e2e/commerce-contract-helpers.spec.js`
- `client/playwright.contract.config.js`
- `client/scripts/run-browser-tests.js`
- `client/scripts/run-contract-tests.js`
- `client/src/admin/EditConflict.jsx`
- `client/src/auth/cache.js`
- `client/src/auth/password.js`
- `client/src/auth/session.js`
- `client/src/auth/SessionProvider.jsx`
- `client/src/commerce/money-input.js`
- `client/vite.contract.config.js`
- `docs/BATCH_1_HARDENING.md`
- `server/scripts/category-identities.js`
- `server/src/catalog/category-import-identity.js`
- `server/src/catalog/category-integrity.js`
- `server/src/catalog/import-report.js`
- `server/src/commerce/order-presentation.js`
- `server/src/utils/admin-revision.js`
- `server/src/utils/password.js`
- `server/test/batch1-auth.test.js`
- `server/test/batch1-import-concurrency.test.js`
- `server/test/batch1-inventory-revision.test.js`
- `server/test/batch1-notification-retention.test.js`
- `server/test/batch1-order-presentation.test.js`
- `server/test/batch1-test-boundaries.test.js`
- `server/test/helpers/connected-api-server.js`

### Modified

- `.gitignore`
- `AGENTS.md`
- `client/e2e/catalog-fixtures.js`
- `client/e2e/catalog-preview.spec.js`
- `client/e2e/commerce-fixtures.js`
- `client/e2e/commerce.spec.js`
- `client/e2e/website-admin.spec.js`
- `client/package.json`
- `client/playwright.config.js`
- `client/src/App.jsx`
- `client/src/commerce/AdminEditors.jsx`
- `client/src/commerce/api.js`
- `client/src/commerce/CartContext.jsx`
- `client/src/commerce/ConfiguredFields.jsx`
- `client/src/components/AccountActions.jsx`
- `client/src/components/RequireAdmin.jsx`
- `client/src/main.jsx`
- `client/src/pages/AccountRecoveryPage.jsx`
- `client/src/pages/AdminCommercePage.jsx`
- `client/src/pages/AdminOrderPage.jsx`
- `client/src/pages/AdminProductConfigurationPage.jsx`
- `client/src/pages/AdminProductFormPage.jsx`
- `client/src/pages/AdminWebsitePage.jsx`
- `client/src/pages/AuthPage.jsx`
- `client/src/pages/CheckoutPage.jsx`
- `client/src/pages/CustomizationPage.jsx`
- `client/src/pages/OrdersPage.jsx`
- `client/src/services/api.js`
- `client/vite.config.js`
- `README.md`
- `server/package.json`
- `server/scripts/import-catalog.js`
- `server/scripts/run-tests.js`
- `server/src/app.js`
- `server/src/catalog/import-catalog.js`
- `server/src/catalog/import-workbook.js`
- `server/src/catalog/service.js`
- `server/src/catalog/validation.js`
- `server/src/commerce/configuration.routes.js`
- `server/src/commerce/inventory.js`
- `server/src/commerce/notifications.js`
- `server/src/commerce/orders.js`
- `server/src/commerce/ownership.js`
- `server/src/commerce/promotions.js`
- `server/src/commerce/routes.js`
- `server/src/email/account-actions.js`
- `server/src/middleware/auth.js`
- `server/src/models/AdminAudit.js`
- `server/src/models/BundleRule.js`
- `server/src/models/Category.js`
- `server/src/models/DiscountCode.js`
- `server/src/models/NotificationEvent.js`
- `server/src/models/Product.js`
- `server/src/routes/account.routes.js`
- `server/src/routes/admin-catalog.routes.js`
- `server/src/routes/auth.routes.js`
- `server/src/website/service.js`
- `server/test/catalog-api.test.js`
- `server/test/catalog-import.test.js`
- `server/test/catalog-phase1b.test.js`
- `server/test/commerce-configuration-api.test.js`
- `server/test/commerce-configuration.test.js`
- `server/test/commerce-orders.test.js`
- `server/test/helpers/database.js`
- `server/test/phase3-account.test.js`
- `server/test/website-admin.test.js`
