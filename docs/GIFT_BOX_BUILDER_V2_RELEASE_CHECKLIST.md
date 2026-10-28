# Build Your Gift Box V2 — release-readiness checklist

This checklist authorizes no operational action. Public gift Add to Cart and checkout stay closed. Successful disposable synthetic tests are not real packing approval, provider verification or merchant configuration. Review the Phase 5B.4 implementation report for the actual code and verification results.

## Code prepared locally

- [x] Strict versioned configuration, canonical identity, saved-settings pricing and independent builder inventory contracts (Phase 5B.1).
- [x] Explicit Product/gift cart lines, mixed totals, aggregate builder demand, safe guest merging and gift promotion exclusions (Phase 5B.2).
- [x] Internal transactional mixed orders, immutable snapshots, stock consumption, policy fences, idempotent recovery and inspected once-only restocking (Phase 5B.3).
- [x] Customer/admin order presentation, private literal card messages, Product-aware tracking and existing notification/payment protections (Phase 5B.3).
- [ ] Review Phase 5B.4's local draft/approval/history/withdrawal implementation and recorded test results.
- [ ] Review failure and rollback procedures with the owner before authorizing any real configuration.

## Owner information and explicit approvals still required

| Review | Required evidence or decision | Release criterion |
| --- | --- | --- |
| All 12 physical box policies | Complete the [packing worksheet](GIFT_BOX_BUILDER_V2_PACKING_WORKSHEET.md) for `box-1` through `box-12`, with exact IDs, individual/category/mixed limits and tested combinations | Each intended live box has a current explicitly reviewed policy; unsupported boxes remain unavailable |
| Region and geometry review | Actual interiors, heart inserts, circles, basket, usable depth, rim/lid clearance and oversized-plush placement | No unreviewed photo boundary is presented as measured physical fit |
| Builder-to-policy region mapping | Compare the current builder's draft region IDs and inside/beside metadata with the exact policy-allowed IDs | Future Add to Cart sends the intended associations; matching an ID never approves the photo boundary or certifies fit |
| BOX-11 | Two separate compartments, region ownership, per-compartment limits, no bridging, real overhang/elevation/stability checks | Approved conservative compartment rules and retained trial evidence |
| BOX-1 correction | Compare the unchanged original with the separate alpha-correction candidate on light/dark/checkerboard backgrounds | Separate owner artwork approval; do not change the current manifest during Phase 5B.4 |
| Final component definitions | Confirm all names and retail chocolate units, ribbon names/colors, paid gift-card behavior | Recognized immutable IDs, correct presentation, no inferred Product relationship |
| Final prices and stock | Confirm saved integer-piastre prices, complimentary approvals, tracked quantities, Made-to-Order availability and ribbon status | No null-price fallback, stock synchronization or fabricated stock |
| Payment method policy | Review existing personalized-order InstaPay-only rules and any requested future exception | No new method or automatic COD allowance without separate approval |
| Delivery handling | Confirm separately agreed, pending delivery charges and customer wording | Unknown delivery stays pending, never silently free or a reinstated fixed fee |
| Customer/admin fulfillment views | Review immutable breakdowns, privacy, packing instructions and sensible unavailable artwork states | No current-price substitution, unsafe text or private arrangement leakage |

## Future operations requiring separate authorization

- [ ] Prepare a reviewed persistent MongoDB schema/index plan for policy drafts, immutable publications, audit records and the operational fence. Verify the exact authorized target/topology before writes. Runtime startup remains read-only; a missing schema fails closed.
- [ ] Define backup, change journal, publication/withdrawal permissions, unknown-outcome recovery and rollback procedures. Publish/withdraw the policy and matching fence atomically; retain immutable prior versions and order references.
- [ ] Explicitly authorize real policy entry and approval only after packing evidence is complete. Do not seed synthetic policies into a merchant database.
- [ ] Review the owner-approved create-only initial-settings plan, then separately authorize any persistent provisioning. Inspect existing saved settings first: every existing record, including null-price settings, must be preserved and reviewed rather than overwritten.
- [ ] Separately approve versioned media/manifest preparation, including any approved BOX-1 candidate adoption while retaining its original. No original image may be edited by deployment tooling.
- [ ] Separately authorize Cloudflare R2 configuration and uploads. Verify target account/bucket, immutable keys, CORS, media allowlists and approved public URLs; never fabricate production URLs.
- [ ] Verify approved media derivatives against the reviewed source/version and include an honest historical-unavailable fallback.
- [ ] Authorize guarded staging acceptance against its exact dedicated database only after the schema and data review. Recheck publication/withdrawal, mixed-cart pricing, concurrent stock races, retry recovery and rollback without live provider calls.
- [ ] Review the real builder Add to Cart connection separately. Policy approval must not activate that control. Preserve current selections, canonical identity, private messages and owner/session rules.
- [ ] Review the current builder draft-region identities against the approved policy's allowed regions before activation. Resolve unsupported or stale associations explicitly; do not copy photo-study boundaries into authoritative geometry or approve them automatically.
- [ ] Review mixed-cart checkout acceptance separately: ordinary products plus several gift configurations, discounts only on eligible Products, separate chocolate inventory, immutable snapshots, pending delivery and existing payment restrictions.
- [ ] Verify real receiving accounts, order-first private proof, settlement/refund review and notification/tracking permissions through separately authorized safe procedures.
- [ ] Perform final 320px, 390px, tablet and desktop acceptance, keyboard/focus, touch dragging, reduced motion, no overflow, and private message/proof access checks with approved media.
- [ ] Obtain a new explicit release authorization before changing any production launch flag or removing the unconditional public gift-checkout fence. Review both existing global checkout flags and the independent gift launch gate.
- [ ] Approve a staged rollout and rollback plan: close new gift commerce first, preserve owned recovery of committed orders, withdraw incompatible policies atomically, retain historical snapshots and reconcile stock/payment/outbox outcomes before retries.
- [ ] Authorize deployment, upload, persistent writes and launch as separate concrete operations. No checklist checkbox grants those permissions.

## BOX-1 reference to preserve

The original and candidate remain described in [the BOX-1 candidate report](GIFT_BOX_BUILDER_V2_BOX1_CANDIDATE.md). The candidate is local-only under `server/.cache/gift-box-phase4/box-1-candidate/alpha-rgb-candidate-v1/`. Technical alpha/pixel verification does not grant owner artwork approval or physical fulfillment approval. Retain both source and candidate; do not adopt a new manifest or media version until separately authorized.

## Exact blockers before real Add to Cart

Real Add to Cart remains blocked until the owner has supplied and approved physical policies for each offered box, the necessary geometry/media/BOX-1 reviews are complete, approved media and persistent schema/settings have been prepared under separate authorization, and real mixed-cart/payment/delivery acceptance has passed. The builder control and unconditional checkout fence require their own later reviewed code/launch instruction. No draft, approved policy record, admin attestation or photo arrangement can open them by itself.
