# Build Your Gift Box V2 — Phase 5B.4: physical approval and release readiness

Implemented locally on `feature/gift-box-builder-v2`, 28 October 2026. Restricted administration now connects the existing physical-rule validator to immutable reviewed publications and the transactional checkout fence. **Public gift Add to Cart and gift checkout remain closed.** No real physical policy was approved, no photo geometry was certified and no persistent merchant database was used.

## Exact Phase 5B.4 files

Created (15):

- `server/src/models/GiftBoxPhysicalPolicy.js`
- `server/src/models/GiftBoxPolicyPublication.js`
- `server/src/gift-box/policy-contract.js`
- `server/src/gift-box/policy-administration.js`
- `server/src/gift-box/policy-store.js`
- `server/test/gift-box-policy-contract.test.js`
- `server/test/gift-box-policy-admin.test.js`
- `client/src/pages/AdminGiftBoxPoliciesPage.jsx`
- `client/src/gift-box/policies.css`
- `client/e2e/gift-box-policies.spec.js`
- `client/playwright.gift-box-policies.config.js`
- `client/connected-e2e/gift-box-policy-contracts.spec.js`
- `docs/GIFT_BOX_BUILDER_V2_PACKING_WORKSHEET.md`
- `docs/GIFT_BOX_BUILDER_V2_RELEASE_CHECKLIST.md`
- `docs/GIFT_BOX_BUILDER_V2_PHASE5B4.md`

Modified (11):

- `server/src/gift-box/routes.js`
- `server/src/gift-box/cart-pricing.js`
- `server/src/gift-box/checkout-guard.js` — comment updated to distinguish fixture composition from the restricted owner workflow.
- `server/src/models/GiftBoxFulfillmentPolicyFence.js` — comment updated; fence fields/index/transaction behavior unchanged.
- `server/src/config/schema.js`
- `server/test/helpers/connected-api-server.js`
- `server/package.json`
- `client/src/App.jsx`
- `client/src/admin/AdminLayout.jsx`
- `client/src/gift-box/api.js`
- `client/src/services/api.js`

Total: **26 source/test/config/documentation files**. Prior uncommitted phases and unrelated local work are preserved. No dependency/lockfile, environment file, original artwork, authoritative asset manifest, geometry definition, inventory/accounting/order engine, promotion, payment, delivery, tracking or notification implementation changed. Ignored `.cache/` helpers/logs, disposable databases, browser artifacts and isolated build output are verification evidence.

## Restricted owner interface and API

`/admin/gift-box/fulfillment-policies` uses the existing verified administrator route and shared AdminLayout. It is available independently of public builder visibility; the existing backend builder gate and prepared schema are still required. Query keys include the verified session owner; new `safePut` follows the existing generation and CSRF handling used by other mutation helpers.

The structured form selects one of the twelve fixed boxes and provides editable region/compartment rows, compatible component selection, individual maxima, region permissions, oversized-plush controls, total/category/mixed caps and packing instructions. Quantities start blank. The only prefilled numeric finishing quantity is the existing contract's one ribbon/card per completed box. No physical capacity, measurement, compatibility or result is supplied by default.

Owners can save a pending draft, review its entire permitted envelope, explicitly approve a saved version, inspect earlier versions and explicitly withdraw an active version. Unsaved form changes disable approval. A 409 retains the local draft and offers deliberate reload. Form controls, linked field errors, visible focus, native disclosures, literal text and current design tokens follow existing admin conventions. The interface explains that owner attestation, photo geometry, artwork approval and commerce launch are separate.

All endpoints are under `/api/v1/admin/gift-box/fulfillment-policies` and share existing private/no-store headers, verified session authentication, administrator authorization, CSRF and strict Origin checks:

| Method and suffix | Contract |
| --- | --- |
| `GET /` | The twelve box states and fixed component IDs/categories with saved display names; no implicit draft creation. No list query fields accepted. |
| `GET /:boxId?historyPage=1` | Current draft/active version, latest twenty publications and latest forty allowlisted audit events. History is paginated in twenty-version pages. |
| `PUT /:boxId/draft` | Strict `{ expectedRevision, rules, packing }`. Either whole rules/packing section may be null when not supplied. Non-null rules undergo the existing full cross-field policy validation. |
| `POST /:boxId/approve` | Strict `{ expectedRevision, confirmPackingTested: true, confirmSafeTransport: true, confirmLidChecked: true, evidence }`. Only the saved draft can be approved. |
| `POST /:boxId/withdraw` | Strict `{ expectedRevision, reason }`, requiring an active saved publication and matching operational fence. |

Unknown boxes, component IDs, fields, forged status/actor/time/version/hash, invalid quantities, duplicate identities and unsupported references are rejected. Browser claims cannot approve geometry, launch commerce or alter published versions. Empty drafts can be retained but cannot be approved.

## Physical rules and evidence

The runtime `gift-box-fulfillment-policy-v1` contract and its pure validator are unchanged. Draft rules reuse its regions, compartments, component rules and limits. Exact box/component identities, one allowed region per placement, inside/beside restrictions, oversized plush and conservative counts remain explicit. BOX-11 still requires exactly two separate compartments with distinct inside associations; shared inside regions and unauthorized bridging labels fail.

Approval adds conservative administrative requirements: at least one compatible ribbon, all three mixed-category pair limits and the three-category limit must be explicitly recorded, alongside reviewed packing instructions. Under the existing v1 semantics, a mixed cap applies whenever at least two listed categories are present. The three-category cap also constrains every pair; zero there prohibits all mixed contents. The form, history and worksheet explain this. If the desired safe restriction cannot be represented conservatively, leave approval pending rather than broaden the rule envelope.

Packing instructions use strict fields `lidMode: must_close | open_presentation | not_applicable`, `clearanceNotes`, `transportNotes`, `plushHandlingNotes` and `compartmentNotes`. Notes are bounded to 1,000 Unicode code points. Draft notes may be blank. Approval requires substantive lid/clearance and transport instructions, plush handling when plush is compatible and separate-compartment instructions for BOX-11. These are owner instructions and review evidence, not a dimensions or physics model.

Approval evidence is trimmed literal well-formed Unicode, 20–2,000 code points; withdrawal reasons are 10–1,000. The server requires all three explicit packing/transport/lid confirmations. It records the verified administrator, server timestamp and immutable attestations `{ packingTested: true, safeTransport: true, lidChecked: true, physicalAccuracyComputerVerified: false }`. The computer has not verified that the trial actually occurred or that every physical arrangement fits. An administrator checkbox alone is never described as a measured fit guarantee.

## Drafts, immutable versions, hashes and audit

`GiftBoxPhysicalPolicy` is one mutable administration head per fixed box: optional draft, active publication pointer, numeric version counter, revision, editor identities and bounded withdrawal records. Saving a draft consumes its loaded revision, including the first missing-record revision zero. Saving a replacement draft preserves the existing approval until explicit superseding approval or withdrawal.

`GiftBoxPolicyPublication` stores the complete approved v1 policy, packing instructions, evidence, attestations, administrator/time and two hashes. Every approval creates `gift-box-<boxId>` / `v<N>` with a server-derived numeric version, clears the draft and supersedes the prior pointer. Published content is immutable; document mutations and query update/replacement/bulk-write paths are rejected. Unique indexes protect box/version and policy identity/version. Model deletion is forbidden outside the exact empty-URI test process and disposable loopback database, allowing the established isolated fixture cleanup only. No application delete route exists.

Semantic canonicalization sorts regions, compartments, component rules, allowed region IDs, mixed-category sets and mixed rules. It preserves associations and packing instructions. `contentHash` hashes the versioned canonical box/reference/rules/packing envelope, excluding changing approver/time/version counter. Equivalent collection ordering yields the same content hash; changed limits, associations, instructions or reference versions remain distinct. `policyHash` uses the existing server fingerprint over the complete approved v1 policy, including its generated approval/version metadata, so it exactly matches checkout's existing fence contract.

The bounded administration head permits 1,000 published versions per box and at most 1,000 withdrawal records; these are document/history abuse bounds, never packing capacities. Reaching the bound requires separately reviewed archival work. Existing version content and historical order references must be retained.

Draft saves, approvals and withdrawals use snapshot/majority transactions. Each rechecks the administrator in the User collection and conditionally writes the loaded User revision without changing `authVersion`, serializing a concurrent revocation. The loaded box revision protects concurrent administrators. Audit failure rolls back the head, publication, operational fence and administrator revision together. Standard driver transaction retries remain; an explicit retry after a committed but lost approval response sees the advanced revision and must reload, rather than publishing another version silently.

Atomic `AdminAudit` actions are `gift_box.policy.draft_saved`, `gift_box.policy.approved` and `gift_box.policy.withdrawn`. Audit details contain bounded identifiers, revisions, hashes and confirmation flags; the immutable publication retains full approval evidence. Withdrawal records retain the verified actor, server time and bounded reason, with `reasonHash` linked to the same immutable audit event. Private evidence/notes are not copied into tracking or public cart responses.

## Operational fence, resolution and withdrawal

Approval writes the immutable publication, active head, matching approved `GiftBoxFulfillmentPolicyFence` and audit in one transaction. Withdrawal conditionally changes that same box/policy/version/hash fence to withdrawn, clears the active pointer, retains the immutable publication/reason record and audits the operation atomically. Partial publication or partial withdrawal cannot commit.

The cart pricing context now loads stored publications with its existing coherent session. The resolver validates current strict rule references, packing readiness, evidence, attestations, server identity/version metadata and both hashes, then requires matching active head/version and approved operational fence. It has no process cache. Missing/unprepared storage grants no approval; corrupt, absent, mismatched, withdrawn or obsolete records fail closed. Existing saved gift rows can show an honest unavailable state.

Withdrawal deliberately does **not** depend on current eligibility. An immutable approval with an old catalog/media/geometry version remains withdrawable by its stable saved box/version/hash and matching fence, even though fresh quotes reject it. The admin interface marks an incompatible active version for renewed review. This prevents a future reference-version bump from trapping an operational approval in an unwithdrawable state.

Checkout's existing transaction, aggregated stock consumption and policy-fence revision write remain unchanged. Concurrent withdrawal or publication conflicts with that fence; retry must revalidate the fresh policy and review digest. Disposable tests prove withdrawal during checkout rolls back consumption and order creation. Previously committed owner/key/hash recovery remains available before current-policy revalidation; prior order snapshots retain their original immutable references and amounts.

## Separate commerce and visual approvals

An approved physical policy cannot activate the public Add to Cart API: new configured-line quote preparation has an unconditional release fence outside the existing exact-target synthetic test composition. There is no launch flag, request field or alternate route that bypasses it. Existing public strict checkout still unconditionally throws `GIFT_BOX_CHECKOUT_DISABLED`, including with global checkout enabled and a synthetic internal intent. The public builder control and old V2 request-submission closure are unchanged.

Three states remain distinct: the unchanged photo-study checks describe visual placement; a current reviewed policy can establish compatibility with explicit owner rules; a missing/obsolete/withdrawn policy leaves physical compatibility unapproved. Neither rule compatibility nor visible containment certifies a real footprint, depth, clearance or transport safety. BOX-11's actual overhang and bridging still need physical checks. Preview proportions, dragging, keyboard/touch behavior and authoritative geometry status were not changed.

The real static fallback registry remains empty, and no real stored approvals were created. The original BOX-1 image, local alpha-correction candidate, manifest and authority are unchanged. The candidate's read-only SHA-256 still matches `0a0477ba1be45bb1a4253f23c5709cc60b5ddd9f74be1a26c2bac0ddebd364e6`. Its technical verification does not approve artwork or physical fulfillment.

## Owner worksheet and release checklist

The [owner packing worksheet](GIFT_BOX_BUILDER_V2_PACKING_WORKSHEET.md) has a pending register for all twelve boxes and reusable blank trial tables for exact component IDs, individual/category/mixed quantities, inside/beside handling, ribbon/card, lid/clearance, transport and BOX-11's separate compartments. No physical result is populated. Retain real trial evidence separately and describe/reference it in the bounded private admin record.

The [release checklist](GIFT_BOX_BUILDER_V2_RELEASE_CHECKLIST.md) distinguishes implemented code, missing owner decisions and future operations requiring explicit authorization. It covers physical policies, geometry/region mapping, BOX-1 artwork, versioned media/R2, persistent schema, create-only settings and existing-record conflicts, final names/prices/independent stock, Add to Cart, mixed checkout, personalized payment, pending delivery, order views, mobile/accessibility, flags and rollback.

## Verification and actual results

All approval/publication/withdrawal writes used fresh disposable loopback replica sets and explicitly synthetic evidence. Browser tests use isolated intercepted APIs or the guarded real local API fixture. No developer credentials, persistent database, production provider or real physical approval was used.

| Working directory / command | Actual result |
| --- | --- |
| `server`: `npm.cmd test` | **799 passed**, zero failed, skipped or cancelled; final command exit 0. |
| `server`: `npm.cmd run check` | **237 JavaScript files passed** syntax checks. |
| `client`: `npm.cmd run test:contracts` | **21 passed**, all **6/6** fresh per-file fixture batches; clean API/database shutdown and command exit 0. |
| `client`: `npm.cmd test -- --output test-results-gift-box-phase5b4-full --reporter list` | Full browser regression run in progress. |
| `client`: `npm.cmd test -- --config=.cache/phase5b4-policy-ui.config.js --output=test-results-gift-box-phase5b4-ui-final` | **11/11 passed**, covering structured drafts, approval/history/withdrawal, missing attestations, conflicts, BOX-11, access denial and four responsive widths. |
| `client`: same isolated policy config, focused obsolete-reference and responsive followup | **5/5 passed**; one additional distinct policy case and four repeated responsive checks. **12 distinct policy UI cases** total. |
| `client`: `npm.cmd run lint` | Final whole-client result pending browser artifact cleanup; targeted modified/new UI lint passed. |
| project root: `node server/.cache/phase5b4-client-build.mjs` | **Passed**, Vite production build of **1,812 modules**, plus offline SEO: **22 routes**, **zero indexable**, checkout offers disabled. |
| project root: `git diff --check` | Passed; existing LF/CRLF conversion notices are informational. |

The ignored build helper invokes the same production Vite and SEO APIs as `npm run build`, with an allowlisted OS-only environment, no dotenv loading, loopback API and tracking/indexing/builder disabled. Output stays under `client/test-results-gift-box-phase5b4-build/`, preserving existing `client/dist/`. No SEO input/publication, database read or deployment occurs.

Focused pure contracts pass **14/14**; focused policy API/integration passes **23/23**. Coverage includes administrator/session revocation, strict Origin/CSRF, malicious fields, semantic hashes, current revisions/concurrent approval, approval evidence, immutable publication identities, all-action audit rollback, missing/mismatched fence, invalid combinations/BOX-11, stored-policy quotes, withdrawal during checkout, obsolete-version withdrawal, historical order references/recovery and continued public Add to Cart/checkout closure. The existing product/mixed-cart/order/inventory/payment/proof/accounting/tracking suites are included in the full backend run.

Initial focused failures were test expectation/locator mismatches: strict Mongoose correctly rejected an immutable evidence mutation; existing RequireAdmin renders in-place denial rather than redirecting; and connected form labels with option/count text needed accessible role selectors. Assertions were corrected to verify the actual required protections. No permission, runtime guard, rate limit or failing coverage was removed. The independent review identified the historical-withdrawal issue described above, which was fixed and given API/UI regressions.

Evidence logs are under `server/.cache/phase5b4-*.log`; key final logs are `phase5b4-backend-final.log`, `phase5b4-syntax.log`, `phase5b4-connected-full.log`, `phase5b4-browser-full.log`, `phase5b4-policy-admin-final.log`, `phase5b4-policy-connected-final.log`, `phase5b4-policy-ui-final.log`, `phase5b4-policy-ui-followup.log` and `phase5b4-client-build.log`. Screenshots/traces are under the corresponding ignored `client/test-results-gift-box-phase5b4-*` and `client/test-results-contracts/` directories. Phone and desktop screenshots were reviewed; tests cover 320px, 390px, tablet and desktop, no horizontal overflow, safe literal text, focus and private access.

## Remaining information, launch blockers and next phase

Every real box still needs actual packing trials, exact compatible components and quantities, conservative combination envelopes, approved region associations and supported inside/beside/oversized-plush behavior. Lid, depth, transport and BOX-11 compartment restrictions must come from owner evidence. Final geometry, actual policy-region mapping, BOX-1 candidate review and verified media remain separate missing approvals. Do not approve a photo-study boundary merely to make a policy pass.

Before real Add to Cart: separately authorize reviewed persistent schema preparation and policy entry/publication; review existing saved settings without overwriting owner edits; confirm final names/prices/independent inventory; approve and prepare versioned media/R2 under its own authorization; complete real customer/admin, mixed-cart, payment/delivery and accessibility acceptance. The owner must review the existing InstaPay-only personalized-order policy; no new payment method is enabled. Delivery remains pending separate confirmation, never silently free.

Recommended Phase 5B.5: bounded owner evidence entry and release preparation under a new explicit authorization. Review the completed worksheets, actual media/geometry and policy envelopes; prepare a concrete schema/data migration and policy publication/withdrawal/recovery runbook; then verify the exact authorized staging target and real approved assets/settings. Review any versioned policy-contract changes needed for restrictions v1 cannot represent conservatively. Keep public cart and checkout fences until all prerequisites and a separate explicit public-launch instruction exist.

This phase stops after local implementation and verification. No commit, push, merge, deployment, persistent provisioning, merchant database write, R2 upload, real approval, production flag change or public activation was performed.
