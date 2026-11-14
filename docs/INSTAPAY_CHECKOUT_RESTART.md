# InstaPay changed-cart checkout recovery

Baseline: `aa1700e5ea8a1737e23f529acfb59d84da457c41`. Implemented locally; no commit, push, deployment, SEO renewal, production reads/writes, provider changes or launch-flag changes.

## Root cause and fix

The owner-provided production finding identifies an expired EGP 280 transfer reference retained under a reused COD checkout key whose current cart totals EGP 2,410. Selecting InstaPay correctly triggers `CHECKOUT_PAYMENT_CHANGED`: issuing replacement instructions without resolving possible earlier funds would be unsafe. Previously there was no customer restart action. Payment existence also incorrectly restored InstaPay even when the saved method was COD.

The owned recovery DTO now returns the saved payment method, whether the underlying prepared payment is recoverable, and whether cancellation is permitted. These are allowlisted flags; proof contents and storage identities remain private. COD is restored as COD. Cancelled or otherwise nonrecoverable references do not automatically restore InstaPay. Unchanged expired prepared references retain their existing revalidation flow.

For `CHECKOUT_PAYMENT_CHANGED`, an open reference without proof exposes **Start fresh checkout**, plus Contact Us for customers who have transferred. The shared accessible confirmation dialog asks whether a transfer has already been made. Only **No, I haven't transferred** calls the existing cancellation endpoint with `{ noTransferConfirmed: true }`.

Only a successful cancellation response permits replacement of the opaque client key. The old CheckoutIntent/reference remains recorded as `cancelled_no_transfer`. Existing session utilities generate and immediately persist a new UUID. Customer fields, cart, selected payment method and discount are left intact. Old key queries are cancelled, and quote/payment state is scoped to the new key. Authentication generation and scope checks reject late cancellation results from another owner/key. A cancellation failure or timeout retains the original key and dialog; repeating the explicit confirmation safely retries the idempotent cancellation.

The new key obtains its own authoritative quote and prepared reference. Sender/screenshot controls render only with authorized, actionable instructions. Place Order continues to require the normal screenshot process. No absence of proof is treated as evidence that a transfer did not occur.

Review-required, changed-payment, consumed-key, superseded-quote and reference-limit errors have distinct guidance/actions. Consumed-key status checks use the owned recovery query; superseded choices refresh the quote. Existing server safeguards, prices, accounting and expiry revalidation are unchanged.

## Verification

| Check | Result |
| --- | --- |
| Frontend lint | Passed after fixing an unescaped JSX apostrophe |
| Frontend production build | Passed; ordinary default noindex generation, no renewal/export |
| SEO regression | 84 passed / 0 failed |
| Backend syntax | 307 JavaScript files passed |
| Payment/checkout tests | 21 passed / 0 failed |
| Customer checkout/polish browser regression | 13 passed / 0 failed |
| Connected guest restart scenario | 1 passed / 0 failed |
| Connected signed-in restart scenario | 1 passed / 0 failed |
| Existing connected handover/mixed-cart/recovery suite | 4 passed / 0 failed |

The new connected tests use real local API routes and fresh disposable transaction-capable databases. Dedicated synthetic merchandise fixtures total exactly EGP 280 and EGP 2,410. They prepare the old reference, change the cart, save COD, restore COD on refresh, select InstaPay, reproduce the changed-payment conflict, verify no automatic key reset, cancel the dialog, simulate cancellation network failure, retry the same confirmation, obtain a distinct EGP 2,410 reference, preserve the old reference, repeat cancellation and refresh on the new key. A delayed old COD quote exercises cancellation/stale-response isolation. Form data and selected InstaPay remain intact; Place Order stays disabled without proof.

Backend tests additionally verify proof-bearing and consumed-order cancellation refusal, repeated immutable order submission, expired unchanged references, changed discounts, guest/member ownership, preserved accounting and mixed payment allocations. Existing connected tests cover lost proof/order acknowledgements and all five supported mixed-cart line families.

The guest and member browser scenarios run in separate disposable fixtures. An initial combined run reached the real shared checkout rate limit (429). No rate limit was disabled or reset. Initial harness failures (missing test selection, public product route and callback fixture syntax) were corrected without weakening application assertions. Unrelated failing suites were not changed or claimed green.

Run the new connected cases separately:

```text
client: npm.cmd run test:contracts -- checkout-restart-contracts --enabled-checkout -g guest
client: npm.cmd run test:contracts -- member-checkout-restart-contracts --enabled-checkout
```

Logs/traces: `local-data/production-fixes/restart-*.log` and `client/test-results-contracts/` (ignored).

## Changed files

```text
client/src/pages/CheckoutPage.jsx
client/src/commerce/CheckoutInstaPay.jsx
server/src/commerce/routes.js
server/test/checkout-payment.test.js
server/test/helpers/connected-api-server.js
client/playwright.contract.config.js
client/e2e/customer-polish.spec.js
client/connected-e2e/checkout-restart-fixture.js
client/connected-e2e/checkout-restart-contracts.spec.js
client/connected-e2e/member-checkout-restart-contracts.spec.js
docs/INSTAPAY_CHECKOUT_RESTART.md
```

The checkout browser fixture now supplies the actual recovery DTO contract and asserts that sender controls are absent during authorization. Test merchandise exists only in the guarded disposable fixture. No builder, product page, merchant price, inventory, eligibility, Gmail, Cloudflare, historical accounting, payment evidence or production configuration was modified.

## Release status

The reproduced changed-cart recovery works locally for guests and signed-in customers. The fix is ready for review; production remains unchanged. A production deployment and authorized provider verification are still separate steps. Customers who may have transferred, have saved proof, or have consumed orders must continue through reconciliation/recovery rather than silently starting a replacement payment.
