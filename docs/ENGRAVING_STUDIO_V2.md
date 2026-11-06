# Standalone engraving Studio V2

## Scope and compatibility

This release redesigns the existing customer-owned-item service. Gift Box,
product-level customization, checkout/payment authorization, inventory and
physical custody transitions are unchanged. No collections, indexes, migrations,
production flags or payment settings are required.

The former builder used plain category controls, two font samples, three symbols,
upload-only handwriting and a specification-heavy review/cart. The admin editor
presented every configuration field at once. Studio V2 adds:

- Six initially visible illustrated categories, progressive Load More, server
  prices and native keyboard selection. Nine original local category illustrations
  are explicitly illustrative; actual customer photos remain separate.
- Memory-only photo previews with replace/remove, camera and file selection.
- Visual placement preferences with explicit placement help for every type.
- Actual font samples, Arabic/English filters and Arabic-script eligibility.
- Searchable/category-filtered symbol gallery and a neutral digital design board.
- Photo, Handwriting and Fingerprint choices. Historical Drawing remains accepted
  by the server and can be reconstructed from an existing cart/order.
- Pointer-event handwriting, coalesced samples and quadratic smoothing, normalized
  memory-only strokes, undo/clear/restart and an accessible enlarged dialog.
  Export is a transparent 1800 x 900 PNG through personal_artwork, only uploaded
  at Add to Cart. Late exports are rejected after owner change/unmount/edit.
- Review with real item/surface images, design, price and inspection disclosure.
- Private owner-authorized cart thumbnails, design preview, concise service
  journey, editing/removal and prominent actionable expiry errors. Blob URLs are
  revoked on cleanup; file retention is never extended.
- Admin collection cards and five editor sections: general/pricing, placements,
  fonts, icons, approval/publication. Conflict drafts remain intact. A matching
  save retains the version/audit count; stale expectedRevision still conflicts.

## Registries and assets

Old Amiri/Rochester font IDs/metadata, Heart/Star/Infinity IDs/metadata and their
asset paths remain unchanged. Ten additional engraving-specific font IDs reuse
the existing Gift Box TTF/license files without changing its registry or copying
font binaries. English: Rochester, Allura, Great Vibes, Sacramento, Parisienne,
Pinyon Script. Arabic: Aref Ruqaa, Amiri, Lateef, Scheherazade New, Rakkas, Mirza.

Forty-five new original CC0 monochrome SVGs expand the registry to 48. Categories
cover Love, Together, Celebration, Nature, Celestial, Animals, Travel, Hobbies
and Minimal. Their identities include v2; original symbols retain v1. See
client/public/assets/engraving/v2/NOTICE.txt. Curated registry assets contain no
scripts, event handlers, foreignObject, remote references or uploaded SVG code.
The per-type icon limit increases from 30 to 64; exactly one icon per line remains.

Suggested placements live in shared/engraving/studio-placements.mjs: Perfume 6,
Necklace 4, Bracelet 5, Watch 4, Lip Gloss 4, Makeup 5, Bag 5, Office Set 5, Other 0.
Help is an explicit specification kind, never a placement ID. Selection promises
neither safe material suitability nor a guaranteed black/white/grey physical mark.

## Configuration rollout

Deploy backend/registry validation and frontend/assets before publication. The
new UI works with old two-font/three-icon configurations; it reads each type's
approved IDs. Immutable historical version-1 snapshots and Drawing are tested.

After both providers serve this release, run the existing authenticated launcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\RUN_ENGRAVING_PRODUCTION_LAUNCH.ps1
```

Enter an existing administrator's credentials locally, never in chat. The utility
uses existing login/CSRF, administrator identity, optimistic revisions, audited
publication and process-only Cloudflare DNS. It verifies 85 local/live asset
references before writes. SVG/text comparisons normalize only CRLF/LF line endings; font
bytes remain exact. Reported hashes identify the actual live bytes. It adds suggested IDs without changing old placement
labels/status/order, preserves merchant prices/names/status/text limits and skips
matching configurations. An uncertain mutation is resolved by exact readback,
never automatic replay. All nine unchanged initial v1 configurations are expected
to advance once to v2/revision 2 at EGP 100. Verify actual production readback;
do not infer completion from this expectation. Flags remain unchanged.

No database access or schema initialization belongs to this rollout. After new
configurations/orders exist, retain the expanded registry on any rollback; an old
two-font/three-icon backend is not a compatible rollback target. Prefer a frontend
fix or compatible forward patch. Never rewrite historical snapshots.

## Local verification

- 39 engraving/launch tests: ownership/expiry, idempotency, pricing invariance,
  no inventory claims, immutable history, payment/custody gates, asset safety,
  no-op publication and preservation of merchant/retired placement settings.
- One additional real isolated launch API/authentication/audit test passed.
- 17 connected tests passed: 5 existing engraving, 1 Studio V2, 3 ordinary/legacy
  checkout and 8 Gift Box shopping regressions. All use disposable local databases.
- 74 selected default browser regressions passed; 3 production-build/lazy loading
  tests passed with actual Vite compilation and SEO output in an ignored directory.
- 65 SEO tests, frontend lint and 279 server JavaScript syntax checks passed.
- Studio test checks actual loading of all 12 fonts, Arabic restrictions, reduced
  motion, native keyboard category controls, mouse/touch/pen canvas, clear/undo/restart,
  enlarged-dialog Escape/focus restoration, no premature upload, transparent PNG
  dimensions, secure cart thumbnails and editing reconstruction at DPR 2.
- Screenshots at 320, 390, 768 and 1440 px cover category selection, text/icons/
  Personal, handwriting, review, cart, admin overview/editor. Main panels were
  checked for document overflow and visually reviewed. Corrections included admin
  illustration cropping (including category card image-fit), narrow-heading sizing and the explicit revision-conflict
  alert. Synthetic flat-color image fixtures are not merchant/customer content.

Evidence is ignored: client/test-results-contracts/browser-62811 (34 screenshots),
browser-64747 (20 DPR-2 studio screenshots), and client/test-results-engraving-studio
(contact sheets). Earlier failed test artifacts remain available; rate-limit
contention was resolved with independent fixture lifecycles, never disabled limits.
The full default browser suite was not rerun; the focused counts above are actual.

## Controlled live verification

The new explicit smoke command is cart-only:

```powershell
cd client
node scripts/smoke-engraving-studio-production.mjs --authorized-studio-cart-smoke
```

It verifies deployed asset bytes, nine upgraded configurations, UI, real private
item/surface/handwriting uploads, cart, unpaid checkout presentation and read-only
Gift Box/shop/empty-checkout loading. A fresh disposable browser owns its cart;
synthetic cart contents are removed on success. Its network allowlist blocks order,
admin, payment and fulfillment endpoints. No test order is placed. Existing
synthetic order 767557 must remain untouched and never charged or fulfilled.
Reports/screenshots stay under ignored test-results-engraving-studio-production.

Deployment, authenticated production publication and live smoke results must be
recorded after execution; local checks alone do not certify production success.

The first Render rollout reported live while the API still exposed the old
registry. A same-commit clean-cache redeploy resolved the mismatch; subsequent
readback exposes twelve fonts and 48 icons. Publication is held until full asset
verification succeeds. A Windows/Linux SVG line-ending-only mismatch was reproduced
and the verifier corrected/tested without allowing other content differences.
