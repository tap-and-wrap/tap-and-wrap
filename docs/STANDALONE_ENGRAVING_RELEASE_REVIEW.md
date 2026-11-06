# Standalone engraving final release review

Latest local release-gate result: **406/406 default browser tests passed**. The account-recovery
fix and final verification are recorded in [ACCOUNT_RECOVERY_RELEASE_GATE.md](ACCOUNT_RECOVERY_RELEASE_GATE.md).
Earlier failures and BLOCKED assessments below are historical review evidence, superseded by that closure.
Local commit approval does not authorize push, deployment, schema writes or service activation.

Baseline: `c5f8a46e10de804f0dc5e82c4988cba42bcdd89f`. Local uncommitted code only.
No production database/provider operation, configuration activation, schema write,
seed, commit, push or deployment was performed.

## Scope and source review

Reviewed the original inventory of 45 modified and 31 new files, the complete tracked
diff, new engraving modules/components/contracts/tests and original asset notices.
The existing Product/Gift Box changes are additive line dispatch, narrow payment and
presentation guards, private upload fields and isolated test maintenance. No catalog
Product, Gift Box settings, price, stock or product-level engraving change is included.
The final manifest also records this review's configuration/documentation corrections.
Unrelated pre-existing untracked files remain outside the intended source bundle.

| Boundary | Source evidence and result |
| --- | --- |
| Verified owner | `commerce/ownership.js`: optional authentication establishes `user:<verified id>` or hashed guest cookie; invalid sessions rotate guest ownership. No submitted owner is trusted. |
| Upload signing | `commerce/uploads.js:policyForUpload`: purpose, permitted role, opaque current owner context and item UUID are required; Product/order/template fields are rejected for engraving. `uploads.routes.js` independently parses a UUID and strict body. |
| Actual image | Existing `inspectStoredImage` checks byte type, bounded stream and Sharp image dimensions; completion verifies a separate frozen private copy. No public private-file URL is returned. |
| Exact private reference | `engraving/pricing.js:engravingQuote` calls `validateUploadReferences` for owner, complete state, unexpired date and engraving purpose, then checks exact item key/role and distinct files. Cart/checkout never extend temporary expiry. |
| Private access | `openPrivateUpload` filters exact owner unless verified active admin, verifies state/expiry, streams private/no-store bytes and audits admin views. New editable-cart/order-file queries filter owner before returning private references. |
| Stale session | Signing compares `commerceOwnerContext(owner)`; shared upload client checks auth generation before and after asynchronous stages. Builder draft is memory-only and owner scoped. Guest merge atomically transfers owner/cart/quota and validates the receiving owner. |
| Idempotency | `cart.js:addCartItem` hashes canonical strict input; equal key/hash acknowledges once, different hash conflicts. Writes occur in the cart transaction. UUID identity keeps different physical items separate. Order-private add receipts prevent checkout-before-retry reinsertion. |
| Atomic edits | Replacement requires exact owner cart, line ID, matching physical item and loaded specification/review fingerprint; replacement and attachment changes share the transaction. |
| Price/quantity | Strict cart quantity literal 1; quantity API rejects service changes. Only `configuration.pricePiastres` supplies unit and line totals. No option price exists. Strict order validator requires these equal the historical type price. |
| Concurrent configuration | Current published version must match; cart/checkout review hashes bind server configuration and owner. Conditional `commerceFence` writes serialize against transactional publication; changed options/prices require explicit review. |
| Mixed carts | `quoteCartCore` strict path rejects mixed kinds before quote/order/inventory/cart writes. The original cart remains intact; no partial checkout. |
| Discounts/stock | Promotions build eligibility only from Product lines. Service quotes produce empty inventory claims; aggregate consumption therefore touches no Product inventory. `inventory_return` explicitly rejects service orders. |
| New order | `placeOrderCore` snapshots exact configuration/specification, retains files atomically, preserves positive price, starts unpaid with `collectionAuthorized:false` and no inventory claims. |
| Payment bypasses | Signing, accounting proof/normal collection, order instructions, notification templates, canned messages, WhatsApp quotation and tracking qualification check the server gate. Generic fulfillment rejects service orders. Missing gate fails closed. |
| Authorization/work | `engravingAction` checks revision and exact item, then all items' custody, inspection, final stage and accepted current proposal. Only admin can authorize collection. Work requires authorization, actual paid state and confirmed design. |
| Unexpected funds | Only explicit reconciled admin exception records unsolicited actual funds; it cannot set collection authorization. Tracking still cannot issue premature Purchase. |
| Cancellation/custody | Accounting cancellation does not overwrite engraving custody. Review fixes allow late receipt and actual safe return after cancellation. Financial records remain unchanged; cancellation is not a refund or an inventory return. |
| Compatibility | Historical Product/Gift Box/quotation paths retain their original contracts; only the new discriminator selects new behavior. Historical engraving requests remain on Requests. |

These conclusions are source inspection plus disposable tests, not verification of
production access controls or storage topology. Arbitrary database corruption or
direct privileged database edits are outside the application API threat model.

## Defects and minimal corrections

1. **Custody: cancelled late-arriving item could not be received.** In
   `server/src/engraving/workflow.js`, the blanket closed-order guard rejected
   `receive`. Reproduction: place unpaid order, cancel before physical arrival,
   then record actual receipt. There was no way to acknowledge possession. Allow
   only receipt while closed; inspection, authorization and engraving remain blocked.
   Mirror that action in the admin UI. A full receipt history also previously
   prevented custody recording; a bounded 1,000-receipt limit now applies to
   clarification/work, while finite receipt/return transitions remain available.
   Duplicate return-stage actions are rejected rather than growing receipts forever.
2. **Custody: cancelled return could remain permanently blocked by pending charges.**
   Closed orders cannot change/accept ordinary charge quotes, but the custody return
   guards required them resolved. Reproduction: cancel an order with its initial
   pending shipping record, arrange return, attempt actual handoff. Closed-order
   custody dispatch/handoff now records reality independently of unresolved charges;
   it does not erase, forgive, accept or invent a charge. Active-order charge gates
   are unchanged. Backend and connected UI tests cover late receipt through return,
   retained cancellation, pending financial history and empty inventory claims.
3. **Misleading inherited copy.** Original checkout screenshots showed engraving's
   payment choice as “full payment” and promised contact within 12 hours. Engraving
   now says payment follows inspection/approval and handoff/return are confirmed
   separately. Its financial summary and service email drop the inherited deadline; its order labels
   say return/contact address and engraving service amount. Ordinary/Gift Box copy
   is unchanged. Ineligible engraving-only discount entry is hidden. Mobile admin
   monetary digits also split across lines (for example `1` then `00.00`); scoped
   summary sizing now preserves monetary tokens, with a connected geometry assertion.
4. **Contradictory browser fixtures.** Default config disabled Gift Box intake but
   included additional enabled-builder specs. Those specs now follow the existing
   dedicated enabled configuration, like the four specs already excluded. The
   production loading spec retains its separate production-build fixture. No public
   feature flag changed.
5. **Runner cache URL broke synthetic fixtures.** The new owned Vite runner used a
   custom cache directory, while existing route-focus/SEO/calibration harnesses
   import `/node_modules/.vite/deps/react.js`. The imported resource was absent,
   producing the recovery screen instead of the synthetic page. Restore Vite's
   normal cache path, preserving one React module identity and the owned IPC cleanup.
   The initial run was stopped, recorded honestly and restarted after this correction.
   The owned launcher also now honors the dedicated production-loading fixture: it
   builds real production chunks/SEO to ignored output and serves local preview,
   rather than silently substituting the development server.

6. **Stale homepage fixtures in the full suite.** Two motion cases and the public
   section-order case expected eight selections while the shared default fixture
   supplies nine. Those scenarios now explicitly request eight picks. The starter
   fallback case expected eight although baseline `HomeCatalog.jsx` intentionally
   returns four starter picks; its assertion now matches that unchanged source.
   No homepage/catalog component or merchant data changed.

No invariant was relaxed to satisfy a test. The custody changes distinguish recording
physical reality from authorizing financial or engraving work.

## Visual acceptance

Opened all 25 original PNGs linked by the prior verification report. Inspected the
320/390/440/1440 builder views, Text samples, Icons, all four Personal subtypes,
review, cart, checkout, unpaid order and admin configuration/custody. No horizontal
clipping, photo overlay, unreadable category labels or misplaced appearance controls
was found. Amiri renders Arabic with preserved multiline text; Rochester's English
sample remains separate and unavailable for Arabic. Appearance options are exactly
black/white/grey with the material disclosure. Notes use a collapsed native accordion.
The white surfaces, rose-brown controls, original logo and existing heading/body
typography belong to the established design system. No subjective redesign was made.

The long mobile admin screenshots represent full operational/history forms; their
height is not overflow. The original cart/checkout images include a temporary add
toast; it is transient existing feedback, not permanent clipped content. The original
checkout/unpaid-order images are evidence for the inherited-copy correction above.
Fresh connected captures accompany the review bundle. A contact sheet indexes the
25 original images; original PNGs are retained for legible independent inspection.

## Production preflight (source-only, no live inspection)

New collection: `engravingserviceconfigurations`, including MongoDB's normal `_id_`.
Declared indexes:

| Collection | Keys | Options |
| --- | --- | --- |
| engravingserviceconfigurations | `{typeId:1,version:1}` | unique; default name `typeId_1_version_1` |
| engravingserviceconfigurations | `{typeId:1}` | unique; partial filter exactly `{current:true}`; default name `typeId_1` |
| orders | `{owner:1,'cartAddOperations.key':1}` | non-unique, non-sparse, no partial filter/TTL; default name `owner_1_cartAddOperations.key_1` |

The engraving model is imported but has explicit `autoCreate:false, autoIndex:false`.
Its required-schema registry entry and the optional Order index are conditional on
`ENGRAVING_CONFIGURATION_ENABLED`. Intake requires that flag plus
`ENGRAVING_ENABLED=true` and `ENGRAVING_LAUNCH_AUTHORIZED=true`. All default false.
With defaults, the existing schema registry remains sufficient and public capability
returns disabled; the legacy service page retains its own gate. With configuration
enabled before schema preparation, read-only startup verification fails readiness
rather than creating or repairing schema. Existing service order/custody/reconciliation
reads remain available even when new intake closes.

Potential live conflicts are **unknown**, not cleared by local tests: existing same-name
indexes with different options, duplicate configuration `(typeId,version)` or current
type records, unexpected existing collection contents, privileges, topology and exact
host/database. The Order index is additive/non-unique and needs no historical backfill.
No new Upload TTL/index or Product migration is declared. Verify the entire existing
registry before initialization; the initializer is not an engraving-only delta tool.

### Commands for later separately authorized inspection

Offline only, no connection/writes:

```powershell
Set-Location C:\Users\youss\Projects\tap-and-wrap\server
npm.cmd run schema:init
```

There is no generic read-only production inspection CLI in the existing initializer.
After independent read authorization, privately supply the exact existing terminal
target/host/URI/runtime settings (never paste credentials into commands or reports).
The following source-only recipe opens a read-only schema query; it is **not run in
this review**. The guard function name includes “WriteAllowed”, but it verifies exact
connected target and performs no write. These commands neither initialize nor seed:

```powershell
$env:TAP_WRAP_SKIP_DOTENV='true'
$env:ENGRAVING_CONFIGURATION_ENABLED='true'
$env:ENGRAVING_ENABLED='false'
$env:ENGRAVING_LAUNCH_AUTHORIZED='false'
@'
import mongoose from 'mongoose';
import { schemaConfiguration } from './scripts/initialize-schema.js';
import { assertDatabaseWriteAllowed, databaseDiagnostic } from './src/config/database-safety.js';
const settings = schemaConfiguration({target:'production'}, process.env);
try {
  await mongoose.connect(settings.mongoUri, {autoCreate:false,autoIndex:false,
    serverSelectionTimeoutMS:6000,maxPoolSize:2});
  const {databaseModels} = await import('./src/config/schema.js');
  for (const Model of databaseModels) {
    assertDatabaseWriteAllowed(Model.db, settings);
    try {
      const indexes=await Model.collection.listIndexes({timeoutMS:6000,maxTimeMS:6000}).toArray();
      console.log(JSON.stringify({collection:Model.collection.name,
        required:Model.schema.indexes(),actual:indexes}));
    } catch (error) {
      if(error.code===26) console.log(JSON.stringify({collection:Model.collection.name,missing:true}));
      else throw error;
    }
  }
} catch(error) { console.error(JSON.stringify({error:databaseDiagnostic(error)}));process.exitCode=1; }
finally { await mongoose.disconnect(); }
'@ | node --input-type=module
```

Use the existing opt-in DNS initializer only if that exact production topology needs
it; do not change DNS/proxy/topology guards to make inspection succeed. Index output
contains schema metadata, not private records; review locally before sharing.

**Writes to production** occur only under separately approved explicit initialization:

```powershell
npm.cmd run schema:init -- --apply --target production --confirm-schema-writes --confirm-production-schema
```

That command calls `createCollection/createIndexes` across the declared registry;
it is NOT a dry-run or read-only check. It must not be run under this task. It does
not drop conflicting indexes or seed the nine definitions. Separately review any
incompatible index rather than silently replacing it.

Rollback after accepted service orders must retain a backend that understands the
new discriminator, private file purpose, snapshots, payment gate, receipts and
custody workflow, plus a compatible order/admin frontend. Close intake first; preserve configuration history, orders, funds
and customer property. Do not roll back to the production baseline reader once
engraving records exist.

## Test and bundle closure

Final executed results and Git assessment follow. The ZIP digest/readability result
is stored separately in the ignored `bundle-verification.json`, avoiding a circular
ZIP hash inside its own included report. Prior results remain in the original verification
record; this report supersedes its browser-suite uncertainty only where an actual
completed rerun is recorded.


### Completed results

| Execution in this review | Actual result |
| --- | --- |
| Full default browser suite, disabled intake | **FAIL: 394 passed, 6 failed; all 400 completed, 17.7 minutes** |
| Enabled Gift Box fixture (including calibration) | **PASS: 105/105**, clean owned-server shutdown |
| Actual production build/SEO plus local preview chunk-loading | **PASS: 3/3**, clean shutdown; noindex isolated build |
| Cross-tab account-change case, separate repeated run | **PASS: 3/3**; full-run timeout remains recorded, not proven fixed |
| Corrected motion/public-content selections | **FAIL: 16 passed, 1 failed**; all four stale count cases now pass; password-reset confirmation still fails |
| Final real browser/API/disposable database engraving contracts | **PASS: 5/5**, including all modes, wrong-owner denial, positive unpaid price, native viewer, monetary wrapping and cancelled late receipt/return |
| Final full backend | **PASS: 910/910**, zero skipped/failed |
| Focused custody/security regression after receipt-limit changes | **PASS: 22/22** (overlaps full backend) |
| Final server syntax | **PASS: 274 JavaScript files** |
| Final source lint (generated outputs excluded) | **PASS** |
| Diff whitespace check | **PASS**, ordinary LF/CRLF checkout warnings only |

Logs are ignored local files under `server/.cache/engraving-review-*.log`.
No test totals are summed across overlapping selections. Prior 65 SEO-unit and
Product/Gift Box connected results remain in the original verification report;
those unchanged suites were not falsely presented as new runs here.

The original enabled/disabled mismatch is resolved. The full default suite is
**not green**: the completed run failed; focused corrections/repetitions are not a
substitute for an actually completed fully passing default rerun. No second complete
400-test run was performed after the narrow fixture corrections.

### Outstanding blocker: account reset confirmation

`client/e2e/website-public.spec.js:131` consistently cannot see the password-reset
success confirmation. It failed both the complete default run and the focused rerun.
The assertion remains intact; it was not softened into merely observing a POST.

Source root cause: `AccountRecoveryPage.jsx:13` captures its token locally and its
mount effect removes the URL fragment. Its reset mutation calls
`session.authenticate` at line 29. `auth/session.js:29` increments the session
owner/generation before the request; `GiftBoxDraftProvider.jsx:13` keys a subtree
containing all routes by that owner. The reset page consequently remounts with an
empty fragment and loses local mutation success state. These three files are
unchanged against the production baseline; no separate complete baseline browser
run was performed. The source explanation is distinct from a live-production claim.

Minimal follow-up correction: retain only the non-sensitive reset operation outcome
across the owner-keyed remount (or isolate that public status from the keyed subtree),
while preserving secret-fragment stripping, one explicit submission, verified-session
rotation and clearing every private draft/cache. Do not persist the password/token
in browser storage or weaken Gift Box/session owner isolation. This requires focused
account-lifecycle work, not a Gift Box business redesign; it was not changed as an
unrelated production feature during this engraving review.

The cross-tab case also timed out once in the complete run (waiting for Account B's
order heading), then passed three unchanged isolated repetitions. No cross-account
file/order disclosure was demonstrated. Keep the timeout as an intermittent test
finding; do not call it fixed solely from the repeat passes.

### Assessment and approvals

**Engraving security/commerce: PASS after the corrections listed above**, within the
inspected application/API and disposable tests. No remaining bypass of engraving
ownership, price, collection authorization, inventory or custody was found.

**Final conclusion: BLOCKED for the READY TO COMMIT gate.** Resolve the reproducible
account-reset confirmation failure, retain/investigate the full-run auth timeout and
obtain independent source review. The default browser suite cannot honestly be
marked fully green. This block does not authorize unrelated account/Gift Box refactors.

Remaining owner authorizations after that technical closure: approve the independent
source review and eventual commit; separately approve exact-target schema reads and
DDL preparation; approve real type placements/material restrictions and font/icon
registries; approve custody/handling/return/charges/liability/retention procedures;
then separately authorize deployment, real-topology storage/session/provider smoke
checks and engraving activation. No real payment is authorized by this review.

Git closure: HEAD remains the stated baseline, **49 tracked files modified, 32
intended new files**, nothing staged. The original 45/31 inventory was preserved and
expanded only for the documented test-configuration/fixture corrections and this
report. Unrelated untracked files were not copied, staged, removed or changed.

Sanitized ZIP: `client/test-results-engraving-review/tap-and-wrap-engraving-source-review.zip`.
It includes the exact tracked diff, allowlisted source snapshots, all reports,
license/source notices, hashes, original 25 screenshots and 28 fresh screenshots,
contact sheets, test summary and Git manifest/status. Font binaries and environment
snapshots are omitted. Any database URI examples in whole-file snapshots are redacted
only in the archive and explicitly listed; the exact diff is checked unmodified.
ZIP CRC readability and every archive-member hash are verified locally.

### Fresh screenshot evidence

The originals remain linked in the original verification report. Fresh captures
include corrected checkout copy, unbroken admin amounts, English typography, the
expanded instructions accordion and cancelled-item return. All depicted customer
names, photos and addresses are synthetic disposable fixtures.

- [admin-configuration-1440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-1266e-nt-preserves-conflict-draft/admin-configuration-1440.png)
- [admin-custody-1440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-61666-ayment-engraving-and-return/admin-custody-1440.png)
- [admin-custody-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-61666-ayment-engraving-and-return/admin-custody-390.png)
- [cart-1440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/cart-1440.png)
- [cart-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/cart-390.png)
- [checkout-1440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/checkout-1440.png)
- [checkout-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/checkout-390.png)
- [step-1-1440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-1-1440.png)
- [step-1-320](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-1-320.png)
- [step-1-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-1-390.png)
- [step-1-440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-1-440.png)
- [step-2-drawing-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-drawing-390.png)
- [step-2-english-1440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-english-1440.png)
- [step-2-fingerprint-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-fingerprint-390.png)
- [step-2-handwriting-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-handwriting-390.png)
- [step-2-icons-1440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-icons-1440.png)
- [step-2-photo-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-photo-390.png)
- [step-2-special-requests-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-special-requests-390.png)
- [step-2-text-1440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-text-1440.png)
- [step-2-text-320](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-text-320.png)
- [step-2-text-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-text-390.png)
- [step-2-text-440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-2-text-440.png)
- [step-3-1440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-3-1440.png)
- [step-3-320](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-3-320.png)
- [step-3-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-3-390.png)
- [step-3-440](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/step-3-440.png)
- [unpaid-order-390](../client/test-results-contracts/browser-52458/engraving-contracts-connec-dd902-d-inspection-gated-checkout/unpaid-order-390.png)
- [cancelled-late-arrival-return-390](../client/test-results-contracts/browser-52458/engraving-contracts-wrong--8bbd5-eived-and-returned-in-admin/cancelled-late-arrival-return-390.png)
