# Tap & Wrap — Gift Box final integration gate (31 October 2026)

**Base:** `feature/gift-box-builder-v2`, commit `c6f5b3e10d1406361b1fc8a9be46be9e7d193d4b`.

**Status: DEVELOPMENT / REVIEW ONLY — NOT APPROVED FOR LIVE PURCHASING.**

This patch adds five isolated browser regression tests for the newly added personalization admin UI and order read-only presentation. It does not alter application runtime code, save business settings, grant licenses, create indexes, publish images, deploy, or enable checkout. Its isolated test fixtures are not actual merchant approvals.

## Tests added

The `playwright.gift-box-phase4.config.js` suite now also includes `gift-box-personalization-final.spec.js`.

1. An authorized admin creates a **pending, unpriced, unpublished** photo-print option; no accidental complimentary charge or approved license is posted.
2. An engraving option changed by a second admin rejects a stale revision, retains the first draft, and requires explicit confirmation to reload before saving an exact integer-piastre amount.
3. A customer session cannot access admin editing controls or submit option writes.
4. A customer order shows the owner's saved engraving text without exposing private image identifiers or automatically loading private images.
5. An admin order shows purchase-time print placement, exact charge and engraving text, without automatically downloading customer files.

The tests mock API responses in an isolated local Playwright process. They are **not** a replacement for an authorized end-to-end test with a disposable MongoDB replica set, secure upload test double and real HTTP ownership guards. The existing backend tests test many of those lower layers separately.

## Mandatory owner/release checks (NOT completed by this patch)

- **Checkout stays off:** keep `CHECKOUT_ENABLED`, `COMMERCE_LAUNCH_AUTHORIZED`, `GIFT_BOX_DIRECT_COMMERCE_ENABLED` and `GIFT_BOX_PERSONALIZED_CHECKOUT_ENABLED` disabled until separate reviewed authorization and test evidence. Do not infer approval from a successful UI build.
- **Actual box packing:** each proposed box needs merchant-reviewed approved component compatibility, maximum mixed contents, actual physical arrangement and a published policy. **Box 1 source/derivative artwork remains a documented production blocker** until independently reviewed.
- **Real pricing/inventory:** all selected box, components, ribbons, gift cards, photo prints and engraving surfaces need confirmed prices, stock/availability or explicit Made-to-Order status. Blank/unapproved pricing cannot be represented as free.
- **Engraving rights and feasibility:** validate real font licensing for each activated engraving style and independently confirm material, printing/engraving equipment, colors and placement. A style preview alone is not a production license.
- **Secure media:** verify the public manifest against reviewed R2 object bytes and HTTPS delivery; verify private upload ingress and authenticated admin file retrieval using dedicated test credentials. No public object URLs for customer images.
- **Schema and flags:** review `GiftBoxPersonalizationOption` collection/index setup against the exact authorized target before enabling `GIFT_BOX_PERSONALIZATION_OPTIONS_ENABLED`. Runtime must not implicitly perform DDL. Verify live values rather than assuming local defaults describe Render/Cloudflare configuration.
- **Integrated journey:** exercise guest login merge and two-owner isolation; cart retries/idempotency; multi-gift charges; photo expiration/replacement; Add to Cart server re-quote; abandoned upload cleanup; order snapshot/read permissions; inventory rollbacks; fulfillment and payment evidence. These require an appropriately isolated environment, not production.
- **Customer storefront and SEO:** test 320, 390, 768 and 1440 px, tab order, alerts, selection revalidation, error recovery and loading states. Release SEO/publication is independently gated, and currently generated builds are intentionally `development-noindex`.

**Launch decision:** no automatic flag flip or production writes. Unverified physical fit, fonts/rights, real configuration and complete checkout are blockers, not just checklist items. After the Gift Box is verified, the agreed separate roadmap is all ~1,595 catalog products publicly visible with WhatsApp enquiries where prices are unapproved; then standalone Laser Engraving; then engraving on selected categories; then storefront/admin polish.

## Commands (Windows PowerShell)

```powershell
cd C:\Users\youss\Projects\tap-and-wrap
cd client
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --config=playwright.gift-box-phase4.config.js
cd ..
git diff --check
git status --short
```

Expected browser suite size changes from **66 to 71 tests**. A pass establishes only the synthetic/browser contracts above; server and production readiness require the separate checks listed here.
