# Batch 6 — fixed English pages and owner handoff

Local implementation only. No production/staging database access, external provider operations, messages, payments, environment changes, commits, pushes, deployment or migration. Previous local batches remain uncommitted. The standalone original comprehensive audit report was not available locally; the six preceding batch reports, phase/release contracts, current code and the supplied business requirements were reviewed instead.

## Completed public pages

The existing `/about`, `/contact`, `/shipping-policy`, `/refund-policy`, `/privacy-policy` and `/terms-of-service` routes now render complete code-managed English content. They do not fetch SiteContent, depend on a database document, or render legacy database text. Footer contacts and policy-sensitive homepage FAQs use the same source. React renders text; no customer/database HTML is injected.

`shared/storefront-content.mjs` owns the copy, public contacts, FAQ and legacy read DTO. About and Contact use the existing white-led palette, original logo, Cormorant/DM Sans typography, editorial headings, section navigation and support actions. Policies use readable paragraphs and restrained dividers. Six unique titles/descriptions, canonical path handling, semantic headings and existing footer routes are preserved. Section offsets use the measured `--site-header-height`.

The copy distinguishes initial WhatsApp contact within 12 hours from final quotation, delivery or payment. Shipping remains Pending Confirmation, never inferred free; merchandise, add-ons and shipping remain separate. COD/InstaPay are the only methods. Website InstaPay is order-first with secure order-bound proof; bespoke requests use WhatsApp acceptance/evidence and independent reconciliation. Product personalization retains the approved product/variant price. Bespoke requests need neither an account nor upfront payment.

Returns preserve ordinary-goods rights, applicable exceptions for conforming customer-specification goods, and remedies for defective, incorrect or nonconforming goods. Starting production is not a blanket refund exclusion. No invented merchant reporting deadline, retention period, delivery region, address, registration or business history was added.

## Legal review and publication gate

These are review-ready English policies, **not legally approved publication**. Each legal page explicitly states the owner/Egyptian legal review requirement. `contentPublicationApproved` remains false in source. The React metadata and prerendered six pages stay noindex even if a legacy SiteContent record was approved or an external content export claims approval. Existing indexing flags, reviewed SEO publication IDs, expiry checks, media attestations and Cloudflare routing remain in force; this batch authorizes none of them.

Legal-reference inputs checked on 16 October 2026:

- [Egyptian Consumer Protection Agency returns guidance](https://cpa.gov.eg/ar-eg/%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA-%D8%A7%D8%B9%D9%84%D8%A7%D9%85%D9%8A%D8%A9/ArtMID/654/ArticleID/6790): ordinary-goods 14-day rights subject to exceptions, defective-goods 30-day protection, and the conforming customer-specification exception.
- [CPA legislation library](https://cpa.gov.eg/en-us/Legislations), including its Law No. 181 of 2018 text. Articles 5–6 raise Arabic-language and supplier-identification disclosure requirements. English-only implementation is the owner's requested scope, **not a finding of legal compliance**.
- [Official Egyptian Economic Courts law text](https://elec.eecourts.gov.eg/assets/laws/16%20-%20%D9%82%D8%A7%D9%86%D9%88%D9%86%20%D8%AD%D9%85%D8%A7%D9%8A%D8%A9%20%D8%A7%D9%84%D9%85%D8%B3%D8%AA%D9%87%D9%84%D9%83.pdf) as an additional primary reference for Law No. 181 of 2018.

### Required owner and professional sign-off before publication

1. Legal operator/seller identity, seller address, registration and tax/invoice disclosures. No fictitious identity/address has been substituted.
2. Confirm public WhatsApp **+201508216472**, email **tap.wrap22@gmail.com**, Instagram **https://www.instagram.com/tapandwrap/** and website **https://tapandwrap.net**. These match existing repository contact values; operational ownership/reachability was not tested. Confirm the separate InstaPay destination **01060673073** through an authorized payment-readiness procedure.
3. Egyptian legal review of English-only disclosures, required Arabic information, distance-contract disclosures and cancellation rights, all-inclusive price/tax information, and the merchandise-first/separately agreed delivery process. A disclaimer does not cure missing mandatory disclosures.
4. Sign off returns/cancellation/refund wording and operational handling, including statutory deadlines and method of refunds. Do not shorten rights or treat all made-by-request goods as automatically excluded.
5. Approve privacy/operator details, lawful-processing and provider/transfer disclosures, privacy-request verification, retention schedule and dispute/financial retention exceptions. No exact deletion period is promised or implemented here.
6. Confirm support responsibilities, staffing and the 12-hour initial-contact commitment, plus escalation for delayed responses, delivery issues and complaints.
7. Record approval in a reviewed code change only after missing disclosures are supplied. Then separately follow the authorized SEO publication procedure; changing one source marker alone is not release authorization.

## Genuine read-only architecture

- Admin `/admin/website/content` is a read-only pages/owner-guide directory; no policy/contact/FAQ text inputs or approval/save controls remain.
- Authenticated admin GET `/admin/website/content` returns only a source-generated directory/DTO with `editable: false` and `managedBy: source`.
- PATCH/PUT/POST/DELETE (and other non-GET methods) at that legacy content endpoint are rejected with HTTP 403 `FIXED_CONTENT_READ_ONLY`, after the existing authentication, admin, database readiness and CSRF/Origin middleware. The service function itself also rejects writes.
- Public `/public/site-content` returns fixed page/contact/FAQ values while retaining separately approved review handling. The six pages/footer/FAQ do not need this endpoint to succeed.
- Historical SiteContent documents and the model/schema remain preserved; no database migration, document deletion or backfill is needed. Obsolete content-write validation and the frontend write helper were removed.
- SEO generation ignores legacy supplied content bodies. The approved exporter no longer reads SiteContent and cannot use historical database approval to publish these pages. Product export restrictions are unchanged; no export was performed.
- Homepage selections, categories, products, images, reviews, components, quotations and order administration retain their existing write APIs, revisions and safeguards.

All current FAQ questions concern ordering, shipping, personalization or cancellation, so this batch makes that FAQ code-managed with the policies. It does not remove unrelated merchant-managed content or delete old FAQs.

## Admin usability and daily handoff

“Requires attention” is the first store navigation item. “Pages & owner guide” gives direct links and a plain-language daily sequence for product/display/price/inventory review, photographs, component pricing, custom quotations, acceptance, order reconciliation, delivery, refunds and email diagnostics. Custom-request detail fields and common statuses/payment methods have human-readable labels. Payment settings link to order delivery operations instead of retired fixed-rate approval and explain merchandise-only initial transfers.

Order financial actions now open the existing shared native dialog for review before recording. It shows the operation/order and entered amount/method where applicable. Keep editing, Escape, focus containment/restoration and explicit confirmation are supported. The server remains authoritative; the dialog grants no approval. Ambiguous retries continue to use the frozen original operation and idempotency key rather than another payment.

Batch 5's runtime is unchanged: original submission time; immediate owner event; one eligible 9-hour reminder if uncontacted; dashboard-only overdue at 12 hours; Mark as Contacted suppresses undispatched reminder/active initial-contact overdue. Opening WhatsApp, recording quote sharing, customer acceptance and payment verification remain distinct.

Attention performance review: existing aggregation projects an allowlist, excludes closed work, returns at most 20 rows with server pagination and uses a 3-second database deadline. A 41-order disposable fixture verifies three nonoverlapping pages (20/20/1) and no private history/checkout keys. This does not establish production-scale latency: the union/lookup/filter/sort/count still processes matching active work. Representative-volume query-plan/load validation belongs to release readiness; no speculative index/schema rewrite was made.

## Verification

Only scrubbed local test runners, disposable loopback MongoDB replica sets and mocked browser/provider fixtures were used. No developer `.env` values or existing database were loaded.

- Focused backend: 110 tests passed across website admin, SEO exporter, checkout foundation, service requests, product personalization, transactional email and operational readiness. After adding the workload case, the operational file passed all 17 tests; unique backend coverage is 111 tests. Final website/operational rerun also checks the removed obsolete write schema.
- SEO: all 65 tests passed, including authoritative alias redirects, draft compatibility, queries/HEAD/expiry protections, category routing, default noindex, approved export/media and publication safeguards. Six fixed pages ignore database text and stay noindex.
- Browser: **80 distinct cases pass after corrected assertions were rerun**: the initial 30-case selection finished 25 passed/5 failed on obsolete labels or selector scope; all five failed cases then passed in a 7-case targeted recheck (including two responsive page/guide regressions). A separate 50-case media/admin/personalization/service/attention selection passed completely. Includes six pages at 320/390/768/1440, all existing admin routes at eight widths from 320 to 1920, failed/missing SiteContent, source contacts/footer/FAQ, no editing controls, navigation/logo, native financial confirmation/cancel/focus, COD/InstaPay, media, personalization, quotations and attention. The existing all-admin-layout file took 5.3 minutes; no full browser suite was run.
- Targeted ESLint passed. Backend syntax checks cover 165 JavaScript files; exporter syntax checked separately. Isolated Vite production build passed under scrubbed environment with Meta/indexing off, writing only ignored `client/test-results/batch6-build`. SEO generation was exercised by unit tests, not by an unauthorized data export or publication.
- Page and mobile owner-guide screenshots were visually inspected. Screenshots/traces and test logs are ignored local artifacts under `client/test-results/` and `server/.cache/`.

Initial failures were resolved: a preservation assertion compared JSON property order; an added fixture used a nonexistent notes field; browser assertions used old Contact/payment labels or an unscoped duplicate link. Wrong-folder ESLint and a nonexistent selected test filename were corrected. None required relaxing security, rate limits, business gates or test timeouts. Git's line-ending notices are not test failures.

## Exact Batch 6 file manifest

This list describes this task's changes relative to its preflight hashes, not the full preexisting uncommitted tree.

```text
shared/storefront-content.mjs
client/src/pages/StaticPage.jsx
client/src/information-pages.css
client/src/components/Footer.jsx
client/src/components/PublicContent.jsx
client/src/content/final-faq.js
client/src/pages/HomePage.jsx
client/src/pages/AdminWebsitePage.jsx
client/src/pages/AdminRequestsPage.jsx
client/src/pages/AdminCommercePage.jsx
client/src/pages/CheckoutPage.jsx
client/src/pages/ServiceRequestPage.jsx
client/src/commerce/OrderFinancials.jsx
client/src/admin/AdminLayout.jsx
client/src/admin.css
client/src/services/website.js
client/src/seo/metadata.js
client/scripts/seo/generator.js
client/scripts/seo/generator.test.js
server/src/website/service.js
server/src/website/routes.js
server/src/email/templates.js
server/scripts/export-seo-catalog.js
server/test/website-admin.test.js
server/test/seo-export.test.js
server/test/operational-readiness.test.js
client/e2e/information-pages.spec.js
client/e2e/website-public.spec.js
client/e2e/website-admin.spec.js
client/e2e/batch2-admin.spec.js
client/e2e/checkout-foundation.spec.js
client/e2e/service-requests.spec.js
docs/BATCH_6_PAGES_AND_HANDOFF.md
```

Prior batch reports and selected Cloudflare worker/compatibility/export-command/worker-test files match preflight SHA-256 hashes. The SEO generator/test changes are limited to fixed-content rendering; the existing product-compatibility implementation remains and its focused tests pass. Batch 5 owner-notifications, operations, owner settings and attention page match their preflight hashes. Other earlier changes were not reset, discarded or deployed.

## Release blockers and next phase

Complete the sign-off checklist above, then the separately authorized production-readiness review: merchant product/component approvals and accurate stock/prices; schema/index compatibility and existing-order reconciliation; R2/provider/CORS/readiness and restricted synthetic tests; sender authorization and operations recipient; queue activation cutoff and ambiguity handling; scheduler/monitoring approval; retention decisions; checkout-enabled acceptance tests; current reviewed alias mapping refresh; security/performance/accessibility review; recovery plan; finally explicit release authorization. Enable flags only after their dependencies pass. Indexing and marketing remain separately gated after legal/privacy/consent and SEO publication review.

No known Batch 6 functional blocker is being hidden behind a production claim. **Batch 6 is locally ready for owner/code review.** All focused checks above pass after the documented corrections. Legal/business publication readiness and provider/production verification remain outstanding; this is not authorization to launch. No known unresolved Batch 6 functional test failure remains.
