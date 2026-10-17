# Owner workflow and customization

17 October 2026 — local implementation for review. HEAD remains `cf3b118`.

## Result and boundaries

The normal owner workflow uses business fields instead of separate approval actions. Products, components and templates retain internal compatibility/safety fields, but the ordinary editors no longer require Price Approved, Configuration Approved, Review Resolved or Ready actions. Prices, real stock, available variants and required customer inputs remain server-validated.

No production/staging database connection, migration, provider operation, communication, environment modification, commit, push or deployment was performed. Checkout and request-intake gates remain unchanged. Production counts/visibility/image success in the request are owner-supplied facts, not independently reverified here.

The existing video work was preserved. The following visibility journals were only checked for existence/size, never rewritten: `local-data/visibility-1595-review.json`, `visibility-1595-review-retry.json`, `visibility-1595-applied.json`. All earlier untracked files remain preserved. Do not rerun the old missing-visibility operation on the now-visible catalog.

## Owner experience

**Products:** select public visibility, enter the real price, choose availability and enter actual quantities where tracked. A positive saved price confirms that business input automatically. Blank/zero never enables a purchase. Imported ten stays unconfirmed and is not prefilled as real stock. Selecting Made by Request is explicit and requires no tracked quantity. Zero confirmed stock remains visible with an enquiry action.

“How is this product sold?” distinguishes a single item, configured variants and options awaiting clarification. Ambiguous imported variant notes default to clarification rather than invented variants. Original Draft/Hold, review flags and notes are retained; they are informational after a normal business-field save. They do not require manual resolution buttons. Purchase eligibility is derived independently. Required personalization must be valid and is still enforced by cart/order endpoints.

For variant products, the parent ten is retained unapproved, not publicly exposed and never deducted. The owner enters actual stock per variant. A known available variant can sell while another remains unavailable or unconfirmed; the latter cannot be purchased. A global availability switch can disable the whole product. Variant overrides require real positive prices; blank overrides retain the existing verified base-price inheritance contract. A confirmed positive base price is still required for normal product checkout.

The admin product list shows business readiness/enquiry status, labels inherited quantities as unconfirmed and identifies retained import warnings. It no longer describes Ready as a mandatory merchant action. Saved readiness does not activate global checkout.

**Components:** choose the service(s), request availability and optional price. Nothing assigns food ingredients to Gift Box or engraving automatically. Positive fixed prices are used as known estimates; zero/blank becomes Price Pending; explicit Free remains a separate choice. Unknown amounts cannot enter automatic paid pricing. Enter real stock or select Made by Request only when known; allowing a quotation request does not certify stock. Category/subcategory and image controls remain available. Imported identities, classifications and review notes are preserved.

**Templates:** new configurations start as Gift Box request questions. Gift Box/Engraving enquiry templates require no base product price, fonts or materials. Product/tray type selection uses the existing automatically priced configuration engine; complete valid saves become available without a second approval action. Template/rule identities are generated automatically. Incomplete configurations return field errors instead of being treated as complete.

Enquiry templates contain questions; optional components are offered using component service/availability controls. Automatically priced templates keep their strict component, price, selection and engraving validation. Editing configuration creates an immutable new version. Availability-only changes disable/enable that version without silently creating a still-offered predecessor. New service requests use only the latest offered enquiry version; stale form versions are rejected for reload. Existing submitted request retries and snapshots still recover when a template/intake is closed.

Priced product-template bindings deliberately remain tied to their saved version. After creating a priced revision, select that new version in the product's existing human-readable configuration picker when intending to change future product configurations. Existing order/accepted-quotation snapshots are never silently retargeted. Ordinary product “Customize This” continues using its direct field editor and does not require a template.

## Gift Box and engraving

Both existing routes support accountless, text-only requests with zero templates/components/products. Engraving retains its manual item-reference fallback and only offers merchant-configured products/fonts/placements. No upfront payment is collected.

Saved enquiry templates optionally add validated text/image questions. Answers and field labels/version are snapshotted with the request and shown in the protected owner dashboard. Private template images use the same request-key/session-owned upload path as reference images. There are at most five images across the entire request, up to 8 MB each; template configuration cannot require more. The existing Gallery/Camera/Files chooser, full image decoding and retained private evidence rules are reused.

Submission references, immutable retries, ownership, CSRF/Origin checks, rate limits, dashboard history and 12-hour initial contact remain intact. The owner prepares quotations, manually opens/sends WhatsApp, records sharing/acceptance, and uses existing order conversion and reconciliation. No screenshot marks payment Paid. Shipping remains Pending Confirmation and is never inferred Free. Existing immediate/9-hour notification rules were not changed.

The production maintenance message remains intentional while `CUSTOM_REQUESTS_ENABLED` and `CUSTOM_REQUESTS_LAUNCH_AUTHORIZED` are not both authorized/enabled. This implementation does not bypass that gate. Closing intake preserves existing receipts and obligations.

## Compatibility and migration

- New optional `Product.purchaseSetup` records the normal business-save contract and option structure. Existing records without it retain the legacy strict purchase gates; browsing remains independent. Normal owner edits opt individual records into the new contract without mass status/review changes.
- New `ComponentOption.ownerManaged` identifies server-normalized business edits. Existing request-policy services remain empty/unconfirmed until the merchant chooses them. No bulk enablement of the 85 components is necessary or safe.
- `CustomizationTemplate.usage` separates enquiry questions from automatic priced rules. Missing legacy values keep the existing priced interpretation. Immutable template versions and optimistic concurrency remain enforced.
- Optional immutable `ServiceRequest.templateSnapshot` stores submitted questions/answers. Historical requests without it continue working.
- No new collections or indexes are declared, and no data backfill is required by this change. Existing declared commerce/request schema/index readiness must still be verified separately before authorized activation. No initialization command was run.
- Existing public visibility, permanent aliases, media keys, stock values and financial records are not migrated. No lockfile, dependency, infrastructure, SEO export/publication or tracking configuration was changed. Approved SEO exports retain their existing independent guards; business-field saves do not authorize indexing.

## Verification

All executed database tests use disposable loopback replica sets and synthetic records; providers are mocked/offline. Browser tests use installed Chrome, isolated API fixtures and responsive/touch emulation. Physical devices and real providers are not verified.

| Executed check | Result |
| --- | --- |
| Expanded backend matrix: owner workflow, catalog HTTP/auth, carts/orders, service requests, configuration/versioning, public visibility, actual Worker/API routes, inventory concurrency, 1,595-record visibility operator | 126 passed, 0 failed |
| Post-correction backend catalog/configuration/request matrix | 67 passed, 0 failed |
| Template withdrawal/current-version and owner-request regression matrix | 52 passed, 0 failed |
| Final dedicated owner API/checkout/variant/private-template-file tests | 8 passed, 0 failed |
| Focused Chrome owner/service/personalization/hero/service-film matrix | 25 passed, 0 failed |
| Final owner-list/editor/template/mobile-request browser checks | 5 passed, 0 failed |
| Updated legacy component/template owner-form checks | 2 passed, 0 failed |
| Client lint; server syntax | Passed; 177 JavaScript files checked |
| Isolated production build and offline default SEO generation | Passed; indexing false, zero indexable routes/approved products |

Counts overlap and must not be added together as unique tests. Normal browser runners exited cleanly. The executed scope includes real server-authoritative COD and order-first InstaPay transactions for owner-managed Hold products, per-variant stock deduction without approving the parent ten, unavailable variant rejection, stock contention, stale revisions, quote conversion, request idempotency, protected files, missing email, closed-intake recovery and canonical/legacy routes. The inherited full-size fixture proves browse-only Draft/Hold behavior; it is not a new production inspection.

Intermediate failures were investigated rather than hidden: two assertions assumed the retired top-level Ready/parent-stock filter shape; assertions now check the legacy branch and the explicit per-variant exception. Browser fixtures lacked a valid compare-at value, category association or required image-field limits; these were corrected. Two select/input locators incorrectly required exact labels despite nested help/options and were corrected without removing assertions. Two legacy commerce-form cases were updated from retired approval/fixed-shipping actions to the approved current workflow. The final targeted runs above are green; the entire application suite was not rerun.

## Remaining dependencies and limits

1. No live checkout or intake activation is authorized here. Real schema readiness, session/domain/CSRF configuration and existing service permissions need release verification.
2. Text-only intake works locally without storage. Private images and admin media require separately verified private/public R2 configuration, CORS, authorized provider smoke tests and the existing storage gates. JPEG/PNG/WebP remain supported; HEIC limitations are unchanged.
3. The merchant must supply actual prices/counts, product option facts, suitable component services and real engraving options. No food/material/font suitability or stock is inferred. Any older approved component using separate legacy price/request-price policies needs merchant review when moving to the single business-price editor.
4. Request-question choices are capped at twenty latest offered template families per response. Priced template versions remain explicit product bindings. No new tray storefront was introduced.
5. Physical iPhone Safari, Android Chrome, Samsung Internet and live R2/email delivery remain unverified. Previous native Edge decoder risk/physical media acceptance remains documented in the video reports; no footage was replaced or compatibility guarantee added.

## Release and rollback — future authorization required

1. Review this manifest and freeze all accumulated local changes, including the earlier video patch. Include the four new runtime/test modules below; exclude all existing backups, journals, secrets and generated `.cache`/test artifacts. Never use a bulk add. Production auto-deploy triggers must be understood before a later authorized push.
2. Verify additive schema compatibility on an authorized target. No catalog migration is necessary: preserve the current 1,595 public records, 85 components and aliases. Do not reset quantities or bulk-promote Ready/review/price/inventory fields.
3. Under separate release authorization, deploy compatible API and frontend while commerce and intake remain closed. Verify health, Shop/category/direct paths and protected admin operations. Reload old editor tabs to avoid stale drafts.
4. Configure a small merchant-reviewed synthetic/approved cohort, real variants, component services and request questions through the dashboard. Verify no-price enquiries, zero stock, real count/Made by Request and private evidence with separately authorized provider tests. Keep email, SEO and Meta activation separate.
5. Only after release acceptance and explicit authorization, enable request intake using its two existing gates. Test text-only Gift Box and manual engraving first, then verified private images and the dashboard/WhatsApp workflow. Enable checkout through its own two existing gates only after commerce acceptance. No flag is automatically enabled by this code.

If an issue occurs, close new intake/checkout through their existing independent controls under authorized operational access; preserve existing requests/orders and reconciliation access. Prefer a forward fix/current compatible admin for any requests containing new question snapshots. A coordinated code rollback must retain all optional fields and journals: old code may keep newly edited Draft/Hold products enquiry-only and cannot render added request answers. Do not strip new fields, restore old product documents, change stock, cancel orders or rewrite accepted financial history as rollback. Existing live obligations must remain accessible throughout recovery.

## Exact file manifest for this task

Modified:

```text
client/e2e/commerce-fixtures.js
client/e2e/commerce.spec.js
client/e2e/product-personalization.spec.js
client/e2e/service-requests.spec.js
client/src/admin/RequestEligibilityEditors.jsx
client/src/admin/catalog-form.js
client/src/commerce/AdminEditors.jsx
client/src/pages/AdminCommercePage.jsx
client/src/pages/AdminProductFormPage.jsx
client/src/pages/AdminProductsPage.jsx
client/src/pages/AdminRequestsPage.jsx
client/src/pages/ServiceRequestPage.jsx
server/src/catalog/product-policy.js
server/src/catalog/public-presentation.js
server/src/catalog/service.js
server/src/catalog/validation.js
server/src/commerce/configuration.routes.js
server/src/commerce/customization.js
server/src/commerce/inventory.js
server/src/commerce/pricing-context.js
server/src/commerce/request-policy.js
server/src/commerce/request-validation.js
server/src/commerce/service-request.routes.js
server/src/commerce/service-requests.js
server/src/models/ComponentOption.js
server/src/models/CustomizationTemplate.js
server/src/models/Product.js
server/src/models/ServiceRequest.js
server/test/catalog-public-visibility-policy.test.js
server/test/permanent-visibility.test.js
```

Added:

```text
client/e2e/owner-workflow.spec.js
server/src/catalog/owner-workflow.js
server/src/commerce/owner-configuration.js
server/test/owner-workflow.test.js
docs/OWNER_WORKFLOW_AND_CUSTOMIZATION.md
```

These 35 files are separate from the six preexisting modified video/catalog-browser files and earlier untracked operator/reports/backups. The full Git working tree contains earlier work as well; this manifest is not permission to commit/deploy it.
