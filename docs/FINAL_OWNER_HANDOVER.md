# Tap & Wrap owner handover

Prepared 11 November 2026. This guide describes the implemented workflows. It is not permission to enable checkout, send money, publish unreviewed legal terms or change production records.

## Before accepting online orders

The owner must approve the new standalone engraving collection policy, the final shipping/refund wording, the receiving account, genuine product availability and the operational handover process. Egyptian legal review remains outstanding where already indicated on the permanent policies. Keep both `CHECKOUT_ENABLED` and `COMMERCE_LAUNCH_AUTHORIZED` off until a separate launch decision. This refinement does not change either production setting.

New standalone engraving orders include the approved service price at checkout. Physical receipt, suitability inspection and the customer's acceptance of the final design remain mandatory before engraving work. Historical engraving orders retain their original deferred-payment terms. Do not request a second payment simply because an old order has a different workflow.

COD is unpaid until actual cash collection is recorded. InstaPay proof is evidence awaiting reconciliation, never automatic payment confirmation. Unknown delivery or return charges remain separate and require quotation and acceptance.

## Manage the storefront

Use the existing owner dashboard and load the latest record before editing. A conflict means someone changed it since it was opened: preserve your draft, reload and review rather than overwrite it.

- Products: edit descriptions, gallery order and the exact product/variant price. A positive approved price plus genuine stock or approved made-to-order availability and valid purchasing setup exposes purchase actions automatically. No second launch checkbox or deployment is needed for an individual price edit. Unpriced products remain WhatsApp enquiries.
- Stock: enter only confirmed merchant stock. Imported provisional quantities are not real inventory. Made-to-order must reflect an actual ordering arrangement. Never restore withdrawn `B6-BOX-050`.
- Categories: preserve the product's actual main/subcategory relationship. Hidden or inactive categories affect publication. Do not bulk reimport the historical spreadsheet or image ZIP.
- Product imagery: use the existing media administration; preserve selected gallery order. Public catalog files and private customer uploads are separate.
- Featured products: use the existing featured/best-seller controls. Default shop ordering puts approved featured choices first, then mixes categories deterministically. Search, category pages and explicit price/name sorting keep their own ordering.
- Website media: use the existing homepage/category configuration. Preserve approved hero media, responsive proportions and the original logo. No new designer images were invented in this refinement.

## Manage customization

Gift Box components, quantities, arrangement geometry and pricing remain in the existing Gift Box settings. Sticker and photo-print options retain their configured prices. For Boxes 1–11 the sticker proof saves the selected side and proportional placement; Box 12 retains its earlier proof. The cart lists photo-print count and sticker text, lettering, color and side. The line total includes all approved personalization charges even though a separate personal-touches subtotal is no longer shown.

Standalone engraving types and service prices remain independent of catalog engraving. The customer uploads their own exact surface, designs text or original-color artwork, reviews the composite and adds the service to the cart. Overall item photographs are optional and separate. Approved fonts retain their saved identities. Position suggestions are not needed in the customer visual editor; existing admin placement records and historical orders remain available.

Catalog-product engraving is text, approved English/Arabic lettering and approved appearance color. Configure only genuinely suitable products through their existing engraving configuration. A catalog background is not required for the text-only mode. The global surcharge remains the existing dashboard setting, initially EGP 100 per engraved item; changing it affects new quotations and safely reprices carts, not accepted order snapshots. Historical visual product designs remain available through their legacy edit path.

Ready-made products can accept optional personal photos using the existing **Accept customer photos** capability. Customers can order as is or select an ordered collection of images. No individual physical positions and no automatic photo surcharge are introduced. Separate mandatory product fields remain mandatory. Configure only products whose real offering supports customer photos.

## Review and fulfil orders

New enquiries/custom requests are not accepted paid orders. Use their own reference and quotation process. Make initial WhatsApp contact within 12 hours; this is not a delivery promise or a final quotation deadline.

For an accepted order, open the owner order detail and review:

1. Customer name, normalized Egyptian phone, optional email and complete delivery address. New addresses retain governorate, city/area, street, optional building/floor/apartment and notes; historical plain addresses remain readable.
2. Exact items, quantities, selected variants, immutable accepted prices and separate delivery/return charges.
3. Gift Box arrangement, component quantities, photo prints and saved sticker proof.
4. Standalone surface/design and optional overall item photographs; catalog engraving text/font/color; ready-made personal-photo collection in its submitted order.
5. Payment obligations and actual collected/refunded balances before taking a financial action.

Private photographs, artwork and payment screenshots load through explicit authorized View actions in the owner dashboard. Use the original-file download actions when preparing work; never copy private storage keys or share private URLs. A missing or expired cart upload requires replacement, not a retention extension. Historical accepted order originals retain the existing authorized retrieval path.

For InstaPay, the customer creates one order first, sees that order's approved recipient and payable amount in checkout, and submits a screenshot there. They can return through the secure order page. If an upload/request fails, retry or recover the same accepted order. Do not tell them to create another order or transfer again merely to replace evidence. Check the actual receiving account before recording collection. Reject unclear evidence with an explanation, and allow replacement against the same obligation.

Record COD collection only after the applicable actual delivery or handoff. A COD commitment is not collected cash. Some personalized purchases require an owner-authorized quotation for COD; do not bypass that restriction.

Delivery starts as **Confirmed separately**, not free or zero. Record the exact quotation, available method and genuine customer acceptance. Changes require a new agreement. Do not invent fees, delivery dates or national coverage.

For customer-owned engraving items, separately record receipt and condition, inspection, any clarification and the final proposal. Record actual customer acceptance of the current proposal. The final work-approval action remains gated on those records. Payment alone cannot start engraving. After work, record completion and the real return/handoff. Customer property never becomes merchant stock.

If an item is unsuitable, do not engrave it. Record the reason, discuss return and the applicable cancellation/refund or agreed alternative. Preserve custody and financial history. Cancellation is not a refund confirmation. Use the existing reconciled refund actions against actual collections; never silently edit historical totals. Personalized items retain applicable statutory remedies.

## Technical locations and recovery

- Frontend: Cloudflare **Worker Static Assets**, Worker `tapandwrap-frontend`, custom storefront domain `tapandwrap.net`. It is not a Pages-only deployment.
- Source: GitHub `tap-and-wrap/tap-and-wrap`, reviewed application releases on `main`.
- Publication: GitHub **Production SEO renewal**, dedicated `seo-publication` branch, followed by Cloudflare native Git Build. The publication lock binds reviewed main source, approved public catalog/media, publication ID and expiry.
- API: Render `tapandwrap-api`, `api.tapandwrap.net`, watching `main`.
- Database: MongoDB Atlas with exact-target/readiness guards.
- Files: Cloudflare R2; private customer uploads use owner-bound authorization and retention, separate from public catalog media.

Render Free can sleep. Check `https://api.tapandwrap.net/health/ready`, wait for wake-up and retry before diagnosing an outage. A storefront TLS handshake failure is a separate issue; Render sleep does not prove a certificate defect. Do not upgrade hosting without owner approval. Before the actual business handover, review whether the chosen hosting level supports the agreed operating needs.

When a deployment fails, inspect the exact failed commit and build logs with redaction. Do not bypass the publication seal, freshness checks, schema target guards or checkout authorization. Keep the last reviewed working release available. A green GitHub job alone does not prove a live frontend release.

Backups and restores need a separately authorized operator: maintain approved Atlas backups and an appropriate R2 retention/recovery plan, protect access, and practise a restore into a dedicated isolated target. No backup plan or provider retention was changed or independently verified in this coding pass. Never test restoration over live customer data.

Operational configuration names only (values belong in the approved hosting settings):

- API/session/topology: `NODE_ENV`, `PORT`, `MONGODB_URI`, `DATABASE_TARGET`, `PRODUCTION_DATABASE_AUTHORIZED`, `PRODUCTION_DATABASE_HOST`, `AUTH_DEPLOYMENT_MODE`, `AUTH_TOPOLOGY_APPROVED`, `API_PUBLIC_ORIGIN`, `AUTH_SITE_DOMAIN`, `TRUST_PROXY_CIDRS`, `CLIENT_ORIGIN`, `SESSION_SECRET`.
- Commerce: `CHECKOUT_ENABLED`, `COMMERCE_LAUNCH_AUTHORIZED`, `CUSTOM_REQUESTS_ENABLED`, `CUSTOM_REQUESTS_LAUNCH_AUTHORIZED`, `ENGRAVING_ENABLED`, `ENGRAVING_CONFIGURATION_ENABLED`, `ENGRAVING_LAUNCH_AUTHORIZED`.
- Private files: `STORAGE_ENABLED`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- Public catalog media: `CATALOG_MEDIA_BASE_URL` and the existing catalog R2 settings. Do not interchange public and private buckets.
- Email: `NOTIFICATIONS_ENABLED`, `EMAIL_PROVIDER`, `EMAIL_ENABLED`, `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME`, `NOTIFICATION_SAFE_RECIPIENTS`, `NOTIFICATION_LIVE_DELIVERY_ENABLED`.
- Frontend: `VITE_API_BASE_URL`, `VITE_SITE_URL`, `VITE_META_ENABLED`, `VITE_SEO_INDEXING_ENABLED`.
- Publication/runtime: `SEO_INDEXING_ENABLED`, `SEO_EXPECTED_PUBLICATION_ID`, `SEO_WITHDRAWN_PATHS` and the existing browser CSP origin settings. Preserve production runtime values through the documented sealed workflow.

No password, token, connection string or customer file belongs in handover documents or screenshots.

## Post-Codex publication, after owner review

This coding pass must not manually dispatch SEO renewal. Once the owner has reviewed the result:

1. Confirm the reported reviewed `main` SHA is pushed and Render has deployed that exact SHA with readiness passing. Check that both global checkout flags are still off.
2. Open [Production SEO renewal](https://github.com/tap-and-wrap/tap-and-wrap/actions/workflows/seo-renewal.yml), choose **Run workflow**, select **main**, and run the existing workflow with its existing defaults. Do not substitute an ad-hoc Vite build or overwrite runtime variables.
3. Wait for the workflow's sealed publication and Cloudflare's native build of `seo-publication`. Verify its lock references the reviewed main SHA and record the actual publication ID, expiry and Cloudflare Worker version.
4. Independently verify the live bootstrap/source identity, canonical HTTPS routing, robots, sitemap index and child sitemap, representative product HTML/schema and genuine withdrawn-product 404/noindex. Expired or mismatched publication data must continue to fail closed.
5. Perform read-only UI checks. No real orders, payments or personal-file uploads are needed for this verification. Only then call the frontend release verified.

A scheduled six-hour renewal may run independently. Observe and report its actual result; do not assume that pushing `main` alone published the frontend. See [the complete publication runbook](SEO_TOKENLESS_RENEWAL.md).

## Secure-connection investigation

The owner reported Chrome on a Samsung phone after typing `tapandwrap.net`; the exact error code, scheme and network are unknown. Public read-only tests in this pass found working HTTP-to-HTTPS and www-to-apex redirects preserving path/query, valid hostname certificates and TLS 1.2/1.3 over IPv4 for storefront/www/API, and working awake-API CORS. IPv6/device/network reproduction and authenticated Cloudflare zone/certificate settings remain unverified. No blind DNS, TLS, HSTS or HTTP/3 changes were made.

If it happens again, record the full address, exact Chrome error code, device time and whether it occurred on Wi-Fi or cellular. Compare the same address on the other network. An authorized Cloudflare operator should inspect actual Worker Custom Domains/Routes, active certificate coverage, DCV and DNS/DNSSEC/CAA status before making a targeted correction. Do not infer a dashboard setting from a browser paraphrase.

References: [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [routing](https://developers.cloudflare.com/workers/configuration/routing/), [SSL protocol errors](https://developers.cloudflare.com/ssl/troubleshooting/err-ssl-protocol-error/), [version/cipher mismatch](https://developers.cloudflare.com/ssl/troubleshooting/version-cipher-mismatch/), [certificate validation](https://developers.cloudflare.com/ssl/edge-certificates/changing-dcv-method/troubleshooting/).
