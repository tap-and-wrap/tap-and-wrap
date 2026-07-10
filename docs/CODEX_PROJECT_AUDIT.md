# Tap & Wrap Repository Audit

Audit date: 2026-07-10  
Repository supplied at: `C:\Users\youss\tap-and-wrap`  
Audit mode: first-pass, read-only application audit; documentation files only

## Executive summary

Tap & Wrap is a substantial MERN ecommerce implementation with real product browsing, server-authoritative pricing, customization, bundle offers, discount codes, checkout, four payment methods, customer uploads, order tracking, service requests, an admin area, email notifications, analytics, store settings, and deployment manifests. The architecture is generally coherent and the highest-risk order creation path uses a MongoDB transaction correctly.

The project is not ready for a public launch yet. The current Render build is blocked because `server/package.json` and `server/package-lock.json` describe different dependency trees while `render.yaml` uses `npm ci`. Order creation has no idempotency key, unpaid card orders never expire, several invalid order/payment combinations are allowed, Paymob callback processing has race and order-matching gaps, customer discount limits are not concurrency-safe, role-based owner authorization is defined but never enforced, and there are no automated tests for these invariants.

The frontend production build succeeds, but lint fails with 10 errors and 11 warnings. The main JavaScript chunk is 871.93 kB minified (240.19 kB gzip). The supplied logo assets are valid and branded, but the visible header/footer render a text recreation instead of the supplied logo, contrary to the stated branding requirement.

Overall project health: **58/100**.

Finding counts used throughout this handoff:

| Severity | Count |
| --- | ---: |
| P0 | 1 |
| P1 | 13 |
| P2 | 19 |
| P3 | 4 |

## Repository state

- Git metadata is not present in the supplied workspace. `git -C C:\Users\youss\tap-and-wrap rev-parse --show-toplevel`, `git branch --show-current`, and `git status` report “not a git repository.” Therefore the current branch, modified files, untracked files, commit history, and whether `.env` files are tracked cannot be verified.
- The root contains `client/`, `server/`, `.gitignore`, `README.txt`, and `render.yaml` before this audit's `docs/` output.
- No root `package.json` exists. Client and server are separate npm projects.
- Real `.env` files exist in `client/` and `server/`. Their values were not printed, copied, or modified. Only variable names and safe configured/unconfigured classifications were inspected.
- `.gitignore` excludes root/client/server `.env` variants while allowing example files.
- The IDE context referenced `client/.env.production.example` and `README-PUBLIC-LAUNCH-POLISH.txt`, but those files were not present in the actual supplied filesystem. Repository files are the source of truth.
- Runtime: Node `v24.13.0`, npm `11.8.0`. Both package manifests require Node `>=20.19.0`.

### Package scripts

Client: `dev`, `build`, `lint`, `preview`, `check:env`. There is no test script.  
Server: `dev`, `start`, seed scripts, `test:email`, `check:env`, and `check:paymob`. There is no test or lint script.

### Environment names

Client examples/code: `VITE_API_URL`, `VITE_SITE_URL`, `VITE_META_PIXEL_ID`; SEO generator also accepts `SITE_URL` at script runtime.

Server code/examples: `NODE_ENV`, `PORT`, `MONGO_URI`, `CLIENT_URL`, `CLIENT_URLS`, `SERVER_URL`, `JWT_SECRET`, `ADMIN_COOKIE_NAME`, `ADMIN_COOKIE_DAYS`, `ADMIN_TOKEN_EXPIRES_IN`, `ADMIN_COOKIE_SAME_SITE`, `ADMIN_COOKIE_DOMAIN`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `ADMIN_NOTIFICATION_EMAIL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_ROOT_FOLDER`, `WHATSAPP_NUMBER`, `INSTAPAY_HANDLE`, `VODAFONE_CASH_NUMBER`, `SHIPPING_CAIRO_GIZA`, `SHIPPING_OTHER_GOVERNORATES`, `LOW_STOCK_THRESHOLD`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_APP_PASSWORD`, optional `EMAIL_PASS`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`, `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID_CARD`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET`, `PAYMOB_RESULT_SECRET`, `PAYMOB_BASE_URL`, `PAYMOB_PAYMENT_KEY_EXPIRATION`, and `PAYMOB_REQUEST_TIMEOUT_MS`.

Safe classification of the current local environment: development mode; client API/site URLs are local; Cloudinary and SMTP are configured; Paymob is not configured. No live service was called.

## Commands run and results

### Successful

- `node --version` -> `v24.13.0`.
- `npm.cmd --version` -> `11.8.0`.
- `client: npm.cmd run build` -> success; 2,454 modules; JS 871.93 kB/240.19 kB gzip; chunk-size warning.
- `server: npm.cmd run check:env` -> success in development; localhost origins reported.
- Server `node --check` over every `server/src/**/*.js` -> all passed.
- `client: npm.cmd ls --depth=0` -> completed, but reported five extraneous transitive packages.
- `server: npm.cmd run check:paymob` -> command completed and correctly reported Paymob NOT CONFIGURED; result signing secret available through fallback; callback URLs local.
- Logo/PWA asset inspection -> PNG dimensions valid: 32, 48, 180, 192, 512, maskable 512, and OG 1200x630. Visual inspection confirms Tap & Wrap artwork, not a generic icon.

### Failed or blocked

- `client: npm.cmd run lint` -> 10 errors, 11 warnings. Exact errors are summarized in P2-01.
- `client: npm.cmd run check:env` -> missing `VITE_API_URL` and `VITE_SITE_URL` in the shell environment. The script does not load `client/.env`; safe inspection showed both local `.env` entries are set to local URLs.
- `server: npm.cmd ls --depth=0` -> `ELSPROBLEMS`; installed/locked Cloudinary 1.41.3, Mongoose 9.7.4, and Nodemailer 9.0.3 are invalid against `server/package.json` ranges.
- `server: npm.cmd ci --dry-run --offline --ignore-scripts` -> could not resolve the requested Cloudinary tree from the offline cache and exposed the Cloudinary peer-version conflict.
- `client: npm.cmd audit --package-lock-only --audit-level=high` -> registry audit blocked by local certificate trust: `unable to verify the first certificate`.
- `server: npm.cmd audit --package-lock-only --omit=dev --audit-level=high` -> same certificate failure.
- Bare `npm` commands were initially blocked by PowerShell's disabled `npm.ps1` execution; the equivalent `npm.cmd` commands were used.
- Git discovery commands failed because `.git` is absent.

No dependency installation was performed. No server was started because that would connect to the configured database, and the backend dependency tree is currently inconsistent. No email was sent.

## Architecture map

### Frontend

- React 19 + Vite 8 + Tailwind 4.
- React Router 7 routes are declared in `client/src/App.jsx`; the production build confirms the imported router and Lucide exports resolve.
- TanStack Query is the remote-data layer. Feature modules under `client/src/features/` call the Axios client in `client/src/lib/apiClient.js`.
- `CartContext` persists cart items and a discount code in localStorage. `AdminAuthContext` restores cookie-backed admin identity. React Hook Form + Zod handle checkout/service/admin forms.
- Shared public shell: `Header`, `Footer`, SEO manager, loading/error states, product/card/customization/upload components.
- All pages are synchronously imported into one application chunk.

Public routes: `/`, `/shop`, `/services`, `/track-order`, `/payment-result`, `/faq`, `/delivery-returns`, `/privacy-policy`, `/terms`, `/contact`, `/categories/:slug`, `/products/:slug`, `/cart`, `/checkout`, `/order-success/:orderNumber`, and `*`.

Admin routes: `/admin/login`, `/admin`, `/admin/orders`, `/admin/orders/:id`, `/admin/products`, `/admin/products/new`, `/admin/products/:id`, `/admin/categories`, `/admin/services`, `/admin/services/:id`, `/admin/offers`, `/admin/discounts`, `/admin/analytics`, `/admin/settings`.

### Backend

- Express 5 application with Helmet, exact-origin CORS, Origin checks for unsafe browser methods, global and route-level rate limits, JSON/urlencoded parsing, cookies, development logging, 404 and error handlers.
- MongoDB/Mongoose models: Admin, BundleOffer, Category, Counter, DiscountCode, Order, Product, ServiceRequest, StoreSettings.
- Route groups: health, categories, products, store config, orders, order tracking, Paymob, uploads, discounts, pricing, service requests, and protected admin route groups.
- External services: MongoDB, Cloudinary, SMTP/Nodemailer, Paymob Accept, and frontend/browser storage.
- Startup validates environment, connects MongoDB, starts HTTP, and handles SIGTERM/SIGINT, unhandled rejections, uncaught exceptions, and database disconnect.

### Main flows

1. Product browsing: pages -> React Query product/category APIs -> public Express routes -> serializers -> Product/Category.
2. Cart: `CartContext` stores product/customization snapshots locally; UI subtotal is informational.
3. Pricing preview: cart/checkout sends product IDs, quantities, customization choices, governorate, customer email, and code -> `calculateOrderPricing` reloads authoritative products/prices -> bundle offers -> code discount -> totals.
4. Checkout/order creation: Zod validation -> payment availability/proof trust -> MongoDB transaction -> pricing/reservations -> atomic stock decrement -> counter/order number -> Order insert.
5. Manual proof: public rate-limited upload -> Cloudinary folder -> URL/public ID returned -> order validates prefixes -> `pending_review`.
6. Card: committed order -> Paymob authentication/order/payment-key -> iframe redirect; retry uses order number + email.
7. Tracking: order number + checkout email -> sanitized order/status/customization response.
8. Admin order update: cookie auth -> transition validation -> cancellation stock restore + Order save hook promotion restore in a transaction -> queued customer email.
9. Discount application/restoration: after offers, code is validated and total use atomically incremented; cancellation hook decrements once using an order flag.
10. Bundle offers: deterministic priority/created order; units are consumed once across offers; usage counters reserved and restored with order flags.
11. Stock: authoritative product-level stock check and conditional decrement; cancellation restores aggregated order lines through bulk writes.
12. Service requests: optional trusted upload -> request insert -> admin/customer email -> protected transition/quote update.
13. Store settings: singleton Mongo document -> 60-second process cache -> public sanitized config; admin can mutate settings.
14. Email: in-process queued tasks -> escaped templates -> admin/customer recipients; failures are logged and do not reject checkout/update responses.
15. Upload lifecycle: Multer memory upload -> MIME/size check -> Cloudinary transform/folder -> asset reference; product image deletion exists, customer orphan cleanup does not.

## Confirmed working areas

- Frontend production compilation, React Router imports, and Lucide imports succeed.
- Backend JavaScript syntax passes.
- Backend prices, customization charges, shipping, offers, and codes are recalculated from database/store settings; client prices are not accepted.
- Duplicate cart lines are aggregated for stock availability/decrement.
- Product snapshots include product/category IDs, name, slug, image, SKU, authoritative unit price, customization details/prices, quantity, and totals.
- Order creation uses one MongoDB transaction for pricing reservations, stock decrement, order number, and order insert.
- Global discount usage reservation is a conditional atomic update.
- Cancellation restoration flags and transaction/session propagation prevent normal repeated cancellation from double-restoring stock, discount count, or offer count.
- Card is disabled unless Paymob credentials are complete and the stored setting is enabled. No Paymob secret is exposed to the client.
- Paymob HMAC uses the documented transaction callback fields in order with SHA-512 and timing-safe comparison. Amount, currency, and integration ID are checked. A browser result uses an application signature and current server state; it cannot independently mark an order paid.
- Duplicate callbacks for the same transaction ID are atomically deduplicated.
- Paid/refunded states are protected from ordinary downgrade by a later failed callback in the sequential case.
- Retry rejects paid/refunded and cancelled/delivered orders.
- `EMAIL_APP_PASSWORD` is supported with `EMAIL_PASS` fallback. Missing SMTP skips mail without crashing. User-controlled HTML content is escaped. Payment proof links are only included in the admin new-order email. Internal admin notes are not included in customer templates.
- Uploads are limited to one file, 5 MB, and JPEG/PNG/WebP MIME types; SVG is excluded; Cloudinary folders/public IDs are server-generated; transformations cap dimensions and use automatic format/quality.
- JWTs have issuer, audience, subject, expiry, and type; verification enforces issuer/audience. Cookies are HttpOnly, Secure in production, SameSite-aware, and cleared with matching base options.
- Admin login errors are generic and login is rate-limited to five failed requests per 15 minutes.
- Exact CORS origins, proxy trust, unsafe-method Origin validation, Helmet, hidden Express signature, production-safe 500 messages, and route authorization exist.
- Store settings prevent enabling card without credentials or disabling every payment method.
- SPA rewrites, immutable hashed-asset cache headers, health path, Node engine, PWA manifest/icons, robots, sitemap, canonical generation, and basic structured data exist.
- Global focus-visible and reduced-motion CSS exists.

## Findings

### P0

#### P0-01 — Render's `npm ci` dependency tree is unsynchronized

- Files: `render.yaml:6-9`, `server/package.json:22-39`, `server/package-lock.json` root package and locked package entries.
- Evidence: Render runs `npm ci`. The manifest requests, among other differences, Cloudinary `^2.7.0`, Mongoose `^8.19.1`, and Nodemailer `^7.0.9`; the lock root requests/locks Cloudinary 1.41.3, Mongoose 9.7.4, and Nodemailer 9.0.3. `npm ls` reports all three invalid. `multer-storage-cloudinary@4` also declares a Cloudinary 1.x peer and is not imported by application code.
- Impact: a clean Render build can fail or install an unreviewed major-version set; the deployed backend is not reproducible.
- Recommended fix: decide the supported package versions, remove the unused `multer-storage-cloudinary` dependency or resolve its peer compatibility, regenerate `server/package-lock.json`, then run `npm ci`, syntax checks, and integration tests on Node 20/22.
- Safe to fix automatically: partially; lock regeneration is mechanical, but major-version selection requires review.
- Test: delete a disposable copy's `node_modules`, run `npm ci`, `npm ls --depth=0`, `npm run check:env`, syntax checks, API tests, and a Render preview deploy.

### P1

#### P1-01 — Order creation has no idempotency contract

- Files: `server/src/routes/order.routes.js:8-20`, `server/src/controllers/order.controller.js:199-355`, `client/src/features/orders/orderApi.js:5-14`.
- Evidence: every POST creates/reserves/decrements a new order. There is no client request ID, idempotency header, unique checkout key, or lookup/replay response.
- Impact: timeout/double-click/retry can create duplicate orders, reserve promotions twice, and decrement stock twice.
- Recommended fix: require a cryptographically random checkout idempotency key, store it under a unique index, and return the existing order for a repeated identical request; reject mismatched replays.
- Safe to fix automatically: no; schema/API/migration and UX behavior need design.
- Test: issue two concurrent identical POSTs with one key and assert one order/one stock decrement/one usage reservation.

#### P1-02 — Unpaid card orders strand stock and promotion usage indefinitely

- Files: `server/src/controllers/order.controller.js:270-355`, `server/src/controllers/order.controller.js:367-399`, `server/src/models/Order.js:937-963`; no expiry worker exists under `server/src`.
- Evidence: stock and offers/codes are reserved before Paymob initialization. Initialization failure leaves the order unpaid with retry instructions. Only manual cancellation restores resources.
- Impact: abandoned/failed card checkouts can make sellable stock unavailable and exhaust discount/offer counters.
- Recommended fix: add `paymentExpiresAt`/reservation state and an idempotent expiry worker that cancels eligible unpaid card orders transactionally; define behavior for late callbacks.
- Safe to fix automatically: no.
- Test: expire an unpaid order twice and assert one restoration; race expiry against a paid callback.

#### P1-03 — Admin transitions permit financially impossible order/payment combinations

- Files: `server/src/controllers/adminOrder.controller.js:19-35`, `server/src/controllers/adminOrder.controller.js:311-492`.
- Evidence: any pending-through-out-for-delivery order can be cancelled without checking `payment.status`; any order can advance to delivered without checking a failed/unpaid card; payment can be marked paid/refunded without checking order cancellation/delivery or method.
- Impact: paid orders can be cancelled/restocked without a refund, failed card orders can be fulfilled, and cancelled/restocked orders can later be marked paid.
- Recommended fix: centralize an order/payment state machine with method-specific invariants and explicit paid-cancellation refund workflow.
- Safe to fix automatically: no.
- Test: table-driven tests for every COD/manual/card state pair and transition.

#### P1-04 — A delayed Paymob success can pay an already-cancelled/restocked order

- Files: `server/src/controllers/paymob.controller.js:186-448`, especially matching/validation at 204-261 and unconditional status update at 299-414; retry guard only at 550-570.
- Evidence: callback processing verifies payment method but never rejects or reconciles `order.status === "cancelled"`. A cancellation can restore stock, followed by a valid delayed success that sets payment paid.
- Impact: customer charge with no reserved inventory; overselling and manual refund burden.
- Recommended fix: serialize cancellation and callback handling in transactions; for a paid callback on cancelled/expired order, create a reconciliation/refund-required state instead of ordinary paid fulfillment.
- Safe to fix automatically: no.
- Test: concurrently cancel and submit a signed success fixture; assert one deterministic reconciled outcome.

#### P1-05 — Paymob order matching accepts inconsistent identifiers

- Files: `server/src/controllers/paymob.controller.js:151-183`, `server/src/controllers/paymob.controller.js:204-261`.
- Evidence: merchant order ID and Paymob order ID are combined with `$or`; when both exist, the code does not require both to identify the same order.
- Impact: a valid signed callback containing inconsistent identifiers can attach to whichever order matches one identifier if other checks happen to match.
- Recommended fix: match the stored Paymob order ID and merchant order ID together when both are present; reject disagreement and enforce uniqueness on Paymob order ID.
- Safe to fix automatically: yes after fixtures are added.
- Test: signed fixtures with matching, missing, and conflicting identifiers.

#### P1-06 — Concurrent different Paymob transactions can overwrite from stale payment state

- Files: `server/src/controllers/paymob.controller.js:263-414`.
- Evidence: next status is calculated from a previously read document. The atomic update filters only `_id` and absence of that transaction ID, not the expected current payment status. Two different transaction callbacks can both compute from stale `unpaid`; the last write can overwrite a paid state with failed.
- Impact: a successful payment can be reported failed during concurrent attempts/callbacks.
- Recommended fix: use a transaction or compare-and-set filter on current state, then retry/re-evaluate; encode precedence in the database update.
- Safe to fix automatically: no.
- Test: race signed success and failure fixtures with distinct transaction IDs repeatedly.

#### P1-07 — Per-customer discount limits are not race-safe

- Files: `server/src/services/discount.service.js:76-153`.
- Evidence: per-customer usage is `countDocuments` followed later by a separate global counter increment/order insert. Concurrent transactions for the same email can both observe a count below the limit.
- Impact: customers can exceed a per-customer promotion cap; marketing cost and inconsistent enforcement.
- Recommended fix: maintain a unique customer-discount reservation/usage record with atomic count/unique keys, or another serialized per-customer mechanism inside the order transaction.
- Safe to fix automatically: no; requires a data model.
- Test: concurrent orders for one email at limit 1; exactly one succeeds.

#### P1-08 — Owner role authorization is defined but never used

- Files: `server/src/middleware/adminAuth.middleware.js:58-68`; every admin route under `server/src/routes/admin*.routes.js`, notably settings, discounts, offers, product/category delete, order/payment updates.
- Evidence: `requireOwner` exists but `rg` finds no route use. Any active `admin` role can change payment settings, prices/promotions, delete catalog data, cancel orders, and mark payments.
- Impact: privilege escalation within the admin team and weak separation of duties.
- Recommended fix: define an authorization matrix and apply `requireOwner` to financial settings, destructive catalog/promotions actions, and sensitive payment overrides; log actor/action.
- Safe to fix automatically: no; owner policy needs confirmation.
- Test: authenticated owner/admin integration tests for every protected mutation.

#### P1-09 — Payment proofs are public Cloudinary assets with weak URL/public-ID binding

- Files: `server/src/config/uploadConfig.js:75-124`, `server/src/controllers/upload.controller.js:19-70`, `server/src/models/Order.js:888-895`, `server/src/services/notification.service.js:332-405`.
- Evidence: proofs use normal `secure_url` image delivery. Trust only checks that URL begins with the account hostname and public ID begins with the folder; it does not prove the URL encodes that exact public ID or that the asset belongs to this checkout.
- Impact: sensitive payment screenshots can be viewed by anyone with the URL and a known proof asset can be attached to another order.
- Recommended fix: use authenticated/private Cloudinary delivery or a protected admin proxy with short-lived signed URLs; create a server-side upload ticket bound to checkout/type and validate exact asset identity.
- Safe to fix automatically: no.
- Test: anonymous URL access must fail; cross-order asset reuse must fail; authorized admin link must expire.

#### P1-10 — Frontend deployment can build successfully with a runtime-fatal API configuration

- Files: `client/src/lib/apiClient.js:11-29`, `client/package.json:7-13`, `client/vercel.json:3-9`, `client/scripts/checkProductionEnv.mjs:1-63`, `client/.env.example:1-3`.
- Evidence: production module evaluation throws when `VITE_API_URL` is absent, but `build` does not run `check:env`. The supplied local `.env` URLs are local and no production example file is present. The standalone check does not load `.env`.
- Impact: Vercel can report a successful build that opens as a blank screen, or a production site can call localhost.
- Recommended fix: make the Vercel build run an environment-aware validation before Vite; add a production example and deploy checklist; validate HTTPS/non-local production URLs.
- Safe to fix automatically: yes, with agreed environment behavior.
- Test: build must fail for missing/local production values and succeed with preview URLs; smoke-test deployed `/` and a direct route.

#### P1-11 — The supplied logo is not used in the visible site chrome

- Files: valid asset `client/public/tap-wrap-logo.webp`; text recreation at `client/src/components/layout/Header.jsx:152-164` and `client/src/components/layout/Footer.jsx:67-74`.
- Evidence: the actual branded asset is unused by React. PWA, favicon, and OG images do contain the supplied logo.
- Impact: violates the explicit launch branding requirement and creates inconsistent visual identity.
- Recommended fix: use the supplied logo (or an approved optimized derivative) with correct alt/intrinsic dimensions in header/footer while retaining the existing accessible home label.
- Safe to fix automatically: yes after owner approves sizing/crop.
- Test: desktop/mobile visual regression plus asset/network inspection.

#### P1-12 — Zero-total orders are allowed but card initialization rejects them

- Files: `server/src/models/Product.js:201-230`, `server/src/services/pricing.service.js:100-105`, `server/src/services/paymob.service.js:35-51`, `server/src/controllers/order.controller.js:344-399`.
- Evidence: products/totals may be zero and pricing clamps grand total to zero. Paymob conversion rejects amount `<= 0` only after the order has committed and stock/promotions were reserved.
- Impact: a zero-total card checkout creates an unpaid order that can never initialize normally and strands inventory.
- Recommended fix: decide zero-total policy; either reject before transaction, force a non-card completion method/status, or prevent discounts from reducing payable card total below gateway minimum.
- Safe to fix automatically: no; business decision required.
- Test: free product, 100% code, fixed discount, and free-shipping-only cases across payment methods.

#### P1-13 — No automated tests cover launch-critical business invariants

- Files: `client/package.json:6-13`, `server/package.json:7-17`; no test files/config are present.
- Evidence: neither project has a test script. Pricing, transaction rollback, restoration, state transitions, Paymob HMAC/idempotency/races, upload trust, auth/CORS/cookies, email escaping, and deployment smoke behavior are untested.
- Impact: high regression probability while fixing the P0/P1 issues; several race defects cannot be safely verified manually.
- Recommended fix: add server unit/integration tests with MongoDB replica-set support and signed Paymob fixtures; add frontend component/flow tests and a small production E2E suite.
- Safe to fix automatically: partially; scaffolding yes, business assertions require review.
- Test: CI must run tests, lint, build, env validation, and clean install.

### P2

#### P2-01 — Frontend lint fails

- Files/evidence: `DiscountCodeBox.jsx:25`, `Header.jsx:114`, `AdminAuthContext.jsx:39,77`, `CartContext.jsx:360`, `AdminOrderDetailsPage.jsx:93`, `AdminProductEditorPage.jsx:131`, `AdminServiceRequestDetailsPage.jsx:167`, `AdminSettingsPage.jsx:187`, `AdminDiscountsPage.jsx:129`, plus 11 hook/compiler warnings listed by ESLint.
- Impact: CI quality gate cannot pass; effect-derived state and dependency issues raise stale/cascading-render risk.
- Fix: refactor state initialization/synchronization, split hook exports, remove unused function, and resolve hook dependencies deliberately.
- Safe automatically: mostly, but admin form reset behavior needs regression testing.
- Test: `npm run lint`, form edit/load flows, menu close, auth restore, discounts.

#### P2-02 — One 872 kB frontend chunk contains every public/admin page

- Files/evidence: synchronous imports `client/src/App.jsx:7-36`; Vite warning for `dist/assets/index-*.js` at 871.93 kB.
- Impact: slower first load and parse time, especially mobile; admin code ships to shoppers.
- Fix: route-level `lazy`/Suspense, vendor chunk review, defer admin pages, measure rather than raising the warning limit.
- Safe automatically: yes with loading/error tests.
- Test: build chunk report, Lighthouse/WebPageTest on mid-tier mobile, direct-route refresh.

#### P2-03 — Upload acceptance relies on claimed MIME before Cloudinary decode

- Files/evidence: `server/src/middleware/upload.middleware.js:5-32`; no local signature/magic-byte inspection.
- Impact: disguised files consume memory/network and make validation dependent on Cloudinary behavior.
- Fix: inspect JPEG/PNG/WebP signatures and decode metadata before upload; keep Cloudinary validation/transform.
- Safe automatically: yes.
- Test: valid images, renamed executable, polyglot/truncated images, decompression limits.

#### P2-04 — Customer and pre-save catalog uploads can become permanent orphans

- Files/evidence: `server/src/controllers/upload.controller.js:75-153`, `adminUpload.controller.js:61-106`; only attached/removed product images are cleaned by `adminProduct.controller.js:230-258,781,847`.
- Impact: abandoned engraving/proof/service uploads and failed forms accumulate storage and sensitive data.
- Fix: pending-upload records/tags with TTL cleanup, explicit abandon/delete endpoint, and retention rules for proof/service assets.
- Safe automatically: no; retention policy required.
- Test: upload then abandon/fail/cancel/delete; scheduled cleanup removes only unreferenced expired assets.

#### P2-05 — Email is resilient but not explicitly disableable or durable

- Files/evidence: `server/src/config/email.js:41-179`, `email.service.js:95-103`; no `EMAIL_ENABLED` flag, queue, retry, or delivery persistence.
- Impact: operators cannot intentionally disable a fully configured SMTP account without removing values; a process restart can lose queued notifications.
- Fix: support explicit enable/disable, persist important jobs or use an external queue, record delivery attempts, document Render SMTP tests and environment-specific certificate handling.
- Safe automatically: partial.
- Test: disabled, partial, valid, rejected, timeout, restart-after-response scenarios; confirm checkout still succeeds.

#### P2-06 — Skip link target is missing on most public flows; mobile menu lacks dialog focus behavior

- Files/evidence: skip link `Header.jsx:143-148`; `main-content` exists only on six content pages, not Home/Shop/Category/Product/Cart/Checkout/Services/Track/Success/Payment. Menu `Header.jsx:219-290` has no Escape handler, focus transfer, or focus containment.
- Impact: keyboard/screen-reader users cannot reliably skip navigation; focus can remain behind an open mobile menu.
- Fix: put `id="main-content"` on every public main and implement Escape/focus return; use a disclosure pattern or dialog semantics as appropriate.
- Safe automatically: yes.
- Test: keyboard-only navigation and screen readers on every public route.

#### P2-07 — Admin mobile layout puts the full sidebar above every page

- Files/evidence: `client/src/components/admin/AdminLayout.jsx:105-225`; the grid becomes one column and the entire aside remains expanded.
- Impact: repeated long scrolling and poor mobile order-management usability.
- Fix: responsive drawer/compact nav with focus management and persistent page header actions.
- Safe automatically: no; UX review advised.
- Test: 320/375/768 widths, keyboard, long forms/tables.

#### P2-08 — PWA assets exist but there is no service worker/offline strategy

- Files/evidence: `client/public/site.webmanifest`; no service-worker registration or PWA plugin in package/config/source.
- Impact: “PWA” is manifest/icon-only; no controlled offline/fallback behavior or update lifecycle.
- Fix: either label it installable branding only or add a deliberately scoped service worker; never cache checkout/admin/API responses as stale data.
- Safe automatically: no.
- Test: installability, offline navigation, update, cache purge, private-route behavior.

#### P2-09 — SEO is client-only and omits catalog URLs/data

- Files/evidence: `SeoManager.jsx:121-223` derives product/category text from slugs rather than API SEO fields; structured data is generic at 296-373; sitemap has only static routes; initial OG image URLs are relative in `index.html:46-68`.
- Impact: social bots and non-JS crawlers receive generic metadata; products/categories are absent from sitemap and Product schema markup.
- Fix: prerender/SSR or generate catalog-aware HTML/sitemap; use product `seoTitle`/`seoDescription`, absolute OG URLs, Product/Breadcrumb schema, and a confirmed final domain.
- Safe automatically: no; deployment approach needed.
- Test: rendered HTML fetch without JS, social debugger, Search Console, schema validator.

#### P2-10 — Analytics labels financial/order demand as revenue/sales without payment qualification

- Files/evidence: `adminAnalytics.controller.js:200-241,300-436`; delivered revenue includes all delivered orders regardless payment status; “top products” includes every non-cancelled order and sums pre-offer line totals. Dashboard duplicates delivered-only-without-payment filter at `adminOrder.controller.js:139-153`.
- Impact: failed/unpaid card orders can count as revenue; pending demand is reported as quantity sold; discounts distort product revenue.
- Fix: define recognized revenue (paid, or COD delivered/collected), demand, gross merchandise value, and net item revenue separately.
- Safe automatically: no; accounting semantics required.
- Test: fixture matrix by method, order status, payment status, offers, refunds, cancellation.

#### P2-11 — Current environment names drift from code-supported names

- Files/evidence: safe name-only inspection found current `server/.env` uses `COOKIE_SAME_SITE`, `COOKIE_SECURE`, and `JWT_EXPIRES_IN`, while code reads `ADMIN_COOKIE_SAME_SITE`, derives secure, and reads `ADMIN_TOKEN_EXPIRES_IN` in `authToken.js:25-107,123-164`. Examples use the code names.
- Impact: operators can believe security/session settings are active when they are ignored.
- Fix: remove stale aliases from local/deployment configuration or explicitly support/deprecate them with warnings; add unknown-variable checks.
- Safe automatically: no real `.env` values should be auto-edited during this audit.
- Test: startup configuration tests inspect effective options without logging secrets.

#### P2-12 — Deployment configuration and operating documentation are incomplete

- Files/evidence: `render.yaml` declares only core DB/JWT/URLs/cookie/Cloudinary values; email, Paymob, admin seed, store/payment settings, Atlas transaction requirement, callback setup, and rollback steps are undocumented. Root `README.txt` is an old bundle-pricing copy list; `client/README.md` is the Vite template.
- Impact: high likelihood of a technically successful but nonfunctional or insecure launch.
- Fix: use the generated handoff/fix plan as baseline; document Atlas replica set/IP access, Vercel variables, Render variables, admin seeding, Cloudinary, SMTP, Paymob callbacks, health/smoke tests, and rollback.
- Safe automatically: documentation yes; platform changes no.
- Test: a new operator performs a clean staging deployment using only docs.

#### P2-13 — Cross-site Vercel/Render admin cookie behavior is browser-dependent

- Files/evidence: `authToken.js:25-107` uses production `SameSite=None; Secure`; Axios uses credentials in `apiClient.js:32-49`; `render.yaml:26-27` selects `none`.
- Impact: unrelated `*.vercel.app` and `*.onrender.com` sites make the API cookie third-party. Browser privacy controls may block admin sessions even though CORS is correct.
- Fix: use first-party custom domains (for example site and API subdomains under one registrable domain) or same-origin proxy/BFF; verify browser matrix before launch.
- Safe automatically: no; DNS/deployment decision.
- Test: Safari, Firefox, Chrome privacy modes, desktop/mobile, login/logout/refresh.

#### P2-14 — Static frontend lacks a Content Security Policy

- Files/evidence: `client/vercel.json:12-39` has nosniff/referrer/permissions headers but no CSP or frame policy.
- Impact: reduced defense-in-depth against XSS/clickjacking; external image/API/payment domains are not explicitly constrained.
- Fix: deploy a tested CSP (prefer nonce/hash where feasible), `frame-ancestors`, and compatible Paymob/Cloudinary/connect/img directives.
- Safe automatically: no; must be report-only tested first.
- Test: CSP report-only logs across all pages, Paymob redirect, Cloudinary, admin.

#### P2-15 — Category images accept arbitrary admin-supplied URLs/public IDs

- Files/evidence: `adminCategory.controller.js:21-26`; unlike products at `adminProduct.controller.js:73-126`, category normalization does not call `isTrustedUpload`.
- Impact: accidental external tracking/broken/malicious content and inconsistent cleanup/trust rules.
- Fix: reuse trusted Cloudinary validation and lifecycle cleanup for categories.
- Safe automatically: yes after handling existing data.
- Test: trusted asset succeeds; external/mismatched asset fails; delete cleans orphan.

#### P2-16 — Signed payment-result links never expire

- Files/evidence: result signature covers only order number, transaction ID, status at `paymob.service.js:776-824`; endpoint returns status/totals at `paymob.controller.js:703-783`.
- Impact: copied browser-history/link tokens retain indefinite access to order/payment summary.
- Fix: include issued/expiry time and optionally customer/session binding; minimize returned data.
- Safe automatically: yes with backward-compatibility choice.
- Test: valid, tampered, expired, and replayed links.

#### P2-17 — Global IP rate limiting includes Paymob callbacks

- Files/evidence: global limiter `server/src/app.js:194-215` runs before `/api/payments/paymob` at 281-284 and skips only health.
- Impact: a legitimate callback burst from shared Paymob egress can receive 429, delaying payment state.
- Fix: use a separate authenticated callback limiter/queue and reliable retry response strategy; retain HMAC verification.
- Safe automatically: no; traffic assumptions required.
- Test: callback burst and Paymob retry behavior; invalid-HMAC abuse remains bounded.

#### P2-18 — Promotion restoration can silently mark counters restored when no counter changed

- Files/evidence: `server/src/models/Order.js:970-1079` marks flags after conditional updates/bulk writes but does not inspect matched/modified counts.
- Impact: pre-existing counter drift can become permanent while the order says restoration completed.
- Fix: inspect results, log/reconcile mismatches, and make a repair command/report.
- Safe automatically: yes after deciding mismatch policy.
- Test: normal, zero/missing/corrupt counters, repeated cancellation.

#### P2-19 — Discount minimum subtotal deliberately uses the pre-offer subtotal without a documented rule

- Files/evidence: `pricing.service.js:52-60` passes `minimumSubtotalBase: subtotal` while discountable items/shipping are post-offer; `discount.service.js:215-223` checks that base.
- Impact: a code can qualify before an automatic bundle lowers merchandise below the advertised minimum. This may be intended but is not documented.
- Fix: confirm business policy and name/document it; if minimum should be after offers, use the adjusted subtotal.
- Safe automatically: no; business decision.
- Test: boundary cases combining bundle and code discounts.

### P3

#### P3-01 — Unused/incomplete scaffolding increases maintenance noise

- Files/evidence: `VITE_META_PIXEL_ID` is in `client/.env.example` but unused; Product variant schemas at `server/src/models/Product.js:41-93,251-254` have no API/admin/cart flow; Vite/React assets and `App.css` remain unused.
- Impact: operators expect analytics/variants that do not exist; dead files confuse handoff.
- Fix: implement with requirements or remove/deprecate from examples/model/docs.
- Safe automatically: no for schema/config; dead assets yes after import check.
- Test: `rg`, build, and migration/backward compatibility.

#### P3-02 — Many runtime images lack intrinsic dimensions/decoding hints

- Files/evidence: image sites found in CartItem, Checkout, ProductDetails, tracking, and admin pages; only product cards consistently use lazy loading.
- Impact: potential layout shift and avoidable decode/scroll cost.
- Fix: persist/use image dimensions, set aspect ratio and `width`/`height`, apply lazy/eager/fetch-priority intentionally.
- Safe automatically: partial.
- Test: Lighthouse CLS/LCP and slow-device visual checks.

#### P3-03 — Paymob transaction history caps can permit very old replay processing

- Files/evidence: `Order.js:642-651`; `paymob.controller.js:334-355` slices processed IDs to 50 and attempts to 20.
- Impact: after an unusually large number of attempts, an old signed callback ID may no longer be in the dedupe array.
- Fix: use a separate transaction collection with a unique gateway transaction ID and retention policy.
- Safe automatically: no; migration.
- Test: more than 50 attempts plus replay of the first ID.

#### P3-04 — Date-series construction mixes server-local and Cairo timezone boundaries

- Files/evidence: `adminAnalytics.controller.js:37-53,76-95` uses server local dates/UTC ISO keys, while aggregation at 314-319 groups in `Africa/Cairo`.
- Impact: first/last-day analytics can shift around timezone boundaries on UTC hosts.
- Fix: construct range/key boundaries explicitly in Cairo or UTC consistently.
- Safe automatically: yes with tests.
- Test: orders around Cairo midnight and DST/history boundaries.

## Security audit summary

Strong baseline: JWT claims/verification, HttpOnly/Secure/SameSite cookies, exact CORS, Origin checking, Helmet, generic login errors, brute-force limiting, protected admin APIs, escaped email HTML, route/body limits, and HMAC-verified Paymob callbacks.

Pre-launch security work: enforce owner permissions (P1-08), protect proof/reference assets (P1-09), add CSP (P2-14), validate exact callback identity/races (P1-05/P1-06), verify first-party cookie deployment (P2-13), add file signatures (P2-03), and complete a dependency vulnerability scan after resolving the certificate/lock issues. Because `.git` is absent, it is unverified whether secrets were ever committed; current ignore rules are correct.

## Data-integrity audit summary

The normal order transaction and cancellation flags are good. Primary integrity gaps are duplicate order retries, indefinite reservations, payment/order state invariants, Paymob cancellation/race handling, per-customer discount concurrency, and silent promotion-counter mismatch. MongoDB deployment must be a replica set (Atlas qualifies) for multi-document transactions; this was not live-tested.

## UX and accessibility audit summary

Pages have clear loading/error/empty patterns, responsive Tailwind layouts, labeled forms, cart count naming, payment explanations, proof upload guidance, order tracking, success/retry flows, focus-visible CSS, and reduced-motion CSS. Confirmed weaknesses are broken skip targets, mobile menu focus behavior, stacked admin mobile navigation, visible logo noncompliance, and lack of runtime browser/assistive-technology testing.

## Performance audit summary

Build output is functional but the single 871.93 kB JS chunk is the main concern. Product cards lazy-load images, Cloudinary transformations cap uploads, hashed assets receive immutable caching, and React Query avoids repeated focus fetches. Route code splitting, image dimensions/priority, and real mobile measurements are required before adding animation dependencies.

## Deployment audit summary

- Render manifest: correct root, health path, Node start, and core secret declarations; blocked by P0-01.
- Vercel manifest: Vite build/output, SPA rewrites, asset caching, and baseline headers are present.
- Direct route refresh is configured but not deployed-tested.
- Current local URLs are localhost; production Vercel/Render values are unverified.
- `robots.txt`/`sitemap.xml` currently use `https://tap-and-wrap.com`; ownership/live status was not assumed.
- Paymob is disabled in the current environment and local callback URLs are not publicly reachable.
- Email/Cloudinary are configured locally but were not exercised.
- MongoDB Atlas network/replica-set/user permissions were not verified.

## Untested areas

- Live MongoDB connection, indexes, transaction support, rollback, data shape, and migrations.
- Any real checkout/order mutation, stock or promotion reservation/restoration.
- Paymob account/integration/iframe credentials, dashboard callbacks, test card, refunds/voids, webhook retry behavior, and current account compatibility with the legacy Accept authentication/order/payment-key flow. Current Paymob docs emphasize payment intentions/hosted checkout but still describe callbacks as authoritative; account-specific support must be confirmed with Paymob.
- SMTP connection, self-signed certificate behavior, Render outbound SMTP, recipients, and deliverability.
- Cloudinary uploads/delivery/authenticated assets/deletion.
- Browser console/network, responsive screenshots, keyboard/screen reader, Lighthouse/Core Web Vitals, PWA install, direct production refresh.
- Vercel/Render live configuration, DNS/custom domains, CORS/cookies across browsers.
- Dependency advisories because npm registry audit failed on local certificate trust.
- Git state/history and whether secrets were previously committed.

## Launch blockers

1. Repair and clean-install the backend dependency lock used by Render (P0-01).
2. Add order idempotency and an expiry/reconciliation lifecycle for unpaid card reservations (P1-01/P1-02).
3. Enforce one coherent payment/order state machine, including cancellation/refund and late Paymob callbacks (P1-03/P1-04/P1-06/P1-12).
4. Fix Paymob identity matching and add signed callback concurrency tests before enabling card (P1-05/P1-13).
5. Enforce admin role policy and protect payment proofs before giving additional admin accounts or accepting real proofs (P1-08/P1-09).

Branding (P1-11), production environment gating (P1-10), cookie/domain verification (P2-13), lint, and core automated tests must also be complete before a public launch.

## Recommended next steps

Follow `docs/CODEX_FIX_PLAN.md` in order. Do not add React Bits effects until all “must fix before animations” items pass. Stage with test data and Paymob test credentials, run the full matrix, then deploy behind first-party custom domains. Repository files—not old handoffs—remain the source of truth.

## External references used for readiness checks

- Paymob states that backend callbacks are the source of truth and redirects are for user experience: https://developers.paymob.com/paymob-docs/integration-paths/apis
- Paymob callback/HMAC overview: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac
- React Bits current catalog/dependency references are recorded in `docs/REACT_BITS_ANIMATION_PLAN.md`.
