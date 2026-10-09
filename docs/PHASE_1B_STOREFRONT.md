# Phase 1B: storefront and admin catalog integration

Current UI conventions are superseded by [Batch 2](BATCH_2_FRONTEND.md): public filters have three accordions (Category, Availability, Price), decimal EGP text inputs and no slider or separate subcategory control. Nested category URLs and backend relationships remain intact. Optional `includePriceRange=false` skips the unused aggregation without changing pagination or eligibility. The original phase record below remains historical.

The project remains JavaScript/JSX with separate React/Vite `client/` and Node/Express/Mongoose `server/` npm installations. Phase 1B connects catalog presentation and product management to the existing Phase 1A APIs. It does not create a cart, checkout, payment, file-upload or R2-upload implementation.

The supplied transparent logo, fonts and white-led design tokens remain the visual foundation. The catalog has not been imported into a persistent database, and the audited workbook contains no approved merchant prices or stock.

## Frontend routes and behavior

- `/shop`: server pages of 20, submitted product-name search, category/subcategory and availability filters, dual-handle price controls plus EGP inputs, all seven sorts, accurate server totals, and loading/error/empty states. URL prices are integer piastres; search, applied filters, sort and page are stored in the URL. Mobile uses accessible native modal filters and a sorting bottom sheet, with keyboard containment, Escape and opener focus restoration. Cards use two columns on phones and four on wide desktop.
- `/products/:slug`: ordered image gallery, configured variant prices/availability, quantity bounded by approved tracked stock, independent required personalization, description/detail/shipping accordions, an honest unavailable-reviews area, up to four recommendations, and a sticky options bar after the purchase section leaves the viewport. Eligible Customize This links lead to the existing future-release route. Uploads and cart submission remain unavailable.
- `/admin/products`, `/admin/products/new`, `/admin/products/:id/edit`: server-verified protected listing, search/filter/sort/pagination, validated add/edit forms, explicit price and inventory approval, publication, SKU, variants, image-reference ordering/main selection and homepage merchandising selections. Editing prices or inventory clears the corresponding approval in the form. Existing personalization/customization and original source metadata are omitted from saves and remain preserved.
- Homepage: featured categories use the existing featured category API, while Best Sellers displays at most eight available, eligible products explicitly selected by an administrator. Category feature management remains available through the protected category API; a category-management screen is a later task.

Required image personalization is displayed as an unavailable-upload notice rather than a fake file input. Product cards link to product details when purchase processing would be needed, and product Add to Cart controls remain disabled. No successful cart state or animation is simulated.

## Public catalog contract

All endpoints retain the existing `{ ok: true, data: ... }` response envelope and structured errors. An unavailable database returns HTTP 503 instead of silently exposing development products. There is no public draft-preview endpoint.

| Method | Path under `/api/v1` | Response |
| --- | --- | --- |
| GET | `/public/products` | Lightweight product cards, pagination and price range |
| GET | `/public/categories/:slug/products` | The same product response scoped to a category |
| GET | `/public/products/:slug` | One approved product with options and up to four related cards |
| GET | `/public/categories` | Active categories, public product counts and safe category image URLs |

Product query parameters:

| Parameter | Values and behavior |
| --- | --- |
| `page` | Positive integer, 1–200; defaults to 1 |
| `limit` | Positive integer, capped at 20; defaults to 20 |
| `q` | Product-name text search, up to 100 characters; descriptions are not searched |
| `category` | Main-category or subcategory slug |
| `subcategory` | Subcategory slug; must belong to the selected main category |
| `availability` | `available` or `sold_out`, based on approved inventory and variant availability |
| `minPrice`, `maxPrice` | Nonnegative integer piastres; minimum must not exceed maximum |
| `sort` | `featured`, `best_sellers`, `newest`, `price_asc`, `price_desc`, `name_asc`, `name_desc` |
| `featured`, `bestSeller` | Explicit `true`/`false` merchandising filters |

Every sort has a stable `_id` tie-breaker. Featured and Best Sellers use explicit administrator selection and display order, not inferred sales statistics. The homepage feed uses `bestSeller=true`, `availability=available`, `sort=best_sellers` and a limit of eight. A public request with `bestSeller=true` is capped at eight even if it requests a larger limit.

List pagination is `{ page, limit, total, pages }`. `total` is the complete server-side filtered count. `priceRange: { min, max }` contains integer piastres for the current search/category/availability/selection filters while ignoring active price bounds. An empty range has `null` values. Products are never downloaded as a complete catalog for React to filter.

Category queries support pagination, `parent=root` or a parent slug, and `featured=true|false`. Main categories and their active children are returned through the same paginated endpoint. Counts include approved visible Product records and exclude ComponentOption records.

### Lightweight cards and product details

Public cards contain `_id`, name, slug, `category`/`subcategory` objects (`_id`, name, slug), `mainImageUrl`, approved `pricePiastres`, optional `compareAtPiastres`, `priceApproved`, `featured`, `bestSeller`, `orderingAvailable` and `requiresOptions`. They omit full galleries, variant arrays, personalization/customization configurations and private source notes.

Product details add description, `galleryUrls`, approved inventory, configured variants, personalization fields, customization metadata and `relatedProducts` with at most four same-category approved cards. Each variant exposes its key, attributes, effective approved price, approved inventory and ordering availability. A variant without a price override inherits the approved product price. No source notes or internal variant-approval flags are returned.

Personalization and customization remain independent. A configured required message can exist while `Customize This` eligibility is disabled. Customization eligibility requires explicit stored template/service configuration; the page integration does not implement a template editor, customer upload or final customization pricing.

Storage keys remain in MongoDB as references, never binary images. Public APIs do not return `mainImageKey`, `galleryKeys` or category `imageKey`. Only an explicitly configured `CATALOG_MEDIA_BASE_URL` with HTTPS, no URL credentials, and no query/hash can turn safe relative keys into public URLs. Without it, product image URLs are `null`, galleries are empty, and category image URLs are `null`. Supplying a base URL does not upload or verify an image. Original files and selected gallery order remain unchanged.

## Publication and inventory

Public products require Ready status, approved integer prices, approved inventory, resolved review flags, approved configured variant prices/inventory, and active main/subcategories. Draft, Hold, unapproved and unresolved catalog entries remain private.

Approved sold-out products remain visible so cards and availability filters can represent them honestly. Visibility and ordering availability are separate: unavailable inventory or tracked quantity zero prevents ordering. Made by Request uses the existing `made_to_order` token and `quantity=null`; it never deducts tracked stock. Parent availability still controls the whole product, and a product with configured variants needs at least one orderable variant.

New tracked products default to quantity 10 with provisional inventory. Changing price, compare-at price, inventory mode, quantity or availability requires approval again unless an authorized administrator explicitly approves that same edit. A Ready product cannot retain an invalid approval state; save validation rejects the change or the administrator must return it to Draft. No provisional price is presented as an approved public price.

There is no successful Add to Cart processing in this phase. Product-card purchase actions lead to product details where processing is required. The real cart animation, cart mutation, purchase submission and checkout remain for later implementation.

## Protected administrative contracts

The existing cookie session, active user and administrator role checks protect catalog administration. Mutation endpoints additionally require the existing signed CSRF token and allowed Origin. Customers cannot obtain administrator rights through public signup, and no demonstration admin login is provided. Auth session verification and admin readiness checks return a prompt unavailable response when the catalog database is disconnected.

| Method | Path under `/api/v1` | Purpose |
| --- | --- | --- |
| GET | `/admin/products` | Search/filter/sort/paginate administrative records, maximum 20 |
| GET | `/admin/products/:id` | Full administrative product detail |
| POST | `/admin/products` | Allowlisted product creation |
| PATCH | `/admin/products/:id` | Validated edits and merchandising selection |
| PATCH | `/admin/products/:id/inventory` | Inventory mode, quantity, approval and availability |
| PATCH | `/admin/products/:id/publication` | Draft/Ready/Hold control |
| GET/POST | `/admin/categories` | Paginated category listing and creation |
| PATCH | `/admin/categories/:id` | Category metadata, image reference, activation, order and featured selection |

Admin lists support the public product filters plus `status`, `priceApproved`, `inventoryApproved`, `inventoryMode`, `available` and `reviewRequired`. Boolean query parameters use `true`/`false`. Admin category lists also support `active`.

Editable merchandising fields are `featured`, `featuredOrder`, `bestSeller` and `bestSellerOrder`; selection defaults to false and order defaults to zero. Display orders are nonnegative integers. Bestseller selection is an explicit merchant decision and creates no sales count or ranking claim.

Updates validate hydrated documents, retain optimistic concurrency checks and reject unknown fields. Omitted personalization and customization configurations remain stored unchanged. Inventory edits preserve required validation and reset approvals appropriately. Existing gallery references remain administrative data: selecting a main image places it first, and reordering must retain the main-image/gallery invariant. This phase does not delete original images or upload replacement files.

## Catalog review: components and flagged rows

The Phase 1A report contains 1,680 source entries: 1,595 Product candidates and 85 separate ComponentOption candidates. The latter are exactly **80 Customization Option rows plus five Gift Packaging rows**. They are not 85 independently sellable products, and their classification has not been changed.

The 423 distinct flagged rows are an overlapping union of the following reasons, not the sum of these counts:

| Review reason | Rows |
| --- | ---: |
| Medium catalog confidence | 310 |
| Variant or customization grouping requires review | 195 |
| Customization configuration requires merchant approval | 43 |
| Variant product grouping requires merchant approval | 7 |
| Gift packaging held as component | 5 |

The seven variant candidates are `B7-COS-009/010` (KIKO lip colors), `B7-ERW-003` (Swan Drop Earrings), `B7-AUD-010` (Sony speaker), `B7-CAM-007/009` (retro/Instax cameras), and `B7-WTS-003` (Round Smartwatch, also requiring brand/model confirmation).

The five packaging candidates are `B6-BOX-026` (White Ribbon Mini Gift Box), `B6-BOX-027` (Pearl-Decorated Mini Gift Box), `B6-BOX-047` (Personalized White Round Gift Box Set), `B6-BOX-063` (Red Stacked Round Gift Box Set) and `B6-BOX-070` (Pink Custom Ribbon Hatbox). Merchant review must decide whether each remains a component or becomes a standalone offering; `B6-BOX-047` also needs an individual-versus-set decision. No uncertain row has been automatically merged, published, deleted or reclassified. All 43 customizable candidates still need explicit approved configurations before eligibility is enabled.

The source retains 12 main categories, 197 subcategories and 4,139 image references. The local Git-ignored report at `local-data/catalog-import-report.json` lists original IDs, reasons and source notes. See [Phase 1A](PHASE_1A_CATALOG.md) for audited category totals, import safety and primary-image preservation.

## Staging prerequisites and remaining phases

A real catalog preview requires an explicitly authorized local/staging database, an approved catalog-import operation, a configured session secret and allowed frontend origin, and legitimate administrator provisioning. These are operational prerequisites, not work performed automatically by the frontend. Production connections and complete persistent imports remain unauthorized.

Merchant review must resolve the flagged records, assign real prices, approve inventory, confirm variant grouping and approve personalization/customization configuration. Public product images additionally require approved media setup and a configured public HTTPS media base. R2 uploads remain outside Phase 1B.

The name-only text index is now `product_name_search`. MongoDB permits only one text index per collection. If an authorized existing staging database already contains the older `product_search` name-and-description index, it needs a reviewed staging index migration before the updated index can be built. The application does not drop that index, perform the migration or connect to an existing database automatically. A fresh database builds the new index directly. Atlas-specific query plans and persistent staging behavior still need authorized verification.

Next-phase work includes the actual cart and purchase flow, required-field submission/upload handling, approved customization/template behavior and pricing, approved media integration, published customer-review infrastructure, and the existing prelaunch SEO strategy. Checkout, orders, payments and R2 uploads remain disabled or unimplemented until separately authorized.

## Verification record

- Backend root verification: **54/54 automated tests passed** and JavaScript syntax checks passed for **38 files**. Tests use newly created disposable loopback MongoDB fixtures, never an existing database or developer credentials.
- New API tests cover all seven sorting modes, name-only search, category/price/availability filters, exact filtered counts and range bounds, selected bestseller limits, public visibility/media serialization, product options/recommendations and protected edits preserving omitted configurations. Existing tests retain authorization, approval, pagination, inventory, model and import checks.
- New presentation tests cover safe public media URLs, approved Made by Request/stock behavior and omission of raw image keys/provisional prices.
- Frontend `npm test`: **33/33 passed** (14 browser interaction tests and 19 pure helper tests), using isolated API fixtures and installed headless Edge. No real database, login provisioning, catalog publication or cart processing is used by these fixtures.
- Browser coverage includes server pagination/filter/sort requests and counts, slider keyboard interaction, Tab/Shift+Tab containment, Escape/focus restoration, loading/empty/error/retry states, ordered gallery, variant price/stock changes, required personalization, independent customization eligibility, sticky options, public draft rejection, customer and server-denied admin access, approval reset, Made by Request editing, CSRF-bearing saves/configuration preservation, and homepage selection limits.
- Frontend `npm run lint` and `npm run build` passed. Product/admin bundles are lazy loaded. Shop, product and admin editor layouts were checked at 320px, 390px and 768px, with a four-column shop at 1440px. No page overflow or uncaught browser exceptions occurred. Desktop shop and mobile product/editor screenshots were inspected.
- Initial browser failures were test-selector mismatches (card class names and exact label text including nested options/help) and insufficient scrolling to move the whole purchase section out of view. Corrected selectors/scrolling passed the complete rerun; no failing checks remain. The sandbox launcher also failed before running commands, so authorized checks used the escalation mechanism.
- The source workbook SHA-256 remains `a8add0210a1b0f625f4583e818471a702ffe2837df4a01605a12b24355d0c2ca`. Its data and the Phase 1A import report were inspected without changing them. `local-data/` and browser artifacts remain Git-ignored.
- No persistent catalog/database writes, R2 uploads, real orders/payments, commits, pushes or deployments were performed by this implementation.

## File manifest

Modified:

- `server/src/models/Product.js`
- `server/src/catalog/product-policy.js`
- `server/src/catalog/validation.js`
- `server/src/catalog/service.js`
- `server/src/routes/auth.routes.js`
- `server/src/routes/admin.routes.js`
- `server/test/catalog-api.test.js`
- `server/scripts/run-tests.js` (isolates public media environment during tests)
- `server/.env.example` (optional public HTTPS media base, blank by default)
- `client/src/App.jsx`, `client/src/main.jsx`
- `client/src/pages/ShopPage.jsx`, `HomePage.jsx`, `AuthPage.jsx`, `StaticPage.jsx`
- `client/src/services/api.js`
- `client/package.json`, `client/package-lock.json`
- `.gitignore`, `AGENTS.md`, `README.md`, `docs/PHASE_1A_CATALOG.md`

Created:

- `server/src/catalog/public-presentation.js`
- `server/test/catalog-presentation.test.js`
- `server/test/catalog-phase1b.test.js`
- `docs/PHASE_1B_STOREFRONT.md`
- `client/src/components/ProductCard.jsx`, `CatalogFilters.jsx`, `CatalogDialog.jsx`, `RequireAdmin.jsx`, `HomeCatalog.jsx`, `HomeCatalog.css`
- `client/src/pages/ProductPage.jsx`, `AdminProductsPage.jsx`, `AdminProductFormPage.jsx`
- `client/src/services/catalog.js`, `client/src/utils/catalog.js`, `client/src/admin/catalog-form.js`
- `client/src/catalog.css`, `client/src/admin.css`
- `client/playwright.config.js`
- `client/e2e/catalog-fixtures.js`, `catalog-browser.spec.js`, `catalog-helpers.spec.js`

The frontend adds only the Playwright development test dependency; runtime stack and separate npm installations remain unchanged. The transparent logo and `design-system.css` were not edited.
