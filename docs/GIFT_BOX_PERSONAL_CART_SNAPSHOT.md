# Gift Box — Personalized cart and immutable snapshot candidate

This branch-only patch adds versioned optional photo/engraving intent to Gift Box configurations, reloads current saved prices and verified private uploads in cart quote transactions, attaches uploaded photos to the current cart, and snapshots the priced selections in version 2 of Gift Box order lines. Non-personalized version 1 configurations remain unchanged.

## Safety and limitations

- No public checkout flag or production database change. `GIFT_BOX_PERSONALIZED_CHECKOUT_ENABLED` is separately OFF by default and MUST remain OFF until the complete merge/order/private-file customer journey is verified. No live order acceptance is authorized by this patch.
- The private upload must already be `complete`, owner-bound, box-bound, unexpired and not attached to another cart. Photos are attached atomically to the cart and retained by the existing order transaction.
- Engraving/photo options must have saved, approved prices; missing prices do not become free.
- The public cart response exposes only photo counts, text and prices, not upload keys or other owners. Admin order details may show upload IDs but private bytes still require the existing authenticated, audited file-view endpoint.
- Existing guest-to-user cart merge cannot safely consolidate personalized Gift Box attachments yet. It fails closed without losing the guest cart. Do not launch customer personalization until that flow and full end-to-end tests are complete.
- Do not enable `GIFT_BOX_DIRECT_COMMERCE_ENABLED`, checkout or any new server flags yet.

## Local validation

In repo root: `node --test server/test/gift-box-personal-cart-contract.test.js` and `node --check` on modified scripts. With dependencies installed: from `server/`, `npm.cmd test` and `npm.cmd run check`; then client lint and Vite build. Review any failing existing tests before committing.
