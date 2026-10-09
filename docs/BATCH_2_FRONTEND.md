# Batch 2 — storefront, administration and frontend reliability

This report supersedes earlier centered-logo, desktop hamburger-only, standalone shop-subcategory and price-slider conventions. The JavaScript `client/` and `server/` architecture and original logo are preserved. Batch 3 is not part of this work.

## Implemented behavior and root causes

| Request / finding | Root cause | Result |
| --- | --- | --- |
| Navigation / F51 | Equal-column centered header, desktop navigation hidden in a drawer, static account destination and role-independent order links | Original logo at the left on desktop; horizontal navigation; search, verified-role account destination and real cart at the right. Mobile native drawer uses the same role rules. Contact remains in the footer. Checking/error sessions do not expose guessed account destinations. |
| Sticky navigation | Header was not consistently coordinated with filters, summaries and fixed controls | Announcement scrolls away; measured sticky header height supplies layout offsets. Mobile drawer closes when switching to desktop. |
| Announcement | A static message | Two identical CSS-transform groups provide a continuous loop; screen readers encounter the approved message once. Hover/focus and explicit touch/keyboard pause controls stop motion; reduced motion shows a static message. |
| Filters / F19 | Immediate numeric conversion destroyed intermediate input; range slider and independent subcategory state; inconsistent clear handlers | Exactly Category, Availability and Price accordion groups. Raw EGP strings survive editing; Apply validates and converts with integer arithmetic. Blank/zero, invalid/reversed bounds, URL/history, locked category context and Clear All are handled explicitly. Search/sort survive clearing. |
| Hidden category refinements | Legacy `subcategory` URL parameters could remain active without a visible control | Shop links normalize to one visible category. Category landing pages discard hidden legacy refinements; canonical child-category pages preserve their real parent/child API relationship. Models/admin/SEO hierarchy remain intact. |
| Unnecessary price queries | Product listing always aggregated slider bounds | A validated, backward-compatible `includePriceRange=false` flag skips that aggregation. Current public/admin clients opt out; twenty-item limits, accurate totals, server filtering and default compatibility remain. |
| Hero | Limited developer video configuration and playback/failure handling | Exact headline preserved. Approved local desktop/mobile media, posters, reserved aspect ratio, muted inline playback, explicit pause/play, reduced motion and blocked-media fallback. No footage has been invented or added. |
| Trust figures | String-only statistics lacked structured approval/evidence and animation contracts | Exactly four structured owner claims, gated on all four approvals and evidence. Viewport-entry animation runs once using IntersectionObserver/rAF DOM updates; final screen-reader values and stable two/four-column layouts. Proposed claims remain unpublished. |
| Footer | Obsolete Explore column and text contact links | Brand/original logo, five Information links, and approved Instagram/WhatsApp/email icon destinations. Missing approved destinations remain honest placeholders. |
| Buttons / F08 | A more-specific anchor color rule overrode secondary-button colors | Removed the conflicting cascade rule; anchor/button primary, secondary, destructive, text and disabled states share readable semantics. Functional control borders use a darker token while decorative brand borders remain unchanged. |
| Admin shells / F20 | Route families used different wrappers, widths, padding and nested page shells | Shared AdminLayout outer gutters, title/actions, grouped navigation, state geometry and sign-out. Deliberately narrower inner forms, contained tables and embedded product previews. |
| Mobile admin overflow | Absolutely positioned screen-reader edit labels inherited the body as their containing block and escaped narrow table scrollers | Table scrollers establish a relative containing block. Labels remain accessible and tables scroll internally. The diagnostic at 320px changed document width from 768px to 290px by correcting that containing block alone; final eight-width route checks verify the fix without hiding overflow. |
| Mutation invalidation / F21 | Mutations refreshed one local list instead of actual dependent query families | Central dependency invalidation refreshes affected product/category detail, counts, homepage, reviews, bundles, customization and current-owner checkout queries without clearing safe public/session caches. |
| Promotion dates / F22 | Device-local `datetime-local` conversion shifted schedules away from Cairo | Explicit Africa/Cairo wall-time/UTC helpers; raw inputs; nonexistent DST minutes rejected and repeated minutes require an explicit occurrence. |
| Order administration / F32 | Customer delivery data was not presented clearly and generic selects offered transitions forbidden by the server | Authorized contact/address/notes; state choices mirror the real server transition function, including COD and verified InstaPay prerequisites. Existing revisions, internal-note separation and proof privacy are preserved. |
| Recovery/focus / F45 | No render boundary or coordinated route-focus/scroll lifecycle | Sanitized root/page boundaries, skip link, route heading focus, query-only input preservation and bounded browser-history scroll restoration. |
| Settling route focus / F45 | Focus completion was reported even for a hidden heading, and observation stopped after the first success although authorization/loading could replace that heading | Visible, ready headings require confirmed actual focus. A bounded eight-second observer follows replacement and style/visibility readiness, stops on user key/pointer/control-focus interaction, and never repeatedly focuses the same heading. Deterministic hidden/replaced-heading tests failed before the correction and pass afterward; typed drafts retain focus. |
| Sticky-header history restoration | Global root scroll-padding caused the browser to scroll an outgoing navigation link before the destination committed, recording the wrong history position | Offsets apply to content headings/anchors rather than the entire document. Deferred restoration waits for lazy content, cancels on user interaction, and avoids recording a clamped short page. Busy/loading titles are skipped until the real page is ready. |
| Form errors / F46 | Summary messages were not reliably associated with individual inputs; broad `:invalid` selectors could focus a fieldset | Named contract paths, linked field errors/summaries and first invalid input/select/textarea focus in customer and admin forms. Draft values remain intact. |
| Array-field errors / F46 | Category restrictions and allowed-action arrays had no unique aggregate/indexed validation targets; bundle description lacked a persisted-field DOM name | Explicit accessible group boundaries and nearest indexed-group fallback associate real array error paths. Main/child selectors have distinct local names; bundle description is named. Controlled payloads, revisions and unsaved selections remain unchanged. |
| Category restriction removal | Removing an earlier row shifted selected IDs but retained index-keyed parent context, allowing the next child picker to use the removed category's slug/search | Parent contexts are reindexed when removing a row. Child pickers reset local search/page when their parent changes. The regression selects two different roots, removes the first and saves only the intended remaining child ID. |
| Modals / F47 | Separate dialog implementations had inconsistent backdrop, focus and scroll lifecycles | Shared native-modal hook, Escape/Tab containment, genuine backdrop dismissal, opener restoration and stacked scroll locks. Dialog padding and drags do not dismiss forms. |
| Boundaries / F48 | Pale decorative borders also served as functional control outlines | Scoped higher-contrast control borders, visible keyboard focus and comfortable action targets; original palette and decorative surfaces preserved. |
| Product-card controls | Card actions had 40–42px heights and disabled opacity weakened readability | Buttons and option links use at least 44px targets, higher-contrast functional borders and opaque readable sold-out states on desktop and mobile. |
| Upload/error/overlay UX / F49 | Incomplete retry feedback, mutable controls during submission and overlapping fixed feedback | Honest upload-stage feedback, local previews/removal, deliberate retries retaining selections, busy-state control freezing, blocked-image fallback and dismissible cart feedback coordinated with dialogs, consent and purchase bars. Upload timing/provider gates remain unchanged. |
| Session-checking cart feedback / F49 | The cart readiness guard threw before the shared error-feedback handler; cards consumed the rejected promise without announcing it | The unchanged guard now runs inside the existing generation-scoped handler, before any mutation. Pending verification announces a wait; failed verification directs the user to the existing Cart retry. Recovery never automatically replays an add, starts an animation or updates cart data. |
| Superseded cart reads / F21, F49 | A delayed initial GET could overwrite the newer successful mutation snapshot in the same account cache | Only the exact captured session/cart read is canceled after a successful mutation returns a cart snapshot. Account generation is checked again after cancellation and before cache replacement. Failed mutations leave reads intact. The browser race reproduced eight times before correction and passes after it; real cart mutation DTOs retain the server checkout flag. |
| Documentation / F52 | Earlier instructions still described superseded visual contracts | Current AGENTS/README/Phase 1B notes document the updated navigation, filters, layout and verification workflow; historical reports remain identified as historical. |

## Request completion matrix

PASS means implemented and verified locally; it does not approve merchant content, enable integrations or authorize launch.

| Requested scope | Status | Remaining dependency |
| --- | --- | --- |
| Desktop left logo, horizontal navigation, right actions and sticky offsets | PASS | None for the implemented layout |
| Mobile drawer and identical role-aware navigation | PASS | Real-device/manual assistive-technology acceptance remains recommended |
| Seamless announcement, pause controls and reduced motion | PASS | Approved wording is preserved |
| Exactly three shop accordions, manual EGP bounds, Clear All, URL/history and server pagination / F19 | PASS | None; category hierarchy and admin relationships are retained |
| Responsive local hero, exact headline, pause and failure fallback | PASS (implementation) | Approved actual footage/posters and playback/performance checks with those files |
| Four approval-gated count-up claims | PASS (implementation) | Merchant evidence, final wording and explicit approval; claims remain unpublished |
| Footer logo, Information links and approved contact icons | PASS | Missing owner-approved public destinations/content remain placeholders |
| Shared admin shells and readable action variants / F08, F20 | PASS | None for tested route/layout states |
| Dependency invalidation, Cairo promotion times and order detail/actions / F21, F22, F32 | PASS | Existing backend authorization/revisions remain authoritative |
| Error boundaries, skip navigation, route focus and field errors / F45, F46 | PASS | Manual screen-reader acceptance remains recommended |
| Native modal lifecycle, control boundaries and upload/feedback UX / F47, F48, F49 | PASS | Actual private storage remains disabled; upload failure/success is tested with isolated mocks |
| Requested content alignment and updated conventions / F51, F52 | PASS | No Batch 3 work or deployment |

## Approval and asset prerequisites

Current `client/src/content/developer-content.js` intentionally has `heroVideo: null` and four claims with `approved: false`. These are owner-proposed marketing claims, not catalog/database statistics.

After receiving approved footage, add only optimized assets to `client/public/media/`, for example:

- `hero-desktop.webm` or `.mp4`, ideally a short silent 1080p-or-smaller clip, **under 1 MB where feasible without unacceptable visual degradation**.
- `hero-mobile.webm` or `.mp4`, cropped/encoded deliberately for mobile with the same under-1-MB target. Any necessary exception requires owner review of visual quality and bandwidth.
- `hero-poster.webp` and optionally `hero-mobile-poster.webp`, sized/compressed for their rendered dimensions.

Set `heroVideo` to the documented object with `approved: true`, local `/media/` paths, intrinsic `width`/`height`, and explicit `autoplay`/`loop` booleans. No R2 account is required. Only local approved paths are accepted. Compression targets are recommendations, not measured results; verify actual playback, poster/LCP and mobile bandwidth with the delivered files. Browser playback success is tested only with an explicitly isolated media mock until real footage exists.

The desktop `src` is required even when `mobileSrc` is configured. `mobileSrc`/`mobilePoster` take effect at 767px and below; omitted mobile fields fall back to desktop assets. One `width`/`height` aspect ratio applies to both exports, so deliver compatible crops. The exact configuration example is in `client/src/content/developer-content.js`.

Each of the four statistics requires a unique `id`, nonnegative safe integer `value`, positive integer `scale`, `suffix`, `label`, `approved: true`, nonempty `source`/`approvalEvidence`, and a parseable `approvedAt` date. Display equals `value / scale` followed by `suffix`: the prepared configurations produce `50K+`, `90%+`, `10K+` and `9+`. All four must pass before the section displays figures. Evidence and final wording require merchant approval; no database inference or automatic publication occurs.

This developer configuration is bundled into public JavaScript. Store only a public-safe evidence reference/summary here; keep private supporting documents outside the frontend. Counter widths use reserved em-based space rather than font-sensitive ch units; a font-swap regression verifies that number animation and display-font arrival do not change card geometry.

Footer contact icons consume the existing approved public site-content DTO. Approval/validation in site-content administration remains authoritative. Backend Gmail credentials are never used as public contact information.

## Verification

All applicable local gates passed on the final implementation. These are checks executed during Batch 2, not earlier phase claims. The completed scope does not authorize launch or verify live providers.

| Check | Result |
| --- | --- |
| Full guarded backend suite — `npm.cmd test` from `server/` | 325 passed; 0 failed/skipped |
| Server syntax — `npm.cmd run check` from `server/` | 118 JavaScript files passed |
| Offline SEO/generator/Cloudflare regressions — `npm.cmd run test:seo` from `client/` | 28 passed; 0 failed/skipped |
| Full isolated frontend suite — `npm.cmd test` from `client/` | 237 passed; 0 failed/skipped; final run 6.8 minutes |
| Connected React → real local API → disposable replica set — `npm.cmd run test:contracts` from `client/` | 4 passed; 0 failed/skipped; only external storage mocked |
| Frontend lint — `npm.cmd run lint` from `client/` | Passed after all final source/test changes |
| Isolated production build — `npm.cmd run build` from `client/` | Passed; Vite 8.3.4, 1,747 modules; offline noindex SEO |
| Git whitespace and file manifest | Passed with CRLF-aware diff check; 71 unique existing paths, no missing entries |
| Original logo identity | Working-file and HEAD blob hashes both `4d65e01752fd7fa5f10e19e0a6beeb4a4fe1262a` |

Batch 2 adds 104 frontend regression cases: 35 admin/helper cases, 18 shop cases, 25 storefront cases and 26 reliability cases. Five backend cases cover the optional range-aggregation contract and real order-transition parity; one new SEO case verifies public static navigation. The four existing Batch 1 connected cases were rerun against the updated frontend and actual validation/serializers, rather than counted as new tests.

Responsive coverage includes all eight requested widths (320, 375, 390, 440, 768, 1024, 1440, 1920). The shared-admin route sweep checks 21 routes at each width: 168 route/width combinations, not 168 additional test cases. It includes overview, orders/detail, products/add/edit/configuration/preview, categories, homepage, reviews, content, customers, analytics, email delivery, payments, customization, components, bundles, discounts and shipping. Every checked page retains aligned outer/title gutters and avoids document overflow; tables scroll within their containers. Separate tests cover compact mobile navigation, loading/denied/error states and mutation feedback.

Other assertions cover text/control contrast, verified role transitions, unknown-session destinations, native dialog keyboard/backdrop/focus/stacked-scroll behavior, raw price editing, URL/history, mutation cache dependencies, Cairo DST gaps/repeated minutes, accessible native/server/array errors, local file previews and explicit upload retries, reduced motion, approval gates and blocked media. The connected cases verify normalized engraving controls/one upload/server quote/cart changes, supported admin configuration/exact piastres/revisions, customer-note privacy/ownership denial, and paginated category/component relationships. Checkout is explicitly disabled in those connected tests.

Failures were investigated before completion. A full 232-case run exposed one delayed-admin-heading focus failure; deterministic hidden/replaced-heading regressions then reproduced the premature completion mechanism. A delayed initial cart read overwrote a successful add in eight isolated reproductions before the exact-read cancellation fix. Both corrections passed five repetitions of each of five focused focus/cart tests (25 checks), then the full 236-case and final 237-case suites. A final mobile drawer-to-delayed-heading regression passed against unchanged modal lifecycle code; the suspected cleanup interaction was not reproduced and no speculative modal correction was applied. No snapshots were blindly accepted.

Final isolated screenshots reviewed include `client/test-results/batch2-home-320.png`, `client/test-results/batch2-shop-1440.png`, and the regenerated 320/1440 admin-product artifacts under `client/test-results/`. Earlier desktop-home/mobile-shop artifacts were also reviewed. These depict synthetic products/content, not staging screenshots or approved merchant prices. The commerce fixture used by the broad admin geometry screenshot omits publication status, so its blank badge is a fixture omission; the actual admin list projection includes `status`. That screenshot is evidence for layout, not every record field.

The final build's entry JavaScript chunk is 335.00 kB (100.77 kB gzip); main CSS is 74.82 kB (15.18 kB gzip), with route chunks emitted separately. These are build-output sizes, not measured LCP/INP/CLS or total loaded JavaScript. SEO generation made zero database connections/network requests and produced 22 development routes, zero indexable routes, zero catalog products/categories and no checkout offers. Environment-file loading was disabled for this build, with a loopback API and tracking/indexing flags disabled.

All automated gates are PASS. Remaining acceptance work concerns actual approved footage, content/evidence, eligible catalog/media and the manual checks below; no live integration verification is inferred from mocks.

No physical browser zoom, live media playback, Atlas connectivity, email delivery, R2 upload, Meta receipt, production indexing or live merchant interaction is claimed. A CSS viewport/device-scale simulation exercises a 200%-zoom-equivalent reflow scenario; actual browser-UI zoom remains a later manual acceptance check.

## Changed files

The working tree already contained Batch 1 changes. The manifest here lists files touched by Batch 2, not every preexisting Git change: 71 paths, comprising 18 created files (marked below) and 53 modified files. Unmarked entries were modified.

- `AGENTS.md`
- `README.md`
- `client/e2e/batch2-admin-helpers.spec.js` (created)
- `client/e2e/batch2-admin.spec.js` (created)
- `client/e2e/batch2-reliability.spec.js` (created)
- `client/e2e/batch2-shop.spec.js` (created)
- `client/e2e/batch2-storefront.spec.js` (created)
- `client/e2e/catalog-browser.spec.js`
- `client/e2e/catalog-fixtures.js`
- `client/e2e/commerce-fixtures.js`
- `client/e2e/seo.spec.js`
- `client/e2e/website-admin.spec.js`
- `client/e2e/website-public.spec.js`
- `client/scripts/seo/generator.js`
- `client/scripts/seo/generator.test.js`
- `client/src/App.jsx`
- `client/src/accessibility.css` (created)
- `client/src/admin.css`
- `client/src/admin/AdminForm.jsx` (created)
- `client/src/admin/AdminLayout.jsx` (created)
- `client/src/admin/cairo-time.js` (created)
- `client/src/admin/catalog-form.js`
- `client/src/admin/order-actions.js` (created)
- `client/src/admin/query-invalidation.js` (created)
- `client/src/catalog.css`
- `client/src/commerce/AdminEditors.jsx`
- `client/src/commerce/CartContext.jsx`
- `client/src/commerce/CategoryRestrictions.jsx`
- `client/src/commerce/ConfiguredFields.jsx`
- `client/src/commerce/api.js`
- `client/src/commerce/commerce.css`
- `client/src/components/AccountActions.jsx`
- `client/src/components/CatalogDialog.jsx`
- `client/src/components/CatalogFilters.jsx`
- `client/src/components/Footer.jsx`
- `client/src/components/FormFeedback.jsx` (created)
- `client/src/components/Header.jsx`
- `client/src/components/PageErrorBoundary.jsx` (created)
- `client/src/components/PublicContent.jsx`
- `client/src/components/RequireAdmin.jsx`
- `client/src/components/RouteFocus.jsx` (created)
- `client/src/components/useModalDialog.js` (created)
- `client/src/content/developer-content.js`
- `client/src/main.jsx`
- `client/src/pages/AccountRecoveryPage.jsx`
- `client/src/pages/AdminCommercePage.jsx`
- `client/src/pages/AdminOrderPage.jsx`
- `client/src/pages/AdminProductConfigurationPage.jsx`
- `client/src/pages/AdminProductFormPage.jsx`
- `client/src/pages/AdminProductPreviewPage.jsx`
- `client/src/pages/AdminProductsPage.jsx`
- `client/src/pages/AdminWebsitePage.jsx`
- `client/src/pages/AuthPage.jsx`
- `client/src/pages/CartPage.jsx`
- `client/src/pages/CheckoutPage.jsx`
- `client/src/pages/CustomizationPage.jsx`
- `client/src/pages/HomePage.jsx`
- `client/src/pages/OrdersPage.jsx`
- `client/src/pages/ProductPage.jsx`
- `client/src/pages/ShopPage.jsx`
- `client/src/pages/TrackOrderPage.jsx`
- `client/src/services/catalog.js`
- `client/src/storefront.css` (created)
- `client/src/utils/catalog.js`
- `client/src/website-admin.css`
- `docs/BATCH_2_FRONTEND.md` (created)
- `docs/PHASE_1B_STOREFRONT.md`
- `server/src/catalog/service.js`
- `server/src/catalog/validation.js`
- `server/test/batch2-order-ui-contract.test.js` (created)
- `server/test/catalog-phase1b.test.js`

## Safety and next work

- Existing staging/production databases and merchant records were not accessed or mutated. Backend fixtures are fresh guarded local databases; browser fixtures use isolated APIs, and connected tests use a separate disposable replica set.
- No `.env` secrets inspected/modified; no catalog import, live merchant-provider operation, email/payment, R2 upload, publication, checkout activation, commit, push or deployment.
- Some earlier browser checks fetched existing public Google Fonts assets. Shared catalog/commerce fixtures now block those fonts; connected contract tests block all nonloopback requests. These public asset reads did not access Gmail, Meta, R2 or any authenticated merchant provider account.
- Batch 1 identity/generation guards, authorization, CSRF/Origin checks, revisions/409 draft preservation, allowlisted customer DTOs, private files and transaction/idempotency protections are preserved and regression-tested.
- Checkout/provider flags remain disabled. Test-only checkout/provider fixtures do not alter runtime settings.
- Owner-approved media, marketing evidence, contact/policy content and a public eligible catalog remain external prerequisites. This frontend completion does not authorize launch.
- Review the isolated UI artifacts and approve actual content/assets. Only then scope Batch 3 separately; do not perform live integration or database operations as part of these instructions.
