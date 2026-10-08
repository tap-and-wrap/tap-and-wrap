# Phase 2 — Core commerce engine

Implementation and verification record, 8 October 2026. The existing JavaScript/JSX React/Vite client and Express/Mongoose server remain separate npm applications.

## Implemented behavior

- Real server-persisted guest/customer carts: add, quantity update, remove, clear and authenticated eligible guest-cart merge. A random HttpOnly, SameSite cookie identifies a guest; MongoDB stores its hash. Variants, text selections and upload IDs form distinct line identities. A cart holds at most 30 lines and 99 units per line, and expires after 30 days. Adding does not reserve stock.
- Product cards and details use the real cart endpoint. Required fields/variants use Choose Options; unavailable items cannot be added. A successful response updates the cart count and triggers a native Web Animations zigzag to the actual header icon. Reduced-motion users receive accessible feedback without the flight animation.
- Configurable ordinary product photos/names/messages, counts, formats, size and character limits. Files and previews stay in browser memory until Add to Cart. Replacements revoke browser object URLs. Failed storage/add requests never report a successful upload/cart addition.
- One approved, versioned customization/pricing engine supports gift boxes, laser engraving and product-level Customize This/trays. Only explicitly eligible approved products/templates/components are offered. Group choice/quantity/action limits, unavailable options, original delta selections, fonts/materials/placement, engraving text limits and optional artwork are enforced server-side. Engraving has configured flat/option adjustments, without per-character pricing. `/customize` still features exactly two services.
- Integer-piastre product/variant/component pricing, deterministic non-overlapping bundles, one validated coupon, stacking restrictions, eligibility/date/subtotal/usage limits and non-negative totals. All 27 Egyptian governorates map to domestic shipping: Cairo/Giza 9,000 piastres; others 12,000. Admin rate changes require approval. No international checkout is accepted.
- Guest/customer checkout with validated delivery details, COD and full InstaPay payment to `01060673073`. Proof is selected locally and uploaded only on Place Order. COD begins unpaid; InstaPay begins awaiting verification. Neither a screenshot nor an upload completion marks payment paid.
- Ten-minute checkout intents bind the current cart, configured prices, discount, shipping and method. Submission revalidates everything. A unique owner/checkout-key index and request fingerprint prevent duplicate orders and conflicting reuse of a key. A cryptographic six-digit public number has a unique database index and bounded collision retries.
- MongoDB replica-set transactions atomically commit conditional product/variant/component stock changes, the immutable order, coupon redemption, upload retention, checkout consumption, cart removal and durable notification event. Approval/category/template/bundle/shipping fences prevent stale eligibility decisions. Made by Request never decrements a quantity. Any failed operation rolls back. State changes use revision checks; permitted unpaid early cancellations restock once. Paid cancellation is blocked pending a separately reviewed refund policy.
- Owner-checked order details, account history and guest tracking by number plus normalized Egyptian mobile number. Tracking returns limited states/timestamps, generic nonmatching responses, and allows five requests per 15 minutes per IP. Guest orders are not linked by unverified phone/email.
- Protected admin order lists/details, separate fulfillment/payment updates, InstaPay verification/rejection, COD collection confirmation and private customer-file viewing. Configuration screens manage templates/revisions, components, eligibility, product requirements, bundles, coupons and shipping. Sensitive mutations/views create redacted audit records. Receipts are fetched only after View Proof, into an authenticated modal with Escape/focus restoration; no public proof URL is returned.
- Durable notification outbox for received, payment confirmation/rejection, confirmed, preparing, out for delivery, delivered and cancelled events. Bounded workers claim leases, recover interrupted work, retry with backoff and record terminal failures. Provider idempotency keys remain stable. Disabled delivery leaves events queued.

## API contracts

All paths below are relative to `/api/v1`; success uses `{ ok: true, data }`. Existing catalog/auth routes remain in place. All browser mutations retain signed CSRF and allowed-Origin checks. Admin endpoints require the existing active administrator session.

| Paths | Methods and behavior |
| --- | --- |
| `/commerce/cart` | GET current repriced compact cart; DELETE clear |
| `/commerce/cart/items` | POST validated product/variant/personalization/customization |
| `/commerce/cart/items/:id` | PATCH quantity; DELETE line |
| `/commerce/cart/merge` | POST authenticated eligible guest merge and cookie rotation |
| `/commerce/customization/services/:kind/products` | GET paginated gift-box/laser eligible products |
| `/commerce/customization/products/:slug` | GET selected eligible product and approved template |
| `/commerce/customization/quote` | POST authoritative configured unit-price preview |
| `/commerce/shipping` | GET approved domestic mapping/rates |
| `/commerce/checkout/config` | GET launch availability, governorates/rates and InstaPay number |
| `/commerce/checkout/quote` | POST create/refresh an owned expiring checkout intent |
| `/commerce/orders` | POST idempotent order; GET authenticated account history |
| `/commerce/orders/:id` | GET owned complete snapshot |
| `/commerce/orders/:id/cancel` | POST permitted revision-safe unpaid cancellation |
| `/commerce/orders/track` | POST rate-limited number/phone tracking |
| `/commerce/uploads/sign` | POST owned, purpose/field-limited direct private PUT authorization |
| `/commerce/uploads/:id/complete` | POST inspect and freeze a verified private copy |
| `/commerce/uploads/:id` | DELETE unused owned temporary file, subject to leases/attachments |
| `/commerce/uploads/:id/content` | GET authenticated private content; no public read signing |
| `/admin/commerce/orders` | GET bounded search/filter/sort list |
| `/admin/commerce/orders/:id` | GET order and private-file metadata, without loading file bodies |
| `/admin/commerce/orders/:id/state` | PATCH audited revision-safe fulfillment/payment update |
| `/admin/commerce/orders/:id/proof` | GET explicit authenticated receipt stream |
| `/admin/commerce/orders/:id/files/:uploadId` | GET explicit authenticated associated customer file |
| `/admin/commerce/templates`, `/components`, `/bundles`, `/discounts` | GET paginated lists; POST create; GET/PATCH `/:id` |
| `/admin/commerce/templates/:id/revisions` | POST draft revision preserving old approved versions |
| `/admin/commerce/shipping` | GET/PATCH approved rate settings |
| `/admin/commerce/products/:id/configuration` | PATCH ordinary personalization and independent customization configuration |

Lists cap at 20 records and 200 pages. Normal product/order/configuration list projections exclude galleries, complete template groups, private files and order lines. Catalog and customization queries use approved publication and active category relationships; stock filters use variant counters when variants are configured.

## Database changes

New collections/models: `Cart`, `CheckoutIntent`, `Order`, `DiscountRedemption`, `CustomizationTemplate`, `DiscountCode`, `BundleRule`, `ShippingConfig`, `Upload`, `UploadQuota`, `NotificationEvent`, `AdminAudit`.

Product adds bounded upload MIME/size policy and a commerce write revision. Component records add explicit customization enablement/configuration approval and a write revision; original IDs, roles, images and review classifications are preserved. New stock still defaults to 10 **provisional** units. No blanket catalog or inventory approval is introduced. Unique/idempotency, date/search/list, TTL and notification-claim indexes support bounded queries. MongoDB contains file metadata/references, never binary images. Product/order/customization price snapshots are immutable across later merchant edits.

## Private storage and notification boundaries

`STORAGE_ENABLED=false` and empty R2 settings are defaults. Missing storage returns an honest unavailable error before quota/file creation. The real SDK adapter uses 300-second type/size-bound presigned PUTs. The browser sends bodies directly to R2. Completion inspects actual JPEG/PNG/WebP bytes, declared length and bounded dimensions, then copies to a different private key with conditional source ETag and re-verifies it. A still-valid PUT cannot overwrite the verified copy. Quotas cap an owner at 20 active temporary uploads and 100 MiB; one image is at most 10 MiB, subject to a narrower configured field limit; payment proof is at most 5 MiB.

Temporary files expire after 24 hours. Cart attachment protects accepted files from a cleanup attempt following a lost add response; removal/clear detaches them. Successful checkout retains order files and releases temporary quota. Cleanup waits for signing/verification leases to expire, retries failed deletion and preserves retained files. Configure a private R2 bucket with **public `r2.dev` and public custom-domain access disabled**. Keep public catalog media and its `CATALOG_MEDIA_BASE_URL` separate. Original clean catalog photos/object paths remain untouched outside the repository.

`NOTIFICATIONS_ENABLED=false` is the default. Staging/development delivery requires `NOTIFICATION_SAFE_RECIPIENTS` and the configured sender/provider. Tests cannot instantiate a live notification provider. The configured adapter uses Resend; retry/delivery acceptance tests use an isolated injected provider. No emails were sent. The provider and storage behavior follow the [official R2 SDK example](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/), [R2 presigned URL documentation](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) and [Resend idempotency documentation](https://resend.com/changelog/idempotency-keys).

## Verification

The final regression runs passed. Backend tests use a fresh disposable loopback MongoDB replica set under ignored `server/.cache/`, never a merchant URI or `.env`. Frontend Playwright uses installed Edge, an isolated Vite server and explicit API/storage fixtures; no browser test purchases reach a real backend/provider.

- Backend `npm.cmd test`: **165 passed, 0 failed**, including 83 new commerce tests and all 82 existing tests.
- Frontend `npm.cmd test`: **63 passed, 0 failed**, including 23 new commerce browser tests and all 40 existing catalog/helper/preview tests.
- Frontend lint and production build: passed. The production output keeps commerce/admin pages in lazy chunks.
- Server `npm.cmd run check`: passed for **80 JavaScript files**.
- Read-only runtime dependency audits (`npm.cmd audit --omit=dev --json`): **zero known vulnerabilities** in both client and server.
- Worker dry-run: `{ mode: "dry-run", writes: false, notificationDeliveryEnabled: false, privateStorageEnabled: false }`.
- Browser checks cover 320/390/768/1440 widths, no horizontal overflow, product/stock/URL-filter regressions, gallery/order preservation, local file selection/replacement, unavailable/failed storage, both builders/trays, price/option validation, launch disable, COD/InstaPay, account/admin access, order history/cancellation, receipt on-demand/focus/Escape behavior and reduced motion. New commerce tests collect browser page errors; expected console/network fixture failures remain intentional.
- Cart screenshots were generated only under ignored `client/test-results/`; the 320px and 1440px layouts were visually inspected and preserve the existing transparent logo, typography and white/rose appearance.
- SDK PUT signing was verified offline with invented test credentials. Private-file inspection/copy/retention/expiry and provider retries were tested using memory adapters. Live Atlas, R2 CORS/SDK traffic, Resend delivery and real payments are **not verified**.

Failures encountered and corrected included nullable discount validators, malformed test DTOs/teardown, incorrect API fixture paths/CORS, immutable-array rewrites on state changes, test rate-limit counter isolation, admin shipping/query response mismatches, preview-control regressions, an incorrect login-button test selector and a duplicate import introduced during final review. Runtime authorization/rate limits remain enforced. A test attempting to instantiate a live email provider was corrected to verify the existing rejection rather than weakening that protection. Admin order list/detail tests verify photo/proof metadata without reading storage bodies; only explicit View Proof fetches the file. The browser also verifies decoded proof pixels and Escape/focus restoration under React Strict Mode.

## Exact authored files

Generated `.cache/`, `dist/`, test logs, traces and screenshots are ignored verification artifacts, not source changes. Existing logo/design-token files, catalog workbook/importer, clean photos, private `.env` launch settings and merchant data were not changed.

Created:

- `docs/PHASE_2_COMMERCE_ENGINE.md`
- `server/src/models/Cart.js`, `CheckoutIntent.js`, `Order.js`, `DiscountRedemption.js`, `CustomizationTemplate.js`, `DiscountCode.js`, `BundleRule.js`, `ShippingConfig.js`, `Upload.js`, `UploadQuota.js`, `NotificationEvent.js`, `AdminAudit.js`
- `server/src/commerce/audit.js`, `cart.js`, `configuration.routes.js`, `customization.js`, `errors.js`, `inventory.js`, `models.js`, `notifications.js`, `orders.js`, `ownership.js`, `pricing.js`, `promotions.js`, `routes.js`, `storage.js`, `uploads.js`, `uploads.routes.js`
- `server/scripts/run-commerce-jobs.js`
- `server/test/commerce-configuration.test.js`, `commerce-configuration-pagination.test.js`, `commerce-configuration-api.test.js`, `commerce-orders.test.js`, `commerce-storage.test.js`, `commerce-provider-contracts.test.js`
- `client/src/commerce/api.js`, `CartContext.jsx`, `ConfiguredFields.jsx`, `animation.js`, `commerce.css`, `AdminEditors.jsx`, `CategoryRestrictions.jsx`
- `client/src/pages/CartPage.jsx`, `CheckoutPage.jsx`, `OrdersPage.jsx`, `TrackOrderPage.jsx`, `CustomizationPage.jsx`, `AdminCommercePage.jsx`, `AdminOrderPage.jsx`, `AdminProductConfigurationPage.jsx`
- `client/e2e/commerce-fixtures.js`, `commerce.spec.js`

Modified:

- Root `AGENTS.md`, `README.md`, `.gitignore`
- `server/package.json`, `server/package-lock.json`, `server/.env.example`
- `server/src/app.js`, `server/src/config/env.js`, `server/src/config/db.js`
- `server/src/models/Product.js`, `server/src/models/ComponentOption.js`
- `server/src/catalog/validation.js`, `public-presentation.js`, `product-policy.js`, `service.js`
- `server/scripts/run-tests.js`, `server/test/helpers/database.js`, `server/test/database-connection.test.js`
- `client/src/main.jsx`, `client/src/App.jsx`
- `client/src/components/Header.jsx`, `client/src/components/ProductCard.jsx`
- `client/src/pages/ProductPage.jsx`, `AuthPage.jsx`, `AdminProductsPage.jsx`, `AdminProductFormPage.jsx`
- `client/e2e/catalog-fixtures.js`, `catalog-browser.spec.js`, `catalog-preview.spec.js`

## Remaining integration and exact next steps

1. Review this implementation with checkout disabled. Safe local verification from the appropriate folders is `npm.cmd test`, then server `npm.cmd run check`, or client `npm.cmd run lint` and `npm.cmd run build`. `npm.cmd run commerce:jobs` is an offline dry-run and performs no database/storage/email writes.
2. After explicit authorization, configure the dedicated Atlas staging database and scoped database user/IP access using [Phase 1C](PHASE_1C_STAGING.md). Transactions require a replica set; a standalone local MongoDB cannot perform cart/order/configuration writes. Do not open Atlas access globally or use production credentials. Runtime target and connected-write guards reject production/foreign/default database names.
3. Separately authorize the first persistent catalog import using the documented Phase 1C dry-run/target/write procedure. None was performed here. Merchant review must resolve flagged source classifications and explicitly configure/approve prices, inventory, categories, templates/components and product requirements. Imported draft/provisional items remain excluded from carts and public shopping.
4. Separately authorize private staging storage setup. Set the five R2 environment values shown in `server/.env.example`, scope keys to the private bucket, configure CORS for the exact approved client origin and PUT/Content-Type, then verify one disposable staging file through sign → direct PUT → complete → cart → order → explicit admin View. Test ownership denial, ETag/overwrite protection and expiry. Do not bulk-upload catalog images or reuse a public media bucket for customer files.
5. Separately authorize development-safe email verification. Configure a verified sender, provider key, safe recipient allowlist and `NOTIFICATIONS_ENABLED=true`; process only deliberately created staging test events. The bounded worker requires explicit terminal target/configuration plus `npm.cmd run commerce:jobs -- --once --target staging --confirm-writes --batch-size 20`. This command performs persistent writes and may use configured external providers; **do not run it before authorization**. Schedule authorized batches later and monitor failed/dead events; no scheduler/external service was created here.
6. Keep `CHECKOUT_ENABLED=false` and `COMMERCE_LAUNCH_AUTHORIZED=false` until a separate launch decision. Both must be true for checkout. Tests override the in-memory flag only for disposable fixtures. Production database targets are still deliberately rejected; production support, deployment and launch authorization belong to a later task.
7. Before launch, verify real R2/Atlas/provider behavior, origin/cookie/trusted-proxy configuration, merchant configuration and fulfillment operations. Existing account email verification and a paid-order refund/cancellation policy remain launch dependencies; this task does not invent a refund flow, verified-phone account linking, customer reviews, sales rankings or merchant catalog data. Customer receipt replacement after rejection can be handled only after a reviewed policy; rejection never automatically charges, refunds or marks payment paid.

No production/staging persistent import, external R2 upload, real email, real customer order/payment, commit, push, deployment or unrelated SEO/advertising work was performed. Test orders exist only in disposable isolated fixtures.
