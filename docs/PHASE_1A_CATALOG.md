# Phase 1A: catalog backend and safe import

The JavaScript architecture in the current README and AGENTS.md takes precedence over the older blueprint's TypeScript/pnpm/SSR layout. Phase 1A adds backend data contracts and APIs; it does not change the completed frontend or implement checkout, orders, payments, R2 uploads, or Phase 1B UI.

## Source and classification

The original source is `local-data/TapAndWrap_Website_Product_Master.xlsx`. Keep it unchanged and out of Git. The importer reads the actual `Website Product Master` headers, preserves `Product ID` as `externalCatalogId`, and reconciles image references with `Image Index`. An image reference is not a claim that its file was inspected or uploaded.

| Source role | Rows | Destination |
| --- | ---: | --- |
| Product | 1,545 | Draft Product candidates |
| Customizable Product | 43 | Product candidates requiring eligibility review |
| Variant Product | 7 | Product candidates requiring grouping/variant review |
| Customization Option | 80 | Separate ComponentOption records |
| Gift Packaging | 5 | Separate packaging candidates requiring merchant review |
| Total | 1,680 | 1,595 product candidates and 85 components/packaging candidates |

The workbook contains 4,139 image references, 12 main categories, and 197 distinct subcategory groups. Labels such as `Wallets / Men` remain one audited subcategory label under Accessories; splitting them would invent a hierarchy. Slugs are stable and unique; names/descriptions/source classifications are retained. `Image 1 (Main)` is the first gallery item even when its filename ends in `-02` or another suffix.

Read-only inspection found that all 1,680 SKU, price, compare-at price, stock status, and quantity cells are blank. There are 310 Medium-confidence rows and 195 rows with merchant/variant notes. The distinct union of confidence, notes, and Customizable Product/Variant Product/Gift Packaging roles is 423 review rows. Thirty selected main images are not `-01` files; for example, `B1-TRO-001` (Custom Sports Awards Set) selects `custom-sports-awards-set-02.webp` and `B1-TRO-002` selects `top-performer-acrylic-award-03.webp`.

The seven variant candidates need explicit grouping decisions: `B7-COS-009/010` (KIKO lip colors), `B7-ERW-003` (Swan Drop Earrings), `B7-AUD-010` (Sony speaker), `B7-CAM-007/009` (retro/Instax cameras), and `B7-WTS-003` (Round Smartwatch, also needing brand/model confirmation). Packaging candidates `B6-BOX-026/027/047/063/070` need a decision about component versus standalone sale; `B6-BOX-047` also needs an individual-versus-set decision. All 43 Customizable Product candidates need approved configurations before eligibility is enabled. The ignored local report contains every flagged row's original ID, worksheet row number, reasons, and source notes.

## Models and publication

- **Product** extends the starter's names and fields: `externalCatalogId`, name, unique slug, description, `categoryId`, `subcategoryId`, `mainImageKey`, `galleryKeys`, SKU, `pricePiastres`, `compareAtPiastres`, `priceApproved`, inventory, typed variants, typed personalization fields, explicit customization eligibility/template references, and timestamps. Source notes, confidence, review flags, and import fingerprints are private administrative metadata.
- **Category** supports root/child relationships, globally unique slugs, distinct normalized names within a parent, optional image references, active status, display order, featured selection, and timestamps. Product counts are calculated from the appropriate filtered Product query; components are not counted as products.
- **ComponentOption** preserves option/packaging rows in a separate collection. It cannot be made Ready through the product API and never participates in public product queries.

Persisted product states are `draft`, `ready`, and `hold` (UI labels Draft, Ready, Hold). The starter `published` flag is derived from Ready. Ready requires a valid approved integer price, approved inventory mode/quantity, a selected main image, and resolved catalog review flags; configured variant prices/inventory must also be approved. Public queries require active main/subcategories. Phase 1B retains approved sold-out products publicly with ordering disabled, allowing availability filtering. Imported source publication values never grant approval automatically.

All money is nonnegative integer piastres. Blank prices stay `null`; no price estimates or comparison prices are invented. Imported quantities start at the explicitly requested 10 provisional units, with `inventory.approved=false`. Workbook quantities/stock statuses remain in source metadata for review. `made_to_order` means Made by Request and has `quantity=null`; the stock-policy helper returns zero stock deduction for this mode. It does not create a checkout or stock-mutation endpoint.

Variants and required personalization are bounded structured fields. Source notes do not automatically become variant attributes, required uploads, or engraving eligibility. `Customize This` defaults off. References to customization templates are foundations for a later authorized configuration task; Phase 1A does not implement a builder/template engine.

## API foundation

All routes use the existing `{ ok, data }` / `{ ok:false, error }` convention. Admin routes use existing cookie-session authorization, admin role enforcement, and Origin/CSRF protection for mutations. No public admin signup is added.

| Method | Path under `/api/v1` | Purpose |
| --- | --- | --- |
| GET | `/public/products` | Approved public product cards |
| GET | `/public/products/:slug` | Approved product detail |
| GET | `/public/categories` | Active categories and public product counts |
| GET | `/public/categories/:slug/products` | Approved products in a category |
| GET | `/admin/products` | Paginated administrative cards |
| GET | `/admin/products/:id` | Administrative record detail |
| POST | `/admin/products` | Validated product creation |
| PATCH | `/admin/products/:id` | Allowlisted product edits |
| PATCH | `/admin/products/:id/inventory` | Inventory mode, quantity, approval, availability |
| PATCH | `/admin/products/:id/publication` | Draft/Ready/Hold controls |
| GET | `/admin/categories` | Categories and administrative product counts |
| POST | `/admin/categories` | Category creation |
| PATCH | `/admin/categories/:id` | Category metadata/status/order/featured edits |

Product lists are capped at 20 records, use stable sorting and bounded server-side queries, and omit full galleries, personalization/customization configurations, and private source notes. Search uses a MongoDB text index rather than unindexed regular expressions. Additional category/status/sort indexes support browsing. Admin edits validate full hydrated documents so publication and cross-field invariants run; changing a price or tracked quantity requires approval again. Duplicate-key and concurrent-edit errors return 409.

Product query parameters are `page` (1–200), `limit` (capped at 20), `q`, `category`/`subcategory` (slugs), and `sort` (`newest`, `price_asc`, `price_desc`, `name_asc`, `name_desc`). Phase 1B adds `featured`/`best_sellers` sorts, availability and integer-piastre price filters, merchandising flags, HTTPS media serialization and related products; see [Phase 1B](PHASE_1B_STOREFRONT.md) for current contracts. Admin lists additionally accept `status`, `priceApproved`, `inventoryApproved`, `inventoryMode`, `available`, and `reviewRequired`; boolean query values are `true`/`false`. Category lists accept pagination, `parent=root` or a parent slug, and `featured`; admin category lists also accept `active`. Public categories exclude inactive ancestors and count approved visible products; admin counts include all product candidates, excluding components. Category visibility is calculated once per category-list request and reused for its count aggregation. Public details omit internal variant approval flags; Phase 1B supplies approved tracked quantities for quantity controls, while Made by Request quantities remain null.

## Import operation and safety

From `server/`, run `npm run catalog:import`. Dry-run is the default and uses no database connection. The local report records row issues, review reasons, classification totals, category totals, image reconciliation, and the workbook checksum. The original workbook and image references are never edited.

The default report is `local-data/catalog-import-report.json`. Optional flags are `--dry-run`, `--file <path>`, `--report <path>`, and `--batch-size <1..100>` (default 50); file/report paths are relative to the project root and must resolve inside it. Reports use an existing directory. `--help` lists the supported flags.

Application is restricted to an explicitly confirmed staging target using a dedicated staging URI; production targets/environment are rejected. Never use a production URI or casually relabel one as staging. The CLI must never fall back to application `MONGODB_URI`. No persistent database import was authorized or performed in this task.

Only after explicit authorization, staging application requires all three flags `--apply --target staging --confirm-staging`, a separately configured `CATALOG_IMPORT_STAGING_URI`, and the exact database `tapandwrap_staging`. Phase 1C tightened the previous suffix check; see [staging preparation](PHASE_1C_STAGING.md). The CLI does not load `.env`. The application module independently verifies its connected models share the staging connection, or the named new loopback test database under `NODE_ENV=test`; `NODE_ENV=production` has no override. Complete incoming documents pass asynchronous Mongoose validation before a connection, then again against resolved staging category IDs before catalog records or indexes are written.

Writes use controlled batches and unique source-ID/slug indexes. Existing Product, ComponentOption, and Category records are preserved instead of merging workbook values over merchant prices, stock, names, slugs, publication, or customization. Changed source fingerprints/classifications are reported for review. Invalid or structurally inconsistent data blocks application; no guessed correction or implicit product promotion occurs. A separate explicit source-update/migration workflow would be needed to apply changed source values to existing records.

## Verification and Phase 1B boundary

`npm test` runs existing utility tests plus catalog model, real-index, API authorization, publication, inventory, and importer tests against newly created disposable loopback MongoDB instances. The runner ignores developer `.env` files and clears any existing MongoDB URI. The test binary and generated data stay under `server/.cache/`, which is Git-ignored. First use needs a binary download. `npm run check` checks all backend/source/script/test JavaScript syntax.

Atlas-specific query plans and persistent staging behavior are not claimed to have been verified; that requires an explicitly authorized staging setup. Phase 1B can add catalog/admin UI integration, approved product/media presentation, and merchant review workflows. Image uploads/mapping to public media, actual prices, stock approvals, variant grouping, customization templates, and checkout remain separate authorized work.

### Recorded local verification

- `npm test`: 44/44 passed, including the seven existing utility tests. The initial import test rejected the fixture's default `test` database name; explicitly requesting `tap_wrap_catalog_test` fixed the fixture while retaining the guard.
- `npm run check`: backend/source/script/test JavaScript syntax passed.
- `npm run catalog:import`: 1,680 entries, 1,595 products, 85 components, 209 categories (12 main/197 subcategories), 4,139 master/index image references, zero invalid rows/header errors, 423 review rows, and 30 non-01 selected primary images.
- Offline asynchronous schema validation: all 209 Category, 1,595 Product, and 85 ComponentOption candidates passed with no database connection.
- Runtime and full dependency audits: zero advisories. Frontend files were not changed, so frontend checks were not rerun for this backend task.
- Workbook SHA-256 remained `a8add0210a1b0f625f4583e818471a702ffe2837df4a01605a12b24355d0c2ca`. No persistent database writes, image uploads, orders, payments, commits, pushes, or deployments were performed.

### File manifest

Modified: `.gitignore`, `AGENTS.md`, `README.md`, `server/package.json`, `server/src/app.js`, `server/src/config/db.js`, `server/src/models/Product.js`, `server/src/models/Category.js`, and `server/src/routes/admin.routes.js`.

Created:

- `server/package-lock.json`
- `server/src/models/ComponentOption.js`
- `server/src/catalog/fields.js`, `product-policy.js`, `validation.js`, `service.js`, `import-workbook.js`, and `import-catalog.js`
- `server/src/routes/catalog.routes.js` and `admin-catalog.routes.js`
- `server/scripts/check.js`, `run-tests.js`, and `import-catalog.js`
- `server/test/helpers/database.js`, `server/test/catalog-models.test.js`, `catalog-api.test.js`, and `catalog-import.test.js`
- `docs/PHASE_1A_CATALOG.md`
- `local-data/catalog-import-report.json` (local only, Git-ignored)

Implementation references: [Mongoose 8 validation](https://mongoosejs.com/docs/8.x/docs/validation.html), [read-excel-file](https://github.com/catamphetamine/read-excel-file), and [isolated MongoDB test helper](https://typegoose.github.io/mongodb-memory-server/docs/guides/quick-start-guide/).
