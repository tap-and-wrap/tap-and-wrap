# Phase 3 — Website completion and integration foundations

Date: 2026-10-09. Work was performed only in the existing Tap & Wrap JavaScript project.

The storefront, admin content/review workflow, account recovery, Gmail transport, consent-based Meta integration and Cloudflare-compatible build-time SEO are implemented locally. Existing carts, customization, checkout/order correctness, private uploads and payment verification remain in place. Checkout, email delivery, Meta delivery, external storage and indexing remain disabled by default. No persistent catalog import, existing/production database connection, external upload, real email/payment/Meta event, commit, push or deployment was performed.

## Implemented storefront and administration

- Home uses the exact headline “Makes someone’s heart flap with Tap & Wrap.” Its sections follow the requested order: developer-managed hero; developer-managed approved trust information; available published bundles; selected main categories; exactly eight eligible selected Best Sellers when the selection is complete; Gift Box and Laser Engraving; approved featured reviews; approved FAQ; footer.
- Developer content lives in `client/src/content/developer-content.js`. Video supports a local optimized desktop/mobile source, intrinsic dimensions, poster, native controls, muted playback and preload none. No footage or statistics were invented. Current footage/statistics are explicit development placeholders.
- Approved About, Contact, Privacy, Refund, Shipping and Terms content comes from the admin API. Missing/unapproved text stays an explicit development placeholder. FAQ uses accessible native accordions. Text renders as text, including script-like strings.
- Footer contacts now use the same approved contact contract as the Contact page. Egyptian WhatsApp numbers become validated international wa.me links. The exact existing transparent logo and its 2000 × 667 dimensions remain unchanged.
- Main-category and subcategory landing pages have crawlable URLs, category metadata/breadcrumbs and server-side filters. Canonical category scope remains fixed when applying/clearing filters, searching or sorting; child pages retain their parent relationship. Normal product requests stay capped at 20.
- Product reviews are read-only to customers, paginated at 20 and returned only for public eligible products. Admins can create/edit/hide genuine reviews with explicit approval, quote permission and a private source note. Editing content clears approval unless explicitly renewed. No fictional testimonials or customer submission endpoint was added.
- Existing product galleries, variants, required photo/text fields, optional customization, related products, sticky purchase controls, quantity controls and reduced-motion cart feedback remain covered by regression tests. Tracking consumes only successful server receipts; a failed cart add cannot trigger AddToCart tracking or the existing flight animation.
- Account pages now provide password recovery, reset, verification, real sign-out and honest verification-delivery availability. Recovery/verification tokens stay in memory, are stripped from the URL fragment and are submitted only after explicit interaction. The reset page matches the backend’s actual 43-character base64url token contract.
- Protected administration now provides overview, customers, reviews, approved website/policy/FAQ content, categories, homepage selections, 30-day analytics, payment configuration visibility and notification diagnostics. Existing order/payment, product, component, template, bundle, discount and shipping editors are linked and reused.
- Bundle editors now distinguish rule activity from homepage publication, accept owner descriptions and use the existing product search parameter `q`. Lightweight promotion lists omit complete item/reference arrays; edit screens request detail explicitly.
- Public bundles fill up to eight eligible selections using indexed batches of 20, scanning at most 100 configured candidates. A valid ninth selection remains discoverable when earlier selections become unavailable. Savings are calculated by the existing integer-piastre promotion engine and clamped to the actual bundle subtotal.
- Homepage category selection is main-category-only; child edits omit the unused featured field rather than silently overwriting it. Payment/launch controls are read-only in the new settings page. Existing authenticated View Proof/private-file modals remain on-demand, with no automatic proof request or public URL.

## New and changed API contracts

All paths below are relative to `/api/v1`. Existing authentication, role, Origin, CSRF and safe-target middleware remain enforced.

| Endpoint | Behavior |
| --- | --- |
| GET `/public/site-content` | Approved about/contact/policies/FAQ and eligible featured review summaries; unapproved sections are null or empty. |
| GET `/public/products/:slug/reviews` | Approved review summaries, 20 per page maximum, with public product/category gates. |
| GET `/public/bundles` | Up to eight published eligible bundles, public product summaries and authoritative subtotal/discount/total in piastres. |
| GET `/public/categories/:slug` | Exact active category, safe parent summary and eligible product count. |
| GET `/admin/website/overview` | Operational counts and actual launch state. |
| GET `/admin/website/analytics` | Indexed last-30-days saved-order summary; collected payments are separate from pending InstaPay amounts. |
| GET `/admin/website/customers` | Customer-only paginated summaries; exact email or case-sensitive name-prefix search, no password/session fields or private order payloads. |
| GET `/admin/website/notifications` | Bounded delivery diagnostics without recipients, provider IDs, encrypted links or snapshots. |
| GET/PATCH `/admin/website/content` | Read/edit content with section-specific owner approval and transactional audit records. |
| GET/POST `/admin/website/reviews`; GET/PATCH `/admin/website/reviews/:id` | Protected review management; lists are lightweight and capped at 20. |
| GET `/admin/website/payment-settings` | Read-only existing COD/InstaPay configuration and checkout state. |
| POST `/auth/forgot-password` | Generic rate-limited response; no account enumeration or delivery-success claim. |
| POST `/auth/reset-password` | Single-use expiring token, validated new password, transactional session revocation and auth-version increment. |
| POST `/auth/request-verification` | Authenticated request for an expiring email-verification link. |
| POST `/auth/verify-email`; GET `/auth/account-status` | Explicit verification and recipient/provider availability status without credentials. |
| GET `/tracking/config` | Public feature/policy configuration and current consent; private/no-store response. |
| POST `/tracking/consent` | Opaque server-validated consent choice/revocation with CSRF and rate limits. |
| POST `/tracking/events` | Only validated public PageView/Contact actions; browsers cannot submit purchase totals or forge financial events. |
| POST `/tracking/ack` | Current-consent-owned Purchase receipt acknowledgement; prevents replay on later order reads. |

Existing public product/search/customization responses and successful signup/cart/checkout/order responses can include compact sanitized tracking receipts when configured and consented. Public product/search responses carrying such a receipt are private/no-store. Existing bundle mutations accept `published` and `description`; existing product/category/configuration/order controllers remain the source of truth.

## Models and database changes

- New `Review`: draft/published/hidden, explicit approval and quote permission, private provenance, creator/editor and indexed product/featured/admin lists.
- New singleton `SiteContent`: approved sections, contacts, policies and FAQ with timestamps and optimistic concurrency.
- New `AccountActionToken`: cryptographic token hashes, one-use state and expiry. Recovery links expire after 30 minutes; verification links after 24 hours.
- New `EmailRateWindow`: durable per-recipient throttling for account actions.
- New `TrackingConsent`: hashed opaque cookie token, grant, policy version and expiry/TTL.
- New `MetaEvent`: unique event IDs/deduplication keys, sanitized parameters, retry leases, bounded attempts and browser acknowledgement. Ordinary events expire; Purchase markers remain durable to prevent recreation.
- `User` gains optional email-verification timestamp, auth version and customer-list indexes. `Session` captures the auth version; an old-password login racing with reset cannot create a subsequently authorized session.
- `Order` gains an immutable consent reference and sorted-list index. Existing product/price/customization snapshots and transaction/idempotency/inventory protections remain unchanged.
- `NotificationEvent` supports account actions, encrypted queued action secrets, bounded delivery state and uncertain SMTP outcomes. Secrets are erased when delivered, consumed or terminally failed.
- `BundleRule` gains description/publication and an eligibility-list index. `AdminAudit` supports review/content actions.
- New model collection/index initialization still uses both URI and connected-database guards before every write. Tests cover rejected production targets. No existing database was initialized during this work.

## Gmail and durable notifications

The new backend transport uses Nodemailer 10.0.13. `.env.example` provides only empty placeholders:

```dotenv
EMAIL_PROVIDER=gmail
EMAIL_ENABLED=false
EMAIL_USER=
EMAIL_APP_PASSWORD=
EMAIL_FROM_NAME=Tap & Wrap
EMAIL_SMOKE_TEST_ENABLED=false
```

The authenticated Gmail address is the sender and envelope address; the display name defaults to Tap & Wrap. SMTP uses verified TLS, one pooled connection, bounded timeouts and a maximum send rate. File/URL access and attachments are disabled. Credentials and SMTP diagnostics are never sent to the browser or echoed in logs. The provider adapter remains modular; the existing Resend adapter is preserved for explicitly selected legacy configuration.

Branded escaped HTML and plain text cover order received, payment confirmed, payment rejected/attention, order confirmed, preparing, out for delivery, delivered and cancelled, plus password reset, email verification and password-change notice. Order-event messages contain safe order references/totals, never payment proofs, personalization images or artwork.

Durable outbox event keys prevent repeated status changes from creating duplicate notifications. Workers claim leases, use stable Message-IDs, apply exponential backoff up to six attempts and stop terminal errors. SMTP does not provide exactly-once delivery: ambiguous DATA/socket/timeouts or a crash after dispatch become `uncertain` for manual diagnostic review, with no automatic resend. Nodemailer’s ambiguous `CONN` error shapes are tested explicitly.

The developer smoke command defaults to offline dry-run and is absent from startup/build/tests. It never loads dotenv or connects to MongoDB. Real sending needs separate approval, explicit flags, complete terminal credentials and an allowlisted development recipient. Delivery/authentication has only been tested with mocked transports.

## SEO and Cloudflare behavior

See [PHASE_3_SEO.md](PHASE_3_SEO.md) for the input/export contract and detailed commands.

- `npm run build` builds Vite and then runs the offline generator. With no approved export, it emits semantic noindex development HTML, robots.txt, an empty sitemap and a route manifest. It makes zero network/database requests.
- An explicit approved export generates meaningful product/category HTML with visible names/descriptions/approved prices, source dates, exact-logo markup, alt text, internal links, canonical/Open Graph metadata, organization/product/breadcrumb JSON-LD and discovery sitemap. List HTML remains capped at 20.
- Offers are omitted while checkout is disabled. Explicit draft, provisional, review-flagged, invalid-category or invalid-media records are excluded. No invented review aggregate is added.
- The default `client/wrangler.jsonc` now routes documents through the Static Assets Worker. It serves prerendered files, returns real 404 responses for unexported/draft/deleted product routes, isolates private documents with no-store/noindex, and disables indexing on preview hosts or filtered URLs. There is no per-page Render SSR request.
- Browser page metadata follows the same approval/noindex rules. Admin, cart/checkout, orders/account/recovery, guest tracking and product-customization pages are noindex; Vite development/preview also supplies private document headers.
- The exporter is offline by default. An explicitly authorized read uses a scoped local/staging connection, native cursor batches of 20 × at most 200 pages, no model/index initialization or dotenv, guarded local-data outputs and sanitized approved DTOs.
- This is build-time generation followed by React mounting, not full React SSR or hydration. Real approved catalog export, media/domain configuration, Cloudflare response validation, Rich Results and search-engine indexing remain unverified. Static snapshots require a reviewed re-export/rebuild/purge after publication, price, inventory or media changes.

## Meta Pixel and Conversions API

Feature flags remain false and credential placeholders empty. Runtime enabling requires `META_ENABLED`, approved policy, valid Pixel ID/policy version, HTTPS `SITE_ORIGIN`, and browser `VITE_META_ENABLED`. CAPI additionally requires its explicit flag, access token and a privately configured supported Graph API version.

- The SDK loads only after explicit consent and a qualifying receipt; automatic configuration/advanced matching are disabled. GPC and local refusal suppress events; revocation immediately stops browser delivery and suppresses queued server events.
- Supported standard events: PageView, ViewContent, Search, AddToCart, InitiateCheckout, AddPaymentInfo, CompleteRegistration, Contact and Purchase. Configured custom events: CustomizationStart, CustomizedAddToCart and OrderSubmitted.
- Search fires after a real successful server search without sending the search text. AddToCart/registration/customization/checkout events follow successful validated actions, not failed button clicks.
- EGP amounts come from server integer-piastre pricing. Parameters are restricted to public product IDs, quantities, approved values and configured method/service enums. Source paths exclude query strings and private order identifiers. Customer names/email/phone, passwords, engraving messages, proof and image keys never enter tracking payloads.
- Accepted COD order placement qualifies for Purchase; an InstaPay submission is OrderSubmitted and becomes Purchase only after explicit paid verification. Unique durable order keys prevent repeated admin updates or checkout retries from creating another Purchase.
- Browser and server share event IDs. Purchase acknowledgement is consent-owned and suppresses later order-read receipts. Browser storage also protects against a lost acknowledgement; acceptance into the Pixel queue is not proof of external Meta receipt.
- CAPI has durable bounded leases, five attempts/backoff, stale-event suppression and consent checks. It only sends a hashed anonymous consent identifier as matching data; this intentionally minimizes personal information and may reduce matching quality.
- No real SDK, Pixel/CAPI request or Events Manager receipt was verified. Browser tests intercepted the SDK; backend providers were isolated mocks.

## Verification

| Check | Result |
| --- | --- |
| Baseline backend/frontend before Phase 3 | 165 backend and 63 frontend tests passed. |
| Final complete backend suite | 242 passed; 0 failed, skipped or cancelled. Disposable local MongoDB only. |
| Complete final frontend rerun | Running; 96 tests collected. Final result will be recorded before completion. |
| Offline SEO generator/Worker suite | 27 passed; approved fixtures only. |
| Frontend lint | Passed without warnings. |
| Production build | Passed; safe development-noindex output, 22 routes, 0 indexable routes, no database/network requests. |
| Server syntax checks | Passed for 103 JavaScript files. |
| Runtime dependency audits | Client and server each report 0 known vulnerabilities with `npm audit --omit=dev --json`. |
| Default `email:smoke` | Passed: dry-run, sent=false, databaseWrites=false. |
| Default `seo:export` | Passed: dry-run, databaseConnected=false, databaseWrites=false, filesWritten=false, dotenvLoaded=false. |

New backend coverage includes 26 email/account tests, 19 Meta tests, 18 website/admin tests, 13 exporter tests and one exact-category regression. Existing security/approval/inventory/order/storage cases also pass. Test runners clear inherited provider/database configuration and use mocks/disposable fixtures.

Browser coverage includes desktop, tablet, 320/390px layouts, fixed logo alignment/dimensions, URL filters, modal keyboard/Escape/focus behavior, galleries/options/photos, cart success/failure/reduced motion, disabled checkout, order ownership, on-demand private proof, admin denial, category locks, content approval, read-only customer reviews, account links/sign-out, consent/GPC and deduplication. A product’s semantic prerendered information is tested with JavaScript disabled. Traces/screenshots stay under ignored test-results.

Failures discovered during implementation were investigated: the frontend token format was corrected to the actual backend contract; SMTP ambiguity now stops automatic retries; the product picker uses the inspected API search key; WhatsApp URLs use approved phone data; eligible bundles are selected after validation with centrally clamped savings; and the default Cloudflare config now uses the reviewed Worker. Test-only selector ambiguity was corrected to actual accessible names, and the layout test’s twelve hard navigations were split into independent widths with working in-app navigation instead of increasing safety/rate limits.

## Remaining prerequisites and deliberate limits

1. The owner must supply approved hero footage/poster, substantiated trust figures, About/contact/policies/FAQ text and genuine reviews with quote permission. The site deliberately does not substitute invented business information.
2. Real catalog/admin operations require an explicitly authorized dedicated transaction-capable local/staging database and real admin account provisioning through the existing secure process. No persistent catalog exists from this task. Catalog approval and clean public media mapping remain prerequisites for real public shopping.
3. Gmail App Password/account, recipient allowlist, storage configuration, Meta credentials/policy and canonical domain require private owner configuration and separate live-test authorization. No Gmail authentication/delivery, R2 upload, real payment, Meta receipt, Cloudflare deployment or indexing is claimed.
4. Checkout remains disabled behind both launch flags. The owner’s account-verification/admin-access policy must be finalized before release; optional verification currently preserves existing login and does not grant roles or attach guest orders.
5. Customers and payment settings are deliberately read-only in the new dashboard. Sensitive existing order/configuration/content/review actions retain audit records. Earlier product/category controllers are reused and were not given new audit records in this phase.
6. Analytics is a bounded 30-day saved-order summary, not an invented live sales dashboard. Public bundles inspect at most 100 candidates, matching the existing active-rule ceiling; featured reviews overscan at most 40 approved selections before eligibility checks.
7. SMTP uncertain deliveries require developer review; there is no unsafe admin resend override. Gmail cannot guarantee exactly-once delivery. Purchase browser acknowledgement records local queue acceptance, not external receipt.
8. SEO snapshots must be regenerated when real catalog eligibility changes. Approved dynamic product SEO is prepared and fixture-tested, but is not activated with live merchant data.

## Exact next staging-integration steps

These are instructions for a separately authorized integration session, not actions performed here.

1. Keep both checkout launch flags, `STORAGE_ENABLED`, `EMAIL_ENABLED`, `META_ENABLED`, `META_CAPI_ENABLED`, `VITE_META_ENABLED`, `VITE_SEO_INDEXING_ENABLED` and Worker `SEO_INDEXING_ENABLED` false.
2. Follow [PHASE_1C_STAGING.md](PHASE_1C_STAGING.md) for scoped Atlas networking/users, exact `tapandwrap_staging` guards and the separately authorized first persistent import. Run offline checks first. Do not use another project/production database, globally open Atlas networking, seed a demonstration admin or bypass existing auth.
3. Verify imported drafts through the authenticated staging preview. Resolve review classifications and approve actual merchant prices/inventory/configurations/categories individually. Add approved website content, eight eligible homepage picks and genuine review records through the protected interfaces. Customer-file/R2 setup is a separate authorization.
4. With explicit staging-read authorization, set terminal `DATABASE_TARGET=staging`, `MONGODB_URI` privately to the exact database and `CATALOG_MEDIA_BASE_URL` to the reviewed HTTPS public media mapping. Prefer a separate read-only DB user for exports. From `server/`:

   ```powershell
   npm.cmd run seo:export
   npm.cmd run seo:export -- --target staging --confirm-read --output local-data/approved-seo-export.json --content-output local-data/approved-site-content.json
   ```

   The first command is offline. The second requires authorization and writes sanitized local JSON only; it does not write a database. Do not expose the export as an API or commit local-data.

5. From `client/`, create/review a noindex preview using an owner-selected HTTPS canonical host:

   ```powershell
   npm.cmd run build
   npm.cmd run seo:generate -- --input local-data/approved-seo-export.json --content local-data/approved-site-content.json --site-origin https://OWNER-APPROVED-HOST
   npm.cmd run test:seo
   ```

   Paths are project-root-relative. Omit content export when no approved text exists. Do not pass `--publish` or enable indexing during staging. A separately approved deployment must verify real source HTML, headers, 404s and canonical behavior before indexing.

6. For a later explicitly authorized single Gmail test, configure terminal `EMAIL_PROVIDER=gmail`, `EMAIL_ENABLED=true`, `EMAIL_USER` and `EMAIL_APP_PASSWORD` privately, `EMAIL_FROM_NAME=Tap & Wrap`, `EMAIL_SMOKE_TEST_ENABLED=true`, `NODE_ENV=development`, and `NOTIFICATION_SAFE_RECIPIENTS` containing the exact test recipient. The smoke command intentionally does not read .env. From `server/`:

   ```powershell
   npm.cmd run email:smoke
   npm.cmd run email:smoke -- --send --confirm-send --recipient YOUR_ALLOWLISTED_TEST_RECIPIENT
   ```

   The first command sends nothing. The second may be run only after explicit send approval with a real allowlisted address replacing the placeholder. Return enabled/smoke flags to false afterwards. Do not use a customer recipient or claim this dry-run authenticated Gmail.

7. For separately authorized durable staging-worker validation, use a scoped staging write account and confirmed target, keeping unrelated storage/Meta delivery disabled. A single bounded worker batch is:

   ```powershell
   npm.cmd run commerce:jobs -- --once --target staging --confirm-writes --batch-size 20
   ```

   This is a persistent write/external-delivery command when providers are enabled and requires explicit authorization. It must never run automatically during tests/build/startup.

8. After approving a tracking policy and credentials, perform separately authorized Meta test-event verification with synthetic staging actions: consent/refusal/GPC, event-ID deduplication, failed cart adds, accepted COD and manually verified InstaPay. Real checkout/production tracking/indexing activation and deployment remain separate launch decisions.

## Exact authored file manifest

### Created

- `client/src/components/AccountActions.jsx`
- `client/src/components/PublicContent.jsx`
- `client/src/content/developer-content.js`
- `client/src/pages/AccountRecoveryPage.jsx`
- `client/src/pages/AdminWebsitePage.jsx`
- `client/src/pages/CategoryPage.jsx`
- `client/src/services/website.js`
- `client/src/utils/contact.js`
- `client/src/seo/metadata.js`
- `client/src/seo/PageMetadata.jsx`
- `client/src/seo/RouteMetadata.jsx`
- `client/src/tracking/client.js`
- `client/src/tracking/TrackingConsent.jsx`
- `client/src/website.css`
- `client/src/website-admin.css`
- `client/scripts/generate-seo.js`
- `client/scripts/seo/generator.js`
- `client/scripts/seo/generator.test.js`
- `client/scripts/seo/worker.test.js`
- `client/public/seo-static.css`
- `client/worker/seo-worker.js`
- `client/e2e/seo.spec.js`
- `client/e2e/tracking.spec.js`
- `client/e2e/website-admin.spec.js`
- `client/e2e/website-public.spec.js`
- `server/src/email/settings.js`
- `server/src/email/templates.js`
- `server/src/email/gmail.js`
- `server/src/email/action-secrets.js`
- `server/src/email/account-actions.js`
- `server/src/models/AccountActionToken.js`
- `server/src/models/EmailRateWindow.js`
- `server/src/models/TrackingConsent.js`
- `server/src/models/MetaEvent.js`
- `server/src/models/Review.js`
- `server/src/models/SiteContent.js`
- `server/src/routes/account.routes.js`
- `server/src/tracking/service.js`
- `server/src/tracking/routes.js`
- `server/src/website/service.js`
- `server/src/website/routes.js`
- `server/scripts/email-smoke-test.js`
- `server/scripts/export-seo-catalog.js`
- `server/test/phase3-email.test.js`
- `server/test/phase3-account.test.js`
- `server/test/phase3-tracking.test.js`
- `server/test/website-admin.test.js`
- `server/test/seo-export.test.js`
- `docs/PHASE_3_SEO.md`
- `docs/PHASE_3_WEBSITE_COMPLETION.md`

### Modified

- `AGENTS.md`
- `README.md`
- `client/.env.example`
- `client/package.json`
- `client/playwright.config.js`
- `client/vite.config.js`
- `client/wrangler.jsonc`
- `client/src/App.jsx`
- `client/src/main.jsx`
- `client/src/components/CatalogFilters.jsx`
- `client/src/components/Footer.jsx`
- `client/src/components/HomeCatalog.jsx`
- `client/src/commerce/CartContext.jsx`
- `client/src/commerce/AdminEditors.jsx`
- `client/src/pages/HomePage.jsx`
- `client/src/pages/ShopPage.jsx`
- `client/src/pages/ProductPage.jsx`
- `client/src/pages/StaticPage.jsx`
- `client/src/pages/AuthPage.jsx`
- `client/src/pages/CheckoutPage.jsx`
- `client/src/pages/OrdersPage.jsx`
- `client/src/pages/AdminProductsPage.jsx`
- `client/src/pages/AdminCommercePage.jsx`
- `client/e2e/catalog-fixtures.js`
- `client/e2e/commerce-fixtures.js`
- `server/.env.example`
- `server/package.json`
- `server/package-lock.json`
- `server/src/app.js`
- `server/src/config/db.js`
- `server/src/middleware/auth.js`
- `server/src/models/User.js`
- `server/src/models/Session.js`
- `server/src/models/Order.js`
- `server/src/models/NotificationEvent.js`
- `server/src/models/BundleRule.js`
- `server/src/models/AdminAudit.js`
- `server/src/commerce/cart.js`
- `server/src/commerce/routes.js`
- `server/src/commerce/orders.js`
- `server/src/commerce/notifications.js`
- `server/src/commerce/configuration.routes.js`
- `server/src/catalog/service.js`
- `server/src/routes/catalog.routes.js`
- `server/src/routes/auth.routes.js`
- `server/scripts/run-commerce-jobs.js`
- `server/scripts/run-tests.js`
- `server/test/database-connection.test.js`
- `server/test/catalog-phase1b.test.js`

The temporary alternative Wrangler configuration created during development was removed after integration into the existing default config. Ignored build/cache/test artifacts are generated verification outputs, not source assets. No original product images, supplied logo, private .env or other project files were edited.
