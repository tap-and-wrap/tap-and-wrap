# Tap & Wrap — Direct gift cart and checkout integration (development patch)

This patch connects the existing reviewed-policy and inventory engine to **real HTTP cart/checkout services** for **completed, non-personalized gift boxes**. The previously tested internal checkout route stays disposable-test-only, and public checkout remains OFF unless independently enabled with existing checkout flags and `GIFT_BOX_DIRECT_COMMERCE_ENABLED=true`. Do not set this variable yet.

## Customer flow

When the backend has an explicitly published, current physical policy for the chosen box, verified enabled/priced inventory for **every selected component**, a valid complete placement + ribbon, and the independent runtime flags, the customer can add the gift to a mixed cart. Checkout reparses the configuration, checks live prices/stock, obtains the physical policy fence, consumes inventory in the existing transaction and saves the immutable gift order snapshot. The item is personalized, requiring InstaPay; delivery remains pending confirmation. Both policy and inventory revocation invalidate the transaction. Gift-only and mixed carts remain rejected while the flag is off.

The customer button **must remain disabled** for unsupported boxes and any local photo/engraving drafts; those require private upload, authoritative options/prices and order snapshots. This is NOT the final personalized Gift Box launch and is not permission to deploy or change production settings.

## Remaining for the complete product

1. Secure private photo upload, attachment ownership, print options, engraving options/fonts, prices and immutable order snapshots; test failures, retries and admin fulfillment view.
2. Safe actual R2 production media mapping and public rendering; no locally ignored media deployed automatically.
3. Explicit source-backed per-box compatibility and verified retail prices/inventory. No invented capacities; the current production Atlas does not have GiftBoxComponentSetting or physical policy collections.
4. Full connected/disposable database and browser testing for the actual enabled path, then controlled staging deployment and live smoke tests. All merchant-visible catalog records remain unchanged.

## Test commands

From repository root `node --test server/test/gift-box-runtime-commerce.test.js`. Then from `server` run `npm.cmd test`, `npm.cmd run check`. From `client` run `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd test -- --config=playwright.gift-box-phase4.config.js`, and `npm.cmd test -- --config=playwright.gift-box-cart.config.js`. Run `git diff --check` before review. No database or cloud tooling is needed for the patch.
