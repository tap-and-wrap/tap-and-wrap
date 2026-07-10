# Tap & Wrap Project Handoff

Repository files are the source of truth. Do not trust old handoffs, IDE tabs, deployment dashboards, or this document over the current files. Re-run discovery and verification at the start of the next development session.

## Purpose

Tap & Wrap is a MERN ecommerce storefront for gifts, engraving, gift wrapping, photo printing, custom gifts, service requests, and corporate gifting. It supports public catalog/checkout/tracking flows and a cookie-authenticated admin application.

## Current repository condition

- Supplied path: `C:\Users\youss\tap-and-wrap`.
- Git metadata is absent, so branch/status/history/uncommitted changes cannot be determined. Restore or locate the real Git checkout before editing.
- The audit added documentation only under `docs/`; no application files, `.env` values, commits, or pushes were made.
- Health score: 58/100. Findings: P0 1, P1 13, P2 19, P3 4.
- Frontend build succeeds; frontend lint fails; backend syntax/env validation succeeds; backend dependency manifest/lock is inconsistent and blocks reproducible Render install.
- Current safe environment classification: development/local URLs; Cloudinary and SMTP configured; Paymob not configured. Values are intentionally omitted.

## Technology and architecture

### Client

- React 19, Vite 8, Tailwind CSS 4.
- React Router 7, TanStack Query 5, Axios, React Hook Form, Zod, React Hot Toast, Lucide, Framer Motion.
- `client/src/App.jsx`: all routes; pages are currently synchronous imports.
- `client/src/lib/apiClient.js`: API base URL and credentialed Axios client.
- `client/src/context/CartContext.jsx`: localStorage cart/discount state.
- `client/src/context/AdminAuthContext.jsx`: cookie-backed admin session restore/login/logout.
- `client/src/features/`: thin API modules by domain.
- `client/src/components/seo/SeoManager.jsx`: client-side titles/meta/canonical/structured data.

### Server

- Node ESM, Express 5, Mongoose, Zod.
- `server/src/server.js`: environment validation, DB connect, listen, graceful shutdown.
- `server/src/app.js`: security/middleware and API mounting.
- Domain controllers/routes/models under matching folders.
- Pricing composition: `orderPricing.service.js` -> `bundleOffer.service.js` -> `discount.service.js` through `pricing.service.js`.
- External services: MongoDB, Cloudinary, SMTP, Paymob.

## Feature inventory

- Category/product listing, search/filtering, details, product images and service eligibility.
- Engraving text/image and wrapping options with server-recalculated prices.
- Persistent cart and authoritative pricing preview.
- Automatic `any_n` and fixed-product bundle offers.
- Percentage/fixed/free-shipping discount codes with total/customer limits and scopes.
- Checkout with address, COD, InstaPay, Vodafone Cash, and disabled-until-configured card payment.
- Manual payment proof upload/review.
- Order tracking by order number + email.
- Paymob initialization, retry, processed callback, response redirect, signed result display.
- Email confirmations/status updates for orders and service requests.
- Custom/corporate service requests with reference upload and admin quote/status handling.
- Admin dashboard, orders, catalog, categories, offers, discounts, services, analytics, settings.
- Store settings singleton for contact, shipping, payment enablement, and low-stock threshold.
- SEO basics, PWA manifest/icons, Vercel SPA config, Render API config.

## Public frontend routes

| Route | Page |
| --- | --- |
| `/` | Home |
| `/shop` | All products |
| `/categories/:slug` | Category |
| `/products/:slug` | Product details/customization |
| `/cart` | Cart/pricing preview |
| `/checkout` | Checkout |
| `/order-success/:orderNumber` | Success/manual/card retry |
| `/track-order` | Tracking |
| `/payment-result` | Signed Paymob result |
| `/services` | Service request |
| `/faq` | FAQ |
| `/delivery-returns` | Delivery/returns |
| `/privacy-policy` | Privacy |
| `/terms` | Terms |
| `/contact` | Contact |
| `*` | Not found |

## Admin frontend routes

`/admin/login`, `/admin`, `/admin/orders`, `/admin/orders/:id`, `/admin/products`, `/admin/products/new`, `/admin/products/:id`, `/admin/categories`, `/admin/services`, `/admin/services/:id`, `/admin/offers`, `/admin/discounts`, `/admin/analytics`, `/admin/settings`.

## API routes

All paths are under `/api`.

- Health: `GET /health`.
- Storefront: `GET /categories`, `GET /categories/:slug`, `GET /products`, `GET /products/:slug`, `GET /store-config`.
- Pricing/orders: `POST /pricing/preview`, `POST /discounts/validate`, `POST /orders`, `POST /order-tracking`.
- Upload/service: `POST /uploads/customer-image`, `POST /service-requests`.
- Paymob: `POST /payments/paymob/webhook`, `GET /payments/paymob/response`, `POST /payments/paymob/retry`, `GET /payments/paymob/result`.
- Admin auth: `POST /admin/auth/login`, `POST /admin/auth/logout`, `GET /admin/auth/me`.
- Admin orders: dashboard/list/detail, `PATCH /admin/orders/:id/status`, `PATCH /admin/orders/:id/payment`.
- Admin catalog: category/product list/create/detail/update/delete; authenticated product image upload.
- Admin promotions: offer/discount list/create/update/delete.
- Admin services: list/detail/update.
- Admin analytics: `GET /admin/analytics/overview`.
- Admin settings: `GET/PATCH /admin/store-settings`.

Read the route files for exact paths and middleware; do not rely solely on this summary.

## Important business invariants

These must remain true after every change:

1. The backend is the only pricing authority. Client price/totals must never be accepted.
2. Product/customization/shipping prices, offers, and codes are recalculated at order creation.
3. Stock check/decrement, promotion reservation, order number, and order insertion are one transaction.
4. Cart duplicate product lines are aggregated for stock.
5. Offer units cannot be allocated twice across offers.
6. Discount codes apply to post-offer eligible line amounts; the current minimum-subtotal qualification uses pre-offer subtotal pending a business decision.
7. Total discount never produces a negative grand total.
8. Stock, code usage, and offer usage restore at most once on cancellation.
9. A repeated checkout request should create at most one order—currently not implemented and the next high-risk fix.
10. Payment/order transitions must prevent fulfilment of failed card orders and cancellation/restock of paid orders without reconciliation—currently incomplete.
11. Paymob HMAC, amount, currency, integration, gateway order ID, and merchant order ID must all agree.
12. Browser redirects never mark payment paid; verified backend callbacks are authoritative.
13. Card remains disabled without complete credentials and an enabled store setting.
14. Customer-facing responses/emails never expose internal admin notes or sensitive upload URLs unnecessarily.
15. Only authorized roles may mutate financial/destructive settings—owner enforcement is currently missing.

## Exact known issues

The authoritative detailed list is `docs/CODEX_PROJECT_AUDIT.md`. Highest priority:

- P0: `server/package.json` and lock disagree while Render runs `npm ci`.
- No order idempotency; retries can duplicate reservations/orders.
- No automatic unpaid-card expiry/restoration.
- Invalid order/payment combinations and late-callback cancellation races.
- Paymob identifier matching uses `$or`; concurrent distinct callbacks can stale-overwrite state.
- Per-customer discount limit is count-then-reserve and not race-safe.
- `requireOwner` is unused across admin mutations.
- Payment proofs are publicly delivered and weakly bound to the order.
- Production frontend build does not gate environment; current client URLs are local.
- Actual logo asset is absent from visible header/footer.
- Zero-total card orders commit before Paymob rejects the amount.
- No automated tests; frontend lint fails 10 errors/11 warnings.
- Single 871.93 kB client JS chunk.
- Upload magic-byte/retention gaps, email durability gaps, skip-link/admin-mobile accessibility issues, incomplete SEO/PWA/deployment docs, analytics semantic errors, and missing CSP.

## Environment variables

Never copy real values into chat, docs, commits, logs, or client code.

### Client

- Required for production: `VITE_API_URL`, `VITE_SITE_URL`.
- Optional/unimplemented: `VITE_META_PIXEL_ID`.
- SEO generation script: `SITE_URL` or CLI URL.

### Core server

- `NODE_ENV`, `PORT`, `MONGO_URI`, `CLIENT_URL`, `CLIENT_URLS`, `SERVER_URL`, `JWT_SECRET`.

### Admin/session

- `ADMIN_COOKIE_NAME`, `ADMIN_COOKIE_DAYS`, `ADMIN_TOKEN_EXPIRES_IN`, `ADMIN_COOKIE_SAME_SITE`, `ADMIN_COOKIE_DOMAIN`.
- Seed/notifications: `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `ADMIN_NOTIFICATION_EMAIL`.
- Stale local names detected but ignored by code: `COOKIE_SAME_SITE`, `COOKIE_SECURE`, `JWT_EXPIRES_IN`.

### Cloudinary/uploads

- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optional `CLOUDINARY_ROOT_FOLDER`.

### Store defaults

- `WHATSAPP_NUMBER`, `INSTAPAY_HANDLE`, `VODAFONE_CASH_NUMBER`, `SHIPPING_CAIRO_GIZA`, `SHIPPING_OTHER_GOVERNORATES`, `LOW_STOCK_THRESHOLD`.

### Email

- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_APP_PASSWORD` (preferred), optional fallback `EMAIL_PASS`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`.

### Paymob

- Required to enable: `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID_CARD`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET`.
- Strongly explicit: `PAYMOB_RESULT_SECRET` (otherwise falls back to JWT/HMAC secret).
- Optional: `PAYMOB_BASE_URL`, `PAYMOB_PAYMENT_KEY_EXPIRATION`, `PAYMOB_REQUEST_TIMEOUT_MS`.

## Deployment status

- Repository contains Render and Vercel manifests, but no live deployment was verified.
- Render API build currently has a P0 dependency-lock blocker.
- Vercel can build the client but must receive production `VITE_*` values; local values must not be deployed.
- Use first-party site/API custom domains or a same-origin proxy to avoid third-party admin-cookie fragility.
- MongoDB must support transactions (Atlas replica set), with network/user permissions configured.
- Cloudinary and SMTP need staging smoke tests.
- Paymob is not configured locally; localhost callbacks are unreachable by Paymob. Keep card disabled until test credentials/dashboard callbacks and race tests pass.
- `robots.txt`/sitemap name `https://tap-and-wrap.com`; confirm the final domain before launch.

## Commands and current expectations

From `client/`:

```powershell
npm.cmd run build       # succeeds; chunk warning
npm.cmd run lint        # currently fails
npm.cmd run check:env   # requires shell/deployment values; does not load .env
```

From `server/`:

```powershell
npm.cmd run check:env      # succeeds with current development configuration
npm.cmd run check:paymob   # reports NOT CONFIGURED
npm.cmd ls --depth=0       # currently fails because manifest/lock/install disagree
```

Do not run `test:email` without explicit authorization because it sends external mail. Do not seed a live database without confirming target and authorization.

## Current next step

Start with fix-plan items 1 and 2:

1. Restore/locate Git metadata and inspect status so user work can be preserved.
2. Reconcile server dependency versions/peer compatibility and regenerate the lock.
3. Establish CI/test harnesses before touching business state logic.

Then specify the payment/order state machine and implement idempotency/expiry using failing tests.

## Instructions for the next developer or assistant

- Read `CODEX_PROJECT_AUDIT.md` and `CODEX_FIX_PLAN.md` first, then inspect the actual changed files.
- Re-run Git status and all safe commands; results in this handoff can become stale.
- Make no Paymob/card claim without test credentials and official/current Paymob documentation.
- Never log `.env`, JWT, SMTP, Cloudinary, database, Paymob, proof, or customer values.
- Keep application fixes separate and reviewable; do not rewrite large files for style.
- Preserve the existing server-authoritative pricing and transaction boundaries.
- Add tests before changing orders, stock, promotions, cancellation, or callback logic.
- Use test/staging data and replica-set MongoDB.
- Do not add React Bits until the “must fix before animations” section passes.
- Do not push or commit unless the user explicitly asks.
