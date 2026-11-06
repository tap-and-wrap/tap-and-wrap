# Standalone engraving: implementation verification

Latest local release-gate result: **406/406 default browser tests passed**. The account-recovery
fix and final verification are recorded in [ACCOUNT_RECOVERY_RELEASE_GATE.md](ACCOUNT_RECOVERY_RELEASE_GATE.md).
Earlier failures and BLOCKED assessments below are historical review evidence, superseded by that closure.
Local commit approval does not authorize push, deployment, schema writes or service activation.

Assessment: **READY FOR RELEASE REVIEW** for the local implementation. This is not
authorization to release or activate the service. No production connectivity,
merchant configuration, real payment or live provider readiness is claimed.

Baseline HEAD remains `c5f8a46e10de804f0dc5e82c4988cba42bcdd89f`.
Nothing was staged, committed, pushed or deployed. No production schema initializer,
importer, merchant seed or payment activation was run. Existing unrelated untracked
files and directories were preserved.

## Delivered scope

The dedicated three-step builder supports approved types, required item photos,
optional surface photos, explicit placement help, Arabic/English multiline Text,
versioned Icons and all four private Personal artwork subtypes. Appearance has no
surcharge and no physical-color guarantee. Drafts survive navigation in memory,
clear on owner changes and refresh, and never put personal content/files in browser
storage. There is no composited product preview or drawing canvas.

Admin configuration publishes immutable versions with stable IDs, revision conflicts,
transactional audit, independent type prices, option retirement and asset approval.
The nine EGP 100 definitions are reviewable source definitions/disposable fixtures;
they were not inserted into a merchant database.

The service has a separate quantity-one cart contract, server prices, owned private
upload roles, atomic replacement and merge, immutable add recovery even after
checkout, immutable historical order snapshots and no inventory claims. Mixed carts
remain intact but require separate checkouts. Product coupons/bundles exclude the
service. Legacy requests, Product and Gift Box contracts remain readable.

Orders preserve the positive service amount while payment collection is locked.
Server gates protect proof signing/submission, instructions, notifications, financial
collection, tracking and work. All physical items require inspection and accepted
final specifications before explicit payment authorization. Existing reconciliation
and settlement accounting verifies actual funds. Custody, unsuitable-item return and
cancellation remain independent of payment; customer property is never restocked.

## Reuse and new mechanisms

Reused: existing transactions, private R2 verification/retention/quota pipeline,
session-generation/CSRF/Origin boundaries, cart/checkout ownership, immutable orders,
settlement ledger, admin layout/revision/audit, private viewer and native dialog.

New: dedicated configuration model/registry, specification and snapshot validators,
engraving cart kind, owner-context signing, post-checkout add receipts, collection
authorization policy, physical custody workflow, builder/draft provider and dedicated
admin configuration. Gift Box changes are limited to additive snapshot dispatch and
test fixture/assertion maintenance; its business feature was not redesigned.

## Executed checks

All database tests used disposable local fixtures with scrubbed configuration. Only
the external storage adapter was mocked in connected commerce tests. Browser external
network requests were blocked. Logs below are local ignored artifacts in
`server/.cache/`.

| Check | Result | Log |
| --- | --- | --- |
| Server `npm test` | 908 passed, zero failed | `engraving-backend-release-review.log` |
| Latest engraving tests, including copied-font hashes/licenses | 21 passed | `engraving-assets-verified.log` |
| Strict snapshot regression selection | 57 passed | `engraving-snapshot-final.log` |
| Server `npm run check` | 274 JavaScript files passed | `engraving-check-final.log` |
| Selected frontend regressions through `npm test` | 82 passed; owned fixture exited cleanly | `engraving-frontend-owned.log` |
| Engraving browser/API/database contracts | 4 passed | `engraving-release-screenshots.log` |
| Existing enabled checkout connected contracts | 3 passed | `engraving-ordinary-connected-final.log` |
| Accepted Gift Box shopping/checkout connected contracts | 8 passed | `engraving-gift-connected.log` |
| `npm run test:seo` | 65 passed | `engraving-seo-final.log` |
| Source lint | Passed | `engraving-lint-final.log` |
| Scrubbed Vite production build and SEO output generation | Passed, noindex output | `engraving-build-final.log` |

These selections overlap; do not add their counts into a claimed unique test total.
The full server run preceded the final font-integrity assertion; the latest focused
21-test run verifies that addition and final versioned font metadata.

Frontend selection: `service-requests.spec.js checkout-foundation.spec.js
commerce.spec.js admin-revision.spec.js batch1-auth.spec.js`. Lint used
`npm.cmd run lint -- --ignore-pattern "test-results*/**"` to exclude generated
browser-extension artifacts. A plain lint attempt had generated-artifact warnings,
not source errors. The isolated production build used Vite's build API plus the
project SEO generator with a fresh allowlisted environment, noindex and an ignored
`client/test-results-engraving-build` output, preserving existing release outputs.

### Failures, corrections and verification limits

- An early configuration test exposed Mongoose's initial document version behavior;
  publication now uses an explicit immutable revision counter. Revision/conflict and
  historical-version tests pass.
- A font test incorrectly assumed both bundled fonts used OFL. Verified notices show
  Amiri OFL and Rochester Apache 2.0; exact copied-file hashes and both actual license
  notices are now tested. Production merchant approval is still required.
- Existing stale test expectations for Soft Toys naming, personalized COD visibility,
  shipping/payment copy and session-keyed transient UI were corrected. Cancellation,
  ownership and final verified cache assertions remain enforced; no payment gate was
  weakened to satisfy tests.
- The original Windows Playwright-managed dev-server process tree did not terminate
  reliably. The browser launcher now owns a scrubbed IPC Vite child, refuses an
  occupied test port and closes it explicitly. The 82-test rerun exited successfully.
  An accidental overlapping fixture run failed on port/artifact contention; subsequent
  runs were serialized with separate outputs and passed.
- The broad default frontend run was stopped after reaching Gift Box calibration
  tests that expected an enabled builder while the default fixture explicitly sets
  `VITE_GIFT_BOX_BUILDER_ENABLED=false`. Its earlier relevant failures were corrected
  and rerun in the passing selections above. **The entire default browser suite is
  not claimed green or complete.** Eight enabled real connected Gift Box tests passed;
  accepted Gift Box calibration was not reopened in this task. Review this remaining
  suite/configuration mismatch before treating default `npm test` as a release gate.
- Screenshot inspection caught route loading-state captures. Final captures now wait
  for actual cart/order/admin content and fonts. Visual review also exposed a narrow
  merchandise-photo column around service summaries; engraving-only cart/order
  layouts now use a scoped single column with an automated minimum-width assertion. Assertions also verify the owned
  order workflow before testing absence of payment controls.

## Pricing, privacy and operational evidence

The focused tests exercise all nine definitions, admin-created types/placements,
price changes, configuration retirement/history and invariant type-only pricing
across modes/fonts/appearances/placements. English and Arabic content are preserved.
Each Personal subtype reaches a real isolated order snapshot. Identical designs for
different physical-item keys remain distinct. Lost Add responses recover exactly one
line; replay after checkout cannot reinsert it.

Ownership tests cover exact owner/item/role bindings, actual image verification,
expiry without extension, atomic replacement, guest-to-account transfer and guest
rotation isolation. Public summaries omit raw private references. Admin file bytes
require an explicit View action. Native viewer focus trapping, Escape and focus
restoration are exercised with real isolated authenticated fetches.

Direct API attempts before authorization cannot sign/submit normal payment proof,
invite payment through supported notifications/WhatsApp, collect normally or start
engraving. Positive order totals survive while amount due now remains zero. An
explicit unexpected-funds reconciliation exception cannot authorize work. Every
line must have inspected, accepted final design before collection authorization.
Tests cover clarification/proposal sequence, stale acceptance, unsuitable/cancelled
items and safe return. The connected lifecycle verifies receipt, inspection, customer
acceptance, authorization, proof, reconciled payment, engraving and actual return
with empty inventory claims.

Browser coverage includes 320/390/440/1440 widths, overflow assertions, native radio
keyboard controls, error feedback, memory draft navigation, reduced-motion setting,
cart editing and no page errors in the builder flow. The suite captures fixture
artwork, not merchant product imagery or a simulated final laser result.

## Files and release prerequisites

Exact authored inventory: [STANDALONE_ENGRAVING_FILES.txt](STANDALONE_ENGRAVING_FILES.txt)
(45 modified, 31 new files). Full contracts, endpoints, schema/index delta, guarded
future preparation commands, backend-first rollout and rollback are in
[STANDALONE_ENGRAVING_IMPLEMENTATION.md](STANDALONE_ENGRAVING_IMPLEMENTATION.md).

Before activation: independent code/security review of upload ownership, idempotency,
payment gates and custody; separately approved production schema preparation; real
merchant placements/material restrictions; font/icon approval; handoff/return,
handling/liability and retention policies; and separately authorized real-topology
storage/session/provider smoke tests. Intake flags remain disabled by default.
Operations and reconciliation remain available when intake is disabled.

No runtime startup writes, production seeding, automatic asset approval or payment
flag changes are part of this implementation. Local verification is sufficient for
review, not evidence of live readiness.

## Final screenshot index

The 25 links below point to local ignored test artifacts and are not committed assets.

- [admin-configuration-1440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-1266e-nt-preserves-conflict-draft/admin-configuration-1440.png)
- [admin-custody-1440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-61666-ayment-engraving-and-return/admin-custody-1440.png)
- [admin-custody-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-61666-ayment-engraving-and-return/admin-custody-390.png)
- [cart-1440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/cart-1440.png)
- [cart-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/cart-390.png)
- [checkout-1440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/checkout-1440.png)
- [checkout-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/checkout-390.png)
- [step-1-1440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-1-1440.png)
- [step-1-320](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-1-320.png)
- [step-1-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-1-390.png)
- [step-1-440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-1-440.png)
- [step-2-drawing-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-drawing-390.png)
- [step-2-fingerprint-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-fingerprint-390.png)
- [step-2-handwriting-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-handwriting-390.png)
- [step-2-icons-1440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-icons-1440.png)
- [step-2-photo-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-photo-390.png)
- [step-2-text-1440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-text-1440.png)
- [step-2-text-320](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-text-320.png)
- [step-2-text-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-text-390.png)
- [step-2-text-440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-text-440.png)
- [step-3-1440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-3-1440.png)
- [step-3-320](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-3-320.png)
- [step-3-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-3-390.png)
- [step-3-440](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-3-440.png)
- [unpaid-order-390](../client/test-results-contracts/browser-59263/engraving-contracts-connec-dd902-d-inspection-gated-checkout/unpaid-order-390.png)

## Subsequent final release review

The original test counts and screenshots above are historical implementation evidence.
See [STANDALONE_ENGRAVING_RELEASE_REVIEW.md](STANDALONE_ENGRAVING_RELEASE_REVIEW.md)
for custody/copy/runner corrections and completed rerun outcomes. The file inventory
has been updated to include those review changes; it now supersedes the original
45-modified/31-new counts quoted above. No production authorization is implied.
