# Final production fixes — implementation and verification

Date: 14 November 2026. Baseline: `c3113bfb1e494ff966d3eaa7c23ef6a588f35562`.

Implemented locally. No commit, push, deployment, production database access, production storage access, email delivery, transfer, launch-flag change, or SEO renewal was performed. Existing unrelated local files were preserved. All commerce writes in verification used disposable, guarded test databases; connected tests used test-only storage.

## A. Root-cause findings

| Issue | Confirmed code finding |
| --- | --- |
| Returning InstaPay checkout | An unchanged prepared reference expired after ten minutes and was rejected along with changed/risky attempts under the same review error. Both the payment window and the checkout intent window participate in final acceptance. Renewing only the former is insufficient. |
| Consumed checkout key | The browser could reuse an opaque key belonging to an already accepted order for a new cart. The old order must be recovered or the consumed key verified before creating a new key. |
| Concurrent quotes | The server lacked an ordering fence for older requests arriving after newer payment/discount choices. Concurrent first insertion could also collide with the unique owner/key index. |
| Gift Box photo placeholder | The reconstructed arrangement had saved photo geometry but no authorized image sources. A separate details gallery loaded the images instead. |
| Slow personalized Add | File sign/PUT/complete pipelines ran sequentially. Engraving repeated the reviewed quote immediately before Add, although the final mutation already validates the accepted review fingerprint and current configuration. Route-level lifetimes interrupted otherwise valid work. |
| Engraving typing | Each edit used asynchronous font loading/measurement, a temporary input copy, and geometry/history commits. The SVG substituted an 800-unit interim width on each text change before metrics returned, causing visible size changes. Existing revision guards already rejected older edit completions; those protections are preserved. |
| Empty artwork | Text-rendering fallbacks inserted sample words into empty customer artwork. |
| Oversized sticker preview | A square workspace expanded to the available desktop/tablet width. Its normalized square coordinate contract was valid; its displayed footprint was excessive. |
| Other UI requests | The approval footnote, large success panel, immediate layer deletion, and differing FAQ background were explicit presentation behavior in the relevant components/styles. |

These are reproducible application findings. The screenshots alone do **not** identify which exact error code or stored record caused each live 409. No live payment record or production response body was inspected. Blocked analytics, extension warnings and report-only CSP messages are not established payment causes.

## B. Changes implemented

- Added a server quote sequence fence and a memory-only client sequence counter. Older quotes cannot overwrite newer choices. A unique first-insertion conflict is reread once. A superseded client request obtains the owned sequence and retries once; canceled requests do not keep retrying.
- Recovery checks the owned intent before quoting. Confirmed consumed keys recover the pending order, or rotate only the opaque key for a verified new purchase. Unknown/failed recovery stays blocked and has an explicit retry.
- An expired, otherwise unchanged prepared InstaPay reference is revalidated with the **same** reference, destination, amount, allocations and evidence. Both submission windows are coherent. Original expiry and revalidation metadata are retained. No payment is declared collected.
- Main Gift Box thumbnails resolve each photo index through the existing owner-authorized private endpoint. Saved positions, crop dimensions, stacking and presentation versions are retained. Fetches abort and object URLs are revoked on unmount/scope change. Loading and genuinely unavailable files have distinct states. The separate details gallery was removed.
- File pipelines use concurrency **2**, stable resource association and source-order results. Verified unchanged files are reused on retry. Failed batches stop scheduling new work and settle running siblings before another retry. Existing file limits, timeouts and validation remain in place; artwork is not recompressed or persisted in browser storage.
- An application-level pending Add can survive ordinary SPA navigation. It shows compact progress, aborts on owner/cart-context changes and updates the cart only after authoritative success. Immutable operation keys and uncertain-response recovery remain. Checkout is unavailable while this preparation is pending.
- Engraving text commits synchronously, uses bounded cached metrics and cached font loads, preserves its scale while text bounds change, and rejects stale font completions. Empty text renders no artwork. Font samples remain samples in the font picker. No selected font or historical saved text is replaced.
- Layer X actions use the shared confirmation dialog for text/image artwork. Cancel preserves the design; Remove affects that layer and remains undoable. Focus returns to a useful control.
- Engraving Add gives one established branded success toast and safely resets after confirmation; the large two-button success panel is removed, including the historical v1 editor. The v1 editor preserves its completed draft until its existing Start again control is used.
- Sticker editing is capped at 280 CSS pixels and 42svh; square v2 proofs are capped at 240 pixels. Product proportions, normalized saved geometry and historical aspect behavior remain intact. All eleven available exteriors and Box 12 fallback were exercised.
- Removed the customer approval footnote while preserving internal placement/fulfillment checks. FAQ now matches Featured Gifts: `#fcf3ef`.

## C. InstaPay verification and remaining intentional conflicts

| Condition / error | Result |
| --- | --- |
| Fresh guest checkout | Authorized amount/destination appears after server preparation; no actionable details while loading. |
| Valid prepared reference, navigation or refresh | Restores/reuses the existing reference rather than generating another one. |
| Both intent and payment expired, unchanged quote | Revalidates the same obligation; recorded proof survives and can produce one awaiting-verification order. A strengthened regression first reproduced the missing intent-window renewal, then passed with the fix. |
| Cart, discount or current price differs from issued instructions: `CHECKOUT_PAYMENT_CHANGED` | Keeps original evidence/amount and asks for reconciliation. No replacement transfer is silently authorized. A quote with no issued reference can reprice normally. |
| Older sequence: `CHECKOUT_QUOTE_SUPERSEDED` | Cannot overwrite the current choice. Bounded client recovery fetches the owned current sequence. |
| Consumed key: `CHECKOUT_USED` | Existing accepted order remains immutable. A verified new purchase uses a new opaque key. |
| Saved proof / non-prepared payment: `CHECKOUT_PAYMENT_REVIEW_REQUIRED` | Preserves evidence and blocks unsafe method replacement. Missing proof is never treated as proof that money was not sent. |
| Ten open issued references: `CHECKOUT_REFERENCE_LIMIT` | Distinct support/reconciliation error; all references remain. The limit is not bypassed or cleared. |
| COD → InstaPay → COD / return to InstaPay | Existing instructions are retained. A method switch asserts no financial collection. Saved evidence blocks unsafe COD switching; accounting still requires reconciliation of possible transfers. |
| Lost proof/order response | Owned lookup recovers the saved proof or accepted order. Repeated order submission uses the same immutable body and returns one order. |
| Zero total after a full discount | Browser shows “No transfer is due”; no preparation/upload request. Backend accepts the zero-total order without proof and creates no transfer reference or settlement. |

Connected tests exercise guest checkout, owned access rejection, mixed product/Gift Box/standalone engraving/product engraving/personal-photo product handoff, refresh, lost proof acknowledgement, lost order acknowledgement and repeated submission. Full backend coverage also exercises authentication/ownership, private uploads, accounting and historical contracts. A new dedicated live signed-in production checkout was **not** performed.

The conservative changed-issued-amount path intentionally remains a reconciliation stop. There is no reliable basis to infer an abandoned transfer from a missing screenshot. This work does not invent one or automatically discard references.

## D. Upload performance

Equivalent controlled browser trials used the baseline and changed client, synthetic files and a 100ms delay at each sign, PUT, completion, quote and Add stage. The timer ran from Add click until the confirmed completed UI. These are individual local fixture trials, not production R2 measurements or statistical latency guarantees.

| Files | Before time | After time | Peak pipelines before → after | Review + Add requests before → after |
| --- | ---: | ---: | --- | --- |
| 1 | 927ms | 537ms | 1 → 1 | 6 → 5 |
| 5 | 1,954ms | 1,947ms | 1 → 2 | 18 → 17 |
| 11 | 3,990ms | 2,987ms | 1 → 2 | 36 → 35 |

Every file still has exactly one sign, PUT and completion in a successful first attempt. Whole-flow counts include the review quote: `3N + 3` before, `3N + 2` after. Add-only counts are `3N + 2` and `3N + 1`. CSRF, preflight, configuration and background reads are excluded. The five-file trial showed essentially no measurable timing improvement; eleven files improved about 25% in this trial.

A separate Gift Box helper simulation with twenty files and three 100ms stages per file measured 7,339ms → 3,732ms, peak 1 → 2, with the same sixty simulated stage calls. Retrying unchanged cached files made zero additional stage calls. This is a helper simulation, **not** a network/full-Add benchmark.

Controlled slow responses, one failed completion, preserved successful sibling uploads, double click, navigation, owner transition and a stalled 60-second upload were tested. No successful cart status appears before final Add confirmation. Expired attachment references require explicit replacement; retry does not silently extend retention.

Completion across navigation is supported only inside the current open app. Closing/reloading a tab is not a durable background queue. Files remain memory-only; opaque uncertain-operation keys remain recoverable. Actual R2 latency/errors, real large-camera-image throughput and physical mobile keyboard performance still require an authorized environment/device check.

Raw measurements: `local-data/production-fixes/upload-browser-performance.json` and `gift-upload-performance.json`.

## E. Screenshot verification

Matched isolated captures use the baseline and changed code, the same synthetic private photo and a 1000px viewport height. Every directory below contains `cart-W.png`, `sticker-W.png`, `engraving-W.png`, `homepage-W.png` and `bounds.json`, where W is its width.

| Width | Before directory | After directory | Sticker before → after |
| --- | --- | --- | --- |
| 320 | `local-data/production-fixes/screenshots/before/320/` | `local-data/production-fixes/screenshots/after/320/` | 224² → 224² |
| 390 | `local-data/production-fixes/screenshots/before/390/` | `local-data/production-fixes/screenshots/after/390/` | 294² → 280² |
| 768 | `local-data/production-fixes/screenshots/before/768/` | `local-data/production-fixes/screenshots/after/768/` | 626² → 280² |
| 1024 | `local-data/production-fixes/screenshots/before/1024/` | `local-data/production-fixes/screenshots/after/1024/` | 626² → 280² |
| 1440 | `local-data/production-fixes/screenshots/before/1440/` | `local-data/production-fixes/screenshots/after/1440/` | 626² → 280² |

At 320px, available width already constrained the square; it is not made illegibly smaller. All captures assert document width does not exceed viewport width and collect zero page errors. Connected tests measure control/footer alignment and control containment at every required width. FAQ computed color equals Featured Gifts after the change. The main cart photo is visible inside its saved arrangement; the old separate gallery is absent.

Additional connected checkout/receipt/editor captures: `local-data/production-fixes/connected-screenshots/`. Machine-readable inventory: `local-data/production-fixes/screenshot-index.json`. These ignored local artifacts are not deployed media.

## F. Testing

Commands run from the indicated package directory. Logs are under `local-data/production-fixes/`.

| Check | Actual result |
| --- | --- |
| client: `npm.cmd run lint` | Passed, no warnings |
| client: `npm.cmd run build` | Passed; normal default noindex build, 23 routes, zero indexable/approved snapshots; no renewal/export |
| client: `npm.cmd test -- customer-polish production-fixes upload-performance production-evidence --output test-results/production-final` | 34/34 passed before the additional zero-value case |
| client: `npm.cmd test -- production-fixes -g zero-value --output test-results/production-zero` | Additional 1/1 passed; final rapid-editing rerun also 1/1 passed |
| client: `npm.cmd test -- production-evidence --output test-results/production-evidence-final` | Refreshed matched captures 5/5 passed; baseline capture 5/5 passed |
| client: `npm.cmd run test:contracts -- engraving-visual-contracts --enabled-checkout` | 4/4 passed; additional `-g historical` check 1/1 passed after removing the v1 sample text/panel |
| client: `npm.cmd run test:contracts -- final-handover-engraving-contracts --enabled-checkout --gift-box-shopping` | 4/4 passed |
| client: `npm.cmd run test:seo` | 84/84 passed |
| server: `npm.cmd run check` | Passed, 307 JavaScript files |
| server: `npm.cmd test -- test/checkout-payment.test.js` | 19 cases; final strengthened expiry results are included in the final full-suite log |
| server: `npm.cmd test` | **1,095 passed / 16 failed of 1,111**; exact same sixteen failing tests as baseline |
| Legacy browser selection: `npm.cmd test -- final-customization final-handover checkout-foundation` | 18 passed / 13 failed; exact same thirteen failures on baseline |

Earlier backend full run: 1,094 passed / 16 failed of 1,110. Baseline: 1,089 passed / 16 failed of 1,105. Five new cases passed and the failure names matched exactly. Final rerun: **1,095 passed / 16 failed of 1,111**, including the additional zero-value case and the strengthened both-expired regression. Both expiry cases and all nineteen payment cases passed.

Existing backend failures are one catalog deterministic-sorting test (also marks its parent suite failed), four reviewed source/bow/Box 1 inventory/overlay checks, one fixed-content SEO export expectation, and ten older unified-cart engraving/deferred-payment/accounting expectations. They reproduce on the baseline; production assets or policies were not changed to satisfy them.

Existing browser failures are the four `checkout-foundation` cases (COD layout, old order-first InstaPay, old order-first retry and admin delivery/accounting UI), two `final-customization` checkout cases (`changed-quote`, `cod`), and seven `final-handover` cases (clicked product loading, five viewport compositions and pending guest transition). Their fixtures/selectors contain older contracts and all thirteen reproduce before these changes. They were preserved rather than weakened. Exact names/logs are in `baseline-comparison.json`, `browser-regressions*.log` and `server-*-full*.log`.

Updated connected tests use current pre-order proof and owned edit-route contracts while retaining real API/storage-authorization assertions. Temporary diagnostic failures included a missing Gift Box fixture flag (corrected command above), a missing owned-recovery response in the new zero-value mock, and archive-only missing test binary/media setup. These were fixture/setup issues, not bypasses of merchant rate limits, authorization or validation. The both-expired regression was a genuine implementation gap and was corrected in code.

## G. Exact changed files

Runtime files modified:

```text
client/src/commerce/CartContext.jsx
client/src/commerce/CheckoutInstaPay.jsx
client/src/commerce/GiftBoxCartSummary.jsx
client/src/commerce/GiftBoxPreview.jsx
client/src/commerce/checkout-session.js
client/src/commerce/commerce.css
client/src/engraving/StandaloneVisualBuilder.jsx
client/src/engraving/LegacyEngravingBuilderPage.jsx
client/src/engraving/StudioControls.jsx
client/src/engraving/useStandaloneVisualBuilder.js
client/src/engraving/visual/VisualEngravingEditor.jsx
client/src/gift-box/FreeArrangementCanvas.jsx
client/src/gift-box/PersonalizationEditor.jsx
client/src/gift-box/StickerWorkspace.jsx
client/src/gift-box/personalization-submission.mjs
client/src/gift-box/private-photo-upload.mjs
client/src/gift-box/sticker-workspace.css
client/src/home-media.css
client/src/pages/CartPage.jsx
client/src/pages/CheckoutPage.jsx
client/src/pages/GiftBoxBuilderPage.jsx
server/src/commerce/checkout-payment.js
server/src/commerce/orders.js
server/src/commerce/routes.js
server/src/models/CheckoutIntent.js
shared/engraving/visual-design.mjs
```

New runtime files:

```text
client/src/commerce/upload-batch.mjs
client/src/commerce/useGiftBoxPhotos.js
client/src/engraving/visual/text-metrics.js
```

Tests modified:

```text
client/connected-e2e/engraving-visual-contracts.spec.js
client/connected-e2e/final-handover-engraving-contracts.spec.js
client/connected-e2e/visual-engraving-fixture.js
client/e2e/customer-polish.spec.js
server/test/checkout-payment.test.js
```

New tests/documentation:

```text
client/e2e/production-evidence.spec.js
client/e2e/production-fixes.spec.js
client/e2e/upload-performance.spec.js
docs/FINAL_PRODUCTION_FIXES.md
```

Ignored diagnostic artifacts include logs, measurements, captures and a baseline checkout under `local-data/production-fixes/`; ordinary test runners also create ignored fixtures/build outputs. Baseline-only helpers point at the existing test Mongo executable and copied local media so the archive can run equivalently. Application runtime/deployment configuration was not changed for this setup. No dependency was added.

## H. Remaining limitations

- No production deployment or provider validation was authorized. Live 409 record-level attribution and real R2 throughput remain unverified.
- Issued instructions whose amount changes, saved-proof conflicts and exhausted reference capacity still require reconciliation. Automatically replacing these would risk duplicate transfers.
- SPA background work is not durable across tab close/reload. Uncertain server mutations retain owned recovery; image data is not persisted.
- Baseline regression failures remain unresolved outside this focused change. Reviewed source-media inventory needs owner review, not fabricated replacements. Historical/payment-policy test expectations need separate reconciliation with current contracts.
- Synthetic layout/keyboard/network tests do not substitute for a physical phone or external provider smoke test.

## I. Release readiness

**NO-GO for declaring production handover complete.** The requested local fixes and focused verification are implemented, but live InstaPay/private-upload reliability has not been verified on a deployed candidate, and the known baseline failures remain. A deployment/provider smoke check would require separate authorization. Reconciliation stops must remain in place throughout that check.

