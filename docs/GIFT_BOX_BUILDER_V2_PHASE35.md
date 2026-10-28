# Gift Box Builder V2 — Phase 3.5 review

28 October 2026. Local, uncommitted work on `feature/gift-box-builder-v2`. The authoritative component registry remains 12 boxes, three roses, 17 plush products and 20 chocolates, with the same IDs and numbering. No source photograph, source cutout, approved asset manifest entry, saved merchant setting, historical record, checkout flag or production service was changed.

## Customer corrections

The mobile Back/Next problem was caused by `.gb-navigation` using `position: sticky; bottom: 0`. This pulled the final action bar upward over content before the customer reached the choices. It also visually separated a heading from its following instructions. The action bar now stays in normal document flow after all cards, Load More, finishing controls and step feedback. No CSS ordering or positive tab indexes are used.

The step number, heading and instructions now share `.gb-step-intro`. At 320px and 390px, the visible and keyboard sequence is progress → preview → step introduction → choices → Load More → Back/Next. Tablet layouts up to 1000px use one column; wide layouts retain the large preview beside the choices. Progress is in normal flow on narrow layouts; the compact count/price summary can remain below the measured site header without covering the step introduction. Desktop progress remains sticky.

The 200% text checks exposed separate overflow in the preview heading/count row and the component-price summary. Both now wrap. The price summary no longer relies on an auto-width grid column that can force the page wider. Heading/instruction pairs and the pending gift-card controls remain readable at enlarged text sizes. Load More still reveals 12 additional options locally and preserves the revealed count across Back/Next.

The card remains an optional checkbox and plain text field, capped at 500 Unicode code points. Its price policy remains pending. Ribbons have no fabricated definitions or colors. Chocolate buttons remain text-only and add one complete pictured retail unit. Admin name/price examples in screenshots are isolated synthetic fixtures, not approved owner configuration.

## Arrangement proportions and interaction

The old square image frames combined three problems: different transparent margins, different artwork aspect ratios, and category sizes expressed against the entire source canvas. A wide retail chocolate bar could therefore look much larger than a taller plush product or individual rose.

`artwork-metrics.mjs` records the measured source dimensions and visible alpha bounds from the unchanged manifest. Placement artwork uses a CSS frame around those visible bounds; the source image, alpha channel and optimized files are unchanged. The frame preserves the actual visible artwork aspect ratio in the box's source coordinate system.

Draft longest-side proportions are now expressed against the proposed floor width:

| Category | Draft ratio | Interpretation |
| --- | --- | --- |
| Individual rose | 0.22 | One visible rose, not its transparent canvas or bouquet |
| Plush toy | 0.58 | Whole visible plush artwork, retaining its own aspect ratio |
| Chocolate | 0.28 | One complete pictured retail unit, retaining packet/bar aspect ratio |

These are visual study ratios, not physical measurements, fit guarantees or production scales. They can be reviewed in the development geometry workflow. Per-product physical dimensions and approved scales are still absent.

Initial draft positions put plush toward the rear, roses across the middle/sides, and chocolates toward the front. This avoids the previous default pile at one repeated location. Movement follows a proposed contact/anchor point within a draft floor, with an explicitly separate beside proposal for plush. The entire visible image rectangle is not claimed to be a measured contact footprint. Standing plush silhouettes may rise above the floor; that is a visual proposal requiring physical review.

Changing boxes clears the old contact region, layer and inside/beside choice as well as the coordinates, while retaining item IDs and quantities. Draft proportions are recomputed for the new photographed floor. Retained items wait in the tray for a fresh placement; a former beside position cannot silently carry over to the new box.

Foreground proposals redraw the owner's existing box artwork through draft clip polygons so front rims/walls can cover item bases. Box 11 has separate layer ranges for its two levels and a raised-container occlusion layer. These are draft source-alpha intersections, not approved masks or recreated artwork. Pointer capture, cancellation, one-release undo entries and keyboard movement remain. Focusing an item now selects it and exposes its movement/removal controls, including when it is partly occluded by another item. A plush can move between inside and beside proposals without changing the pricing selection.

The beside proposal uses an extended scene around the source artwork; it does not squeeze an oversized toy into a transparent margin or pretend that a box has more internal capacity. The scene expands only when required for that study. Touch and mouse coordinate conversion follows the scene transform. Dragging, keyboard movement, selection, layering and inside/beside changes do not produce estimate requests.

## Draft geometry for every box

`shared/gift-box/geometry-drafts.mjs` is a separate frozen photo-study module, version `gift-box-photo-study-2026-10-28.1`. It is never used as server approval. **The authoritative `geometry.mjs` is unchanged: all 12 boxes remain unreviewed, and `reviewPlacement` returns `GEOMETRY_REVIEW_REQUIRED`.** Request submission and conversion remain unavailable.

The drafts use normalized coordinates against the actual source artwork. Floors exclude rear walls, raised lids, hinges and external shells. Ellipses represent circular floors projected by the photograph. Floor proposals are deliberately inset from rims; they do not assert hidden usable space.

| Box | Proposed interior | Layering and remaining review |
| --- | --- | --- |
| `box-1` | One polygon following the cream heart floor | Front heart wall/rim; artwork remains blocked. Overlay is offline inspection only. |
| `box-2` | One polygon following the red heart floor | Rear wall excluded; front heart wall overlays bases. |
| `box-3` | One polygon following the dark heart floor | Its artwork position differs slightly from box 2; front rim needs review. |
| `box-4` | One polygon in the lower heart well | Raised heart lid excluded; cream front wall/rim needs review. |
| `box-5` | One polygon in the black heart-shaped insert | Square outer shell/corners and raised clear lid excluded. |
| `box-6` | One polygon in the smaller cream heart-shaped insert | Square shell, hinge and lid excluded. |
| `box-7` | One perspective ellipse in the cream circular floor | Red lid and rear wall excluded; cylinder front rim proposed. |
| `box-8` | One perspective ellipse in the black circular floor | Raised clear lid excluded; black front wall proposed. |
| `box-9` | One perspective ellipse in the dark circular floor | Raised white lid and white front wall excluded. |
| `box-10` | One perspective ellipse in the pink container's dark floor | Individually positioned floor; raised pink lid excluded. |
| `box-11` | **Two separate elliptical floor projections**, lower and raised | Lower-front layer, raised-container body layer, raised-front layer. No bridging; hidden lower-floor extent and hinge/rotation clearance require review. |
| `box-12` | One perspective ellipse following the visible woven basket base | Handles, sloping woven walls and outer silhouette excluded; flexible rim/depth require physical review. |

There are 13 proposed floors across the 12 boxes. Each also has a separately labeled extended-scene beside proposal. Every draft explicitly retains `reviewStatus: 'unreviewed'`, `productionApproved: false`, `physicalDimensions: null`, `capacity: null` and `approvedItemScales: null`.

The development review page starts with these photo proposals rather than an empty generic rectangle. It displays floor and foreground proposals, supports inspection of the extended beside scene, and exports copyable unreviewed JSON. Local tracing/scale edits stay in memory. No owner admin geometry-edit or approve endpoint exists. Box-1 tracing remains blocked while its artwork issue is unresolved.

## New visual evidence

The compact review sheet is [phase35-review-contact-sheet.jpg](../server/.cache/gift-box-phase35/review/phase35-review-contact-sheet.jpg). It combines changed UI evidence and the 12 newly proposed floor overlays. Full-resolution evidence is in ignored `server/.cache/gift-box-phase35/review/`:

- [320px before](../server/.cache/gift-box-phase35/review/mobile-320-before.png) and [320px after](../server/.cache/gift-box-phase35/review/mobile-320-after.png).
- [390px before](../server/.cache/gift-box-phase35/review/mobile-390-before.png) and [390px after](../server/.cache/gift-box-phase35/review/mobile-390-after.png).
- [Updated desktop mixed arrangement](../server/.cache/gift-box-phase35/review/desktop-mixed-arrangement-after.png), with roses, plush and chocolate.
- [Plush beside proposal](../server/.cache/gift-box-phase35/review/oversized-plush-beside-proposal.png).
- [Step 5](../server/.cache/gift-box-phase35/review/step-5-finishing-touches.png) and [restricted admin editor](../server/.cache/gift-box-phase35/review/restricted-admin-component-editor.png).
- [BOX-11 browser overlay](../server/.cache/gift-box-phase35/review/box-11-two-compartments-browser.png).
- [200% zoom/reflow evidence](../server/.cache/gift-box-phase35/review/mobile-zoom-200.png).
- `box-1-draft-boundary.png` through `box-12-draft-boundary.png` — individual offline overlays; [BOX-11](../server/.cache/gift-box-phase35/review/box-11-draft-boundary.png) shows both distinct floors.
- [draft-geometry-review.json](../server/.cache/gift-box-phase35/review/draft-geometry-review.json) — complete proposals and source hashes.

The before images are byte-for-byte copies of the preserved Phase 3 screenshots. The old collection was not regenerated or overwritten. New browser images show actual owner artwork with explicitly synthetic fixture names/prices; no fixture records were saved to a merchant database. Contact-sheet thumbnails are an overview; full images remain available separately.

`review-gift-box-geometry.js` verifies the complete asset collection before generating offline annotation evidence. Box-1 annotation does not make a usable builder derivative or clear the existing asset block. `create-gift-box-review-sheet.js` assembles only known local evidence and refuses to overwrite different existing files. Routine Phase 3.5 behavior tests now skip capture using configuration metadata, so reruns do not create the same screenshot collection again.

## Box-1 defect and proposed correction

The source is still `boxes/box-1-open-top.webp`, 1453 × 1083, with its original manifest identity/hash. Uncomposited previews show horizontal red/brown remnants extending from the right side of the heart toward the right edge.

The decoded-alpha diagnosis is more specific than the original visual observation:

- The visible alpha bounds end at x=1302. The inspected right strip is x=1303–1452 across all 1083 rows.
- Every alpha value in that strip is zero; 44,049 of its pixels contain nonzero hidden RGB.
- Prominent red RGB bands occur at source y=319–336, 359–376, 401–406, 448–455, 487–497, 525–536, 576–583, 712–719, 848–855 and 882–887, using the documented inspection threshold.
- Correct alpha compositing on white hides these bands, while RGB-only/uncomposited inspection exposes them. This does not approve the file or assume every renderer/export pipeline handles it correctly.

See [diagnostic image](../server/.cache/gift-box-phase35/review/box-1-defect-diagnostic.png) and [pixel findings](../server/.cache/gift-box-phase35/review/box-1-defect-diagnostic.json). The RGB-only view is diagnostic evidence, not corrected product artwork.

Proposed correction, **not executed**:

1. Keep the original file and identity/hash intact. Obtain the owner's editable source or prepare a separately versioned candidate only with explicit authorization.
2. Inspect on light, dark and checkerboard backgrounds. In the candidate, clear hidden RGB only where alpha is exactly zero; preserve every visible and partially transparent edge pixel. If any visible/partial-alpha remnants are found, repair that mask manually against the owner's source rather than cropping away part of the box.
3. Export an alpha-preserving candidate and decode it again. Compare all nonzero-alpha pixels and alpha values with the source, verify that the hidden strip is clean, and check browser/native previews for halos or streaks.
4. Present the candidate for explicit owner review. Only after approval should a new versioned manifest point `box-1` to the corrected artwork. Retain the original for historical identity; then regenerate only the authorized versioned derivatives and review geometry alignment.

No corrected file was created and no source or approved asset reference was replaced.

## Verification and performance

Executed checks and final acceptance outcomes are recorded below. All database tests use fresh disposable loopback fixtures; none uses a developer `.env` or existing merchant database.

| Check | Result |
| --- | --- |
| Full backend `npm.cmd test` | **601 passed**, zero failed/skipped; includes eight new draft/scale/anchor/layer/safety cases |
| Initial focused draft + interaction run | **16 passed**; verifies every component against every box's proposed anchors and extreme pointer positions |
| Phase 3.5 browser acceptance | **12 passed** covering mobile order, Back/Next, Load More persistence, keyboard order, 200% text at 320/390/768/1024, zoom/reflow, mixed proportions, drag/removal/undo, inside/beside movement, Step 5, admin restrictions, box 11, touch and reduced motion |
| Existing V2 browser regressions without repeated image collections | **9 passed** for saved ordering/lazy media, media denial, pricing separation, changed boxes, pending card policy, errors, revisions/complimentary approval, admin authorization/conflicts and touch |
| Existing request/checkout browser regressions | **13 passed** including engraving eligibility/manual fallback, request retries/intake closure, checkout recovery and order/accounting protections; three legacy screenshot-writing cases excluded to preserve earlier artifacts |
| Server syntax | **198 JavaScript files passed** |
| Client lint | Passed |
| Isolated production build and offline SEO generation | Passed; **1,804 modules**, **22 noindex routes**, zero indexable routes, checkout offers disabled |
| Final read-only asset audit | **99 valid sources**, 52 fixed components, 55 alpha images, zero duplicates, unchanged checksum; `productionReady: false` |

The final customer page chunk is 16.99 kB / 5.86 kB gzip, with draft geometry/metrics shared separately by the build. No new dependency, 3D library, production media URL or whole-collection preloader was added. Visible thumbnails and selected placement art still load progressively. The 12-option limit and local slicing remain; estimates still use only pricing selections and server amounts. The final isolated build and log are under `client/test-results-gift-box-phase35-build-final/`; full backend verification is recorded in `server/.cache/gift-box-phase35/full-backend-final.log`.

The text-enlargement checks set the root text size to 200%. Zoom verification covers a 1280→640 CSS-pixel reflow equivalent plus CSS zoom at 200%; it is not a claim of manual browser-chrome zoom or assistive-technology acceptance. Keyboard tests verify actual focus movement from the last option to Load More and then Back, rather than relying only on DOM order. Touch movement uses actual Chromium touch input through CDP.

Initial tests exposed the real 320px enlarged-text overflow, which was fixed at its heading/price layout sources. Other initial failures were test setup: a desktop two-column layout was asserted as vertical, chocolate 20 was selected before pressing Load More, and a mixed-scene drag targeted an item scrolled above the viewport. The corrected drag test scrolls the real item into view and exercises mouse input; it does not force a hidden-element click or weaken placement/pricing gates.

Source-image audit remains authoritative for byte/pixel checks. The original 99-source inventory is still `ffa5e6e01ac8eeb4c3bfe5c2f18dbfd756c5479526a62efd50e85edaf8111dc5`. Original Phase 3 assets, results, local backups and unrelated files are preserved. Offline SVG annotation emitted a system font-cache warning but produced the inspected files successfully.

## Exact Phase 3.5 source changes

Created:

- `shared/gift-box/geometry-drafts.mjs`
- `client/src/gift-box/artwork-metrics.mjs`
- `client/src/gift-box/placement-study.mjs`
- `client/src/gift-box/DraftGeometryOverlay.jsx`
- `client/e2e/gift-box-fixtures.js`
- `client/e2e/gift-box-phase35.spec.js`
- `client/playwright.gift-box-phase35.config.js`
- `server/scripts/review-gift-box-geometry.js`
- `server/scripts/create-gift-box-review-sheet.js`
- `server/test/gift-box-draft-geometry.test.js`
- `docs/GIFT_BOX_BUILDER_V2_PHASE35.md`

Modified from the preserved Phase 3 working tree:

- `client/src/gift-box/state.mjs` — aspect-aware draft footprints/anchors, inside/beside actions, box-change reset and undo.
- `client/src/gift-box/Artwork.jsx` — presentation-only normalization of visible alpha bounds.
- `client/src/gift-box/ArrangementCanvas.jsx` — rectangular artwork proportions, scene transforms, draft rim layers, focus selection and beside control.
- `client/src/gift-box/gift-box.css` — normal-flow navigation, grouped instructions, wrapping, tablet reflow and draft rendering.
- `client/src/pages/GiftBoxBuilderPage.jsx` — semantic step-introduction group.
- `client/src/pages/GiftBoxGeometryReviewPage.jsx` — starts with photo proposals and reports their unreviewed status/layers/extended scene.
- `client/e2e/gift-box-v2.spec.js` — reuse isolated fixture helper and account for preloaded draft regions.
- `client/playwright.config.js` — keep the separate Phase 3.5 suite out of legacy tests.
- `server/package.json` — include the new focused draft test file.
- `server/test/gift-box-interaction.test.js` — verify draft anchor constraints while preserving production and pricing separation.

No backend route, pricing implementation, database model, authoritative geometry definition, fixed component ID, source image, asset manifest, original optimized asset version or production configuration was modified in this phase.

## Remaining blockers before request integration

1. The owner must review the 13 proposed floors, beside scene, rim masks and compartment layering. The current draft anchor constraints do not validate an actual item's physical footprint, rotation, support, capacity or safe packing.
2. Obtain measured inside width/length or diameter, usable depth and rim height for every box; measure compartment elevations/spacing/hinge clearance for box 11 and the basket's base/opening/depth. Obtain each plush/rose/retail chocolate unit's size, intended orientation and safe packing limits. Physical dimensions, approved scales and capacities remain null.
3. Correct and explicitly approve box-1 artwork through a separately versioned candidate and recheck its geometry alignment.
4. Approve component display names, complete chocolate retail units, integer-piastres prices and availability through restricted settings. Chocolate identity/unit questions from Phase 3 remain open. No prices or stock were inferred here.
5. Approve ribbon IDs/colors and the gift-card identity/charge policy. Keep pending finishing choices honest until then.
6. Separately authorize any persistent schema/settings initialization and controlled media/CDN integration. No persistent database, R2 upload or production activation is authorized by this work.
7. A later request phase must validate approved geometry and prices on the server, revalidate current availability, enforce ownership/idempotency, preserve immutable arrangement/price/message snapshots, and retain the existing request/quotation history. It must continue to block direct checkout/conversion without explicit future authorization.

Stop here for Phase 3.5 review. Nothing has been committed, pushed, merged, deployed, seeded into a merchant database, uploaded to R2 or enabled for V2 submission/checkout.
