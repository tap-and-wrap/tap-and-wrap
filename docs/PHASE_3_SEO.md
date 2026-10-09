# Phase 3 SEO implementation and activation

**Current Batch 3 contract:** this phase report is historical. [BATCH_3_SEO_OPERATIONS.md](BATCH_3_SEO_OPERATIONS.md) supersedes its earlier activation details with version-2 immutable publications, source/media freshness, an expected-publication-ID gate, explicit media-object verification, thin-category noindex, accurate Made by Request availability, report-only browser policy and bounded static/React boot. Keep indexing disabled; none of those live activation steps are authorized or verified by a local fixture run.

This is a JavaScript build-time extension to the existing Vite application. It does not change frameworks, contact databases during a normal frontend build, or render public pages through Render on every request.

## Implemented

- Shared, centralized page titles, descriptions, canonical URLs, Open Graph/Twitter metadata, robots decisions and safe JSON-LD.
- Product metadata uses approved public DTOs. Pending/error/private pages are noindex. Draft/provisional products have no public product schema. Product `Offer` data is omitted while checkout is disabled; an explicitly enabled approved export can include truthful EGP offers and configured variant price ranges. No reviews, ratings, availability claims, addresses or social profiles are invented.
- `/categories/:slug` uses an exact public category endpoint, verifies active category/parent data and reuses the existing server-filtered shop. Main and subcategory URLs are crawlable and stable. Fixed category selections remain visibly disabled; a subcategory page locks both its actual main category and subcategory. Apply/Clear All/search/sort keep the current scope without misleading editable controls or redundant URL parameters. Child pages include the parent breadcrumb and avoid unnecessary root/sibling category requests.
- Explicit offline generation of meaningful route-specific HTML, metadata, organization/product/breadcrumb JSON-LD, canonical sitemap and robots.txt. Product/category rendering uses a strict whitelist and per-record publication/price/inventory/category/review gates. Image galleries, customization configurations, storage keys, customer information and private files are not serialized.
- Homepage/shop/category output includes at most 20 product summaries; the sitemap discovers the complete eligible set. No normal application response fetches the whole catalog. Build exports are separately bounded and paginated at their source.
- Builds without an explicit catalog export identify their catalog area as a development placeholder; they do not assert that the live merchant catalog is empty. Missing owner-approved about/contact/legal text remains visibly marked as a development placeholder and excluded from indexing/sitemaps. There are no invented policy promises. Legal/about/contact paragraphs can be provided through an explicit approved content export.
- Repeat generation removes only previously owned route HTML for products/categories that were removed from the approved export. Existing unrelated output files are preserved. Input/output paths are constrained to this project; no implicit `.env` loading or network calls occur.
- Cloudflare Workers Static Assets router serves prerendered documents, genuine 404 responses for unknown/unexported product/category URLs, no-store/noindex private SPA documents, canonical trailing-slash redirects and noindex filtered URLs. Preview hostnames and the default disabled indexing flag never expose an indexable sitemap. Hashed assets bypass document logic.

## Exact input contracts

The read-only server exporter produces an explicit local JSON file. It must not be run against an existing database until separately authorized. `server/scripts/export-seo-catalog.js` defaults to an offline dry-run, never loads `.env`, and requires terminal `MONGODB_URI`, an explicit `local` or `staging` target, `--confirm-read`, and an output path inside ignored `local-data/`. It uses a dedicated connection with automatic collection/index creation disabled and keyset pages of exactly 20 maximum. Production runtime/foreign database names are rejected before connection. The generator accepts this shape:

```json
{
  "version": 1,
  "source": "approved-public-catalog",
  "generatedAt": "actual export timestamp",
  "checkoutEnabled": false,
  "mediaOrigins": ["https://approved-public-catalog-media.example"],
  "categories": [
    { "_id": "stable category ID", "name": "merchant category name", "slug": "existing-slug", "parentId": null, "active": true, "productCount": 0, "imageUrl": null, "updatedAt": "actual source modification timestamp" }
  ],
  "products": [
    {
      "_id": "stable product ID",
      "name": "merchant product name",
      "slug": "existing-slug",
      "description": "merchant description",
      "category": { "_id": "stable category ID", "name": "merchant category name", "slug": "existing-category-slug" },
      "subcategory": null,
      "mainImageUrl": null,
      "pricePiastres": 0,
      "priceApproved": true,
      "orderingAvailable": false,
      "variants": [],
      "updatedAt": "actual source modification timestamp",
      "seoEligibility": { "status": "ready", "published": true, "inventoryApproved": true, "reviewRequired": false, "categoriesActive": true }
    }
  ]
}
```

The example contains contract placeholders only; it is not merchant catalog content and must not be used for publication. The exporter supplies the approved product price. Neither an export nor the generator approves records. Product/category IDs, names and URLs remain stable. Image URLs must be HTTPS, free of query credentials, and on explicitly approved public media origins.

An optional `--content-output` exports only approved SiteContent about/contact/legal sections to a separate JSON file using the content contract below. It does not export customer records, reviews, review source notes, admin identities, raw storage keys, full image galleries or customization configuration. Per-record category/variant/price approval checks run again before output. Batches that exceed the bounded limit or fail pagination abort without publishing a partial file. Output is written atomically; resolved paths remain inside this project's ignored `local-data/`.

Optional owner-approved content input:

```json
{
  "routes": {
    "/privacy-policy": {
      "approved": true,
      "title": "Owner-approved page title",
      "description": "Owner-approved description",
      "heading": "Owner-approved heading",
      "paragraphs": ["Exact owner-approved plain text."],
      "updatedAt": "actual content modification timestamp"
    }
  }
}
```

Supported content paths are `/about`, `/contact`, `/privacy-policy`, `/refund-policy`, `/shipping-policy` and `/terms-of-service`. Text is escaped, not interpreted as HTML. Unapproved or incomplete content remains noindex.

## Safe local commands

From `server/`, the following command is safe and offline:

```powershell
npm.cmd run seo:export
```

Only after separate staging-read authorization and terminal configuration naming the exact dedicated `tapandwrap_staging` target:

```powershell
npm.cmd run seo:export -- --target staging --confirm-read --output local-data/approved-seo-export.json --content-output local-data/approved-site-content.json
```

This authorized command opens a read-only application workflow and writes reviewed local JSON artifacts; it does not import data, create indexes, start the app or write a database. Use a database user with read-only privileges for the exporter. Connection errors are redacted. No existing database was contacted during this task.

From `client/`:

```powershell
node --test scripts/seo/generator.test.js scripts/seo/worker.test.js
npm.cmd run build
node scripts/generate-seo.js
```

The last command creates noindex development HTML and an empty sitemap after a completed Vite build. It does not read credentials, query an API/database or perform deployment. Normal builds remain safe by default. Isolated generator and edge-routing tests verify fixtures only.

After separate staging-read authorization, merchant record/content approval and explicit canonical-domain selection, generate a reviewed staging preview without enabling indexing:

```powershell
node scripts/generate-seo.js --input local-data/approved-seo-export.json --content local-data/approved-site-content.json --site-origin https://OWNER-APPROVED-HOST
```

Paths are relative to the project root, even when the command runs from `client/`. Omit `--content` if approved content has not been supplied; the corresponding pages remain marked development placeholders. `--publish` enables indexable output only when an approved catalog export and valid HTTPS canonical origin are explicitly supplied. This task did not run that publication command with merchant data.

The existing default `client/wrangler.jsonc` now uses the reviewed static Worker and `ASSETS` binding, disables automatic HTML rewriting, and provides genuine 404 handling instead of blanket SPA fallback. Documents pass through the Worker; hashed assets and the supplied logo bypass it. Keep `SEO_INDEXING_ENABLED=false` in staging. Build-time metadata uses the existing `VITE_SITE_URL` and `VITE_SEO_INDEXING_ENABLED=false` by default; the browser flag must agree with the eventual authorized publication decision. These are public configuration values, never credentials. No deployment command was executed.

## Limitations and next verification

No real approved catalog export, public media import, domain activation, Cloudflare deployment, search-engine indexing or Rich Results validation was performed. The source HTML pipeline is fixture-verified; production dynamic product SEO is not activated until an authorized approved export and rebuild/deployment exist. The interactive React application mounts over a semantic HTML fallback; this is build-time generation, not full React SSR or hydration. Check actual layout stability and rich-result eligibility after the approved content/media configuration exists.

Static product prices/availability are snapshots. Rebuild from an updated approved export when publication, approval, descriptions, images, prices or stock change; purge/redeploy removed routes promptly. The frontend continues to revalidate products against public APIs. Static metadata is not an authorization or checkout mechanism. Do not treat a stale SEO snapshot as merchant approval.

Before enabling indexing, inspect actual response source for representative products/categories/static pages, verify canonical host and noindex staging/private routes, check removed/draft product 404 responses, validate genuine EGP offer markup in Google's Rich Results Test, and submit the canonical sitemap through the owner's Search Console. No ranking is guaranteed.

The implementation follows [Cloudflare Static Assets routing](https://developers.cloudflare.com/workers/static-assets/), [SSG/404 behavior](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/), [asset bindings and selective Worker routing](https://developers.cloudflare.com/workers/static-assets/binding/), and [Google's product structured-data guidance](https://developers.google.com/search/docs/appearance/structured-data/product-snippet).

## Authored files

- `client/src/seo/metadata.js`, `PageMetadata.jsx`, `RouteMetadata.jsx`
- `client/src/pages/CategoryPage.jsx`
- `client/scripts/generate-seo.js`, `client/scripts/seo/generator.js`, `generator.test.js`, `worker.test.js`
- `client/worker/seo-worker.js`; modified existing `client/wrangler.jsonc`
- `client/public/seo-static.css`
- `client/e2e/seo.spec.js`
- `server/scripts/export-seo-catalog.js`, `server/test/seo-export.test.js`
- Narrow integration changes: `client/src/components/CatalogFilters.jsx`, `client/src/pages/ShopPage.jsx`, `server/src/catalog/service.js`, `server/test/catalog-phase1b.test.js`
- `docs/PHASE_3_SEO.md`

Existing App/product/content integration, package scripts and canonical frontend placeholders are coordinated by the parent task and recorded in `PHASE_3_WEBSITE_COMPLETION.md`. Focused verification passed 27 generator/edge-router tests and 13 offline exporter tests. The parent task records final combined backend/frontend/browser totals, including the new exact-category API regression and five SEO/browser workflows.
