# Permanent product addresses — activation gate

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
