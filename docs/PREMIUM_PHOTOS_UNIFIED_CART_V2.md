# Premium box photos and Unified Cart V2

## Approved scope and compatibility

Batch 2 starts from `b9de8c6d5fb0b2853bcd806a32a40517666edb23`. The tracked local tree was clean; the existing unrelated untracked patch folders, backups, scripts and reports were preserved. This is a focused React/Vite and Express feature release. No dependencies, migrations, product/component prices or inventory, merchant configuration, checkout/payment launch flags, SEO activation, saved orders or customer records are changed. Synthetic engraving order #767557 is not used for testing or modified.

## Root causes corrected

- The photograph itself was an enlargement button, separate from a text-only selection button. The full card now has one selection button containing the photograph and metadata, plus a sibling enlargement button. Enlarging cannot select; unavailable boxes remain inspectable. The selection button fills the complete card. There are no nested interactive controls or page-scroll gestures.
- Portrait masters contained considerable shop background. Fitting those entire photographs into square cards made the boxes small. Independently reviewed crops now remove expendable background, preserve source-visible physical details, and use a restrained ivory matte where the physical silhouette remains tall. Card/grid dimensions remain consistent with the other components.
- The former viewer forced a 640px derivative to a larger CSS width, with a single toggle and nested scrolling. The replacement calculates fit from the actual natural image dimensions and stage, starts at fit, caps zoom at native detail (also bounded to 4x fit), and clamps panning. It supports buttons, Fit/reset, pointer drag, desktop wheel, touch pinch and keyboard panning. Native modal lifecycle preserves focus trapping/restoration, Escape, backdrop dismissal and body scroll locking. Resize/wheel/pointer resources are cleaned up. Reduced motion disables transitions. No upstream lightbox dependency or React Bits source is integrated.
- Cart lines used three unrelated presentations, quantity dropdowns, prominent component lists and direct removal buttons. `CartLine` now owns the shared image/name/unit-price/quantity/line-total/actions layout, controlled accessible details panel and item-specific confirmation modal. Gift Box presentation is `Gift Box`; technical kinds, configured identities and historical snapshots retain their original names. Normal product title/image navigation remains available.
- Private engraving images use verified owner APIs and abort/generation guards. Blob URLs are revoked on cleanup; an invalid or superseded public line cannot display an old image. Surface/artwork previews load when details open. Engraving remains exactly one physical item per line.
- Expired-file recovery stays visible beside the error instead of becoming hidden inside collapsed details. Unavailable rows retain their identity, saved design and removal action, without inventing prices.
- The Gift Box checkout predicate incorrectly demanded `checkoutAllowed` on ordinary product lines. Cart responses now require every item to be valid, preserve global authorization and engraving runtime authorization, apply Gift Box-specific capability checks only to Gift Box lines, and retain the mixed-engraving restriction. No `checkoutAllowed:true` workaround is added to products.

## Photo framing ledger

All twelve actual local master photographs are 960 x 1280 WebP files under `local-data/taw-giftbox/boxes/`. Alternate closed views of Boxes 2 and 11 were also inspected; the registry's original selection views were retained so the open construction and compartments remain visible.

Coordinates below are original-source pixels: left, top, width, height. The full uncropped master is used only for inspection. Neither the local master nor any transparent placement image is modified.

| Box | Crop | Framing result |
| --- | --- | --- |
| 1 | 0, 440, 960, 840 | Open heart, both wings and hanging ribbon retained. |
| 2 | 0, 555, 960, 725 | All source-visible connected compartments retained across the full source width. |
| 3 | 145, 500, 700, 680 | Closed black heart and decorative ribbon centered more closely. |
| 4 | 190, 240, 710, 1000 | Upright lid and white heart base retained; narrow matte accommodates height. |
| 5 | 0, 350, 960, 930 | Clear lid, black base and visible ribbon ends retained. |
| 6 | 100, 300, 820, 980 | Clear lid, white base and strap at source edge retained. |
| 7 | 160, 330, 660, 900 | Complete upright circular lid and red cylinder retained. |
| 8 | 165, 100, 665, 1180 | Tall open circular construction and trailing ribbon retained. |
| 9 | 150, 330, 660, 870 | Upright circular lid and white cylinder retained. |
| 10 | 180, 330, 640, 870 | Pink rim, upright lid and complete base retained. |
| 11 | 0, 390, 960, 890 | Both tiers, clear lid and source-visible ribbon retained. |
| 12 | 110, 330, 750, 870 | Both woven handles and basket base retained. |

Source limitation: some open wings/ribbons already run through an original source edge, particularly Box 2's wide open view and Box 11's foreground lid/ribbon. No missing product detail was generated or claimed to be recovered. New framing does not cut further into those source edges. A future complete-edge photograph requires a new merchant photograph. The ivory composition preserves aspect ratio and does not aggressively upscale.

## Media publication and rollback

`box-photos-2026-11-07.2` is a separate immutable selection-media namespace under the existing public `tapandwrap-catalog` bucket:

- 24 square thumbnail derivatives: 320 x 320 and 640 x 640 for each box.
- 12 unchanged, uncropped 960 x 1280 selection photographs for honest inspection detail.
- Total: 36 WebP objects, 2,387,686 bytes.
- Public prefix: `https://media.tapandwrap.net/gift-box/box-photos-2026-11-07.2/`.
- All 36 public objects were retrieved and matched to the manifest's actual byte size, format, dimensions and SHA-256. Publication evidence is ignored `local-data/box-photo-publication/report.json`.

The old `gift-box-media-2026-10-31.1` manifest, its 137 objects, placement mappings, asset version and geometry are unchanged. Public API runtime credentials were not needed: the existing Cloudflare authorization was used. The fixed-purpose publisher verifies local bytes, preflights all destination keys, refuses conflicting existing content, rechecks absent keys before upload, and verifies remote/public bytes afterwards. It never uploads customer files or deletes/replaces old releases. Prepared image binaries stay under ignored `client/.gift-box-assets/`; only reproducible source framing, scripts and the media manifest are committed.

Offline reproduction and validation:

```powershell
node server/scripts/prepare-box-photos.mjs
node server/scripts/publish-box-photos.mjs
```

The publishing script defaults to offline verification. Its separate `--apply --confirm-selection-photos` mode is an explicitly authorized production media operation, not part of app startup/build/tests. Rolling back the frontend to the preceding commit restores the old selection-media mapping without changing any stored design. Keep both media namespaces available.

## Cart behavior and commerce fences

The collapsed layout is shared by products, Gift Boxes and engraving. Details use a real button with `aria-expanded`/`aria-controls`, an inert collapsed region and a reduced-motion-aware grid transition. Component lists, messages, fonts, colors, design preview and file/retention details are inside that panel. The visible Clear cart and item-specific promotional links are removed; checkout and Continue shopping remain. The server clear operation remains intact.

Products/Gift Boxes use minus/value/plus controls. Public `maxQuantity` is advisory, derived from current stock and the other valid lines' demand; every request still reprices on the server, validates inventory and respects 1..99. No stock is reserved for a cart add. Engraving has a fixed one-item indicator and the server continues rejecting quantity updates.

Removal captures one immutable line ID and opener. Keep item, Escape and backdrop preserve the cart. Confirm is guarded against repeated activation, provides pending/error feedback and restores useful focus. DELETE retries target that same line; an uncertain response cannot become deletion of another item. Tests cover all three kinds, cancellation, explicit retry after a committed response is lost, and blob cleanup.

Mixed eligibility is:

```text
global checkout authorization
AND every item valid
AND no engraving/non-engraving mixture
AND engraving runtime authorized when engraving exists
AND Gift Box runtime authorized when gifts exist
AND every Gift Box line checkoutAllowed
```

Products keep their ordinary eligibility contract. Product + Gift Box carts pass the existing authorized quote pathway. Carts containing engraving plus another kind remain saved and blocked with a customer explanation; nothing is automatically removed, split, charged or fulfilled.

## Payment milestone deliberately preserved

Gift Box orders retain InstaPay, personalized COD restrictions remain, and engraving payment still follows inspection, design review and customer acceptance. No proof/accounting/status transition is relaxed. No production order, transfer, charge, inventory change or fulfillment action is used for acceptance testing.

Natural combined payment/COD is the next commerce architecture milestone: define inspection-aware payment obligations and acceptance, line/group-specific allowed methods, order grouping, inventory/reservation timing, cancellation/refund/accounting rules and idempotent recovery before enabling it. It cannot safely be delivered as a cart styling change.

## Verification and evidence

Tests use scrubbed configuration, isolated browser API fixtures and fresh disposable local replica sets. They never load merchant database credentials. Focused real API tests cover all requested line combinations, invalid product, expired file, Gift Box stock shortage and disabled capabilities. They also cover advisory stock bounds, fixed engraving quantity, idempotent removal and historical technical names.

The dedicated acceptance suite captures 42 actual rendered screenshots at 320, 390, 440, 768, 1024 and 1440 pixels: all box choices, keyboard/touch enlargement targets, fit and zoom/pan, all three collapsed/expanded cart types and confirmation. Landscape fitting, touch pinch, keyboard bounds, cancellation, lost-response retry and private URL cleanup are exercised. Contact sheets and every screenshot were visually reviewed; final evidence is copied under ignored `local-data/batch2-visual-final/`. Dialogs are captured at the viewport size; full-page captures can otherwise reposition fixed top-layer content and reset resize-dependent zoom. These are installed Edge/Chromium viewports and touch emulation, not physical Safari/device certification.

Visual review corrected the narrow enlarge hit target, 320px title wrapping, engraving preview stylesheet import and portalled confirmation primary-button scope. Earlier assertions were migrated from retired dropdowns/native nested disclosures/immediate removal and old cart CSS classes. No historical installer was run.

Final test counts, the exact source manifest, commit/deployment identities and read-only production verification are recorded with the completed release report. Local fixture checkout tests may create synthetic disposable orders; no such test is pointed at the merchant API.

## Exact source manifest

Final completed checks before release: 968 backend tests, 284 JavaScript syntax checks, 117 Gift Box browser cases, 15 dedicated photo/cart acceptance cases, 15 selected connected real-API cases in fresh disposable databases, 65 SEO tests, lint and production build. The connected set covers mixed Product + Gift Box, reconstruction, guest/account isolation, private uploads, and engraving editing. The 16-case focused backend matrix and three media-contract tests are included in the backend total. Responsive screenshot review covers all six requested widths and all twelve real thumbnails.

The complete default storefront run finished with 393 passed and one intermittent existing admin filter URL assertion (the second filter replaced the first in that run). The same unchanged test then passed all ten isolated repetitions. No admin implementation was modified for this release. This is reported as intermittent regression evidence, not a claim that the full run was entirely green.

The production-bundle suite passed all three cases after replacing its retired cart promotional-link selectors with the real Customize navigation. Eager font loading, cold cart return, private draft continuity and lazy CSS failure recovery remain covered. Lint passed again after that test-only update.

```text
client/connected-e2e/contracts.spec.js
client/connected-e2e/engraving-contracts.spec.js
client/connected-e2e/engraving-studio-contracts.spec.js
client/connected-e2e/gift-box-cart-contracts.spec.js
client/connected-e2e/gift-box-shopping-contracts.spec.js
client/e2e/batch2-reliability.spec.js
client/e2e/commerce-fixtures.js
client/e2e/commerce.spec.js
client/e2e/gift-box-cart.spec.js
client/e2e/gift-box-handoff.spec.js
client/e2e/gift-box-loading.spec.js
client/e2e/gift-box-redesign.spec.js
client/e2e/gift-box-release-checkout.spec.js
client/playwright.config.js
client/playwright.contract.config.js
client/scripts/gift-box-local-media.mjs
client/src/commerce/GiftBoxCartSummary.jsx
client/src/engraving/EngravingCartCard.jsx
client/src/gift-box/BoxPhoto.jsx
client/src/gift-box/Options.jsx
client/src/gift-box/gift-box.css
client/src/pages/CartPage.jsx
server/src/commerce/cart.js
server/src/commerce/pricing.js
server/src/gift-box/cart-pricing.js
server/test/gift-box-cart.test.js
client/connected-e2e/unified-cart-contracts.spec.js
client/e2e/premium-cart-photos.spec.js
client/playwright.batch2.config.js
client/src/commerce/CartLine.jsx
client/src/commerce/cart-v2.css
client/src/gift-box/box-photo-media.mjs
docs/PREMIUM_PHOTOS_UNIFIED_CART_V2.md
server/scripts/prepare-box-photos.mjs
server/scripts/publish-box-photos.mjs
server/test/box-photo-media.test.js
server/test/unified-cart.test.js
shared/gift-box/box-photo-framing.mjs
shared/gift-box/box-photos.v1.json
```
