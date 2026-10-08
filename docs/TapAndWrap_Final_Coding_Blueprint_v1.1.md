# TAP & WRAP — CODING BLUEPRINT v1.1

Updated: 2026-10-08. **Two featured customization services: Gift Box and Laser Engraving.**



---

<!-- Source: 00_README_AND_DECISIONS.md -->

# Tap & Wrap — Coding-Ready Blueprint
Version: 1.1 • Planning freeze: 2026-10-08 • Project: Web District / Tap & Wrap

**Status:** Architecture, UX scope, domain logic and phase acceptance criteria are frozen for implementation. Merchant-controlled values remain provisional and MUST NOT be silently treated as approved.

## Read the documents in this order
1. `00_README_AND_DECISIONS.md` — scope and accepted assumptions.
2. `01_DATA_MODELS.md` — actual collections, fields, indexes and invariants.
3. `02_API_CONTRACT.md` — REST API, payloads, error behavior, authorization.
4. `03_UI_ROUTES_AND_DESIGN.md` — storefront/admin routes, UX, design tokens, interactions.
5. `04_PAYMENTS_UPLOADS_AND_LIFECYCLE.md` — the risky transactional flows, security, jobs.
6. `05_CATALOG_IMPORT_AND_OPERATIONS.md` — audited Excel import, R2 upload mapping, deployment and SEO/tracking.
7. `06_TESTS_AND_BUILD_PLAN.md` — test matrix, exact implementation stages, release gates.
8. `07_ENV_EXAMPLE.md` — deployment layout and environment-variable naming.
9. `08_START_HERE_FOR_CODING.md` — exact next coding prompt and Phase 0 acceptance.
10. `09_SOURCE_ASSETS.md` — included logo, original screenshots and master catalog workbook.
11. `10_CUSTOMIZATION_SERVICES_LOCKED.md` — final Gift Box + Laser Engraving service UX, models, API, upload, and tests (takes precedence for service-specific details).

## Fixed business requirements
- Language: English only; currency: EGP; customer-facing website: Home, Shop, Product, About, guest Track Order, account My Orders, Login, Signup, Cart, Checkout, Contact, Privacy, Refund, Shipping, Terms.
- Hero copy: **Makes someone’s heart flap with Tap & Wrap.** (normal UTF-8 text, visually styled with typography).
- Homepage sequence: Hero video (<1 MB, developer-managed) → Trust metrics (developer-managed) → **Bundles if active** → Featured Categories (admin-managed) → **8** Best Sellers (admin-managed) → Customize section → Featured Reviews (admin-managed) → FAQ (developer-managed) → Footer.
- Brand/reference: Tap & Wrap supplied logo; Hedeytyy-inspired blush/pink/soft white/brown mood; Darb-like shop filters/sort; Glow & Go-like product-page layout/sticky purchase bar; WAM-like optional `Customize This`.
- 20 records per page by default on shop/admin product list, orders, customers, reviews, discounts, bundles, and My Orders. Server enforces max 20 for v1. Homepage bestseller count exactly 8 selected product IDs, fewer only in staging while being configured.
- Product-card actions: `Add to Cart` only when no option input required; otherwise `Choose Options`; sold-out unavailable action. On successful add, animated product-to-cart zigzag using FLIP/motion path; respect `prefers-reduced-motion`.
- `personalization` (required customer photo/text fields for product as listed) is distinct from optional `Customize This` (admin-configured add/remove/replace contents and price changes). Both may coexist.
- **Two featured customization services only:** `Build Your Gift Box` and **`Laser Engraving` (confirmed core merchant service)** at `/customize`, with dedicated builder routes. Custom trays stay product-level; `Customize This` remains product-specific and starts with exact viewed product. Engraving text/artwork uses the existing controlled personalization/media engine and approved product eligibility. See `10_CUSTOMIZATION_SERVICES_LOCKED.md`.
- Stock-tracked products seed **10 provisional units** in staging; `made_to_order` ignores stock decrement, with separate `available` and `published` controls. Inventory for priced variants tracked at variant level when configured.
- Shipping seed: **EGP 90 Cairo/Giza**, **EGP 120 all other Egyptian governorates**; configurable via admin Settings. Egypt only in v1, no international shipping.
- Payment: Cash on Delivery, or **full amount via InstaPay** to `01060673073`, customer uploads payment proof only after clicking Place Order, with admin manual transfer verification. No partial payments/deposits.
- WhatsApp: `+20 15 08216472` (`https://wa.me/201508216472`). Instagram: `https://www.instagram.com/tapandwrap/`.
- Guest tracking: random unique 6-digit public order number + normalized checkout phone number; rate limited, generic invalid responses, limited status only without additional verification. Registered customers: authenticated complete order history.
- Admin: Overview/Analytics, Orders + status emails + payment proof on-demand modal, Products, Categories, Customization Templates/Components, Bundles, Discount Codes, Customers, Reviews (admin entered only), Homepage (featured categories, 8 bestsellers, reviews), Settings (shipping, payment instructions). Audit critical admin changes.
- Catalog: source `TapAndWrap_Website_Product_Master.xlsx`; 1,680 rows, 4,139 clean relative image paths. `tapandwrap-Photos-CLEAN` on developer Windows PC is correct image source. NEVER alter originals.
- Laser engraving content reference supplied by merchant/developer in `assets/references/laser-engraving-reference.mp4`; it is not automatically the homepage hero or a guarantee of engraving capabilities/materials.
- SEO at launch: crawler-readable product/category HTML, title/description/canonicals, XML sitemap, Product/Breadcrumb/Organization JSON-LD, Search Console, performance validation; rankings are not guaranteed.
- Meta: Pixel + Conversions API, consent-aware eligible events, consistent event IDs and deduplication, avoid inflated Purchase events.
- Low cost: Cloudflare caching, compact Mongo projections/indexes, no images in Mongo, no unnecessary polling, direct-to-private-R2 uploads after user action, temporary upload expiry, analytics aggregates and durable email/event jobs.

## Decisions made for engineering consistency (change only via change log)
- Use a TypeScript **pnpm monorepo** with React Router full-stack app on Cloudflare Workers + separate React admin routes, Node.js/Express on Render, Mongoose/MongoDB Atlas, Cloudflare R2 public and private buckets, transactional email provider adapter, Zod validation, Vitest + Playwright testing. This retains React/Node while allowing crawler-visible markup. Confirm Cloudflare free plan's CPU/request budgets with representative SSR tests; cached HTML, not arbitrary Render SSR on every hit.
- API version `/api/v1`; `camelCase` JSON; all money in **integer EGP piastres**; IDs as Mongo ObjectIDs internally, public URLs use slugs; dates stored UTC ISO/BSON dates, rendered in Africa/Cairo when appropriate.
- Primary authorization uses server-side sessions in secure HttpOnly cookies (`SameSite=Lax`, CSRF defense on mutations); customers and admins authenticated via same identity model but server-enforced RBAC. Rate limit login, track and upload.
- Customer email required at checkout for status emails. Phone required; canonical Egyptian mobile format and original display form stored. Changing account phone/email requires verification; guest order linking requires proof of ownership.
- Cart persisted on first Add to Cart rather than mere page view; guest cart token secure/random. Cart does not reserve stock. On submission, controlled transactional stock decrement + unique idempotency key.
- Bundle inventory consumes constituent tracked item quantities. Discount stacking: **single discount code, does NOT combine with another discount code**. Bundle promotional price can coexist with a code only when admin explicitly enables bundle eligibility; default code excludes bundles. Shipping promotions must be explicitly configured. No negative totals.
- Review system only admin writes; only authentic approved merchant-supplied reviews displayed. Admin can select homepage-featured subset. Product reviews are linked to a product only when appropriate.
- Staging and production are completely separate databases, R2 buckets/prefixes, Meta Pixel IDs, email modes, origins and cookie domains.

## Defaults that are NOT merchant claims
- Product prices: automatic per-category development-only estimates; `pricing.approved=false`, `status='draft'`. **No publicly accepted order until approved prices and inventory.** Compare-at/sale prices remain empty unless confirmed. Authenticated staff may use a staging-only noindex preview to review draft cards/pages and test checkout with sandbox test data; this must never enable unapproved products in production.
- Trust counts, review text, dates of business founding, hero media, bestsellers, bundle content, site domain, tax/business/legal policies: placeholders or absent until approved. Never fabricate authentic reviews or trust metrics. Do not publish demo reviews as real.
- Customer email required (needed for email order updates); final support email domain, legal contact and policy contents pending business owner.
- Upload safety defaults: max 10 MB/image and up to 10 images per cart line, unless specific product requires another bounded max; only JPG/PNG/WEBP for photo personalization, JPG/PNG/WEBP/PDF for receipts if agreed (v1 image-only to support modal display); validate actual bytes/server-side and avoid compressing print originals. Temporary orphan expiry target 48h. These are engineering defaults, adjust after real product samples.
- Auth defaults: email+password for accounts; checkout still available to guests. Password reset by email, email verification before security-sensitive actions; 2FA for admin recommended before launch.

## Production-release blockers (not development blockers)
1. Merchant sign-off on actual product prices, variants, stock/made-to-order, featured choices, actual gift-box contents, **engraving product eligibility/materials/fonts/placement/pricing**, and customization production rules.
2. Merchant sign-off on policies (privacy/refund/shipping/terms), delivery lead times, order/contact email, applicable tax treatment, shipping eligibility, payment receiver and method rules.
3. Test verified transfers, email sender/domain, backups/restoration, support access and consent implementation.
4. Final brand media/logo license review, product photo rights, quality reviews for medium-confidence names.
5. SEO/Meta instrumentation pass and realistic load/usage test; obtain production domain and configure Search Console.

## Change control
Do not silently reinterpret a requirement. Record changes in `CHANGELOG.md` with date, affected models/endpoints, migration requirements and test changes. This package is specifications, not an implemented live application.


---

<!-- Source: 01_DATA_MODELS.md -->

# 01 — Database/Mongoose Contracts

## General conventions
- Mongoose + Zod: shared Zod request/domain schemas in `packages/contracts`; Mongoose enforces persistence rules; no unvalidated client values are assigned directly to documents.
- Each business collection: `createdAt`, `updatedAt`, optional `schemaVersion`, and `revision` integer for optimistic concurrency. Add indexes only for actual query paths; test query plans against Atlas Free.
- All money: integer `amountPiastres >= 0`, no JavaScript floating-point monetary calculations; percent discounts use rational basis points (0..10000), deterministic rounding policy `Math.floor` on discounted piastres at item allocation with final adjustment to reconcile line-level sum.
- All public identifiers opaque aside from human-readable 6-digit `orderNumber`. Merchant `sourceProductId` stable from audited Excel (e.g. `B1-LAN-001`); use for repeatable upsert and R2 mapping.
- Product status is independent from inventory. Publicly purchasable only if `status=published && pricing.approved=true && inventory.available=true && valid eligible variants/options`.
- Keep embedded structures bounded (options, order snapshots, line items, status history) so docs remain comfortably below 16MB; do not store image or binary blobs in Mongo.

## 01 users
`_id`, `emailNormalized` unique lowercased trimmed, `emailVerifiedAt?`, `passwordHash` (Argon2id), `role:'customer'|'admin'`, `name`, `phoneE164?`, `phoneVerifiedAt?`, `addresses[]` bounded (label, recipient, street, governorate enum, area, note, phone), `status:'active'|'disabled'`, `lastLoginAt?`, `createdAt`,`updatedAt`.
- Never return passwordHash or secrets to API. Admin promotion is out-of-band/manual audited operation; signup cannot supply role. Avoid storing unnecessary personal fields.
- Indexes unique emailNormalized (partial if optional) and role/status only if needed for customers admin list.

## 02 authSessions
`_id`, `userId`, `tokenHash` unique SHA-256 of random 32-byte token, `expiresAt` TTL, `revokedAt?`, `createdAt`, `lastSeenAt?`, `deviceSummary?`. Cookie only contains opaque token; rotate after login/privilege change; CSRF validation on every state mutation. Admin step-up auth for high-risk changes.

## 03 categories
`_id`, `name`, `slug` unique, `parentId?`, `sortOrder`, `imageKey?`, `published`, `seo:{title?,description?}`, `createdAt`,`updatedAt`.
- Hierarchy maximum 2 or 3 levels at v1; reject cycles; human-friendly URLs; category deletion blocked when still referenced, or archive instead. Homepage selection lives in homepageSettings; category is independently publishable.

## 04 products
`_id`, `sourceProductId` unique and stable, `sku?` optional unique sparse, `name`, `slug` unique, `description`, `categoryId`, `subcategoryId?`, `catalogRole:'product'|'variant_product'|'customizable_product'|'gift_packaging'`, `catalogConfidence:'high'|'medium'`, `merchantReviewNotes?`, `status:'draft'|'published'|'archived'`, `pricing:{basePiastres,compareAtPiastres?,approved,approvalAt?,currency:'EGP'}`, `inventory:{mode:'tracked'|'made_to_order',quantity:number|null,available:boolean,lowStockThreshold?:number}`, `variants[]:{id,sku?,attributes:{label,value}[],priceDeltaPiastres?:number,inventoryMode?,quantity?,available}`, `personalization:{fields[]}`, `customization:{enabled:boolean,serviceKind?:'gift_box'|'laser_engraving'|'tray'|'generic'|null,templateId?,version?,serviceEntryEligible?:boolean}`, `images[]:{key,alt,kind:'main'|'gallery',order}`, `tags[]`, `seo:{title?,description?,canonicalPath?}`, `createdAt`,`updatedAt`,`revision`.
- `personalization.fields[]` definition: `{key,label,type:'image'|'short_text'|'long_text'|'select',required:boolean,minFiles?,maxFiles?,maxLength?,choices?}`. Admin bounded validation; client required fields verified server side.
- Allow zero variants, or variants with stable IDs. Product variant SKUs unique where set. For variant-based stock, decrement only variant stock; don't also decrement parent unless explicit shared stock configured in a future version.
- All image array order is explicit; audited Excel `Image 1 (Main)` is truth EVEN when its filename ends in `-02`. SEO slug collisions resolved with stable suffix; never silently change existing product slugs upon title edit without redirect.
- Indexes: sourceProductId unique; slug unique; compound `{status,categoryId,createdAt,_id}`, `{status,pricing.basePiastres,_id}`, indexed name/category search strategy; do NOT use unindexed regex over full catalog. Build text search v1 on normalized searchable name/tags; use Atlas Search only if supported/cost-appropriate. Query plan validation mandatory.

## 05 customizationTemplates
**Laser engraving template extension (v1.1):** add bounded `engravingConfig?` specifying eligible text-line/character limits, approved fonts/placements/sides, artwork MIME/required rules, and integer-priced `included | flat_fee | selected_options` model. Existing `componentOptions` remain for physical extras; small engraving-style choices can live in the template. See `10_CUSTOMIZATION_SERVICES_LOCKED.md`; do not infer laser eligibility from catalog names/photos.
`_id`, `name`, `kind:'gift_box'|'laser_engraving'|'tray'|'generic'`, `published`, `version`, `groups[]` bounded. Each group `{key,title,control:'single'|'multi'|'quantity'|'text'|'image',required,minSelected,maxSelected,canAdd,canRemove,canReplace,options:[{componentOptionId,defaultIncluded,deltaPiastresOverride?,minQty,maxQty}],order}`. `rules[]` optional declarative mutually-exclusive/dependency rule; **never evaluate arbitrary JavaScript from database**. `createdAt`,`updatedAt`.
- Group is linked per product, with product-level overrides allowed only via validated structured settings. Version or immutable snapshot on order creation. Price derived from eligible option deltas and base.

## 06 componentOptions
`_id`, `sourceProductId?` unique sparse for 80 catalog customization options, `name`,`slug?`,`kind:'ingredient'|'flower'|'fragrance'|'packaging'|'extra'|'other'`,`priceDeltaPiastres`,`priceApproved`,`imageKey?`,`available`,`inventory?:{mode,quantity}`, `merchantNotes?`, `createdAt`,`updatedAt`.
- Do not automatically publish these as ordinary public products. If a component is truly an independently sellable item, merchant may create an explicitly linked product after approval.

## 07 carts
Cart lines also carry bounded `serviceKind` and `templateVersion`; normalized engraving/gift-box selections, including attachment upload IDs, use the same shared cart line model. Public unapproved service prices must never enter live carts.
`_id`, `owner:{userId? ,guestSessionHash?}`, `lines[]:{lineId,productId,variantId?,quantity,personalizationValues,selectedOptionIds[],uploadRecordIds[],bundleId?,priceQuotePiastres?,productRevisionAtQuote?,templateVersionAtQuote?}`, `couponCode?`, `expiresAt?`,`updatedAt`,`createdAt`.
- Enforce max lines (e.g. 50), max unit quantities, serialized size bounds. Never trust quote at checkout; recalculate all prices and input eligibility. Same product + different photos is a different cart line. Cart has no inventory reservation.
- Index userId, guestSessionHash, expiresAt TTL only for abandoned carts. TTL must not delete active carts.

## 08 checkoutIntents
`_id`,`cartId?`,`userId?`,`guestSessionHash?`,`idempotencyKey` unique within checkout ownership/scope,`cartFingerprint`,`customerAndAddressDraft` private,`paymentMethod:'cod'|'instapay'`,`quote:{itemsPiastres,discountPiastres,shippingPiastres,totalPiastres,version,expiresAt}`,`proofUploadId?`,`state:'initiated'|'awaiting_upload'|'finalizing'|'completed'|'failed'|'expired'`,`orderId?`,`expiresAt`, `createdAt`,`updatedAt`.
- Create only after clicking Place Order. For InstaPay, create limited-lifetime intent before private proof upload; finalize only when proof checked. Retry returns existing order for same key; no duplicate. Do not persist full customer bank information.
- TTL index on expiresAt; retained completed IDs in orders for idempotent lookup or retention window; intent cleanup must not break submitted order lookup.

## 09 orders
Order lines also store immutable `engravingSnapshot?` (text, font, placement, artwork asset refs, chosen fee) or `giftBoxSnapshot?` (base box, components and approved deltas), using normal private uploads and item-price breakdown. Operators see human-readable labels without loading file bytes.
`_id`, `orderNumber` unique six-digit integer `[100000,999999]`, `checkoutIntentId` unique, `userId?`, `contactSnapshot:{name,emailNormalized,phoneE164}`, `deliverySnapshot:{governorate,area,street,building?,floor?,apartment?,notes?}`, `lines[]` *immutable pricing/selection snapshots*, `totals:{subtotalPiastres,customizationPiastres?,discountPiastres,shippingPiastres,taxPiastres,grandTotalPiastres}`, `discountSnapshot?`, `shippingSnapshot:{zone,ratePiastres}`, `payment:{method,status:'unpaid'|'awaiting_verification'|'paid'|'rejected'|'refunded',proofUploadId?,verifiedBy?,verifiedAt?,amountPaidPiastres?,statusUpdatedAt}`, `fulfillment:{status:'received'|'confirmed'|'preparing'|'out_for_delivery'|'delivered'|'cancelled',statusUpdatedAt}`, `history[]:{at,actorId?,from,to,reason?,eventId}`, `email?`, `createdAt`,`updatedAt`.
- Each line snapshot: product/source ID, variant ID, name, SKU, category label, quantity, item base price, selected customization labels/IDs/price, required personalization text, immutable **private** order asset IDs and primary public product image key, unit/final line total. Do not embed raw photos.
- Insert status history only through service; restrict legal transitions and admin visibility. Prevent removal of historical order data due to product deletion. Avoid making public tracking expose address/payment proof.
- Indexes: `orderNumber` unique; `checkoutIntentId` unique; `{userId,createdAt,_id}`; `{payment.status,createdAt,_id}`; `{fulfillment.status,createdAt,_id}`; `{contactSnapshot.phoneE164,createdAt}` only if needed for support/tracking with number.

## 10 uploadRecords
`_id`, `ownerUserId?`, `guestSessionHash?`, `checkoutIntentId?`, `cartId?`, `orderId?`, `purpose:'personalization'|'payment_proof'`, `bucket:'private'`, `objectKey`, `originalNameSanitized`, `contentType`, `sizeBytes`, `checksum?`, `state:'authorized'|'uploaded'|'attached_to_cart'|'attached_to_order'|'expired'|'rejected'`, `expiresAt?`,`createdAt`,`updatedAt`.
- Private storage only; access via short-lived server-authorized signed GET or streamed proxy. Uploaded proof is never public. `expiresAt` on temporary record only; after attaching to order, unset expire and promote/copy object to permanent order prefix; verify object before marking attached.
- Indexes `{ownerUserId,state,createdAt}`, `{guestSessionHash,state,createdAt}`, `{orderId,purpose}`, expiresAt TTL. TTL deletion of Mongo records does NOT delete R2 objects; object lifecycle/sweeper handles bucket cleanup.

## 11 bundles
`_id`,`title`,`slug` unique,`description?`,`imageKey?`,`items[]:{productId,variantId?,quantity}`, `priceMode:'fixed'|'sum_minus_discount'`, `fixedPricePiastres?`, `discountPiastres?`, `priceApproved`, `eligibleForCoupons:false default`, `status:'draft'|'published'|'archived'`, `startsAt?`,`endsAt?`,`displayOrder`, `createdAt`,`updatedAt`.
- Availability derived server-side from ALL constituent products/variants (including components if explicitly modeled). One bundle purchase consumes items atomically, never separate untracked bundle stock. Homepage renders active published, approved bundles only.

## 12 discountCodes
`_id`,`codeNormalized` unique,`type:'fixed'|'percentage'`,`amountPiastres?`,`basisPoints?`,`minSubtotalPiastres?`,`maxDiscountPiastres?`,`startAt?`,`endAt?`,`maxUses?`,`perCustomerLimit?`,`usedCount`, `eligibleProductIds?`,`eligibleCategoryIds?`,`includeBundles:false default`,`active`, `createdAt`,`updatedAt`.
- `usedCount` increments atomically when accepted order consumes code, undo only through explicit refund/cancellation business rule (NOT automatically on every cancellation), with audit. Per-customer limit requires durable redemption records or unique dedup within order records; use `discountRedemptions` for strong per-user guarantees.

## 13 discountRedemptions
`_id`,`codeId`,`orderId` unique,`userId?`,`customerEmailHash?`,`createdAt`; unique composite indexes as needed. Created transactionally with checkout; prevents duplicate redemption and supports auditing.

## 14 reviews
`_id`, `productId?`, `customerDisplayName`, `rating` integer 1..5, `text`, `imageKey?`, `verifiedByMerchant:boolean`, `displayOnProduct:boolean`,`displayOnHome:boolean`,`published`, `displayOrder`, `sourceNotesPrivate?`,`createdByAdminId`,`createdAt`,`updatedAt`.
- Never claim verified purchase unless actually checked. No public create/update endpoints.

## 15 homepageSettings (single document)
`key:'home'` unique, `featuredCategoryIds[]` (6–8 target, ordered), `bestSellerProductIds[]` **length 8** in published config, `featuredReviewIds[]`, `updatedBy`,`updatedAt`,`revision`.
- Validate references are published/approved and unique; changes invalidate appropriate public caches.

## 16 storeSettings (single document)
`key:'primary'` unique, `shipping:{country:'EG',rates:[{zone,governorates[],feePiastres,enabled}],freeShippingRule?}, `tax:{mode:'pending'|'included'|'exclusive'|'not_applicable',basisPoints?,approved:boolean}`, `payments:{codEnabled,instapayEnabled,instapayPhone,proofRequired}`, `contact:{whatsapp,instagram,supportEmail?}`, `checkoutEnabled:false until approvals`, `trustMetrics?:{... only approved values}`, `notificationEmailFrom?`,`updatedBy`,`revision`.
- Seed Cairo/Giza: 9000 piastres; remaining Egyptian governorates: 12000; require every enabled Egyptian governorate maps to exactly one zone. Capture rate snapshot in order.

## 17 dailyAnalytics
`_id`, `day` unique YYYY-MM-DD in Africa/Cairo business timezone, `orderCount`, `confirmedOrderCount`, `grossPiastres`, `netPiastres`, `codCount`, `instapayCount`, `refundPiastres`, `updatedAt`, `sourceEventCursor?`.
- Derived and reconcilable, not source of truth. Update with an idempotent event approach and nightly/manual reconciliation, not unguarded `$inc` retries.

## 18 outboxJobs
`_id`,`dedupeKey` unique,`kind:'order_email'|'meta_event'|'analytics_update'|'cleanup'`, `payload` (minimal, no raw receipt), `status:'pending'|'processing'|'done'|'failed'`,`attempts`,`runAfter`,`leaseUntil?`,`completedAt?`,`lastError?`,`createdAt`,`updatedAt`.
- Background jobs executed by bounded Render worker tick or authorized internal invocation, no extra permanently running service needed initially. Email provider and Meta calls idempotent where supported, retry with exponential backoff and dead-letter after cap.

## 19 auditLogs
`_id`,`actorId`,`action`,`entityType`,`entityId`,`beforeSummary?`,`afterSummary?`,`requestId`,`at`,`ipFingerprint?`. Never store passwords, full private images, receipt URLs or raw secrets. Retention policy before live launch.

## Model quality gates
- All indexes exercised by query tests and explained with `explain()` in staging. Keep Mongo size below threshold with monitoring; Atlas Free may need upgrade for actual sustained commerce use.
- Checkout transaction tests on target M0 instance; use **single short Mongo transaction** for accepted order, inventory conditional updates, discount redemption and outbox insert. If environment doesn't support required consistency/throughput, block checkout until upgraded; do NOT silently fall back to inconsistent multi-write logic.
- Protect against historical data rewriting, replay of prior proof uploads, amount/client input manipulation, and SKU/slug collision.


---

<!-- Source: 02_API_CONTRACT.md -->

# 02 — REST API Contract v1
Base: `https://api.<production-domain>/api/v1` (staging separate). JSON camelCase; UTF-8; EGP piastres integers; ISO8601 timestamps; Mongo IDs strings. No query changes app permissions.

## Response envelope and HTTP semantics
Success object: `{ "data": ... , "meta"?: {"nextCursor"?:"...","count"?:20,"totalApprox"?:1680} }`.
List shape: `{ "data": {"items":[...],"pageInfo":{"nextCursor":null,"hasMore":false},"totalMatching":42} }`; use `totalMatching` only where efficient and needed for UI; cache public count or compute indexed count. `limit` fixed max 20.
Error: `{ "error": {"code":"INVALID_INPUT","message":"...","fields"?: {...},"requestId":"..."} }`.
HTTP: 400 invalid request; 401 no session; 403 forbidden; 404 missing/no authorized access; 409 conflict (price/stock/cart revision); 413 upload size; 422 invalid business rule; 429 rate limit; 503 dependency unavailable. Never expose internals in production.
Write endpoints require CSRF token or same-origin token protection + valid credentials; checkout idempotency header `Idempotency-Key` random UUID; `Cache-Control:no-store` for all auth, cart, tracking, admin, upload authorization and checkout responses. Public GET may use short edge caching with invalidation.

## Public catalog/marketing endpoints
- `GET /public/home` → hero static config reference, trust (approved only), featured category cards, active bundles, **8** bestsellers, featured reviews; compact cacheable projection.
- `GET /public/categories` → published category tree & image keys; cached.
- `GET /public/categories/:slug` → category SEO/info; 404 unpublished.
- `GET /public/products?serviceKind=&category=&subCategory=&q=&minPrice=&maxPrice=&availability=&sort=featured|best_selling|newest|price_asc|price_desc|name_asc|name_desc&cursor=&limit=20` → compact product cards, `requiresOptions`/`canAddDirectly`, image thumbnail only. Public excludes drafts/unapproved; `?preview=1` is honored only on secured staging for authenticated admin review, never in production.
- `GET /public/products/:slug` → product, available options, personalization field schema, image gallery and SEO data; reject unpublished/unapproved.
- `GET /public/products/:slug/recommendations?limit=4` → four published and available related products, no expensive unbounded scans.
- `GET /public/products/:slug/reviews?cursor=&limit=20` → admin-published real review summaries.
- `GET /public/bundles?cursor=&limit=20` and `GET /public/bundles/:slug` → active published bundles.
- `GET /public/products?serviceKind=gift_box|laser_engraving&limit=20&cursor=` → only approved/published/available service-picker entries, `serviceEntryEligible=true`, compatible approved template; no full-catalog fetch. `/customize*` marketing routes are served by the React frontend.
- `GET /public/search/suggest?q=` → 5 compact names/slugs only; debounce and rate limit.
- Static `/about`, `/contact`, `/privacy-policy`, `/refund-policy`, `/shipping-policy`, `/terms-of-service`, `/robots.txt` and `/sitemap.xml` served by React/edge route layer, not necessarily API.

## Customer authentication/account
- `POST /auth/signup` `{name,email,password}` → signup; never accepts role; optional email verification.
- `POST /auth/login` `{email,password}` → secure session cookie; generic bad credential response; throttled.
- `POST /auth/logout` → revoke; `GET /auth/me` → safe current identity.
- `POST /auth/forgot-password` `{email}` → non-enumerating success; one-time reset token delivered via email.
- `POST /auth/reset-password` `{token,newPassword}` → consume token and revoke old sessions.
- `GET /account/profile`; `PATCH /account/profile`; `GET /account/orders?cursor=&limit=20` → only authenticated user's order summaries; `GET /account/orders/:orderNumber` → full own order detail, never foreign users.
- `GET /account/addresses`; `POST /account/addresses`; `PATCH /account/addresses/:id`; `DELETE /account/addresses/:id` → authenticated, bounded.

## Cart and dynamic quote
- `POST /customization/quote` `{productId,variantId?,templateId,templateVersion,kind,selections,quantity}` → pure bounded server validation/price calculation, no upload/database write on every typing event; rate limited. Pricing requires template/product eligibility and approved option deltas. Used by both dedicated service builders and `Customize This`.
- `GET /cart` → owned cart with server-verified line summary and upload states (no signed upload URLs).
- `POST /cart/prepare-add` `{productId,variantId?,quantity,serviceKind?,templateVersion?,personalizationValues,selectedOptions,bundleId?}` → **called on Add to Cart click**; validates required inputs except yet-to-upload binary; returns signed short-lived addIntent ID to authorize any image uploads. No product images uploaded until this click.
- `POST /cart/items` `{addIntentId,uploadIds[]}` → validate ownership, finalized uploads, latest prices/options, add line once; returns cart; use intent uniqueness to avoid accidental duplicate line adds.
- `PATCH /cart/items/:lineId` `{quantity,selectionChanges?}` → revalidate, return updated pricing.
- `DELETE /cart/items/:lineId` → detach images; schedule only truly unused temporary media for expiry.
- `POST /cart/discount` `{code}` and `DELETE /cart/discount` → provisional applicability, server rechecks at checkout.
- `POST /checkout/quote` `{addressGovernorate,cartRevision,discountCode?}` → canonical totals and changes/conflicts; no inventory reserve. Returns quote expiry.

## Deferred direct-to-R2 uploads
- `POST /uploads/authorize` `{purpose:'personalization'|'payment_proof',addIntentId?|checkoutIntentId?,filename,contentType,sizeBytes,checksum?}` → server validates session/intent, purpose, quota, whitelist, maximum size, returns `{uploadId,method:'PUT',uploadUrl,headers,expiresAt}`. For personalization requires prepared Add-to-Cart intent; for proof requires checkout intent AFTER Place Order click.
- Browser `PUT` directly to R2 presigned URL, never proxy full body through Render. **No S3 presigned POST**.
- `POST /uploads/:id/complete` → server uses R2 HEAD and bounded signature checking; marks verified; image dimensions/format may need additional async validation before attachment.
- `GET /admin/orders/:id/proof-access` → admin authorization, returns short-lived private view token/URL, fetched only on View button. Never cache; modal displays inline (not new tab).
- `GET /admin/orders/:id/private-assets/:uploadId/access` → authorized order attachment viewing.

## Checkout and orders
- `POST /checkout/intents` with `Idempotency-Key` and `{cartId,customer:{name,email,phone},delivery:{...},paymentMethod:'cod'|'instapay',acceptedTerms:true,quoteRevision}` → created only on **Place Order click**, captures bounded pending state and server quote. COD may move to completion immediately; InstaPay returns intent for private proof upload.
- `POST /checkout/intents/:id/complete` `{proofUploadId?}` → final check quote, stock, proof ownership, promo use, and order creation with transaction & idempotency; returns `{orderNumber,paymentStatus,fulfillmentStatus,orderSummary}`. Same idempotency key returns exact same created order rather than charging/deducting twice.
- `POST /guest/orders/track` `{orderNumber:'583921',phone:'01...'}` → rate-limited generic failure response if mismatch and minimum tracking summary if valid; do not include full address, private uploads, customer email, payment proof or linked account info. Recommended later: phone OTP for details, v1 statuses only.
- `GET /checkout/confirmation/:token` → token-scoped, short TTL or authenticated own account; must not leak details from public order number alone.

## Admin endpoints (server checks role='admin' on every route)
### Summary, products, categories
- `GET /admin/overview` → compact latest counts and daily summary; optional manual refresh, no polling.
- `GET /admin/products?cursor=&q=&status=&category=&sort=&limit=20` → 20 item rows, minimal fields, no gallery preload.
- `POST /admin/products` / `GET /admin/products/:id` / `PATCH /admin/products/:id` / `POST /admin/products/:id/archive` → name, slug, description, prices, price approval, inventory, variants, personalization and template selection; `If-Match:revision` optimistic-lock critical mutations.
- `POST /admin/products/bulk-update` → max 100 audited IDs per call for price/stock/status updates; **never automatic price approval just by bulk staging seed**.
- `GET /admin/categories?cursor=&limit=20`, `POST /admin/categories`, `PATCH /admin/categories/:id`, `POST /admin/categories/:id/archive`.
- `POST /admin/media/authorize` `{purpose:"product_image"|"category_image"|"review_image",filename,contentType,sizeBytes}` → authorized admin-only direct PUT to a **nonpublic staging prefix** in R2, never raw file through Render; `POST /admin/media/:id/complete` validates format/dimensions and creates reviewable asset record; `POST /admin/media/:id/publish` promotes validated image + thumbnail derivatives to public versioned keys and returns media refs for product/category/review editor; delete/revoke only when no published use.
- `GET /admin/customization-templates?cursor=&limit=20`, `POST /admin/customization-templates`, `GET /admin/customization-templates/:id`, `PATCH /admin/customization-templates/:id`, `GET /admin/component-options?cursor=&limit=20`, `PATCH /admin/component-options/:id`.
- The templates list accepts `kind=gift_box|laser_engraving|tray|generic` filter; the admin product editor validates `serviceKind`/`templateId` compatibility and supported fonts, text limits, placements, artwork rules and pricing, rather than duplicating collection CRUD endpoints.
### Orders/payments/customers
- `GET /admin/orders?cursor=&q=&paymentStatus=&fulfillmentStatus=&from=&to=&limit=20` → 20 summaries, `hasProof` boolean only, **no proof URL**.
- `GET /admin/orders/:id` → expanded detail, selections, upload metadata (not image bytes).
- `POST /admin/orders/:id/payment/verify` `{decision:'approve'|'reject',reason?}` → idempotent state transition, explicit transfer verification, audit and queued email/analytics.
- `POST /admin/orders/:id/fulfillment` `{status,reason?,expectedRevision}` → enforce legal transitions, audit, notify customer.
- `GET /admin/customers?cursor=&q=&limit=20`, `GET /admin/customers/:id` → minimum needed PII and authenticated admin.
### Marketing and settings
- `GET|POST /admin/bundles`, `GET|PATCH /admin/bundles/:id`, `POST /admin/bundles/:id/archive` (lists max 20; validate constituent items).
- `GET|POST /admin/discount-codes`, `GET|PATCH /admin/discount-codes/:id` (lists max 20, code uniqueness, atomic redemption safeguards).
- `GET|POST /admin/reviews`, `GET|PATCH /admin/reviews/:id` (lists max 20); no public write reviews endpoint.
- `GET /admin/homepage`, `PATCH /admin/homepage` `{featuredCategoryIds,bestSellerProductIds,featuredReviewIds}` → require 8 distinct approved product IDs for production; invalidate public home cache.
- `GET /admin/settings`, `PATCH /admin/settings/shipping`, `PATCH /admin/settings/payments` (audit + safeguards), `PATCH /admin/settings/contact`.
- `GET /admin/analytics?from=&to=&granularity=day` → summaries; clamp date range, avoid scanning millions of order docs.
- `GET /admin/audit?cursor=&limit=20` → optional owner-only read surface, redact secrets.

## Important sample payloads
### Product-card response
```json
{
  "data": {
    "items": [{
      "id": "<product-object-id>", "name": "Rose Gift Box", "slug": "rose-gift-box",
      "pricePiastres": 65000, "imageUrl": "https://<public-media-domain>/products/rose-box-thumb.webp",
      "availability": "in_stock", "requiresOptions": true, "canAddDirectly": false
    }],
    "pageInfo": {"nextCursor": "<opaque-cursor>", "hasMore": true},
    "totalMatching": 1545
  }
}
```
Illustration only; the product and price are not merchant approved.
### Checkout intent response
```json
{
  "data": {
    "checkoutIntentId": "<opaque-id>",
    "paymentMethod": "instapay",
    "amountDuePiastres": 74000,
    "currency": "EGP",
    "proofRequired": true,
    "expiresAt": "<ISO8601>"
  }
}
```

## Cross-cutting API gates
- Pagination size 20; stable keyset cursor when feasible; enforced maximum even if client requests 5000.
- Authentication/session/CSRF + origin/CORS allowlist, request body size caps, Zod validation, sanitized text, async error wrapper, request IDs.
- HTTPS only, secure headers, no sensitive GET params; private responses no-store. Never include proof presigned URL in order lists or API errors.
- Consistent server-generated totals; expose price-change error before ordering; form carries current `revision` and retry instructions.
- Public search uses bounded input and indexed search; requests debounced in client, server-side 429 limit.


---

<!-- Source: 03_UI_ROUTES_AND_DESIGN.md -->

# 03 — React Routes, Components, Design & Interactions

## Runtime/layout architecture
- React Router framework with Cloudflare Workers SSR (`ssr: true`) for crawler-facing routes, React hydrated interactions for shop/admin/checkout. Node.js + Express is the only authoritative pricing/order/auth API on Render. **Worker SSR does not connect directly to MongoDB.** Public server loads use a cache-aware, bounded API fetch; never call private API during unauthenticated SSR.
- Cache public stable HTML/fragments/JSON at the edge where safe; invalidate on admin changes. For the free Workers CPU limit, measure SSR rendering actual large product template before committing to launch. Fallback if budget exceeded: separately prerender stable product/category HTML at build time with a static hosting adapter; avoid unbounded dynamic SSR on low-cost Render.
- Public layouts: `StoreLayout`, `AccountLayout`, `AdminLayout`, `LegalLayout`. Error boundaries (404, 500), skeletons, empty states and keyboard accessibility everywhere.

## Route map
| URL | Purpose | SEO/index? |
|---|---|---|
| `/` | Home | yes |
| `/shop` | Filter/sort/search 20 product grid | canonical `/shop`; filtered query combos noindex or canonical to category/canonical listing |
| `/collections/:slug` | Category landing and paginated product grid | yes for valuable approved categories |
| `/products/:slug` | Product detail + gallery + required personalization + optional Customize This + admin reviews + 4 recommendations | yes, approved products |
| `/customize` | Two featured services: Build Your Gift Box + Laser Engraving | yes |
| `/customize/gift-box` | Gift Box from-scratch builder; choose approved base box then components and optional personalization | yes (landing copy), dynamic order state not indexed |
| `/customize/laser-engraving` | Laser Engraving builder; choose eligible item, font/text/placement and optional approved artwork | yes (landing copy), dynamic order state not indexed |
| `/products/:slug/customize` | Customize exact viewed product using eligible gift-box/laser/tray/generic template; independent from required personalization | noindex/canonical original product |
| `/bundles` `/bundles/:slug` | Active bundles / details | yes if substantive content |
| `/about` | About Us | yes |
| `/track-order` | Guest order tracking, 6-digit + phone | noindex |
| `/account/login` `/account/signup` `/account/reset-password` | Customer auth | noindex |
| `/account/orders` `/account/orders/:orderNumber` `/account/profile` | Private customer pages | noindex/auth |
| `/cart` `/checkout` `/order-confirmation/:token` | Cart, checkout, confirmation | noindex |
| `/contact` | WhatsApp, Instagram and approved contact info | yes |
| `/privacy-policy` `/refund-policy` `/shipping-policy` `/terms-of-service` | Owner-approved policies | yes once approved |
| `/admin` and `/admin/{orders,products,categories,bundles,discounts,customers,reviews,homepage,analytics,settings}` | Role-protected back office | noindex/auth |

## Branding/design tokens (initial reference, verify against logo before CSS freeze)
- Blush background `#F9E7E4`; logo brown `#674333`; off-white `#FFFDFC`; optional muted rose accent derived from Hedeytyy references after visual verification. Text must meet accessibility contrast on all backgrounds; `color-mix` and darker accessible brown for small body text.
- Headline serif candidates: Bodoni Moda, Cormorant Garamond. Body/UI: DM Sans. Use exact supplied Tap & Wrap logo asset; do not replace it with typed wordmark. Preload only necessary font files/weights, self-host legal webfont subsets where licensing permits.
- Hero copy exact: `Makes someone’s heart flap with Tap & Wrap.` Video optimized by developer (<1MB), muted, loop, poster, `playsInline`, with reduced-motion and bandwidth/data-saving fallback. CTA Shop Gifts + Customize Your Gift; disable large arbitrary admin hero uploads.
- Spacing/design: generous whitespace, premium gifting atmosphere, pink/champagne accents, soft border-radius, not overdecorated. Responsive mobile-first; 320px narrow phone minimum; 44px targets; visible focus rings; keyboard support; no font/animation dependency for checkout.

## Homepage ordered components
1. Header: logo, Home, Shop, **Customize**, About Us, Track Order; search, account/my orders, cart badge, mobile menu.
2. HeroVideo: static media/code, exact copy + CTAs.
3. TrustStats: genuine approved merchant facts only; omit unverified numbers (do not display X+ as real).
4. FeaturedBundles: dynamically show active/approved bundles in admin display order; **completely hide section when none**.
5. FeaturedCategories: admin chooses/order ~6–8 published categories, image navigation, View All.
6. BestSellers: **exactly 8** approved admin-selected products, normal card semantics and 2 columns on mobile.
7. CustomizeCTA: static developer-managed section presents **exactly two** primary service cards, **Build Your Gift Box** and **Laser Engraving**, linking to `/customize/gift-box` and `/customize/laser-engraving`; link to `/customize` hub. Trays remain supported via product-level `Customize This`, not a third featured service.
8. FeaturedReviews: admin-published authentic quotes, optionally images, no public submission forms.
9. FAQ: developer-controlled content, approved before launch, accessible accordion.
10. Footer: contact social, legal pages, primary navigation.

## Shop interaction spec
- Mobile: 2 columns; desktop: 3–4 depending width; avoid fetching all products. Max 20 cards per API page, Next/Load More or discrete pagination; sync filters and sort state to URL/search params.
- Darb reference: slide-out Filter drawer on mobile, bottom-sheet Sort by, Clear All and View Results; availability, category/subcategory, price double-slider with manual min/max; current result count, dismiss on Escape, trap focus in dialog.
- Sorting: Featured, Best Sellers, Newest, Price Low–High, Price High–Low, Name A–Z and Z–A. Stable secondary sort by `_id` prevents repeat/skip when ordering values tie. `Best Sellers` uses recorded sales stats or explicit featured sort depending chosen label; don't mislabel manually promoted as statistical bestsellers if unverified.
- Search debounce ~400ms; abort stale fetch; search via indexed bounded query. Empty state suggests clearing filters.
- Card: thumbnail, name, compact price, optional promotion badge, favorites NOT in v1; button `Add to Cart` if safe direct-add, otherwise `Choose Options`; sold out disabled. On successful add animate product thumbnail from button in a short zigzag to cart icon via overlay using CSS/motion path; disable for reduced motion and avoid heavy video/RAF loops.

## Product page
Engraving-specific logic: a fixed engraved product may require plain text/artwork through normal personalization (not automatically `Customize This`); only products explicitly enabled by admin show the button. Dedicated Laser Engraving service shows eligible engravable items, validated text/font/placement, permitted artwork uploads, then review. For source product route `/products/:slug/customize`, use that exact base item/default selections. See `10_CUSTOMIZATION_SERVICES_LOCKED.md` for full wizard steps and UI decisions.
- Desktop gallery left, information right; mobile image gallery swipe. Main/gallery order exactly from master; second-image-on-hover only where available and user device supports hover. Lazy-load all non-primary galleries, correct intrinsic aspect ratios/width/height.
- Title, price, availability, variant selectors, required personalization fields and local file previews (no upload before Add to Cart), optional `Customize This` control (only enabled products). Custom builder opens in dedicated dialog/route section, starts with current product, shows permitted modify/replace/remove/add options + live server-validated price quote. Manual notes are not unpriced promises.
- Add to Cart validates fields, triggers authorized temporary upload(s), shows reliable progress/retry; do not report success until cart commit succeeds.
- Product reviews admin-published only; related products 4; policy accordions where business-approved. Sticky Add to Cart bar appears only after main purchase controls scroll away; for options-heavy products sticky CTA scrolls to/selects required fields rather than bypassing them.

## Checkout/track pages
- Cart: items, custom options, photo thumbnails only via authorized private image preview, quantity changes, discount, shipping preview and revalidated total.
- Checkout: customer full name, verified-format Egyptian phone, email, governorate/city/area/street/building/address, optional notes, COD/InstaPay radio, calculated shipping, consent/terms checkbox; full InstaPay, no partial amount. Proof file picker displays local preview before upload; actual R2 PUT only on Place Order click.
- Confirmation: order number + method/status and safe summary. Pending InstaPay must clearly state **Awaiting verification**, not Paid. Accessible to owner via guarded confirmation token and account.
- Guest track: exactly 6 digits + phone; no URL-based data leak; show limited fulfillment/payment status only, throttle attempts, non-enumerating error.
- Account: login/signup/recovery; My Orders 20 per page and detail, user can view only owned orders.

## Admin interaction specs
Add **Admin → Customization** with tabs for Gift Box Templates, Laser Engraving Templates, Product-Level Templates (including trays), and Components/Extras. The product editor has independently editable required personalization and optional builder eligibility/type/template. No additional Mongo collections or generic homepage builder required.
- Common paginated list components enforce 20 per page, server-side search/filter, meaningful loading and empty states; never fetch full 1,680 products for selection UI (use async search with 20 results).
- Orders list: number, placed date, total, method, payment status, fulfillment, customer summary, `View` detail. `Has Proof` indicator only; proof loads ONLY after `View Proof` button into an accessible modal/drawer; closing frees object URL/signed access. Buttons Verify/Reject payment and status transitions demand confirmation/audit.
- Products: catalog list, edit form with price approval, image upload/reorder/alt-text via admin-only direct R2 staged media workflow, variants, required personalization, independent `Customize This`, stock mode checkbox (`No inventory — Made by request`), separate available/published switches, draft warnings, bulk edit.
- Categories: manage category hierarchy and optional image, plus separately Homepage featured category selection/reorder.
- Bundles: choose constituent products through paginated lookup, set discount or fixed price and schedule, preview price/stock; publishing reveals Homepage bundles section automatically.
- Discount Codes: fixed/percent/minimum spend/limits, status, eligibility and exceptions for bundles.
- Reviews: manual create/edit/feature/hide, rating 1–5, customer name/approved source, product association; no customer review submit.
- Homepage: featured categories order, 8 bestsellers order, selected reviews; no hero video editor, no FAQ editor or general CMS.
- Settings: shipping zones for Cairo/Giza/other Egyptian governorates; COD/InstaPay instructions; contact; protected checkout enable switch with release checklist interlock.
- Analytics: summary tiles and chart sourced from dailyAnalytics, date range; refresh on demand; respect actual paid vs placed accounting definitions.

## Staging preview mode
- An authenticated admin can preview draft/unapproved product pages and provisional prices in staging via a protected preview session; force `noindex`, show clear **Development Price / Not Yet Approved** banner and disable production-style checkout outside explicit sandbox order tests. The same preview route MUST return 404/disabled in production for non-approved products.

## SEO/head rules
- SSR product/category pages respond with unique title, meta description, canonical, OG tags, image alt and Product/Offer schema only for legitimate published approved data. Avoid showing placeholder estimate as legitimate Offer price. JSON-LD offers availability consistent with server.
- Root `sitemap.xml` includes canonical published product, category and policy pages; split into sitemaps if size requires. Never index `/admin`, `/account`, `/cart`, `/checkout`, `/track-order`, confirmation, private upload routes.
- Metadata on admin product update invalidates edge cache/sitemap data. XML sitemaps may be batched generated from products via scheduled/update job, not full collection scan on every request.
- Google rankings cannot be guaranteed, even with excellent technical SEO.


---

<!-- Source: 04_PAYMENTS_UPLOADS_AND_LIFECYCLE.md -->

# 04 — Checkout, Payment, Upload, Inventory and Event Lifecycles

## Trust boundaries
- React/browser is UI only. Node API validates identity, product availability, selected component eligibility, authoritative price, discount, shipping, stock, uploads and all order transitions.
- Direct R2 writes use short-lived server-authorized single-object presigned **PUT**; no long-term credentials in browser. Separate public product-media and private customer-media buckets. Restrict CORS origin to staging/production sites. Read proof/print originals via short-lived authorized GET or backend proxy with `Cache-Control: private, no-store`.
- Browser checkout requests may be duplicated, delayed, retried or malicious. Idempotency and DB invariants take priority over UI convenience.

## Money and total formula
1. For each purchasable line derive product base price (or selected variant price), permitted component replacements/additions/removals, per-line quantity and any bundle fixed/special rate.
2. Subtotal = sum(line prices). Apply eligible single discount code (default excludes bundles); round integer piastres deterministically, minimum 0.
3. Shipping from *validated Egyptian governorate* and current settings (Cairo/Giza 9000 piastres, elsewhere 12000), overridden only by explicit enabled policy such as free shipping.
4. Add applicable validated tax according to merchant-approved policy (`taxPiastres`); if tax applicability/rate is still unknown, keep checkout staging-only. Grand total = subtotal minus discount plus shipping plus any separately charged tax. Server quotes carry `cartFingerprint` + settings version + expiration; server recomputes again on final submit and returns 409 on any meaningful change.
5. Prices and compare-at on unapproved seeded products are for **staging only**, checkout disabled production until approved. Honor `made_to_order` stock-free mode but still honor availability and optional quantity caps.

## Add to Cart with customer personalization photos
This identical deferred Add-to-Cart flow applies to **laser engraving customer artwork** and **gift-box photos**: local preview prior to click; client obtains addIntent and private direct-to-R2 authorization only after click; order links to production attachments. Engraving artwork never shares payment-proof purpose. A product requiring a photo normally does not need `Customize This`; see `10_CUSTOMIZATION_SERVICES_LOCKED.md`.
1. Customer picks files locally. Local object URL/thumbnail in browser; no remote upload yet.
2. Customer taps Add to Cart. Client validates required count/type/size and calls `POST /cart/prepare-add` with selected product/options/quantity. Server validates known fields and creates an add intent owned by guest session/user.
3. Client requests presigned PUT for each selected file using add intent, then PUTs browser→R2 (private/temp). Cap total files per intent, total bytes per guest/account per day, simultaneous uploads (e.g., 2), and retries.
4. Client calls each `/uploads/:id/complete`. Backend confirms object exists and bounded metadata; do file magic-byte and image dimension validation in a bounded safe step. If any required photo fails, no cart commit; report recoverable error and temporary objects eventually expire.
5. Client calls `/cart/items` with add-intent and verified uploaded IDs. Backend rechecks identity/ownership, schema, quantities and upload states; creates line, marks uploaded assets attached to cart. Only now show cart success/zigzag animation.
6. Abandoned cart upload expiration: 48h target; implement R2 `temp/` lifecycle expiry and periodic orphan reconciliation. Ensure app-level expiration prevents use after deadline even if R2 deletion is delayed. Never delete files referenced by completed orders. Same clicked add intent must not duplicate line on retry.

## Place Order: Cash on Delivery
1. User enters contact, address, agrees terms, clicks Place Order.
2. API creates checkout intent with unique idempotency key and server-priced quote; verifies cart item inputs/upload references.
3. Finalize order through a short Mongo transaction: recheck revision, conditionally consume inventory for each tracked product/variant/component, validate per-customer discount use, create order with unique six-digit order number, create redemption record, queue confirmation email / analytics / eligible Meta outbox events, mark checkoutIntent complete. On stock failure **rollback**, return 409 with actionable cart changes.
4. Payment status `unpaid` (COD) and fulfillment `received`. Show confirmation only after transaction commit; COD Purchase tracking may represent accepted order (not collected cash) and reporting separates paid revenue from placed value.
5. Fulfillment updates per accepted transition (received→confirmed→preparing→out_for_delivery→delivered). COD payment can be marked paid upon actual collection, not automatically by delivery unless business approves policy.

## Place Order: full InstaPay
1. Cart shows exact **full total** and transfer number `01060673073`; checkout proof image preview is local only.
2. User clicks Place Order → backend creates short-lived checkoutIntent (e.g. 15 min) after revalidating quote; only now authorizes upload of selected proof. Direct browser→private R2 PUT; upload metadata checked; proof becomes linked to intent. This stage must not deduct stock yet or create accepted order.
3. `/checkout/intents/:id/complete` validates proof and atomically creates order/reserves/decrements tracked inventory. Order payment `awaiting_verification`, fulfillment `received`; do NOT mark paid or count confirmed paid revenue yet. If cart prices/availability changed in this interval, return a safe quote-change state; leave temporary proof associated with intent to allow resolving without losing data (with expiry/retry policy).
4. Admin opens order detail and clicks View Proof. Only then fetch expiring private access into a modal, never auto-load proof in 20-row list or open new tab. Admin compares transfer **in actual receiving account** against order amount/reference; receipt screenshot alone not sufficient.
5. Admin Approve sets payment `paid`, actor/time + audit, queues email and one verified Purchase CAPI event. Admin Reject sets `rejected` with reason and informs customer; fulfillment remains on hold until resolved. Re-upload workflow for rejected proof can be added as controlled versioned re-submission; do not overwrite original proof, maintain auditable history.
6. Cancellation before payment approval: controlled cancellation returns stock if deducted, marks files/private access according to retention, and ensures prior proof cannot be reattached to another order.

## Admin image uploads (products/categories/reviews)
- Admin may add product/category/review images directly from browser to an R2 **private staging prefix** using admin-only presigned PUT authorization, never by sending file bytes through Render. Server validates actual image format, dimensions and size, generates bounded optimized thumbnail(s) by trusted process, then publishes to public immutable/versioned media keys. Unused admin staging objects expire. Existing public product images are not deleted while still referenced by a live product or historical order snapshot.
- Admin review image upload is optional and follows the same verified image pipeline. Never allow SVG/HTML active content or unchecked remote URLs as image sources.

## Inventory concurrency guarantee
- Store order and tracked stock decrements within an ACID transaction on the Atlas replica set, using conditional filters `quantity >= requested` and matching active/approval state. Unique checkoutIntentId enforces one order per intent. Multi-line basket with multiple shared inventory sources must roll back *all* stock decrements if any line fails.
- `made_to_order` inventory is not decremented but `available=true` and product/variant publication is checked.
- Track stock source references in order snapshot for exact restock on approved cancellation/refund; choose `restockedAt` idempotency marker per item to prevent double-restocks. Avoid negative inventory.
- Product state race: when owner unpublishes or edits price between cart and order, revalidate at final commit. Do not reserve inventory just from cart contents.
- Test MongoDB transaction capability, failure labels and retry behavior on the exact Atlas Free cluster being used. If full safety and performance cannot be supported, upgrade before taking orders.

## Six-digit order numbers and guest tracking security
- Generate integer 100000..999999 using cryptographically secure RNG; enforce a unique index, handle collision retry boundedly, never derive from `orders.countDocuments()` or increment a counter. At very large order volumes, consider transitioning to an expanded-format public reference; v1 6 digits has finite capacity.
- Guest lookup requires both order number and phone normalized to E.164; return generic failed response for nonexistent/mismatched; strict IP/device rate limit + CAPTCHA/adaptive restriction on abuse. Successful lookup shows only fulfillment status, limited payment state, and dates; no delivery address, personal details, private media or contents without additional verification.
- Account My Orders uses actual `userId` relation and secure session, never match accounts to guest orders solely by submitted phone/email without verification.

## Admin status transitions and notifications
- Explicit finite state machine for fulfillment and separate finite state machine for payment; block illegal transitions and record audit/time/actor/old/new with revision compare-and-set.
- Every accepted status change queues an order email with minimal information; API doesn't wait for email provider to succeed. Retry boundedly in outbox, idempotent provider request if available. Email may arrive late/fail, dashboard displays internal delivery status.
- Standard emails: placed, InstaPay proof received/verification pending, verified/rejected, confirmed, preparing, out for delivery, delivered, cancelled. Avoid sending each duplicate status update.
- Domain verification, sender authentication and email delivery provider are setup requirements before production, not blockers for coding. In staging send mail to sink/test addresses only.

## Reviews and audit privacy
- Reviews are admin-written/transcribed merchant-provided authentic reviews only. Customer cannot post reviews. Source notes stored privately and customer names display only with appropriate permission; do not claim verified customer when not verified.
- Access to customer uploads logged for sensitive staff actions where practicable. Do not log access tokens, entire upload URLs, personal message contents, bank details or raw request bodies.

## Meta Pixel + Conversions API (consent-aware)
- Browser events after eligible consent: `PageView`, `ViewContent`, `Search`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `CompleteRegistration`, optional `Contact` and `CustomizeProduct` custom event. Standard content IDs match source product stable mapping; EGP value from server quote where available.
- **COD**: fire Purchase at accepted COD order confirmation, with shared `event_id` for paired browser/server dedupe, orderNumber or internal stable event keyed separately (don't leak personal info). **InstaPay**: fire Purchase via **server CAPI after admin approves actual payment**; don't fire an unverified purchase at proof submission. Distinguish payment-submitted event as custom non-Purchase if needed.
- Outbox dedupeKey unique `meta:purchase:<order-id>` ensures at-most-one intentional queued Purchase. Meta API retries may be at-least-once, so persistent event_id stable for dedupe. Hash eligible email/phone server-side only when allowed under privacy/consent rules. Never send customer photos, uploaded receipts or detailed gift message text to Meta.
- Test via Meta Test Events and conversion path; avoid claiming each browser action corresponds to revenue.

## Resource and security limits (initial engineering targets, not contractual SLAs)
- Admin/store item lists max 20; bestseller exactly 8; related 4; no auto request for proof. Safe normalized name search debounce 400ms; result count only when useful.
- R2 images: public thumbnails preferably ≤100–200 KB typical on shop, optimized previews; original product originals stored if needed, never fetched for thumbnails. Customer print originals private and preserved at original quality.
- Upload default each up to 10MB, max 10/cart line, strict file count/session/day cap; approve dimensions/limits after real merchant examples. 5–10MB can still be too small for some print artwork; configurable typed validation per product.
- Mongo list projections / `lean()` reads, `.limit(20)`, bounded aggregation; indexes and explain benchmark. Sessions/jobs/order histories consume DB space: define retention and archiving policies before sustained volume.
- Cache public categories/featured and product listings using bounded TTL and purge on merchant edit; prevent price and stock from being trusted solely from cache.
- Workers are request-metered and CPU-limited; public SSR/caching must be measured. Render receives no static product-image traffic. Atlas Free has **no built-in automated backup**, so tested offsite `mongodump`/restore or upgrade required before production.


---

<!-- Source: 05_CATALOG_IMPORT_AND_OPERATIONS.md -->

# 05 — Catalog Import, Deployment, SEO, Resource Operations

## Actual audited inputs
- Website workbook: `TapAndWrap_Website_Product_Master.xlsx`, sheet `Website Product Master`, data rows 2–1681 inclusive (1,680 catalog entries). `Image Index` has 4,139 image records. Source asset folder on user Windows machine: `C:\Users\youss\Downloads\tapandwrap-Photos-CLEAN` (already copied and SHA256 verified); **do not modify the original** `tapandwrap-Photos` folder.
- Roles measured: `Product` 1,545; `Customization Option` 80; `Customizable Product` 43; `Variant Product` 7; `Gift Packaging` 5. Confidence: High 1,370; Medium 310. Workbook has 195 rows with merchant/variant/customization review notes. Roles are candidate classifications, not merchant business facts.
- Image Count totals 4,139. **Do not infer main image from `-01` suffix**. `Image 1 (Main)` is canonical, e.g. `Custom Sports Awards Set` uses `...-02.webp` as main. Additional image paths are in `Image 2`..`Image 23`.

## Excel source column mapping
| Column | Workbook field | Ingestion |
|---|---|---|
| A | Product ID | `sourceProductId` — unique import key |
| B | Product Name | `products.name` / `componentOptions.name` |
| C/D | Main Category/Subcategory | resolve/create category/subcategory and refs |
| E | Description | `products.description` — review medium-confidence text |
| F | Catalog Role | map to candidate catalog domain type |
| G | Confidence | `catalogConfidence`, QA flag |
| H | SKU | Optional, omit until merchant confirms |
| I/J | Price EGP / Compare-at Price EGP | If blank, apply **development-only estimate**, mark unapproved |
| K/L | Stock Status/Quantity | Default tracked 10 provisional unless role/notes require manual review |
| M/N | Variant/Customization Details, Merchant Notes | private merchant review notes; never automatically create unverified option prices |
| O | Publish Status | Draft by default |
| P | Image Count | Assert matches actual nonempty Image columns |
| Q:AM | Image 1 Main ... Image 23 | R2 public object keys in exact order |

## Deterministic import protocol
**Engraving/featured-services import rule (v1.1):** no photo/name-based auto-detection of engravable eligibility or initial gift box builder offerings. Seed draft candidate annotations for merchant review only. `serviceEntryEligible=false`, `customization.enabled=false` by default. The admin later assigns reviewed compatible templates and approved fees to selected base products. Custom trays remain product-level; the `/customize` hub has exactly Gift Box and Laser Engraving.
1. Import workbook in script with a verified parser appropriate for XLSX; never edit original workbook in import pipeline. Validate expected columns, row count, unique source ID, image counts, category/slug references and nonempty product names.
2. Build `sourceProductId` → stable product ID mapping. `Customization Option` (80) imports as unpublished componentOptions not storefront product by default. `Gift Packaging` (5) imports as draft packing options/merchant-review candidates, NOT automatically live unless merchant approves their independent sale status. `Product` (1,545), `Customizable Product` (43), `Variant Product` (7) import into Products with **draft** status. Initial product document count if every role maps as above: 1595 (1545 + 43 + 7); 5 packaging candidates remain separate/unpublished pending mapping approval.
3. Normalize main categories (12 high-level categories) and subcategories to stable slugs. Multi-level names like `Wallets / Men` must be handled without blind slash-based path splitting unless category hierarchy mapping verified.
4. Generate safe unique slugs and preserve redirects/previous slug mapping on future edits. Assign price estimates using explicit deterministic category template/range with fixed hash/seed (never random values changing on each import); `pricing.approved=false`. For unknown complex products, use conservative **placeholder prices for preview only**; optional null price allowed on drafts if estimation isn't credible. Never invent compare-at prices or false sale badges.
5. Seed provisional stock `inventory.mode='tracked', quantity=10,available=true`; product remains `draft`; do not infer made-to-order automatically from `Customizable Product` role. Admin can tick `No inventory / Made by request` per product.
6. Do **not** auto-enable photo requirements merely because a sample product photo appears personalized. Flag for merchant review. Do **not** infer component customizer logic from names alone. `customization.enabled` defaults false until reviewed; seed known catalog role as a candidate review flag.
7. Upload 4,139 validated image objects directly from CLEAN folder into R2 public bucket using bounded-concurrency local import script (e.g. 3–5 simultaneous uploads; configurable); Render API must never carry mass import images. Generate web thumbnails as separate named derivatives, but preserve original image ordering and image source path mapping. Deduplicate upload by checksum/object key, verify HEAD/hash or manifest, maintain import manifest `sourcePath,key,hash,size,uploaded,status`.
8. Use `/products/<sourceId>/<slug>-...webp` or stable hashed object key (not filesystem paths with spaces in public URLs) and thumbnail derivatives; maintain `sourceImagePath`→R2 object key mapping file for audit and rollback. Public metadata uses safe alt text; image CDN sends cache headers (immutable versioned keys).
9. Bulk upsert by sourceProductId to prevent duplicates. Skip merchant-edited fields on rerun unless explicit `--force-merchant-overrides` with dry-run + backup; never overwrite approved price, stock or manual publish flags from stale source workbook.
10. Dry-run report first: expected products/components/packaging, categories, unmatched images, duplicate slugs, blanks, note/confidence flags. Import staging, validate counts and sample image galleries before production.

## Initial categories (all 12)
Accessories (491); Food & Treats (247); Gifts & Occasions (240); Home & Kitchen (151); Beauty & Selfcare (147); Baby & Kids (144); Home & Decor (109); Flowers & Plants (59); Outdoor & Travel (42); Electronics & Gaming (35); Office & Stationery (14); Pets (1). Counts describe catalog entries before role mapping; NOT guaranteed live product counts.

## Repository layout / ownership
```text
tap-and-wrap/
  apps/
    web/                   # React Router (Cloudflare SSR, public + admin)
      app/routes/
      app/components/
      app/features/{shop,product,cart,checkout,auth,account,admin}/
      app/styles/
      workers/
      wrangler.jsonc
    api/                   # Node.js Express on Render
      src/{app,config,modules,middleware,jobs,lib}/
      src/modules/{auth,products,categories,customization,cart,checkout,orders,uploads,bundles,discounts,reviews,home,analytics,settings}/
  packages/
    contracts/             # shared Zod, enums, types
    pricing/               # pure pricing and order calculations
    ui/                    # reused React primitives and design tokens
  scripts/
    import-catalog/
    migrate/
    verify-r2/
    backup/
  docs/
  tests/{unit,integration,e2e,security,load}/
  pnpm-workspace.yaml
  .github/workflows/
```
Runtime code written in TypeScript, tests with Vitest + integration test DB + Playwright; CI typecheck, lint, test, build on pull requests; staging deploy before production promotion.

## Cloudflare/Render topology and cost safeguards
- `shop.<domain>` or root domain: Cloudflare Workers with React Router SSR and static assets. Confirm actual free Worker request/CPU ceilings for intended traffic; SSR cache responses and avoid hitting Render for static content. **Cloudflare Workers SSR is not the same billing/runtime as purely static Cloudflare Pages.** If free limits unsuitable, benchmark alternative static pre-render build without downgrading SEO.
- `api.<domain>`: Render Node/Express (starter tier assumed ~USD 7/month from user's plan; verify actual checkout and current provider billing at deployment). Trust proxy for HTTPS cookies/rate limit; no local file persistence relied upon.
- `media.<domain>`: R2 public bucket via CDN/custom domain, cache immutable versioned product images. For admin-added media, use private staging PUT + validate/thumbnail + controlled publication to public bucket; audit the action and avoid serving unchecked uploads.
- Private R2 bucket has no public custom domain; sign short-lived URLs for authorized operations only; CORS restricted, no payment proof GET until admin explicit View.
- Atlas free separated staging/production (independent projects/clusters if possible) and database IP allowlisting; safe credential rotation. Cluster data+indexes 512MB free; establish budget alerts and backup restore process or upgrade for production durability.
- Transactional email provider connection via API key on Render, authenticated From domain. Do not send emails synchronously during API transaction. Outbox worker only retrieves bounded pending jobs, e.g. a few jobs every minute in-process under controlled lease, not a separate billable service. R2 lifecycle cleanup plus low-rate reconciliation script avoids extra 24/7 service.

## SEO and search engine release protocol
- SSR initial HTML for public product/category pages: meaningful metadata plus JSON-LD Product/BreadcrumbList/Organization, images, price only if confirmed, canonical. SEO slugs, human descriptions and nonduplicated category titles. Staging `noindex`; production robot rules permit approved pages.
- Sitemap lists only published canonical pages; block index for account/admin/cart/order tracking/checkout. Product images accessible via public CDN, photos/receipts never sitemap-listed. Responsive images via `srcset`, lazy load below fold, width/height, low LCP hero poster.
- Search Console property/domain verification, sitemaps submitted, test rich results and Google indexed coverage; Merchant Center where eligible with real feed + shipping/return info. **No promise of #1 ranking**.

## Meta and analytics operations
- Meta Pixel + CAPI are configured separately for staging (test/dummy) and production; no production ad revenue when staging. Verify event match quality/dedupe/consent; one Purchase per accepted COD vs verified InstaPay as defined in `04`.
- Analytics aggregates computed on paid/placed definitions; make dashboard label explicit to avoid presenting unverified InstaPay orders as paid sales. No analytics scanning every order on each admin visit.

## Backup and restore runbook
- Atlas Free has no built-in managed backup; make encrypted `mongodump` offsite on a secure trusted machine (or upgrade to managed backups) with credential rotation, retention, least privilege. Test `mongorestore` into an isolated staging DB and verify order/product record counts and samples before going live.
- Record deployment version and latest catalog import manifest; avoid storing backup files or secrets in public R2. Back up customizer rules/settings as well as orders. Establish documented Recovery Point/Time Objectives with owner rather than promising perfect availability from free tiers.
- Environmental rollback: reversible code migrations, rollback build, backfilled data migrations with dry-run, avoid destructive migrations on production.


---

<!-- Source: 06_TESTS_AND_BUILD_PLAN.md -->

# 06 — Build Roadmap, Acceptance Tests, Release Checklist

## Phase 0: repository and contracts (start coding here)
Deliverables:
- pnpm monorepo apps/web, apps/api, shared contracts/pricing, strict TypeScript/lint/formatting; `.env.example` no secrets; staging env wired.
- React Router framework app deployable on Cloudflare Workers; prove basic SSR homepage/product demo loads with correct initial HTML. Benchmark Worker CPU/request budget and cache hit/miss. Node/Express API with `/health/live`, `/health/ready`, request IDs and consistent error format.
- Mongoose connection with bounded pool; initial migrations/index definitions; safe customer/admin session scaffolding and Zod schemas; Jest/Vitest/integration test runner.
**Gate:** CI green; SSR test passes with view-source product title; no credentials in git; Cloudflare free-tier feasibility checked.

## Phase 1: catalog and product administration
Deliverables:
- Categories, products, componentOptions, personalization fields, customizationTemplates, images + public search/product APIs and admin CRUD.
- Audited Excel mapping parser, R2 local image importer, dry-run, hash validation, idempotent upsert; draft staging import before any public published data.
- UI: admin product editor with `No inventory / Made by request` checkbox, `Available` and `Published` independent, price approval, editor for standard variants, photo requirements and optional custom builder; admin list strictly 20/page.
**Gate:** expected source categories/row-role mapping correct; 4,139 image references mapped; main image ordering correct; rerunning import produces no duplicates and does not overwrite merchant edits; live drafts not accessible publicly.

## Phase 2: visual storefront
Deliverables:
- Brand styles/logo, header/footer/homepage order including active bundle section position, hero video <1MB with poster, eight bestselling product cards, featured categories, reviews, FAQ, about/contact/legal shells.
- Shop filter drawer, sort bottom sheet, URL-driven filters, server 20 items, product gallery + option selectors, product page reviews + four recommendations, scroll-triggered sticky purchase CTA; zigzag add-to-cart after actual success.
- SSR canonical/meta, initial JSON-LD and sitemap with draft exclusion; mobile/keyboard/accessibility design.
**Gate:** <=20 items/request, product initial HTML SEO verified, no unapproved product indexed, responsive 320/375/768/1280 px, good keyboard focus, reduced-motion safe, no hero 50MB path.

## Phase 3: options, personalization and private assets
Deliverables:
- Separate required personalization vs optional Customize This UI, live local photo preview, admin edit options, pure server pricing library, R2 direct PUT authorize/complete path after Add to Cart click.
- Private temp object lifecycle + final order association, upload quotas, bounded retries, verification, missing-file and cart-abandon cleanup.
**Gate:** no R2 object before Add to Cart; correct required upload count, local preview, print original preserved, abandoned temp expires, unauthorized GET fails, quote agrees UI, template/version changes handled.

## Phase 4: cart, shipping, discount, bundle, checkout
Deliverables:
- Guest/account cart session, server quote, 90/120 governorate shipping config, coupon restrictions, bundle component inventory, provisional prices only staging.
- COD order and full InstaPay proof workflow on Place Order, 6-digit cryptographic order numbers, transactional inventory, idempotency/retry, private receipt viewer manually loaded only on admin click.
**Gate:** no double order/stock deduction; multi-item transaction rollback on one out-of-stock item; retry same key yields same order; correct EGP cents and shipping; InstaPay is NOT paid before admin verifies.

## Phase 5: operations + accounts
Deliverables:
- Admin order list/status and proof modal, payment approval/rejection, confirmation/status emails via outbox, customer directory, account My Orders, secure guest tracking, admin reviews, homepage selectors, discount admin, bundle admin, analytics summary.
**Gate:** role checks for every admin route, foreign order not accessible, safe guest tracking, no automatic receipt request, 20/page everywhere, 8 distinct featured product IDs, emails retried but not duplicated by one event.

## Phase 6: SEO, marketing, deployment and launch readiness
Deliverables:
- Meta Pixel/CAPI event map + deduplication; consent policy; SEO metadata/schema/canonicals/site map; Search Console/merchant setup after domain ready; structured performance/abuse tests and backup restore.
- Production env configured, approved real business details/price/inventory, payment and legal policy approval, authenticated domain email, monitoring, rollback checklist.
**Gate:** all automated acceptance tests green; published real-product sample verified; owner signoff; secrets stored correctly; backed up and restore tested; no staging traffic sent to production pixel.

## Automated acceptance test matrix
### Unit tests — pricing/inventory
- Piastre arithmetic with 0.01 EGP increments, percentage rounding, quantity multiplication, free shipping explicitly configured, coupon minimum spend + limits, no negative totals.
- Bundle fixed total, bundle code eligibility default false, constituent inventory quantities.
- `tracked:10` sale of 2→8, `made_to_order` does not decrement, `available:false` blocks either mode, variant inventory independent.
- Removing/replacing a customization group changes price only via eligible deltas; malicious negative delta rejected; required selection count enforced.

### Integration — API/session/authorization
- Unauthorized customer/admin access returns 401/403, login rate limit, password reset one-use, admin role cannot be set via signup payload, CSRF rejected, session revoked.
- Public filters/sort predictable/stable across pages, `limit=10000` clamped to 20, malicious regex or query operators rejected; archived products 404.
- Two customers cannot access each other's carts, orders, private photo or proof; guest tracking with guessed code and random phone returns generic error after rate limit.
- Product edit revision check rejects concurrent admin overwrites. Product slug uniqueness, source ID uniqueness, index explain follows intended plan.

### Integration — checkout concurrency
- Duplicate Place Order same idempotency key creates 1 order and 1 inventory deduction.
- 20 parallel purchases for last 1 in-stock item yield exactly 1 accepted order; others actionable out-of-stock responses.
- Multi-product transaction: second line out of stock → no order and first line stock unchanged.
- Payment proof uploaded but checkout interrupted → safe retry/expiry without accepted duplicate.
- 6-digit collision mocked; collision generates a different unique ID; exhausted collision returns controlled error, never order ID clash.
- Admin status transition retry sends one effective outbox job, not duplicate emails or analytics.
- Cancellation restock once; subsequent cancellation no second restock.

### R2 upload and private media tests
- Before Add to Cart, selecting an image triggers 0 `/uploads/authorize` calls and 0 R2 requests.
- Before Place Order, selecting receipt triggers 0 R2 uploads.
- Add to Cart triggers PUT only when required; signature/type/size/quotas enforced; cross-session reused upload ID rejected; short presigned URL expires; no public ACL.
- Admin list GET never fetches proof object; View Proof modal fetches once on user click, closing releases; customer cannot request proof access; proof not opened in new tab.
- Cart abandonment expires temp records/objects without deleting completed-order images; 1,000 temp upload objects reconciled in bounded batches.
- Admin image upload of product/category/review image: credentials limited to admin, hidden until validated/published, thumbnail created and displayed, old main-gallery ordering preserved; nonadmin attempts rejected.

### End-to-end UX tests
New v1.1 customization gates: exactly two hub services (Gift Box, Laser Engraving); eligible gift base/engraving product selection uses paginated 20-item picker; normal photo product does not automatically show builder; successful gift composition and detailed price snapshot; engraving permitted fonts/placements/text lengths and required artwork; `Customize This` preloads exact product; tray only on eligible product page; all selected media stays local until Add to Cart; no unapproved engrave/gift pricing in public checkout. See `10_CUSTOMIZATION_SERVICES_LOCKED.md`.
- Guest: Home → category → filtered shop → details → Add to Cart → COD checkout → six-digit track.
- Guest InstaPay: proof local preview → Place Order → private upload → awaiting verification → admin View Proof → approve → customer gets update.
- Registered: sign up/login → My Orders 20/page → own detail, foreign detail denied.
- Personalized photo gift: must upload number required (e.g. 4), photos saved on order, product edit later doesn't alter prior order.
- Customize This gift: replace flower, add chocolate, remove optional perfume, price updates, order snapshot accurate.
- Mobile: filter drawer, sort sheet, sticky purchase bar, cart zigzag/reduced motion, 8 bestsellers, bundle section conditional.

### SEO/Meta/performance tests
- SSR view-source on published product contains product title/description, canonical, JSON-LD, OG and image key; unapproved draft returns 404; generated sitemap excludes private routes.
- Verify PageView, ViewContent, AddToCart, InitiateCheckout, payment-submitted event and correct Purchase behavior; COD purchase at accepted COD; InstaPay purchase only verified by admin. No repeated purchase for status retries; browser/server same event_id when both sent.
- Compare cache HIT vs MISS Render API request counts, ensure 20 item list projection, lazy gallery loading, no proof image during order list, watch Mongo explain stats.
- Worker CPU/request-limit benchmark realistic product SSR; Node memory / Atlas operations benchmark; redesign if free-tier capacity inadequate.
- Security tests: OWASP-style input injection, HTML/email escaping, file metadata spoofing, brute-force guest track, SSRF avoidance, rate limits, unsafe status transitions, permission leakage, no production secret logs.

## Operational metrics / alert thresholds
- Atlas data+indexes utilization, connection count, read/write burst, slow queries. Cloudflare Worker requests/CPU/errors/cache hit rate; R2 operations/storage; Render RAM/CPU and response p95; email queue failed/retry count.
- Treat low-cost target as resource budget, **not a guaranteed fixed $7 total expense**: Workers, R2, email and Atlas upgrades may become paid with scale; vendor plans may change.

## Final production release gate checklist
- [ ] Production domain, TLS, API domain and DNS configured.
- [ ] All production merchant prices, availability, 10-unit placeholder stock, actual gift-box and laser engraving product/material/font/placement/customization rules and fees approved.
- [ ] Accepted shipping/rates/policies/business contact, applicable tax treatment and expected delivery times published.
- [ ] Company InstaPay receiver confirmed; actual payment workflow test performed; COD rules confirmed.
- [ ] Owner's review content and trust claims verified; no fabricated testimonials.
- [ ] Email SPF/DKIM/DMARC and successful transactional test delivery.
- [ ] Live backup created, encrypted, separate location and successful restore demonstrated.
- [ ] Auth/CSRF/rate-limit/private R2 tests pass; admin account uses strong authentication.
- [ ] Meta Pixel and CAPI verified with event deduplication/consent; production Test Events clear.
- [ ] SEO SSR schema and sitemap tested; Search Console property and domain ready.
- [ ] Mobile/desktop and slow-network tests pass; Worker/Render/Atlas budgets measured.
- [ ] Staging data inaccessible to production; `checkoutEnabled` turned on only through reviewed release control.

## Scope not included without separate approval
- International shipping, online card payments or automatic InstaPay verification, customer review submission, marketplace seller accounts, drag-and-drop visual gift editor, ERP integrations, shipping courier API automation, WhatsApp transactional bot, multilingual/Arabic RTL, personalized recommendations via AI.


---

<!-- Source: 07_ENV_EXAMPLE.md -->

# 07 — Environment, Runtime and Secrets Layout

This is a **template**, not actual credentials. NEVER commit real `.env`, cloud tokens, SMTP keys, R2 keys or database URI to Git. Use separate staging and production projects/resources.

## Web/Cloudflare Worker (public vs secret)
```dotenv
# PUBLIC: safe client values (never secret keys)
PUBLIC_SITE_URL=https://<store-domain>
PUBLIC_API_BASE_URL=https://api.<store-domain>/api/v1
PUBLIC_MEDIA_BASE_URL=https://media.<store-domain>
PUBLIC_META_PIXEL_ID=<production-or-staging-pixel-id>
PUBLIC_ENV_NAME=staging
# Framework runtime: dedicated Worker secrets/config for SSR-to-API private needs, if actually required
```

## Render Node/Express API environment
```dotenv
NODE_ENV=production
PORT=10000
APP_ORIGIN=https://<store-domain>
CORS_ALLOWED_ORIGINS=https://<store-domain>
TRUST_PROXY=1
API_PUBLIC_ORIGIN=https://api.<store-domain>
MONGODB_URI=<stored-as-render-secret>
SESSION_COOKIE_NAME=tw_session
SESSION_SECRET=<random-long-secret>
CSRF_SECRET=<random-long-secret>
GUEST_SESSION_SECRET=<random-long-secret>

R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<private-api-token-access-key>
R2_SECRET_ACCESS_KEY=<private-api-token-secret>
R2_BUCKET_PUBLIC=tapandwrap-public
R2_BUCKET_PRIVATE=tapandwrap-private
R2_PRIVATE_UPLOAD_MAX_BYTES=10485760
R2_PRESIGNED_PUT_TTL_SECONDS=300
R2_PRESIGNED_GET_TTL_SECONDS=120
R2_TEMP_UPLOAD_TTL_HOURS=48

MAIL_PROVIDER=<chosen-provider>
MAIL_API_KEY=<secret>
MAIL_FROM=<verified-order-sender-email>
META_PIXEL_ID=<pixel-id>
META_CAPI_ACCESS_TOKEN=<secret>
META_TEST_EVENT_CODE=<set-only-staging>
META_CONSENT_MODE=required

ORDER_EMAIL_REQUIRED=true
CHECKOUT_ENABLED=false
ALLOW_DEMO_CATALOG=false  # staging only; requires authenticated admin preview
PAGINATION_DEFAULT_LIMIT=20
PAGINATION_MAX_LIMIT=20
TIMEZONE=Africa/Cairo
LOG_LEVEL=info
```

## Deployment and security notes
- Use production secret manager/provider env vars; never expose `MONGODB_URI`, email or R2 secrets to React browser or Cloudflare public client bundle.
- Cloudflare Worker SSR should fetch only eligible public cached content from Render, not bypass API security or connect directly to Mongo.
- Use secure HttpOnly session cookies, CSRF on mutations and strict exact-host production CORS. Configure cookie domain/site strategy only after domain chosen and browser e2e tests.
- Private R2 bucket no public domain. `imageUrl` on public products derived only from known public object keys, never untrusted full external URLs.
- Durable outbox processing must not depend on Render instance local disk; use Mongo status leases and periodic in-process work safely. Confirm no duplicate workers act on same lease.
- Set deploy-health and readiness routes; no DB write in health live. Automated DB backup from trusted host or managed provider, never to same unrestricted project as live customer data.

## Bootstrap commands (illustrative; versions must be pinned when coding begins)
```bash
# Monorepo and package-manager setup performed during Phase 0
corepack enable
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter web build
pnpm --filter api build
```

## External docs reviewed at planning time (2026-10-08)
- Cloudflare React Router Workers SSR: https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/
- Workers request/CPU limits: https://developers.cloudflare.com/workers/platform/limits/
- R2 browser direct PUT, presigned URL restrictions: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- R2 lifecycle deletion: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Atlas Free limits/backup: https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/
- Atlas Free backups not managed: https://www.mongodb.com/docs/atlas/backup/cloud-backup/overview/


---

<!-- Source: 08_START_HERE_FOR_CODING.md -->

# Next Conversation / Next Step: START CODING

## Immediate objective
Before coding the customization module, follow `10_CUSTOMIZATION_SERVICES_LOCKED.md`; homepage/service hub offers precisely **Gift Box + Laser Engraving**, while photo personalization stays on normal product form and trays are product-level. The rest of the Phase 0 coding brief is unchanged.
Start **Phase 0** of the Tap & Wrap custom e-commerce codebase. Do not re-plan existing business scope. Read `00_README_AND_DECISIONS.md` through `07_ENV_EXAMPLE.md` first, honor `06_TESTS_AND_BUILD_PLAN.md`, and use `CHANGELOG.md` for changes.

## Suggested coding task to send next
> Start implementing Tap & Wrap from our frozen blueprint. Create the pnpm TypeScript monorepo with `apps/web` (React Router on Cloudflare Workers) and `apps/api` (Node.js + Express on Render), shared `packages/contracts` Zod validation and `packages/pricing`. Set up lint/typecheck/tests, server API envelope, health endpoints, MongoDB/Mongoose connection, error handling, secure session/auth scaffolding and environment templates. Do not implement live payments/checkout yet. Deliver the exact project files, local run instructions and verify Phase 0 tests. Keep credentials as `.env.example` placeholders. Do not create new requirements without discussing changes.

## Setup information the developer may ask for during deployment (not needed to write code)
- GitHub repository name/account and whether the project will be connected to existing repository.
- Cloudflare account/Workers/R2 project access, Render service/environment, MongoDB Atlas cluster/URI.
- Staging and production domain once registered; merchant email provider and verified sending address.
- Owner-confirmed prices, inventory, policies, imagery/hero file, reviews and business metrics before release.

## Definitions of done for Phase 0
- Monorepo works on Windows 11 PowerShell, with documented `pnpm install`, `pnpm dev`, `pnpm typecheck`, `pnpm test`, `pnpm build` paths.
- Public home/product test route produces proper server-rendered HTML on Cloudflare runtime; production Worker request/CPU costs benchmarked before concluding free tier viable.
- Express API health/live and health/ready, versioned `/api/v1`, validated JSON envelope, centralized error middleware, Mongo connection and Zod shared validators.
- Sessions and role middleware have tests; no privileged role assignable at signup; admin routes protected server-side.
- Staging secrets not in code; product checkout disabled by default; coding proceeds Phase 1 afterward without requiring new UX planning.


---

<!-- Source: 09_SOURCE_ASSETS.md -->

# 09
A video reference for Tap & Wrap laser engraving is included in `assets/references/laser-engraving-reference.mp4` (471 KiB as originally supplied). Do not assume this clip is automatically the homepage hero or that it proves which individual products/materials are supported. Confirm use rights, playback design and product eligibility. — Source Artifacts Included In Handoff ZIP

The ZIP handoff includes the implementation documents plus these **unchanged** source assets:

- `data/TapAndWrap_Website_Product_Master.xlsx` — audited website import workbook: 1,680 catalog entries and 4,139 clean relative image paths. Use this exact workbook and preserve original file. Its `Image 1 (Main)` is the image ordering authority.
- `assets/brand/tap-wrap-logo(5).webp` — exact logo supplied by user, not a recreated wordmark.
- `assets/references/image(20261008-104358).png`, `image(20261008-104818).png`, `image(20261008-104818-1).png`, `image(20261008-104827).png`, `image(20261008-105509).png`, `image(20261008-105556).png` — original website/style/shop/product UI reference screenshots supplied by user. Use collectively as design references; do not embed them as products or claim licenses for other brands' assets.

**Not included:** The complete 4,139 clean product image binaries. They already exist on the user's Windows PC at `C:\Users\youss\Downloads\tapandwrap-Photos-CLEAN` after the safe verified copy. Use the local CLEAN folder for the eventual direct-to-R2 bulk import. Do not touch originals.

Don't link actual staging credentials, owner details, and private customer proof images into the handoff ZIP.


---

<!-- Source: 10_CUSTOMIZATION_SERVICES_LOCKED.md -->

# 10 — Customization Services: FINAL LOCKED IMPLEMENTATION SPEC

**Decision:** Tap & Wrap has **two prominently featured customization services** on the public site: **Build Your Gift Box** and **Laser Engraving**. Laser engraving is an established core Tap & Wrap service (not hypothetical). **Custom trays are supported as product-level customizers**, but are **not** a third top-level customization card in v1. This is a navigation/UX distinction, **not** three separate software engines.

This specification adds to `00`–`09`; if there is any ambiguity, these precise service-specific rules take precedence. Merchant-unknown eligible inventory, designs, prices and lead times must be confirmed before publication.

## A. Four distinct customer interactions (do not conflate)

| Interaction | When shown | What it changes | Entry point | Uploaded media timing |
|---|---|---|---|---|
| **Ordinary purchase + required personalization** | A fixed product requires photo(s), a name, or text as part of normal sale | Purchaser supplies the required photo/text; doesn't redesign the product | `/products/:slug` regular purchase form | Private R2 PUT **only after Add to Cart** |
| **Build Your Gift Box** | Customer wants to compose a new arrangement | Customer chooses an eligible gift-box base + available contents/extras and optional personalization | `/customize/gift-box` | Photo/design PUT **only after Add to Cart** |
| **Laser Engraving** | Customer wants engraving on an approved Tap & Wrap product | Customer chooses approved engravable item, enters text and/or uploads permitted artwork, plus allowed style/position | `/customize/laser-engraving` | Logo/artwork PUT **only after Add to Cart** |
| **Customize This** | Specific product has `customization.enabled` and an approved template | Starts with that **exact product** and its default contents; modifies only admin-permitted selections | `/products/:slug/customize` | Files PUT **only after Add to Cart** |

A single product can require normal personalization and optionally support `Customize This`. **Engraving text can be an ordinary required personalization field when an engraved product is sold in a fixed predefined format;** the dedicated Laser Engraving builder is for selecting an item and configuring eligible engraving choices. Avoid showing confusing duplicate upload/input forms or charging twice for one engraving.

**Never** infer that a product can be engraved, or that a photograph implies mandatory uploads, solely from its catalog photo, product name or category. Admin must review/enable eligibility, requirements, prices and production constraints.

## B. Public navigation and precise React routes

- **Homepage:** retained order from `03`, with existing static developer-controlled **Customize Your Gift** section now showing/linking **two cards**: `Build Your Gift Box` and `Laser Engraving`. Neither requires CMS management. Hero secondary CTA goes to `/customize`.
- **Header:** add a compact `Customize` navigation link alongside Home/Shop/About Us/Track Order (responsive mobile menu too), or a clearly visible CTA if navbar space is tight.
- **`GET /customize` (indexable):** main hub with exactly **two hero service cards**, concise explanation, CTA, and no tray top-level card. Include organic links to eligible products/categories. Do not fake price starting-from claims.
- **`GET /customize/gift-box` (indexable landing; dynamic builder):** stepper: (1) choose eligible base box; (2) pick available box contents/extras; (3) optional or required card, text/photo; (4) review itemized price/quantities; (5) Add to Cart. Show stock-dependent choices, limits and price changes; no literal layout drag-and-drop promise.
- **`GET /customize/laser-engraving` (indexable landing; dynamic builder):** stepper: (1) choose eligible product/material/variant; (2) add supported engraving text and choose allowed font/design/placement/side; (3) optionally supply original artwork/logo if **that product** permits it; (4) confirm details and itemized total; (5) Add to Cart. Text and custom artwork must follow product-specific rules and allowed input formats. A visual mock is optional and **not a guaranteed final production proof**.
- **`GET /products/:slug/customize` (noindex or canonical to product):** preselect exactly the source product, defaults and allowed modifier groups. Render the corresponding builder for `gift_box`, `laser_engraving`, `tray` or `generic`; no free choice of replacement products unless template explicitly allows it. If not eligible return 404/redirect to original product with friendly message. Cart stores original product ID and chosen configuration.
- **`GET /products/:slug`** retains the ordinary product flow and independent required personalization fields. `Customize This` button only shown for eligible published products; optional nonbuilder engraving fields need not show it.
- **Tray customization:** accessible from a tray's existing product page, not its own featured service tile. May use `/products/:slug/customize` with `serviceKind='tray'` when configured.

On hub and service pages, images/videos are optimized and user-approved, `prefers-reduced-motion` honored, and service content can use the supplied engraving footage as a visual reference or edited promo. Do not automatically replace the under-1MB homepage hero or expose a general video editor to admin.

## C. Service selection and shared data model (augment document 01)

**`products.customization`** extend to:

```ts
{
  enabled: boolean;                 // controls product-page 'Customize This'
  serviceKind: 'gift_box' | 'laser_engraving' | 'tray' | 'generic' | null;
  templateId?: ObjectId;
  templateVersion?: number;
  serviceEntryEligible?: boolean;    // shows in dedicated service product picker
}
```

`serviceEntryEligible=true` does **not** itself publish a product. Public listing requires actual product publication, approved price, availability, and a published compatible template. Dedicated builders start from a specific approved **base product** (gift-box shell or eligible engravable product), never a price-free virtual order. Each builder's item is still recorded as a normal `productId` cart/order line with validated choices.

**`customizationTemplates.kind`** accepted enum: `gift_box | laser_engraving | tray | generic` (existing enum was missing `laser_engraving`). Reuse bounded `groups[]` for select/multi/quantity/text/upload and declarative dependency/min-max rules; never execute code from database. Product can override template permitted fields via bounded validated config. Existing `componentOptions` represent tangible extras/ingredients; font/style/placement options may be embedded inside a small engraving group in the template rather than one Mongo document per font. An engraving template may include:

```ts
engravingConfig?: {
  allowedTextLines?: number;           // set per product; no unknown automatic assumption
  maxCharsPerLine?: number;           // Unicode-aware validation, predictable rendering
  allowedFontIds?: string[];          // predefined approved fonts, not arbitrary CSS
  allowedPlacementIds?: string[];     // e.g. front/back only if approved
  artworkAllowed: boolean;
  artworkRequired?: boolean;
  allowedArtworkMimeTypes?: string[]; // actual validation plus safe formats
  instructionsMaxLength?: number;
  pricingRule: {                     // one simple supported rule per template
    model: 'included' | 'flat_fee' | 'selected_options';
    fixedFeePiastres?: number;
  };
}
```

The editing UI may show engraving price per product, placement/side or approved option; no unsupported per-character charges, auto-vectorization, real-time rendering or arbitrary customer-submitted physical items in v1. **All engraving configuration and fees must have owner approval before public checkout.**

**`carts.lines[]` and `orders.lines[]`:** save `serviceKind`, base product and variant references, template ID and version, typed normalized selections and a complete *price breakdown*. Orders embed immutable `engravingSnapshot?` (actual requested text, chosen font/placement IDs and human-readable labels, artwork upload IDs, operator instructions) or `giftBoxSnapshot?` (box base, contents, increments), not merely an unreliable free-text note. Never store customer binary media in Mongo.

**`uploadRecords.purpose`** remains `personalization` for ordinary image and engraving artwork, optionally add `engraving_artwork` as a typed subtype (`mediaRole`) to distinguish production assets. Use private keys, same Add-to-Cart-on-click authorization and order association. Admin accesses production artwork by authorized on-demand viewer/download only.

## D. Admin UX and data integrity

**Admin → Products → Edit Product** adds a `Personalization` section and a **separate** `Customization` section with fields `Enable Customize This`, `Service Kind`, `Template`, `Service Picker Eligible`; engraving-specific settings appear only when kind is Laser Engraving. The first section covers required photo/name/message inputs, with file count constraints. Admin can disable either independently.

**Admin → Customization** groups:
- **Gift Box Templates** — base-box product eligibility, available contents, min/max quantities, default contents, addition/replacement/removal rules, per-option price approvals.
- **Laser Engraving Templates** — eligible products/materials, allowed fonts/placements, text limits, artwork requirements, flat/selected pricing and production notes.
- **Product-Level Templates** — trays and other configured product customizers.
- **Components/Extras** — current component options and availability, 20 records/page; reuse existing products/components when possible.

These are admin tabs/filtered views over existing `customizationTemplates`, `componentOptions` and `products`, **not separate Mongo collections**. The homepage Customize section remains developer-controlled (no admin hero/media builder).

**Admin → Orders → Detail** clearly labels `Gift Box`, `Laser Engraving` or `Customize This`; shows an itemized snapshot with photos/artwork indicators, engraving text/font/position, gift contents, total and quantity. Private files load only when admin requests to view them; never preload receipt or customer artwork in 20-order list. Operator should be able to determine every required production action from saved data. Admin order status workflow and customer status emails remain unchanged.

## E. API contract additions (augment document 02)

- `GET /api/v1/public/products?serviceKind=gift_box|laser_engraving&limit=20&cursor=`: only published, approved, currently available and `serviceEntryEligible` products; indexed query, compact cards. A single picker fetch never returns whole catalog. Existing category sort/filter guards still apply.
- `GET /api/v1/public/customization-templates/:id` **or** embed bounded public template config in `GET /api/v1/public/products/:slug`: return only safe published/approved options, no private production/admin fields. Prefer embedding for initial product entry to save a round trip.
- `POST /api/v1/customization/quote` `{productId,variantId?,templateId,templateVersion,kind,selections,quantity}`: recompute and validate server-side, integer piastres only; returns product base, selected option deltas and final quote, restrictions and revision. Throttle, dedupe/debounce UI, no upload or Mongo write required for each quote.
- Existing `POST /api/v1/cart/prepare-add` accepts typed `serviceKind`, `templateVersion`, `personalizationValues`, `selectedOptions` and declares required media roles and allowed count; rejects missing/invalid selections. Returns addIntent for any customer artwork uploads. `POST /cart/items` attaches only verified matching owner uploads, once.
- `GET /api/v1/admin/customization-templates?kind=...&limit=20` (existing endpoint filter), and existing admin template create/update flows with engraved fields and validation. Admin product update enforces service/template compatibility and per-product approval.

## F. Pricing, checkout, media, cost and SEO rules

- Single pure server pricing engine calculates normal products, gift contents and laser options. Quote is never final authorization; **checkout recalculates everything**, applies discount/shipping, validates inventory and records approved price/version snapshot. Frontend submitted prices are ignored.
- Draft prices and `priceApproved=false` **block public purchases**, including engraving fees and gift components. Development-only placeholder prices are for authenticated staging preview, not live orders.
- Inventory: a gift box consumes its **base box** and tracked component quantities where configured; engraving consumes its **base engravable item** stock and any separately tracked material. Made-by-request items do not deduct stock, but `available=false` still blocks checkout. No cart-time reservation; checkout atomicity/idempotency required.
- Before Add to Cart, image/artwork picker uses browser-local previews and **0 R2 uploads**. After Add to Cart, direct private R2 PUT, HEAD/metadata verification, temporary cart reference, eventual permanent order association/abandoned cleanup. Do not compress print-ready originals without explicit policy. Receipt image still uploads only after Place Order. Never mix up engraving artwork and InstaPay receipt purposes.
- SEO: `/customize`, `/customize/gift-box` and `/customize/laser-engraving` are approved indexable editorial landing pages with canonical titles, metadata and readable text; dynamic signed URLs, cart, account and product-specific customization routes should never be indexed. Don't publish schema with invented prices/reviews or promise search position.
- Efficient service listings 20 at a time; live quotes debounced or button-triggered to limit Render load, bounded templates, optimized thumbnails, no polling, sensitive assets fetched by explicit admin action only.

## G. Required acceptance tests / release checks

1. `/customize` displays **exactly two** main cards: Gift Box and Laser Engraving; no top-level tray card. Both destinations work on mobile/desktop.
2. A standard photo product requires its specified uploads but does **not** show `Customize This` unless admin separately enabled it.
3. Build Gift Box: select a published base, choose components within min/max, enforce availability and calculate price in integer piastres; order snapshot remains unchanged after template edits.
4. Laser: only admin-approved eligible products appear; require permitted text/artwork; reject invalid fonts, placements, oversized content, prohibited/unsupported file format, duplicate upload IDs and forged price deltas.
5. A product eligible for engraving can be a normal personalized sale or a builder entry without duplicate required fields/fees; no accidental product redesign.
6. `Customize This` starts from exact product + default configuration and never substitutes a different base product without an explicitly allowed rule; trays work through product pages.
7. Customer artwork/photos trigger **zero uploads before Add to Cart** and are private, owner-scoped, recoverable in cart, expired after abandonment, permanent after order. Admin proof/production media only fetch on explicit View; no new tab for proof.
8. Checkout independently recalculates gift/engraving price, shipping and code; quantity and multiple-options stock safe, idempotent duplicate submissions, admin fulfilment snapshots complete.
9. Unapproved engraving/gift prices prevent public checkout; services index only approved landing pages; staging still can test draft products privately.
10. Performance: pagination max 20 in service pickers, no full catalog pulls, quoted requests debounced; image lazy-loading and cache policy checked.

## H. Explicitly deferred / not assumed

Not in v1 without owner request: third featured service card for trays, arbitrary customer-supplied objects for engraving, exact laser preview/rendering or auto-vector tracing, drag-and-drop visual gift designer, external engraving machine integration, instant machine-ready file generation, manual custom quotation workflow or extra standalone engraving SKU sale without an eligible product. These can be added later without splitting the customization engine.


---

<!-- Source: CHANGELOG.md -->

# Change log

## 2026-10-08 — v1.1 — Final customization scope lock
- Exactly **two** featured services: Build Your Gift Box and Laser Engraving (confirmed merchant core service); `/customize`, `/customize/gift-box`, `/customize/laser-engraving`.
- Separate normal product photo/text personalization, product-context `Customize This`, and product-level tray templates; no third tray featured card.
- Added shared engraving-compatible template shape, price/stock/media validation, admin configuration, paginated service selection, explicit customer/production snapshots and acceptance tests.
- Added supplied small laser engraving video as development visual reference, not an automatically published hero.
- Backwards compatible docs augmented; models/endpoints require implementation, not a Mongo migration yet (no code has been written).

## 2026-10-08 — v1.0 — Architecture frozen for coding
- Locked English-only public storefront; React Router SSR on Cloudflare Workers; Node/Express API on Render; Mongo Atlas and R2 public/private.
- Locked pricing estimates unapproved in staging; provisional 10 stock, made-to-order option; shipping 90/120 EGP; COD/full InstaPay with proof only on Place Order.
- Locked 20-item pagination, 8 admin-selected bestsellers, deferred personalized image upload on Add to Cart, 6-digit + phone guest tracking, admin-only reviews, dynamic bundles/discounts and ordered homepage sections.
- Locked secure checkout idempotency, transaction gate, private uploaded image handling, and marketing/SEO/test readiness gates.
