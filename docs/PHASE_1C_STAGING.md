# Phase 1C: safe staging preparation

Phase 1C prepares a dedicated `tapandwrap_staging` database and an authenticated catalog preview. It does not create Atlas services, connect to production, import the catalog persistently, upload images, publish products, or activate checkout. The existing JavaScript `client/` and `server/` structure, authentication and design remain in place.

## Verified source

The workbook remains `local-data/TapAndWrap_Website_Product_Master.xlsx`. The Phase 1C validation report is `local-data/catalog-import-phase1c-report.json`; both stay Git-ignored.

| Classification | Count |
| --- | ---: |
| Source entries | 1,680 |
| Product candidates | 1,595 |
| Separate components | 85: 80 customization options and five packaging candidates |
| Categories | 209: 12 main categories and 197 subcategories |
| Image references | 4,139 |
| Distinct flagged rows | 423 |

Flag reasons overlap: 310 Medium-confidence rows, 195 grouping reviews, 43 customization-configuration reviews, seven variant-grouping candidates and five packaging candidates. Their counts must not be added to obtain the 423-row total. No uncertain record is merged, reclassified, deleted or published.

Imports retain stable source IDs, classifications, category relationships and the selected main image as gallery item one. Missing prices remain missing; imported tracked quantities remain provisional at 10. Prices and inventory are unapproved, customization is not inferred, and drafts stay outside public APIs.

## Dedicated staging configuration

Use these runtime settings in the existing environment configuration. Never commit `.env`, paste credentials into documentation or print a URI.

| Setting | Staging value |
| --- | --- |
| `DATABASE_TARGET` | `staging` |
| `MONGODB_URI` | Dedicated URI with the explicit database path `/tapandwrap_staging` |
| `STAGING_PREVIEW_ENABLED` | `true` |
| `SESSION_SECRET` | Existing securely generated secret, at least 32 characters |
| `CLIENT_ORIGIN` | Exact frontend origin allowed by the existing security middleware |

The permitted staging database name is exactly `tapandwrap_staging`, not an arbitrary name ending in `_staging`. Production database targets are rejected. Local development remains restricted to the loopback `tapandwrap_dev` target. Connection diagnostics identify readiness and configuration problems without exposing credentials.

Starting the API against staging creates validated collections and indexes; signing in also writes sessions. Run those operations only after staging setup is authorized. The preparation task did not start an API connected to Atlas.

An authorized operator must configure Atlas separately: use a database user limited to `readWrite` on `tapandwrap_staging` and allow only the specific trusted development/backend IP addresses. Do not add `0.0.0.0/0`. Follow the official [Atlas IP access-list instructions](https://www.mongodb.com/docs/atlas/security/ip-access-list/) and [connection instructions](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/). No external service or network-access change was made during this task.

From `server/`, `npm run staging:check` validates staging configuration offline. It does not connect to MongoDB or write catalog records. A successful offline check does not prove Atlas credentials, connectivity or privileges work.

## Authenticated preview and existing integration

An existing, legitimately provisioned administrator uses `/admin/products/:id/preview`. The frontend verifies the existing session and server admin authorization before fetching `GET /api/v1/admin/products/:id/preview`. The endpoint additionally requires the staging preview setting and the validated dedicated staging target. No demonstration login or authorization bypass is provided.

The preview displays saved product information, source ID, classification, category/subcategory, approval state and gallery ordering. Unapproved prices remain hidden. Ordering and Customize This execution are disabled. The preview returns no customer information or raw storage keys; its private query is discarded when unused. Admin documents and responses carry no-index/no-archive and no-store protections. Cloudflare hosting must honor the included static-asset headers; see [Workers static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/).

The existing admin table and editor link to saved-record previews. Product requests remain paginated at 20; category relationships, server filtering/sorting, approval controls, tracked versus Made by Request inventory and explicit homepage selections retain their existing API contracts. Best Sellers remains limited to eight eligible admin-selected products. Public visibility still requires Ready publication, approved prices/inventory, resolved review flags and active categories. Preview access grants none of those approvals.

## Media preparation

The clean photos stay outside the repository in `tapandwrap-Photos-CLEAN`. Relative object references remain unchanged in the catalog; neither binary photos nor the full image collection are copied into `client/public`.

An approved HTTPS `CATALOG_MEDIA_BASE_URL` can later map safe relative references to public image URLs. It does not upload or verify files. Until media setup is authorized, numbered preview placeholders retain every saved image position and identify the selected main photo. R2 configuration and uploads belong to a later phase.

## First staging import: only after explicit authorization

Before applying anything, the user must authorize the persistent import into the dedicated staging database. Do not execute the apply command as part of preparation. Confirm the intended Atlas deployment, scoped user, trusted IP access, source report and any existing staging text-index migration separately. An older `product_search` text index requires a reviewed migration; the application does not automatically drop it.

In PowerShell, start from the project root and enter the dedicated staging URI through a masked prompt. The URI must name `tapandwrap_staging` explicitly. These environment values apply only to this terminal:

```powershell
cd server
$stagingUriSecure = Read-Host 'Dedicated tapandwrap_staging MongoDB URI' -AsSecureString
$env:MONGODB_URI = [System.Net.NetworkCredential]::new('', $stagingUriSecure).Password
$env:CATALOG_IMPORT_STAGING_URI = $env:MONGODB_URI
$env:NODE_ENV = 'development'
$env:DATABASE_TARGET = 'staging'
$env:STAGING_PREVIEW_ENABLED = 'true'
Remove-Variable stagingUriSecure
npm.cmd run staging:check
npm.cmd run catalog:import -- --dry-run --report local-data/catalog-import-first-staging-preflight.json
```

Inspect the report before proceeding: expect the counts above, unchanged flagged classifications and preserved selected-image ordering. Resolve validation errors rather than guessing missing information. The importer reads only `CATALOG_IMPORT_STAGING_URI` for application; it never falls back to `MONGODB_URI` or loads `.env`. `NODE_ENV=production` is rejected, and the URI and connected database are checked before writes.

Only after the explicit authorization and successful validation, run:

```powershell
npm.cmd run catalog:import -- --apply --target staging --confirm-staging --batch-size 50 --report local-data/catalog-import-first-staging-apply.json
```

Review that application report and use the authenticated admin preview to inspect saved rows, relationships and image order. Repeat imports preserve existing records and merchant-edited prices, inventory, names, configurations and publication. Changed source fingerprints or classifications are reported for review. Controlled batches and unique identifiers prevent duplicate records.

Application is insert-only for existing-record preservation. It does not overwrite or delete existing records and does not provide a general rollback command. If an interrupted import inserted a partial catalog, a validated repeat import fills missing records while preserving existing ones; deletion or rollback would require a separate reviewed and authorized procedure.

When this terminal is no longer needed, remove the URI values without printing them:

```powershell
Remove-Item Env:MONGODB_URI, Env:CATALOG_IMPORT_STAGING_URI
```

## Remaining operator actions and verification

Remaining prerequisites are the authorized dedicated Atlas setup, secure runtime secrets/origin, legitimate administrator provisioning and explicit persistent-import approval. Real photo display additionally needs approved media setup. Merchant pricing, stock approvals, grouping decisions and personalization/customization configuration remain outstanding review work.

Automated verification uses disposable local backend fixtures and intercepted frontend API fixtures, never a persistent merchant database. Backend tests passed 82/82; frontend tests passed 40/40. Frontend lint and the production build passed. The fresh dry-run also passed offline Mongoose validation for all 1,595 products, 85 components and 209 categories. The initial frontend run exposed Vite replacing protected-document no-store headers with no-cache; the scoped header fix passed the full browser suite.

Run `npm test` and `npm run check` in `server/`; run `npm test`, `npm run lint` and `npm run build` in `client/`. Atlas connectivity and the first persistent staging import remain unexecuted prerequisites, not claimed test successes.

## Changed source files

Generated build/test artifacts and the ignored local dry-run report are separate from these source changes.

| Area | Created | Modified |
| --- | --- | --- |
| Instructions | `docs/PHASE_1C_STAGING.md` | `AGENTS.md`, `README.md`, `docs/PHASE_1A_CATALOG.md` |
| Server setup | `server/src/config/database-safety.js`, `server/scripts/check-staging.js` | `server/.env.example`, `server/package.json`, `server/src/config/env.js`, `server/src/config/db.js`, `server/src/app.js` |
| Import and catalog | `server/src/catalog/staging-preview.js` | `server/scripts/import-catalog.js`, `server/scripts/run-tests.js`, `server/src/catalog/import-catalog.js`, `server/src/catalog/service.js`, `server/src/routes/admin-catalog.routes.js`, `server/src/routes/auth.routes.js` |
| Backend tests | `server/test/database-safety.test.js`, `server/test/database-connection.test.js`, `server/test/staging-config.test.js`, `server/test/staging-preview.test.js` | `server/test/catalog-import.test.js` |
| Preview interface | `client/src/pages/AdminProductPreviewPage.jsx`, `client/public/_headers` | `client/src/App.jsx`, `client/src/pages/ProductPage.jsx`, `client/src/pages/AdminProductsPage.jsx`, `client/src/pages/AdminProductFormPage.jsx`, `client/src/services/catalog.js`, `client/src/admin.css`, `client/src/catalog.css`, `client/vite.config.js` |
| Browser tests | `client/e2e/catalog-preview.spec.js` | `client/e2e/catalog-fixtures.js` |
