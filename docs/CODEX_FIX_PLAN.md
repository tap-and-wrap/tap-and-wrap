# Tap & Wrap Ordered Fix Plan

This plan is derived from `docs/CODEX_PROJECT_AUDIT.md`. Application files were not changed during the audit.

## Execution rules

- Preserve uncommitted work and inspect Git state first when Git metadata is restored.
- Fix one invariant cluster at a time; add failing tests before changing high-risk order/payment logic.
- Use a MongoDB replica-set test environment for transaction tests.
- Keep Paymob disabled until all card-payment P1 work and test-mode verification pass.
- Never use real payment proof/customer data in test fixtures.

## Ordered plan

| Order | Work item | Findings | Depends on | Difficulty | Risk | Verification |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Reconcile backend manifest/lock and remove or justify unused `multer-storage-cloudinary` | P0-01 | None | Medium | High | Fresh `npm ci`; `npm ls`; syntax/env checks; smoke imports on supported Node |
| 2 | Add CI baseline and server/frontend test harnesses | P1-13, P2-01 | 1 | Medium | Low | CI runs clean install, lint, syntax, unit/integration tests, client build/env checks |
| 3 | Specify the order/payment state machine and zero-total policy in a decision table | P1-03, P1-04, P1-06, P1-12 | 2 | Medium | High | Stakeholder-approved transition table plus failing table-driven tests |
| 4 | Implement order idempotency | P1-01 | 2 | Large | High | Concurrent replay test creates one order and reserves once |
| 5 | Implement unpaid card reservation expiry and late-payment reconciliation | P1-02, P1-04 | 3, 4 | Large | High | Expiry/callback/cancellation races; repeated expiry is idempotent |
| 6 | Centralize and enforce order/payment transitions for admin and Paymob | P1-03, P1-04, P1-06, P1-12 | 3, 5 | Large | High | Full method/status matrix, concurrent callbacks, refunds/cancellations |
| 7 | Require consistent Paymob identifiers and durable transaction idempotency | P1-05, P1-06, P3-03 | 2, 6 | Medium | High | Signed fixture suite for matching/conflicting/replayed callbacks |
| 8 | Make per-customer discount reservations atomic | P1-07 | 2 | Large | High | Concurrent limit-1 test; cancellation restoration and migration tests |
| 9 | Detect promotion restoration mismatches and add reconciliation tooling | P2-18 | 8 | Medium | Medium | Corrupt/missing/normal counter fixture tests and repair dry-run |
| 10 | Define and enforce owner/admin permissions | P1-08 | 2 | Medium | High | Authorization matrix integration tests for every admin mutation |
| 11 | Redesign sensitive upload delivery and upload-to-checkout binding | P1-09 | 2 | Large | High | Anonymous proof access denied; signed admin access expires; cross-order reuse denied |
| 12 | Add signature validation and orphan/retention lifecycle for uploads | P2-03, P2-04, P2-15 | 11 | Medium | Medium | Malformed/polyglot tests; abandon/failure/cancel/delete cleanup tests |
| 13 | Gate frontend production builds on non-local validated environment | P1-10, P2-11, P2-12 | 1 | Small | Medium | Missing/local production URLs fail; staging values build and smoke-test |
| 14 | Move frontend/API to first-party custom domains or a same-origin proxy and verify cookies | P2-13 | 13 | Medium | High | Login/logout/refresh across Safari/Firefox/Chrome privacy modes |
| 15 | Use the supplied logo in visible site chrome | P1-11 | None | Small | Low | Owner-approved responsive visual regression and asset check |
| 16 | Fix frontend lint errors and hook warnings | P2-01 | 2 | Medium | Medium | Zero lint problems plus admin/public form regression tests |
| 17 | Route-split public/admin bundles and tune image loading | P2-02, P3-02 | 16 | Medium | Medium | Chunk report, direct routes, Lighthouse on mid-tier mobile |
| 18 | Repair keyboard skip targets/mobile focus and redesign admin mobile nav | P2-06, P2-07 | 16 | Medium | Low | Keyboard + screen-reader checks at 320/375/768/desktop |
| 19 | Define accounting semantics and correct analytics/timezone queries | P2-10, P3-04 | 3 | Medium | Medium | Fixture ledger by order/payment state, Cairo-midnight tests |
| 20 | Decide/document pre- vs post-offer minimum subtotal behavior | P2-19 | 2 | Small | Medium | Bundle+code boundary cases and owner-approved copy |
| 21 | Harden email operations | P2-05 | 2, 13 | Medium | Medium | Disabled/partial/timeout/restart tests; Render staging delivery |
| 22 | Add expiring payment-result grants and callback-specific traffic controls | P2-16, P2-17 | 6, 7 | Medium | Medium | Expiry/tamper/replay and gateway burst/retry tests |
| 23 | Add CSP in report-only mode, then enforce | P2-14 | 13, 14 | Medium | Medium | No violations in catalog/admin/upload/Paymob staging flows |
| 24 | Implement catalog-aware SEO/pre-rendering and sitemap generation | P2-09 | 13 | Large | Medium | Non-JS HTML, social previews, schema validator, Search Console |
| 25 | Decide PWA scope and implement only the approved offline strategy | P2-08 | 17, 23 | Medium | Medium | Install/update/offline/private-cache test matrix |
| 26 | Resolve or remove unused Meta Pixel/variant/template scaffolding | P3-01 | Earlier schema/config work | Small/large depending decision | Low | No dead config; migrations and build if variants removed/implemented |
| 27 | Add only the approved selective animation plan | Animation plan | All must-fix items | Medium | Low/medium | Reduced-motion, mobile GPU, bundle, CLS/LCP, keyboard acceptance |

## Dependencies between critical fixes

```text
reproducible dependencies
        |
        v
test harness + CI
        |
        +--> state-machine specification
        |          |
        |          +--> expiry/reconciliation --> enforced transitions
        |                                      --> Paymob concurrency/identity
        |
        +--> order idempotency -------------------^
        |
        +--> atomic customer discount usage --> reconciliation
        |
        +--> upload proof privacy/binding --> cleanup/signature checks
```

## Must fix before animations

- P0-01 clean dependency install and reproducible Render build.
- P1-01 through P1-10 and P1-12/P1-13: idempotency, reservation expiry, state machine, Paymob races/identity, discount concurrency, authorization, proof privacy, zero totals, and tests.
- P1-11 supplied visible logo, because animation should be designed around the final brand asset.
- P2-01 lint, P2-02 route splitting, P2-06 accessibility/focus, P2-07 admin mobile, P2-13 cookie/domain deployment, and P2-14 CSP planning.
- Establish a measured performance baseline before adding `motion` or GSAP.

## Safe after launch

Only defer these if all P0/P1 work, deployment smoke tests, and legal/business approvals pass:

- P3-01 unused scaffolding cleanup, unless it interferes with dependency repair.
- P3-02 additional image hints after core LCP/CLS is acceptable.
- P3-03 migration from capped Paymob ID arrays if operational attempt counts are strictly limited and monitored.
- P3-04 analytics timezone polish if launch reporting explicitly documents the limitation.
- Optional PWA offline behavior.
- Catalog SEO enhancements beyond correct titles/canonical/robots/final-domain basics.
- React Bits animations.

## Suggested CI gates

1. Clean `npm ci` in both projects on the supported Node LTS version.
2. `npm ls --depth=0` without invalid/extraneous packages.
3. Server environment validation with test values.
4. Server syntax/lint/tests, including replica-set transaction tests.
5. Client environment validation, lint, tests, and build.
6. Dependency audit/SBOM after the local certificate trust issue is fixed.
7. Production-like E2E: browse -> customize -> cart -> pricing -> each checkout method -> tracking -> admin update/cancel.
8. Paymob signed callback fixture and race suite; real test-mode smoke only when credentials exist.
9. Accessibility keyboard/automated checks and performance budgets.
10. Staging Vercel/Render health, direct refresh, cookies/CORS, SMTP, uploads, and rollback smoke.

## Definition of launch-ready

- No P0 or P1 findings remain open.
- Clean installs, lint, build, tests, and security audit pass in CI.
- Stock/discount/offer restoration and payment state races have automated evidence.
- Paymob remains disabled unless test-mode end-to-end verification passes.
- Payment proofs are not anonymously public.
- Production URLs/domains/cookies/CORS are verified in real browsers.
- The actual Tap & Wrap logo is visible and approved.
- Deployment/runbook/rollback documentation is sufficient for a new operator.
