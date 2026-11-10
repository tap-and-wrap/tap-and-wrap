# Stage C: standalone visual engraving

Base: `dda93aeaee4840cccec6568bb205d7991373f5ac`.

## Integration

`/customize/laser-engraving` now mounts the Stage B shared editor for new work.
The three steps are Your Item, Design Your Engraving and Review Your Engraving.
The first step uses approved service types in a compact dropdown, requires the
actual engraving surface photograph, and permits up to three separate optional
overall item photos. Current configuration supplies the price, fonts and position
suggestions. No catalog product price or fixed surcharge is introduced.

The editor retains free text/image placement, proportional dragging/resizing,
independent workspace zoom, touch/pinch, Undo/Redo and keyboard controls. Reset
uses the branded confirmation dialog. Image bytes and colors remain original.
Review uses the editor's same geometry/lettering renderer for the composite.
The existing branded cart toast remains responsible for successful-add feedback.

## Contracts and safety

- New specifications use strict `engraving-spec-v2`, cart lines use
  `engraving_service_v2`, and immutable snapshots use `engraving-order-v2`.
  The v1 schemas remain strict and unchanged in shape.
- The proportional design validator is shared by client and server through
  `shared/engraving/visual-design.mjs`; the Stage B client import re-exports it.
- Surface, overall photos and artwork have distinct private references and roles.
  The backend validates purpose, verified owner, physical-item identity, role,
  expiry, configuration/version, approved fonts/Arabic, geometry and layer limits.
  Originals and metadata are retained separately, never flattened into a proof.
- Saved editing explicitly hydrates original files under the verified session and
  cart owner context. Missing files are actionable. Owner changes abort requests
  and clear state. Unsubmitted photos/text stay in memory; browser persistence
  holds only opaque operation recovery information.
- Cart add/replacement and checkout reuse the existing transactional machinery,
  immutable operation requests, fingerprints and retained-file handling. A physical
  item cannot become two lines by changing specification versions. Replacement
  cannot silently convert a v1 line into v2.
- Expired upload references stay rejected on retry. A new upload requires explicit
  customer replacement; retrying does not silently renew file retention.
- Shared `isEngravingKind` recognition covers both versions in cart pricing,
  checkout hashing, snapshots, payment groups, custody workflow, notifications,
  analytics redaction, order lists and customer/admin presentation. Missing
  inspection/payment gates fail closed for v2 just as for v1.
- Receive, inspect, final proposal, customer acceptance and payment authorization
  precede payment/work. Existing mixed-cart allocations, COD agreements,
  InstaPay reconciliation, safe return and source-bound refund rules remain.
- Existing v1 text/icon/Drawing cart lines open the preserved legacy edit path.
  Customer/admin composite and original-file reads require explicit View actions;
  administrator bytes use the existing audited order-bound file endpoint.

The generic order-line validator happens to live in
`server/src/gift-box/order-snapshot.js`; its only change recognizes validated v2
engraving lines. Gift Box components, configurations, geometry and pricing do not
change. Reviews, catalog/inventory, homepage media, secrets, hosting plans, global
commerce authorization and SEO publication safeguards are outside this patch.
No migration, persistent database operation, new runtime flag or admin switch is
required.

## Verification retained from implementation

- 72 backend cases passed: `engraving-visual.test.js`, `engraving.test.js` and
  affected unified-cart accounting tests, using disposable local replica sets.
- 13 isolated browser cases passed: Stage B editor behavior and Stage A storefront.
- Seven connected browser cases passed: three builder cases, three saved/legacy/
  order-review cases, plus explicit expired-reference replacement. These use real
  local APIs and synthetic media, with only external storage mocked.
- Six proportional model tests and 84 SEO tests passed. Production build passed.
- Backend syntax checks passed for 295 JavaScript files.
- Final frontend `npm.cmd run lint` was rerun during continuation and passed with
  zero warnings/errors. No other completed suites were unnecessarily repeated.
- Screenshots cover 320, 390, 768 and 1440 px; representative mobile/desktop
  composites and layouts were visually reviewed without horizontal overflow.

Evidence remains ignored under `client/test-results/` and
`client/test-results-contracts/browser-{51662,51664,63459}/`. Each has a passed
`.last-run.json`. Earlier failures remain available: a missing exact accessible
dropdown label, async-dialog focus restoration, a test touch point behind the
sticky header, an ambiguous admin-heading locator, and a test retry that changed
the supposedly immutable revision were corrected during implementation.

Combining all connected cases in one fixture reached the real private-read rate
limit. The cases were split into independent fixture lifecycles; rate limits were
neither cleared nor weakened. The legacy fixtures explicitly create a v1 line
through the isolated API before testing its legacy editor.

## Release procedure and status

Commit only the Stage C manifest, push ordinary fast-forward main, and verify the
remote SHA. Render's existing auto-deploy watches main; verify its exact commit,
terminal live status, readiness and the public engraving type endpoint advertising
both specification versions before frontend publication.

Dispatch **Production SEO renewal** (`.github/workflows/seo-renewal.yml`) on main
using an already authorized supported GitHub method. The workflow seals current
public data, updates only the three publication artifacts, and verifies the native
Cloudflare deployment. Never publish a manual unsealed build or alter SEO flags.
Check `lock.json.sourceCommit`, publication ID, the publication tree difference and
matching live HTML/bootstrap before calling the release complete.

Computer Use is prohibited for this continuation. At preparation time the GitHub
connector has no workflow-dispatch operation and GitHub CLI is absent. If no
existing supported terminal authentication is available, the owner must manually
open GitHub Actions, select Production SEO renewal, choose main, and Run workflow.
The existing six-hour schedule is also unchanged. A missing dispatch path is a
frontend-release blocker, not permission to improvise credentials or a deployment.

Final deployment evidence is recorded separately in the release report under
ignored `local-data/stage-c-release/`. No live order, payment, fulfillment or private
storage mutation belongs to production verification. Stage D remains unimplemented.
