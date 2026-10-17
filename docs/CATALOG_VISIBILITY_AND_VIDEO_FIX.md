# Catalog visibility and video controls

17 October 2026. Local work based on `cf3b11898c959b259cbf292058607038f8704ae2`.

## Scope and readiness

The guarded visibility operator and transparent video controls are **locally ready for review within the tested scope**. **The production catalog has not been updated.** No production/staging connection, provider operation, persistent environment modification, commit, push or deployment was performed. Checkout, custom intake, email, tracking and indexing settings were not changed. Existing untracked source/backups and the previous schema-initialization report remain preserved. HEAD remains `cf3b118`.

Production counts below are owner-supplied facts, not a new database inspection. A production read-only preflight is still required before any separately authorized apply.

## Exact changed-file manifest

Modified:

- `client/src/components/PublicContent.jsx`: transparent hero-film control and honest blocked-autoplay guidance.
- `client/src/components/ServiceFilm.jsx`: transparent service-film controls, separate from navigation.
- `client/src/components/useVideoPlayback.js`: shared pointer-focus handler and a focused correction preserving manual Play during lazy-source/reduced-motion transitions.
- `client/src/home-media.css`: full-film transparent hit areas, keyboard-only focus/label cues, hero copy permits pointer interaction with the underlying film while CTA links remain interactive.
- `client/e2e/media-experience.spec.js`: normal-state transparency, genuine keyboard navigation, pointer/touch regressions and sanitized failure diagnostics; browser logging no longer incorrectly identifies Chrome as Edge.
- `client/e2e/permanent-visibility.spec.js`: unpriced Draft/Hold names, canonical WhatsApp enquiries, working image previews and homepage/Shop fallback cards with no owner picks.

Added:

- `server/scripts/restore-inherited-visibility.js`: offline-default operator, explicit read-only inspection, guarded transactional apply and conservative rollback.
- `server/test/inherited-visibility-operator.test.js`: full-size synthetic preflight, transaction, repeat, drift, concurrent-operator, purchase-gate and rollback tests.
- `docs/CATALOG_VISIBILITY_AND_VIDEO_FIX.md`: this report/runbook.

No model, runtime public filter, admin purchase rules, Worker, alias registry, media asset, dependency or deployment configuration was changed. Ignored browser/build artifacts are not release source.

## Before and after expectations

| Property | Required before apply | Expected afterward |
| --- | --- | --- |
| Products | Exactly 1,595 | Same 1,595 identities/documents |
| Visibility | Missing on every product | `public` on those exact records |
| Draft / review false | 1,257 | Unchanged |
| Hold / review true | 338 | Unchanged; review warnings retained |
| Product price approval | False | False |
| Parent inventory | Tracked, quantity 10, available true, approved false | Identical; ten remains unapproved |
| Published, prices, variants, notes, media, revisions, timestamps | Captured by full-document hashes | Unchanged |
| Reserved product addresses | Exactly 3,190; two per product, exactly one canonical | Identical |
| Public purchase eligibility | None of this cohort | Still none |

`displayProductFilter()` already permits public Draft/Hold/Ready products. It is deliberately unchanged. The owner explicitly approved display of the Hold cohort in this task; this does not resolve its purchasing review flags. Existing hidden/withdrawn values cause preflight rejection rather than being overwritten. Any cohort/count/status/approval drift requires review, not a broader query.

Preflight checks active root-category ownership, coherent active child associations, distinct safe gallery keys with main image first (existing maximum 23), nonempty names, unique valid stored slugs, valid unique reserved addresses, canonical ownership and absence of slug reassignment. It validates references, **not live R2 object existence or delivery**. A missing/inactive category, malformed gallery or missing reservation stops the operation; the operator cannot repair these.

## Operator design and protections

The executable has one fixed production target: SRV host `taw-production.oialf4z.mongodb.net`, database `tapandwrap_production`. Existing `schemaConfiguration`, URI/TLS/production authorization and connected-write guards are reused. No `.env` is loaded. Production configuration must be supplied securely to the operator process; do not paste credentials into chat, reports or command history. The local staging `.env` must not be substituted.

Required process settings include `NODE_ENV=production`, `DATABASE_TARGET=production`, `PRODUCTION_DATABASE_AUTHORIZED=true`, the exact `PRODUCTION_DATABASE_HOST`, a securely supplied `MONGODB_URI`, and **both** `CHECKOUT_ENABLED=false` and `COMMERCE_LAUNCH_AUTHORIZED=false`. These process checks are not independent proof of live Render settings: verify live commerce gates separately before an authorized operation. Do not enable running application flags for this operation.

The operator uses raw driver documents, with automatic collection/index creation disabled. This avoids applying Mongoose defaults, publication setters, timestamps or revision increments to inherited records. It uses no upsert, imports, delete, schema initialization or unrelated-collection writes. The only database update is `$set: {visibility: 'public'}` on the reviewed IDs with missing visibility.

A review plan binds every full raw product before/after image, categories and reservations using canonical BSON-aware SHA-256 hashes. Journal files contain IDs/hashes and counts, not product names, customer records, secrets or media keys. They are restricted to ignored `local-data/*.json` paths, opened exclusively and never overwritten by a new invocation. Treat them as sensitive operational evidence and keep them off Git; hashes are drift checks, not signatures or substitutes for owner authorization.

Apply reads again within a snapshot transaction, requires an exact matching plan, and sends one bounded ordered bulk of 1,595 visibility-only updates with majority commit. Concurrent document edits produce transaction conflicts; there is no automatic transaction/commit retry. A matching already-applied cohort is a verified no-op (modified zero). Mixed/changed state is rejected. Fresh post-commit reads verify every entire post-image, categories/reservations and the independent public-status/visibility count of 1,595.

Journal state begins `prepared`, becomes `review-required` after inspection, and `committed-verified` only after successful apply verification. A crash, timeout, uncertain commit or post-verification error leaves evidence requiring read-only reconciliation. **Do not blindly retry an uncertain result.** No new persistent collection or schema is needed.

## Commands — instructions only, not production execution

Run from the repository root with Node 22.12+ and installed server dependencies. No command below implicitly loads local credentials.

Offline default (actually executed locally):

```powershell
node server/scripts/restore-inherited-visibility.js
```

Actual result: `mode=offline-dry-run`, `connected=false`, `writes=false`, required products 1,595. This checks the operator's default behavior, **not production data**.

Read-only production inspection, using an already approved, securely prepared exact-production operator context:

```powershell
node server/scripts/restore-inherited-visibility.js --inspect --journal local-data/visibility-1595-review.json
```

Expected: matched 1,595, modified zero, state `review-required`. Review the counts and evidence; any precondition mismatch stops execution. This command has **not** been run against production in this task.

Only after separate explicit authorization of the reviewed production update:

```powershell
node server/scripts/restore-inherited-visibility.js --apply --confirm-only-inherited-visibility-1595 --plan local-data/visibility-1595-review.json --journal local-data/visibility-1595-applied.json
```

Expected first apply: matched 1,595, modified 1,595, public browse records 1,595, state `committed-verified`. A new journal filename is required on subsequent invocations. Database account must have the existing collection read/update and transaction permissions; do not broaden access automatically. No checkout or SEO activation is needed.

## Rollback and recovery

Reversal also requires explicit production-write authorization. Use the **successful apply journal**, never merely the review plan:

```powershell
node server/scripts/restore-inherited-visibility.js --rollback --confirm-only-inherited-visibility-1595 --plan local-data/visibility-1595-applied.json --journal local-data/visibility-1595-rollback.json
```

Rollback only unsets visibility on IDs whose entire current document matches that operation's exact post-image. It does not restore a product snapshot. Merchant edits, changed status/price/stock/media/revision/timestamps, deletions or visibility changes are skipped; it cannot overwrite those edits. Reverted records are independently checked against their before hashes. Repeating rollback skips records already reversed. Report skipped counts honestly; a selective rollback can intentionally leave edited products public.

If the apply journal remains `prepared`, do not fabricate a successful state or use normal rollback. A separately reviewed read-only comparison of the plan's before/after hashes and actual committed state is required first. Concurrent edits after commit may cause post-verification failure even though the transaction committed; stop and reconcile.

Because the permitted patch does not increment revisions/timestamps, close/reload all product admin editors around the authorized operation. A previously loaded editor can contain obsolete visibility. Normal subsequent admin writes still require the loaded revision and existing 409 handling. Full-document rollback hashes protect subsequent ordinary edits. No background cleanup or automatic reversal is scheduled.

## Owner dashboard workflow and limitations

No technical approval fields were bypassed. The existing product editor can manage the following without MongoDB access:

1. Reload after the authorized transition; Public display should read Approved for public display. Draft/Hold products show Price on request and WhatsApp enquiry until a real price is entered.
2. Review original merchant notes and review reasons. Keep Hold/review flags until issues are genuinely resolved. Display permission alone does not authorize purchase.
3. Enter the confirmed positive Price (EGP). The form converts it to integer piastres and confirms that entered price. Blank/zero remains unapproved. A confirmed price can display before a product is Ready.
4. Select accurate availability: Tracked stock and explicitly enter real quantity (zero is valid), Made by Request, or Unavailable. Unconfirmed imported ten is not shown as a confirmed editable quantity and is retained privately with approval false during unrelated edits.
5. Configure actual variants and confirm each applicable variant price/stock. Unavailable variants cannot borrow another variant's stock. Review required personalization if configured.
6. Resolve Catalog review required only after review, then choose Ready: approved for online purchase. Valid category/image and independent price/inventory checks still apply. Save; handle conflicts by reloading/reviewing rather than overwriting.
7. Global checkout remains disabled; making a product Ready does not enable checkout. Merchant acceptance of payments requires later authorized release/configuration work.

The editor supports individual stock allocation, not automatic partitioning of parent stock across variants. Owner must enter real counts per variant; no safe automatic allocation can be inferred. There is no mass price/stock approval in this task. All 1,595 display decisions can be handled by the reviewed operation, while genuine purchase readiness remains product-specific.

Public listing/category filtering, fallback homepage selections, direct canonical/legacy resolution and hidden/withdrawn protections are covered by the existing service/HTTP tests. WhatsApp actions include the actual product name and registered canonical path. R2 delivery still depends on the live `CATALOG_MEDIA_BASE_URL`, object existence and provider configuration. No provider was contacted for this verification.

## Video behavior

There is no white Play/Pause chip during normal mouse/touch presentation. A native accessible button covers each actual film surface transparently. Click/tap toggles playback; Tab focuses it, exposes an outline and small cue, and Enter/Space activates it. Pointer interaction clears an earlier keyboard-only focus cue. Keyboard focus remains visible deliberately for accessibility. Hero copy no longer swallows film-surface clicks; CTA links remain interactive above it. Service navigation remains a separate link.

All four source videos/posters, responsive source selection, looping, lazy service loading, visibility handling and failed-video fallbacks remain intact. No assets were re-encoded. HEIC handling, private uploads, financial logic, notification timing and permanent URL ownership were not changed.

Additional local investigation reproduced an early manual service-film start failure under reduced motion in Edge: two of two diagnostic repetitions remained paused, `readyState=0`, `networkState=1`, width zero, source attached, no `MediaError`. The hook previously discarded a gesture before its lazy source became available, and a subsequent source/visibility effect always paused playback under reduced motion even after explicit Play. It now remembers an early Play and permits that explicit gesture while reduced motion is already active. A new reduce preference still pauses/consumes the earlier Play; an intentional Pause remains sticky. Removing reduced motion can resume automatic films as before. This is distinct from the previously documented native decoder failure and does not establish that every historical media failure shared this cause.

## Verification evidence

Tests use isolated synthetic fixtures/disposable loopback MongoDB replica sets and mocked external providers. No production data, real storage uploads, emails, messages, orders or payments.

| Check | Actual result |
| --- | --- |
| Initial focused backend run (5 files) | 31 passed, 0 failed |
| Expanded backend run: operator, catalog API, visibility/presentation, API/Worker routing, inventory revisions and purchase-policy suites | 52 passed, 0 failed, 0 skipped; 18.6 seconds |
| Final operator run after tightening validation and adding concurrent-operator coverage | 6 passed, 0 failed; 7.0 seconds |
| Full-size synthetic read-only plan | 1,595 products; 1,257 Draft; 338 Hold; 3,190 reservations; modified zero |
| Synthetic apply/repeat/reverse | 1,595 visibility-only writes; repeat zero; rollback 1,594 and skip one legitimate later merchant edit; repeat rollback zero |
| Final Chrome: `media-experience`, `permanent-visibility`, `service-video-reliability` | 22 passed, 0 failed; 1.0 minute; clean normal runner exit |
| Final Edge: touch, service preference transitions, transparent controls, each repeated twice | 6 passed, 0 failed; 31.9 seconds; clean normal runner exit |
| Client ESLint | Passed |
| Server syntax | 174 JavaScript files passed |
| Isolated Vite production build + default SEO generation | Passed; indexing false, indexable routes zero, approved products zero |
| `git diff --check` | Passed; normal Windows LF/CRLF notices only |
| Production operator preflight/apply, real media delivery, physical phones | NOT EXECUTED / NOT VERIFIED |

The new browser test initially exposed keyboard-cue persistence after a pointer click; corrected without weakening its transparency assertion. A second test-only failure came from assuming programmatic focus always selects keyboard modality; it now uses real Shift+Tab/Tab and retains the focus-cue assertion. During the reduced-motion correction, an intermediate run reported 20 passes/1 failure because automatic Laser Engraving playback did not resume after removing reduced motion. That regression was corrected by preserving automatic versus deliberate Pause intent; no assertion or timeout was relaxed.

The first sandboxed Edge run completed five video cases successfully but stalled in teardown; only its identified local test process tree was stopped. Its forced cleanup is not presented as a clean test-run exit. A subsequent permission-enabled Chrome run exited normally after both a failing intermediate run and the final passing run. Preliminary commands with wrong working directories/missing prior ignored build-helper paths were corrected; their failures are not counted as verification passes. Final isolated build uses `.cache/visibility-video-build` and scrubbed configuration.

Final browser engines were installed Windows Chrome 155.0.8059.85 and Edge 155.0.4283.45. Responsive checks include 320, 390, 768 and 1,440-pixel layouts, landscape source changes and emulated touch. The exact newly reproduced Edge reduced-motion/lazy-start case passed twice after correction, followed by the final six-case fresh run above. Prior Edge runs before correction included one failure and a diagnostic run with two failures; these are not discarded from the evidence. The final runs used unchanged assertions and timeouts.

Physical iPhone Safari, Android Chrome, Samsung Internet and tablets remain unverified; responsive Chromium viewports and emulated touch are not physical-device acceptance. Prior native Edge decoder risk remains relevant; successful HTTP range responses alone do not prove playback. No claim of universal device compatibility is made.

Reproducible focused commands (run from the indicated package directories):

```text
server: npm test -- test/inherited-visibility-operator.test.js test/catalog-api.test.js test/permanent-visibility.test.js test/permanent-visibility-service.test.js test/product-routing.test.js test/batch1-inventory-revision.test.js test/catalog-public-visibility-policy.test.js
server: npm test -- test/inherited-visibility-operator.test.js
server: npm run check
client: npm run lint
client (PLAYWRIGHT_CHANNEL=chrome in test process): npm test -- e2e/media-experience.spec.js e2e/permanent-visibility.spec.js e2e/service-video-reliability.spec.js
client (default installed Edge): npm test -- e2e/media-experience.spec.js --grep "video surfaces|service films load|touch-emulated" --repeat-each=2
```

On Windows these were invoked using `npm.cmd`. Browser subprocess channel selection was temporary, not an application or deployment setting. The final production build invoked Vite with an allowlisted clean environment, `TAP_WRAP_ISOLATED_TEST=true`, local synthetic origins, Meta/SEO false and output `.cache/visibility-video-build`, followed by `writeSeoOutput` against that directory; no local `.env` or approved production export was loaded. Previous runs are not summed as unique passing tests.

## Release sequence — requires future authorization

1. Review the nine-file manifest and operator scope. Preserve all prior untracked files. Do not commit or push automatically; connected services can auto-deploy.
2. Securely prepare exact-production read-only/operator configuration and verify checkout gates remain disabled in the running application. Resolve any API schema/readiness issues independently; this script cannot initialize schema.
3. Run the explicit read-only inspection and review its exact evidence. Stop on drift, invalid references, missing media evidence or changed counts. Authorize only the reviewed visibility patch separately.
4. Close/reload merchant editors, apply once, retain the journal and verify the reported count/hash results. Reconcile any uncertain state before another operation.
5. Confirm the live Shop total/category pages/fallback selections and selected Draft/Hold direct URLs; inspect names, images and WhatsApp text. Confirm no Add to Cart for unapproved prices, legacy HTTP redirects and genuine 404s for restricted paths.
6. Under separate source-release authorization, deploy the video changes using existing Workers/Render contracts. No routing-map regeneration or catalog import is required by this patch.
7. Physically test film taps/scrolling, keyboard focus/CTAs, mobile orientation, blocked autoplay and posters. Resolve or explicitly accept any remaining decorative-video limitation before broader launch.

For a video rollback, revert only these source changes in a separately authorized release; do not reset the accumulated repository. For a catalog rollback use the conservative journal procedure above. Never reset prices, stock, approvals, aliases or historical records as recovery.
