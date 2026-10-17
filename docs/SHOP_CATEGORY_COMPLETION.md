# Shop and category completion

Implemented 16 October 2026. No merchant database, provider, environment, commit, push or deployment was used.

- Removed only the three default `open` attributes from `CatalogFilters.jsx`. Native toggling retains drafts; existing price-error opening/focus and mobile dialog behavior remain.
- Replaced root-category pills/pagination with a labelled native select, readable names, placeholder, loading/error/retry/empty states and existing brand tokens. Requests fetch only that root's children, sequentially at 20 per page, with the existing 200-page ceiling and cancellation signal. Leaf pages have no chooser.
- Added shared pure category path mapping. Public category responses include `publicPath`; stored slugs still filter products. The resolver matches complete parent-scoped paths and rechecks the existing visibility rules. It reuses the existing server-side category eligibility graph, including inactive identities only for stable collision decisions; the browser does not download the whole category graph.
- React routes, homepage category destinations, applied Shop category selection, chooser, breadcrumbs, canonicals, approved SEO exports/static links and Worker routing use friendly paths. Product cards, images, enquiry links and commerce behavior remain unchanged.
- `/categories/accessories-3a2b6498` resolves to `/categories/accessories`; `/categories/accessories-cosmetics-lip-makeup-1b8eb3e0` resolves to `/categories/accessories/cosmetics-lip-makeup`. Client legacy navigation replaces history and preserves query parameters. Reviewed static builds include guarded Worker 308 redirects with queries preserved. Withdrawal and publication freshness still fail closed.
- The child API resolver is `/public/categories/:root/children/:child`, avoiding a collision with the existing `/:slug/products` API.

Sibling normalized-name collisions, empty ASCII normalization, reserved fallback names and legacy-address conflicts use `category-id-<original MongoDB ID>` segments. Names under different roots remain independent. Inactive identities reserve their addresses too. Actual merchant collisions were not inspected because no existing database was accessed. No IDs, stored slugs, relationships or product references were updated.

Product slugs still use readable names plus external IDs. Removing IDs could misidentify duplicate names. A future minimal alias design is an optional `publicSlug` with a unique partial index, reviewed duplicate-name suffixes, and legacy stored-slug lookup/redirect compatibility. Index creation/backfill needs separate authorization and is outside this batch.

## Verification

- Client lint/build passed; normal build remains offline and noindex.
- All 57 SEO tests passed, including nested static routes, guarded legacy redirects and withdrawals.
- 24 distinct focused backend tests passed across category resolution, category efficiency and SEO export; server syntax checks passed.
- 19 distinct affected browser cases reported passing across the focused catalog selection, new navigation tests, two category SEO tests and nested-dialog test. Verified 320/768/1440px navigation, direct refresh, 23-child pagination, legacy queries/history, collapsed filters, price-error focus, draft preservation, loading/retry/empty states, product pagination and focus containment. Mobile/desktop screenshots were visually inspected using isolated fixtures.
- Browser runner server teardown hangs in this Windows sandbox after cases finish; those runners were interrupted, so no clean browser-command exit is claimed. Initial failures exposed the new loading label's encoding and old tests accessing intentionally collapsed controls; both were corrected. An intermediate SEO run reported four failures that were not reproduced by subsequent stable 57/57 runs. Process inspection through CIM was denied; no escalation or system change was made. The isolated Vite port was confirmed closed after cleanup.

Local repeat commands (each from the indicated folder):

```powershell
# client/
npm.cmd run lint
npm.cmd run build
npm.cmd run test:seo
npm.cmd test -- e2e/category-navigation.spec.js
npm.cmd test -- e2e/batch2-shop.spec.js e2e/catalog-browser.spec.js --grep "three keyboard|price drafts|reversed price|Clear All|legacy subcategory|main category routes|invalid URL|URL monetary|shop requests|mobile drawers|shop layout|shop handles"
npm.cmd test -- e2e/seo.spec.js e2e/batch2-reliability.spec.js --grep "category routes|subcategory pages|nested native dialogs"
# server/
npm.cmd test -- test/category-paths.test.js test/batch3-catalog-efficiency.test.js test/seo-export.test.js
npm.cmd run check
```

## Files changed

- `shared/category-paths.mjs` (new)
- `client/src/App.jsx`
- `client/src/components/CatalogFilters.jsx`
- `client/src/components/HomeCatalog.jsx` (category destination only)
- `client/src/pages/CategoryPage.jsx`
- `client/src/pages/ShopPage.jsx`
- `client/src/pages/ProductPage.jsx` (category breadcrumb only)
- `client/src/services/catalog.js`
- `client/src/storefront.css`
- `client/src/seo/metadata.js`
- `client/scripts/seo/generator.js`
- `client/scripts/seo/generator.test.js`
- `client/scripts/seo/worker.test.js`
- `client/worker/seo-worker.js`
- `client/e2e/catalog-fixtures.js`
- `client/e2e/catalog-browser.spec.js`
- `client/e2e/batch2-shop.spec.js`
- `client/e2e/batch2-reliability.spec.js`
- `client/e2e/seo.spec.js`
- `client/e2e/category-navigation.spec.js` (new)
- `server/src/catalog/service.js`
- `server/src/routes/catalog.routes.js`
- `server/scripts/export-seo-catalog.js`
- `server/test/seo-export.test.js`
- `server/test/category-paths.test.js` (new)
- This report.

Existing untracked user files and backups were preserved. No dependencies were added. Live merchant data, actual media, hosting and current collision inventory remain unverified. A future indexed release needs a newly reviewed fresh SEO export/publication; this task does not authorize it.
