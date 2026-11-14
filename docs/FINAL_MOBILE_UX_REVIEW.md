# Final mobile UX / reliability review — 14 November 2026

Base: `2b56d8287e303f13288a9b2072c10ec524969f28`. Local changes only; no commit, push, deployment, SEO renewal, production data writes or infrastructure/settings changes.

## Implemented

- Cart thumbnails use stable identities, verified owner/session asset loading, abort cleanup and at most three attempts for transient failures. Forbidden/missing/expired files do not retry; image decode errors have an honest fallback. The large private preview remains an explicit View action.
- Rounded cart and customer design disclosures, rotating chevrons, keyboard/expanded states; duplicate engraving type/status copy removed while distinct descriptions remain.
- Sticker frames use loaded-font glyph measurements, compact short-text widths and growing wrapped-line heights. Expanded physical face bounds include rotated corners and round-box shoulders. Historical proof rendering/default coordinates and Box 12 fallback remain unchanged.
- Both editors deselect on outside taps; background gestures scroll the page. Artwork gestures and intentional Adjust View retain capture. Removed normal-mode engraving scroll containment.
- Engraving history/Adjust View share a row; footer has total then secondary Back/primary action. Step scrolling is instant with the existing header offset. Color precedes language/fonts; redundant editing heading removed.
- Builder errors use stable branded toast IDs without scroll/focus jumps. Accepted images show accurate local-draft feedback, previews/counts and replacement controls. Removed only the requested refund reference block.
- Discount button is contained at narrow widths. Server-authorized merchandise quotes no longer require a delivery destination; final customer/address validation remains mandatory. Destination is excluded from the merchandise fingerprint because delivery is separately confirmed.
- InstaPay follows supplied Darb structure in brown/cream: recipient/copy, inset amount/copy, sender, large screenshot area, preview/removal and support reference disclosure. Place Order retains/reuses private proof before accepting the same idempotent order. No automatic paid status or additional transfer request.

## HTTPS: verified results and unresolved boundary

Both authoritative nameservers (`alberto.ns.cloudflare.com`, `stella.ns.cloudflare.com`) agree: apex and www return A `104.21.17.223`, `172.67.178.157`; AAAA `2606:4700:3033::6815:11df`, `2606:4700:3032::ac43:b29d`. Public responses are Cloudflare edge responses.

Three repetitions of each IPv4 URL form succeeded: HTTP apex → HTTPS apex → 200; HTTPS apex → 200; HTTP www → HTTPS www → HTTPS apex → 200; HTTPS www → HTTPS apex → 200. Query strings survived; no insecure redirect intermediate. Eight SNI handshakes across both A records/hosts and TLS 1.2/1.3 verified successfully, negotiating h2. Google Trust Services certificate covers apex and wildcard, valid 10 October 2026–8 January 2027. h3 is advertised; HTTP/3 operation was not established. HSTS header is absent; absence alone does not establish this failure's cause.

Cloudflare authenticated GET diagnostics confirm active zone, production `tapandwrap-frontend` apex custom domain, and empty zone Worker routes. DNS-record/proxy fields, SSL mode/certificate packs, redirect rules/Always Use HTTPS/HSTS settings returned 403 with current access. Their complete configuration/renewal/origin behavior is **not verified**. No evidence-supported Cloudflare mutation is prescribed.

This workstation cannot reach the published IPv6 addresses (`ENETUNREACH`); this is not proof that Cloudflare IPv6 fails. The supplied Samsung image shows the HTTPS-first-style fallback in a Chrome browser surface; the owner confirmed Samsung Chrome on Wi-Fi. Device reproduction remains unresolved. Needed: Chrome/Android versions, launching app/full URL, exact failure time, a same-phone mobile-data comparison against the failing Wi-Fi, Private DNS/VPN state and a device network/error trace during failure. No physical Samsung or Android HTTPS-first automation was available. Next Cloudflare action is read-only dashboard inspection of DNS/proxy, SSL/certificates and redirect rules, not a speculative setting change. Do not disable protections, IPv6 or enable preload to conceal this warning.

Repeatable probe: `node server/scripts/check-public-https.mjs`. Ignored evidence: `local-data/final-mobile-https.json`, `local-data/final-mobile-cloudflare.json`.

## Gmail: correction versus hosting blocker

Render reports `tapandwrap-api` (`srv-db4nguks728c73b5m2l0`) on **Free service compute**; its Starter build plan is separate. [Render documents](https://render.com/docs/free#other-limitations) outbound SMTP ports 25/465/587 blocked on Free, plus idle suspension. Existing logs on 11 November show both successful cycles and uncertain cycles (2, 2 and 4 uncertain events); they lack SMTP-phase evidence. These historical outcomes cannot be conclusively attributed to stale pooling, timeout, account throttling or suspension from the aggregate logs alone.

Confirmed code risks corrected: generic unclassified transport errors previously allowed retry; Nodemailer's `CONN` also occurs after possible DATA acceptance, so that label cannot authorize resend. Exact connection/greeting timeout signatures and DNS failures can retry; provider 4xx remains bounded retry; authentication/permanent rejection remains terminal; ambiguous/unknown outcomes stop for review. New safe phase/code logs omit recipient, credentials, SMTP responses and message text. Fresh per-message Gmail connections avoid pooled stale/requeue behavior; socket timeout is 30 seconds, with 15-second connection/greeting bounds. The dispatcher reserves a complete send budget before claiming another event, avoiding sends started in the tail of a 50-second cycle. Durable IDs, leases, audit records and uncertain-state no-replay rules remain intact.

Gmail/Nodemailer is retained; no live mail, provider/credential change or historical resend occurred. It cannot be certified reliable on currently reported Free compute. Required approved action: move this API service to SMTP-capable always-running paid compute, retain Gmail settings, then run controlled synthetic customer and owner messages to an approved recipient and inspect the new safe diagnostics. If auth/throttle errors are then demonstrated, address the specific Gmail app-password/account issue. No account setting change is currently justified. Suspension/restarts can still defer processing; an ambiguous acceptance still requires merchant reconciliation.

## Verification

- Browser: 50/50 targeted tests passed; after reference-based refinements, 26/26 customization/mobile tests passed, including 320/390/768/1024/1440 and payment/discount comparisons at 337/343. Native touch scrolling, full-circle twists, outside deselection, Arabic/English measurements, session isolation, keyboard/reduced motion and retry boundaries exercised. Final payment styling/copy changes additionally rechecked in the 15-test customization suite.
- Connected React/API/disposable replica set: 3/3 passed, including COD, proof-before-order InstaPay, private admin View and service requests. Only external storage is mocked; no merchant database or real transfer.
- Focused Gmail/payment/outbox suite: 73/73 passed; deadline/retention batch: 37/37; expanded geometry: 7/7. Owner/customer notification coverage passed in the full run. These are synthetic transport tests, **not live Gmail delivery evidence**.
- Client lint/build passed; SEO tests 84/84. Build uses default development/noindex generation, not publication renewal. Server syntax check: 306 files.
- Full backend: **1,082 passed / 1,099 total; 17 failures**. Ten old engraving-payment expectations, catalog sorting and fixed-content SEO failures reproduce against untouched HEAD. Four local gift-box source-inventory/overlay checks fail because local source files differ from the pinned inventory; no assets/manifests were altered. One catalog-efficiency assertion failed in the full run and passed both isolated current and baseline reruns. These failures prevent a clean full-suite release claim; logs retain actual results rather than hiding them.

Production public API still returned checkout enabled, whose implementation requires **both** launch flags true. COD/InstaPay policy, prices/stock, historical orders/accounting, notification audit and private ownership/retention contracts were preserved. No persistent merchant data was touched. Remaining handover blockers: Gmail hosting/live acceptance, Samsung network diagnosis, and existing full-suite failures.

## Exact changed files

```text
client/connected-e2e/enabled-checkout.spec.js
client/e2e/final-customization.spec.js
client/e2e/mobile-finish.spec.js (new)
client/e2e/visual-engraving.spec.js
client/src/commerce/CheckoutInstaPay.jsx
client/src/commerce/cart-v2.css
client/src/commerce/commerce.css
client/src/engraving/EngravingCartCard.jsx
client/src/engraving/EngravingSummary.jsx
client/src/engraving/LetteringControls.jsx
client/src/engraving/StandaloneVisualBuilder.jsx
client/src/engraving/standalone-visual.css
client/src/engraving/useStandaloneVisualBuilder.js
client/src/engraving/visual/SavedVisualPreview.jsx
client/src/engraving/visual/VisualEngravingEditor.jsx
client/src/engraving/visual/visual-editor.css
client/src/gift-box/PersonalizationEditor.jsx
client/src/gift-box/StickerWorkspace.jsx
client/src/gift-box/sticker-workspace.css
client/src/gift-box/usePersonalDraft.js
client/src/pages/CheckoutPage.jsx
client/src/pages/GiftBoxBuilderPage.jsx
client/src/pages/StaticPage.jsx
server/scripts/check-public-https.mjs (new)
server/src/commerce/notifications.js
server/src/commerce/orders.js
server/src/commerce/routes.js
server/src/email/gmail.js
server/test/batch3-commerce.test.js
server/test/checkout-payment.test.js
server/test/gift-box-sticker-placement.test.js
server/test/phase3-email.test.js
shared/gift-box/sticker-placement.mjs
docs/FINAL_MOBILE_UX_REVIEW.md (this report)
```

Logs are under ignored `local-data/final-mobile-*.log`; browser screenshots/traces are under ignored `client/test-results/` and `client/test-results-contracts/`. Unrelated existing untracked files were left untouched.
