# Final storefront, checkout and handover refinement

Baseline: `28187cc8de94a326a980f056606bc400b42e0377`. Application source is committed on `main`; the delivery report records the final SHA and actual backend deployment result. Frontend publication is a separate owner-reviewed action, not an automatic claim of this document.

## Acceptance and root causes

| Request | Local result | Evidence / limits |
| --- | --- | --- |
| Gift Box cart details | PASS | Photo prints and sticker are definition-list rows; saved placement proof remains below. Personal-touches subtotal presentation removed; server charges and arrangement unchanged. |
| Ordinary cart details | PASS | No repeated product-name row or empty disclosure. As-is optional-photo lines retain their edit action without an empty disclosure. Real variant, personalization, photo and engraving details remain available. |
| Product page | PASS | Native accordions, direct approved shipping facts, hidden thumbnail scrollbar; obsolete price-verification copy and separate made-to-order label removed. Genuine availability enforcement unchanged. |
| Native shop controls and default ordering | PASS | Native category/availability/refinement/sort selects; legacy discovery URL maps to Featured. Owner featured choices lead a deterministic category-rank mix with per-item jitter and stable ID tie-breaks. Search/category/price/availability filters and explicit sorts remain authoritative. |
| Navbar shift | PASS | Reproduced 15px desktop / 7.5px centered-mobile movement. `html:has(.home-media-hero)` changed the root gutter from both edges to one edge. Removing that route-specific override preserves a single gutter contract. Logo coordinates match across Home/Shop at all five widths. |
| Filter grey line | PASS | Desktop sidebar had a nested vertical scrollbar from its viewport-height cap. Native controls are width-constrained; scrollbar presentation is hidden while wheel, keyboard, sticky actions and the mobile dialog remain usable. |
| Gift Box scroll jump | PASS | Focus capture plus every visual-viewport resize scheduled recentering. Removed that recurring custom recentering; explicit step navigation still scrolls deliberately and focuses with `preventScroll`. A focused sticker field plus manual scroll and viewport-resize event no longer jumps back. |
| Product-card loading | PASS | Shared `cart.pending` drove every card label. Loading is now local and generation-bound; the shared pending state still disables concurrent actions. Synchronous operation guards cover rapid clicks and stale-owner completion. Delayed, rejected and login-transition cases pass. |
| Standalone engraving UI | PASS | Horizontal aligned markers, current label below, surface before optional overall photos, compact Add Image and movement controls, one footer price, visible errors and existing engine/font/color/history/zoom/private reconstruction retained. |
| Structured checkout | PASS | Name, Egyptian phone, optional email, governorate, city/area, street, optional building details and notes. Strict versioned address validation and formatted historical-compatible address. Accepted customer snapshot immutable. |
| Integrated InstaPay proof | PASS | Existing order-bound proof component remains in checkout. Server recipient/payable balances, copy controls, native private picker, same-proof retry after lost response and recoverable status-refresh failure. Reload reconstructs from an opaque owner-bound order ID, not stored customer details. |
| New standalone payment policy | PASS, launch approval outstanding | New orders freeze `standalone-checkout-payment-v1` in the order and quote fingerprint. Collection joins checkout, while receipt/inspection/current design acceptance/work approval still gate manufacture. Historical missing-policy v1/v2 orders remain deferred. |
| Refund/custody protection | PASS | Synthetic paid-but-unsuitable item can be cancelled, flagged for refund review, refunded against an actual collection and returned without inventing merchant stock or losing custody history. |
| Reviews/footer/homepage | PASS | All 64 original quotes, names, languages and five-star values preserved. Shared truthful feedback-confirmation mark; redundant subtitle/footer text/link removed. Existing media/hero/category contracts retained with calm surface hierarchy. |
| FAQ and permanent content | PASS, legal review preserved | Updated payment, customization, photos, address/privacy and delivery explanations. Curated homepage questions link to the fuller Contact-page FAQ. Existing legal review/publication approval remains ungranted; no new statutory exclusions invented. |
| Mobile secure-connection complaint | NOT REPRODUCED / PARTLY VERIFIED | Current public redirects, IPv4 certificates/TLS 1.2/1.3 and awake API CORS pass. Samsung Chrome's exact code/network, IPv6 and authenticated Cloudflare certificate/routing settings remain unverified. No speculative DNS/TLS/hosting changes. |
| Production launch and financial providers | NOT VERIFIED / NOT AUTHORIZED | No real orders, funds, personal uploads, merchant configuration writes or launch activation. Local provider mocks do not constitute live financial acceptance. |

## Nine disposable journeys

| Journey | Result |
| --- | --- |
| A. Ordinary product to cart, checkout and unpaid COD order | PASS, connected React/API/disposable database; reload ownership retained. |
| B. Gift Box with photos/sticker to cart and accepted order | PASS, exact saved sticker placement/unit price and photo orientation retained; no personal-touches subtotal. |
| C. Standalone item surface, visual text/artwork, review and checkout | PASS, new upfront policy; payment alone cannot start work. |
| D. Catalog text engraving | PASS, surcharge/variant/cart editing and original visual-v1 compatibility. |
| E. Ready-made optional photos | PASS, as-is, multi-select, append/remove/reorder, edit, expiry, privacy and owner originals. |
| F. All five line families together | PASS for InstaPay; unsupported personalized COD is rejected and leaves the cart intact. Accepted financial groups exactly allocate the total. |
| G. InstaPay instructions, private proof, retry and review | PASS; lost accepted proof response reuses one upload, owner-bound reload recovers the same order; verification remains manual. |
| H. COD | PASS; unpaid at order creation and collection forbidden before the applicable real dispatch/handoff. |
| I. Historical contracts | PASS; legacy standalone v1/v2, visual product v1/text v2, photo v1/v2 and Gift Box snapshots remain readable under their original contracts. |

## Focused verification

All backend/integration databases are fresh disposable loopback replica sets. External file providers use isolated memory storage. Browser fixtures scrub inherited configuration and block unapproved service traffic. No merchant database or private production file is used.

- Backend affected regression: **199 passed**, covering checkout foundation, standalone engraving v1/v2, catalog API, product engraving/photos, commerce orders, Batch 3 commerce and Gift Box checkout/order presentation. The final catalog-default/filter correction separately passed its **19** affected cases.
- Isolated browser coverage: **83 distinct cases passed** across shop, commerce/recovery, final handover, shared visual editor and Stage A preservation runs. Counts exclude repeated verification of the same cases.
- Connected browser coverage: **18 distinct cases passed** across final mixed/payment journeys, product engraving, optional photos, owner design review, enabled checkout and Gift Box original-photo reconstruction.
- Final closed-order payment-instructions check: **31 affected cases passed**; failed-delivery/closed orders do not display a new transfer instruction.
- SEO safeguard suite: **84 passed**. Worker/publication implementation unchanged.
- Frontend lint: no errors or warnings. Frontend production build: passed in default noindex mode. Server syntax: **304 JavaScript files passed**.
- `git diff --check` / staged equivalent: reviewed before commit. Original unrelated-file audit: **205 files, zero changes**.

Commands, run in their own application directories:

```text
server: npm.cmd test -- test/checkout-foundation.test.js test/engraving.test.js test/engraving-visual.test.js test/catalog-api.test.js test/product-engraving.test.js test/product-photos.test.js test/commerce-orders.test.js test/batch3-commerce.test.js test/gift-box-checkout.test.js test/gift-box-order-presentation.test.js
server: npm.cmd run check
client: npm.cmd test -- batch2-shop.spec.js batch3-commerce.spec.js commerce.spec.js final-handover.spec.js
client: npm.cmd test -- visual-engraving.spec.js
client: npm.cmd test -- stage-a.spec.js
client: npm.cmd run test:contracts -- --gift-box-shopping final-handover-engraving-contracts.spec.js
client: npm.cmd run test:contracts -- product-engraving-contracts.spec.js
client: npm.cmd run test:contracts -- --enabled-checkout product-photos-contracts.spec.js
client: npm.cmd run test:contracts -- engraving-visual-review-contracts.spec.js
client: npm.cmd run test:contracts -- --enabled-checkout enabled-checkout.spec.js -g "guest COD|real personalization"
client: npm.cmd run test:contracts -- --gift-box-shopping gift-box-shopping-contracts.spec.js -g "native Gift|three photo"
client: npm.cmd run lint
client: npm.cmd run build
client: npm.cmd run test:seo
```

Intermediate failures were corrected and affected cases rerun: old custom-select/checkout confirmation selectors, the first Mongo window-ranking expression, the missing payment-policy projection on private proof authorization, and the connected-test allowlist for the new fixture. Two initial npm invocations from the repository root did not run because there is no root package; successful results above come from the correct application directories. An unsupported generic GitHub workflow-read endpoint was rejected; the publication lock was read through the supported repository-file connector instead. No authentication workaround was used.

Screenshots and redacted execution logs are deliberately ignored under `local-data/final-handover/` and task-specific `local-data/final-*.log`. Actual captures cover **320, 390, 768, 1024 and 1440px**, including Home, Shop, product, cart, checkout, InstaPay, sticker and all standalone steps. Mobile/desktop screenshots were personally inspected. Public production baseline captures are read-only; local customer journeys use synthetic media. Lazy production imagery in a full-page baseline capture is not proof of a media outage.

## Contracts and preservation

`delivery-address-v2` is additive to historical plain addresses. The new immutable engraving payment-policy identity is independent of unchanged visual-design specifications and line snapshots. No database migration or historical data rewrite is performed. Existing financial ledgers, custody actions, private upload ownership/retention and launch gates remain authoritative.

No Gift Box components/options/prices/arrangement geometry, standalone visual engine geometry, product surcharge setting, ready-made-photo contracts, review records, product prices/stock, approved media, original logo, accepted production orders, secrets or SEO safeguards were changed. The editor-control layout changes do not alter saved geometry.

## Release boundary

Commit/push and exact Render source verification are recorded in the delivery report. **Do not call the new frontend released until the owner-reviewed tokenless renewal and exact Cloudflare source/publication checks succeed.** No manual renewal was dispatched in this coding pass. The existing schedule may run independently; observe its actual result.

At the pre-release read, `seo-publication/lock.json` referenced baseline `28187cc8de94a326a980f056606bc400b42e0377`, publication `81a2418fdbf2424e0717f34a3f47115826d157852fa2a25355e05c0f413b48fa`, expiring `2026-11-12T19:44:47.233Z`. This is baseline evidence, not publication of the new changes.

After owner review, follow the exact **Post-Codex publication** procedure in [FINAL_OWNER_HANDOVER.md](FINAL_OWNER_HANDOVER.md). Required approvals remain the new engraving collection policy, final commercial/legal wording, live recipients, launch authorization and any paid-hosting decision.
