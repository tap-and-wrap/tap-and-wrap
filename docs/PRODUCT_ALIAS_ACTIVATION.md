# Permanent product addresses — activation gate

## Current local runtime contract — Remediation 3, 17 October 2026

**This section supersedes the expiring-map runtime/build instructions below.**
Those instructions are retained as history, not a daily operating procedure.
Production has not been changed or independently inspected during remediation.

Permanent URL resolution now uses the existing API/registry on every product
document request. `GET /api/v1/public/product-addresses?slugs=...` accepts one to
twenty valid slugs and returns only requested/canonical paths plus an opaque
approved-content/revision/commerce fingerprint, or `notFound`. Hidden, withdrawn,
deleted and category-restricted owners cannot grant a public path. The endpoint
performs no writes, tracking, approval, registration or export of product details.

The Worker uses a four-second deadline, bounded response validation and zero
positive/negative cache TTL. API and document responses are no-store. Its fetch
also explicitly disables status-based Cloudflare caching and rejects positive-Age
or HIT/STALE/UPDATING authority responses. No visitor cookies, authorization or
query parameters are forwarded. Unknown owners return HTTP 404; registered aliases
return HTTP 308 preserving queries; canonical public products return HTTP 200.
API outage, corrupt/conflicting authority or missing required shell assets returns
no-store/noindex HTTP 503, with no stale-product fallback. Mapping or SEO publication
expiry alone no longer makes a public product fail. Existing orders/admin private
shells are independent of this lookup.

Registered ownership is respected even if new canonical allocation is switched
off. The flag still controls new canonical allocation; it cannot reassign reserved
addresses or erase existing canonical presentation. Renaming an already registered
product reserves its new stored slug and retains its canonical address. Keep
`PRODUCT_ALIASES_ENABLED=true` operationally after activation so new products also
receive reservations. Do not delete registry rows or use direct catalog writers.

An ordinary `npm.cmd run build` always generates the neutral `spa.html` fallback
and runtime-routing declaration. No `--product-compatibility` argument, production
registry dump or daily map rebuild is required. Historical optional maps are never
used to authorize public product access. The old validation helper remains for
archival input validation only. Emergency product withdrawals resolve canonical
owners through the live authority too, including aliases absent from any export.

Indexing remains a separate approval. Current approved static product content
must match the API fingerprint and a fresh, reviewed publication ID. Product and
category write revisions prevent withdrawal/reopening from reviving an old
publication; the fingerprint also binds the checkout gate. Missing/outdated
fingerprints downgrade public products to a noindex shell with their canonical
URL, without exposing old prices/schema. Revision binding is conservative: even
bookkeeping revisions can require an approved SEO refresh, while browsing stays
available. The ordinary product API does not expose routing revisions.

Approved exports now include `routingVersion`, with category revision inputs, and
explicit publication rejects older exports without it. The production SEO-export
prohibition is unchanged. Do not bypass it to enable indexing. Obtain a separately
authorized reviewed publication through the existing permitted process first.
`sitemap.xml` is now an index of bounded `sitemaps/N.xml` pages. Each page checks
current product dependencies before advertising URLs; failed checks return 503
for that sitemap rather than stale product links. Prelaunch robots still disallow
indexing and disabled indexing produces an empty sitemap.

Future separately authorized deployment dependencies: deploy the compatible API
before the matching Worker/assets; verify HTTPS API reachability, schema/indexes
and approved catalog visibility; build/deploy the complete Worker Static Assets
artifact, including `spa.html`; preserve all launch/indexing defaults. Optional
Worker-only `PRODUCT_ADDRESS_API_ORIGIN` defaults to `https://api.tapandwrap.net`
and, if supplied, must be an exact HTTPS origin without credentials/path/trailing
slash. It is not a secret and is never inferred from visitor input. No new binding
or service is required; `ADDRESS_SERVICE` is an injectable fixture/service-binding
interface, not a production prerequisite. Verify cache bypass and no forced stale
response rules on both the authority endpoint and frontend documents. Measure cold
and warm API latency against the deadline. Verify actual Workers Static Assets,
GET/HEAD/queries/unknown/withdrawn routes before any authorized activation. Do not
roll back to a resolver-unaware Worker or omit the new shell.

See [the remediation report](RELEASE_REMEDIATION_3.md) for local tests, limitations
and release dependencies. No deployment, environment change, database operation
against an existing target or live export is authorized by this document.

## Prelaunch Cloudflare HTTP compatibility (16 October 2026)

The owner reports production registry activation with 1,595 products and 3,190
verified reservations. These counts and current database contents were not read
or independently reverified during this HTTP-layer change. Earlier activation
instructions below are historical prerequisites, not instructions to rerun the
migration.

Confirmed cause: `generator.js` builds `productRedirects` only from its approved
SEO catalog, and the Worker requires those destinations in `publicRoutes`.
Browsable drafts have neither entry and therefore previously received the
noindex React shell with HTTP 200 before React redirected them.

The generator now accepts a separate `--product-compatibility` project JSON
file. It is routing evidence, **not an SEO export**. No production exporter gate
was relaxed, no registry read/export tool was added, and no real mapping was
produced. `server/scripts/export-seo-catalog.js` still rejects production and
excludes drafts. The local workbook/name-planning report is not authoritative
and must never be converted into this mapping.

Preparing the real input requires separate authorization for a current,
read-only registry/product/category inspection of the exact production target.
Review each registered address's owner and canonical reservation, legacy-owner
conflicts, deletion/visibility/category eligibility under the current public
browse policy, and completeness against the entire publicly browsable catalog.
Include only products currently public through that policy; a Draft status alone
is insufficient. Keep private review evidence outside the deployable artifact.
Do not infer a destination by removing an identifier suffix.

The strict JSON contract has exactly these top-level keys:

- `version`: `1`.
- `source`: `"reviewed-registered-public-product-addresses"`.
- `origin`: the exact canonical HTTPS website origin supplied to the generator.
- `generatedAt`, `expiresAt`: actual reviewed ISO timestamps, with a positive
  lifetime of at most 24 hours. Choose a separately reviewed refresh cadence.
- `products`: at most 10,000 objects, each containing exactly `canonicalPath`
  (the registered `/products/<slug>`) and `aliases` (registered noncanonical
  product paths, at most 100 per product). Maximum 100,000 total addresses;
  each path is at most 310 characters. Include canonical-only products too.

Only public paths and evidence timestamps/origin enter the manifest. Product
IDs, names, prices, inventory, images, customer data and extra keys are rejected.
Duplicate addresses, cross-owner collisions, chains, external destinations,
conflicts with approved routes, expired/future evidence and `--publish` usage
fail closed. The source label records the review contract; it is not a signature
and does not independently prove database ownership. Deployment review must
establish that provenance.

After separate authorization and review, the future local build sequence is:

```powershell
# From client/. The first command produces the default noindex Vite output.
npm.cmd run build
# Input paths are relative to the repository root. Supply the actual reviewed host.
node scripts/generate-seo.js --product-compatibility local-data/reviewed-product-compatibility.json --site-origin https://OWNER-APPROVED-HOST
```

`--publish` and an approved SEO export are unnecessary for this compatibility
build. If preserving existing approved static product/category snapshots, supply
their separately authorized, current `--input`/`--content` files in the same
generation command; never obtain a production SEO export through a bypass.
Review `client/dist/seo-manifest.json` and `seo-change-report.json`, including
`productCompatibilityChanged`. A later ordinary build omits this mapping: repeat
the reviewed generation step on every deployment build. Mapping removal is also
reported as a deployment change.

With the mapping installed and indexing disabled, registered aliases return
no-store/noindex HTTP 308 with the original query intact; canonical drafts return
the existing no-store/noindex React shell with HTTP 200. GET and HEAD share
statuses/headers and HEAD has no body. React and the existing public API still
load the product and enforce live visibility; no draft HTML snapshot,
Product/Offer schema, indexable route, price or inventory is generated.
Unregistered product URLs return HTTP 404 when the mapping is present. Existing
category routing and approved product snapshots/redirects remain supported.

Expired evidence returns noindex/no-store 503 for its registered product paths;
it is never renewed by rebuilding. `SEO_WITHDRAWN_PATHS` blocks a mapped product's
canonical URL, every alias and customization URL when either its canonical path
or any alias is withdrawn. As with static SEO snapshots, the Worker cannot
observe a database deletion/visibility change instantaneously: authorize an
immediate withdrawal/config deployment and cache purge, then refresh the reviewed
mapping. The live API continues to reject hidden/deleted products in the meantime.

An authorized Cloudflare release must deploy this Worker and the matching built
assets together using the existing `client/wrangler.jsonc` Static Assets binding
and `run_worker_first` routes. Keep `SEO_INDEXING_ENABLED=false`, manifest
`indexingEnabled=false`, robots `Disallow: /`, checkout disabled, and all existing
browser-policy/API configuration. Review expiry/refresh/withdrawal operations
before release. Verify real GET/HEAD redirects, preserved queries, friendly
product rendering, unknown/withdrawn 404s, robots and headers after deployment.
No environment changes, deployment, database access/write, commit or push was
performed for this change; production behavior remains unchanged until an
authorized release with real reviewed mapping evidence.

## Historical implementation and activation preparation

The following describes the original pre-activation implementation state.

Implemented 16 October 2026. **Aliases remain disabled. No existing merchant database was read or written. No persistent indexes, import, commit or deployment were performed.** Tests use only new disposable local fixtures and their own indexes.

`ProductAddress` is a persistent address registry. One unique slug namespace reserves both historic stored slugs and friendly canonical slugs. A partial unique index permits one canonical address per product; an owner index supports bounded DTO/export queries. Addresses are never reassigned or deleted by application code, including when a product is hidden or deleted.

Initial backfill reserves every legacy address before assigning friendly names. Existing canonical reservations always win. New products atomically reserve their legacy slug and one canonical address in the existing product/audit transaction. The first available normalized name wins; collisions use the external catalog identifier, or the MongoDB ID for merchant-created products, with bounded deterministic fallbacks. Names with no ASCII representation use `product-<identifier>` rather than guessing a translation. Concurrent unique-key races retry the whole transaction. A conflicting requested stored slug rejects the mutation instead of taking another product's address.

Renames keep the canonical address. A later explicit stored-slug edit reserves the new stored slug and retains the old reservation in the same transaction. Pre-registry slug history cannot be reconstructed from records that no longer contain it.

Public lookup uses the unique address index and then applies existing product/category/approval visibility checks. Unregistered legacy records still resolve by the existing unique Product.slug index. A registry/legacy owner conflict fails closed; deleted-owner addresses do not fall through to another product. Public listings batch canonical lookups for at most 20 products (related products four). Cart presentation adds only publicPath; cart snapshots, pricing and retention are unchanged. Customization keeps product IDs authoritative.

## Actual offline report

From `server/`, `node scripts/product-aliases.js --dry-run` generated ignored `local-data/product-alias-dry-run.json`:

- Source: local original workbook, **1,595 products**, **0 proposed address collisions**.
- Includes all expected canonical paths, source external IDs, legacy slugs, source checksum and the three needed indexes.
- Example: `/products/baby-footprint-keepsake-gift-box-b6-box-095` → `/products/baby-footprint-keepsake-gift-box`.
- Zero database connections or writes. Workbook identity keys are not production MongoDB IDs. Later merchant edits, current registry reservations and production-only records are **unverified**. This report is deliberately rejected by database apply mode.

Required new indexes on `productaddresses`:

| Name | Keys | Constraint |
| --- | --- | --- |
| product_address_unique | slug: 1 | unique |
| product_canonical_unique | productId: 1 | unique, partial canonical: true |
| product_address_owner | productId: 1, slug: 1 | owner lookup |

## Explicit future authorization required — do not run now

1. Owner separately approves the exact target/host, read scope, backup/restore plan, writer maintenance window, registry collection/index creation, and registry-only backfill. Stop **all** catalog writers. Production must be transaction-capable and use the existing exact `tapandwrap_production` guards; staging is exactly `tapandwrap_staging`.
2. Provide terminal-only `PRODUCT_ALIAS_MIGRATION_URI`; the script never loads `.env` or falls back to `MONGODB_URI`. Production additionally requires `NODE_ENV=production`, `PRODUCTION_DATABASE_AUTHORIZED=true`, the exact approved `PRODUCTION_DATABASE_HOST`, and `--confirm-production`. These settings do not grant authorization by themselves.
3. Obtain a separately authorized current read-only database proposal. Review every entry/count/collision against the actual catalog. Commands below are templates for **future approved execution**, from `server/`:

```powershell
node scripts/product-aliases.js --inspect --target production --confirm-production --confirm-read --report local-data/product-alias-db-review.json
```

4. Only after separate index-write approval, initialize **only the new registry**:

```powershell
node scripts/product-aliases.js --init-indexes --target production --confirm-production --confirm-read --confirm-write --confirm-writers-stopped
```

5. Only after reviewing the database proposal and separate backfill-write approval:

```powershell
node scripts/product-aliases.js --apply --target production --confirm-production --confirm-read --confirm-write --confirm-writers-stopped --reviewed local-data/product-alias-db-review.json --report local-data/product-alias-apply.json
```

The script binds the reviewed target, product identity snapshot and existing reservations. It verifies existing Product indexes and new registry indexes without repairing them; it writes only registry rows in batches of 100. The resulting report must say `verified`, with all batches committed and zero product writes. Stale/edited reviews abort; uncertain or incomplete batches prohibit activation. After interruption, inspect again and review a new report; existing canonical addresses remain reserved. Keep the reviewed file separate from the apply report.

6. Enable `PRODUCT_ALIASES_ENABLED=true` only after verification, first on the separately authorized staging environment. Schema readiness then requires the new indexes. Obtain a fresh approved SEO export with the same flag, separately reviewed media and a fresh reviewed publication ID. The Worker understands reviewed legacy redirects, canonical customization paths, withdrawal overrides and expiry. Publish API/client/Worker changes only under separate deployment approval. Checkout authorization stays independent and disabled.
7. After activation, do not remove the registry, disable resolution, or roll back to a resolver-unaware build: shared canonical URLs must continue working. Freeze catalog writes and retain an alias-aware resolver during recovery. Bulk imports explicitly reject alias-enabled execution; any future import requires an approved maintenance window and a newly reviewed backfill before reactivation. Direct database writers are outside the supported reservation protocol and must remain stopped during migration.

For local/staging rehearsal, substitute `--target local` or `--target staging`, omit `--confirm-production`, and privately supply the matching dedicated URI. Do not reuse an existing merchant database without separate read/write approval. Ordinary startup performs no registry DDL or backfill.

## UI and skip-link outcome

Homepage and product testimonials now share `TestimonialCard` presentation; homepage animation is unchanged. Product controls sit below the native scrolling track; visual scrollbars and artificial minimum card heights are removed. Account-only PageShell layout centers a 500px content area, places the home link above it and underlines only actionable links. Validation, session requests, token handling and password rules are unchanged.

`RouteFocus` targets headings/main content, not the skip link. The modal hook restores its captured opener; header resize only dismisses its drawer. Focus tests distinguish ordinary resizing (skip remains translated offscreen) from intentional keyboard focus (correctly retained and visible across viewport changes). No global blur, resize focus reset or skip-link removal was added. The Edge DevTools chrome itself was not automated.

## Focused verification

Client lint/build and server syntax checks passed. Twenty-six selected backend alias/export cases and all 59 SEO tests passed. Ten selected browser cases reported passing: desktop/mobile account layout and links, recovery submission, ordinary versus keyboard-focused resize, product/legacy/customization deep links, canonical WhatsApp URLs, carousel arrows/keyboard/swipe, and unchanged homepage marquee behavior. Mobile/desktop screenshots were visually inspected.

Initial failures were corrected test setup (missing admin actor), native layout assertions (inline text baseline and grid min-height), and a shared-output race: Playwright cleared test-results while SEO publication tests were using it. The SEO checks passed when run sequentially. The existing Windows Playwright server teardown still hangs after cases finish; runners were interrupted and the isolated Vite port was confirmed closed. A clean browser-command exit is not claimed. No full server or browser suite was run.

## Batch file manifest

- `client/e2e/account-alias-focus.spec.js` (new)
- `client/e2e/storefront-next.spec.js`
- `client/scripts/seo/generator.js`
- `client/scripts/seo/generator.test.js`
- `client/scripts/seo/worker.test.js`
- `client/src/components/CustomerWords.css`
- `client/src/components/CustomerWords.jsx`
- `client/src/components/PageShell.jsx`
- `client/src/components/ProductCard.jsx`
- `client/src/components/PublicContent.jsx`
- `client/src/components/TestimonialCard.jsx` (new)
- `client/src/pages/AccountRecoveryPage.jsx`
- `client/src/pages/AuthPage.jsx`
- `client/src/pages/CartPage.jsx`
- `client/src/pages/CustomizationPage.jsx`
- `client/src/pages/ProductPage.jsx`
- `client/src/seo/metadata.js`
- `client/src/website.css`
- `client/worker/seo-worker.js`
- `docs/PRODUCT_ALIAS_ACTIVATION.md` (new)
- `server/.env.example`
- `server/scripts/export-seo-catalog.js`
- `server/scripts/product-aliases.js` (new)
- `server/src/catalog/import-catalog.js`
- `server/src/catalog/product-addresses.js` (new)
- `server/src/catalog/public-presentation.js`
- `server/src/catalog/service.js`
- `server/src/commerce/cart.js`
- `server/src/commerce/configuration.routes.js`
- `server/src/commerce/routes.js`
- `server/src/config/env.js`
- `server/src/config/schema.js`
- `server/src/models/ProductAddress.js` (new)
- `server/src/routes/catalog.routes.js`
- `server/src/website/service.js`
- `server/test/product-addresses.test.js` (new)
- `server/test/seo-export.test.js`
- `shared/product-paths.mjs` (new)

The generated proposal remains ignored at `local-data/product-alias-dry-run.json`. Existing untracked user files were preserved. No dependencies were added.
