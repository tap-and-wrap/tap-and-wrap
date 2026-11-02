# Gift Box Builder V2 — Phase 3

28 October 2026. Work remains uncommitted on `feature/gift-box-builder-v2`. This phase adds the local visual builder, restricted owner interface, chocolate asset integration and development geometry review. It does not approve physical arrangements, open V2 requests, activate checkout, provision schema, seed merchant settings, or publish media.

## Source verification and chocolate mappings

The actual directory is **`local-data/taw-giftbox/chocolate/`**, singular, rather than the plural path in the authorization. All 20 expected numbered files were found there and inspected visually using a contact sheet. No source files were renamed, moved or modified.

Each chocolate definition has `selectionAsset: null`, `presentation: 'text-button'`, `interaction: 'add-one-per-tap'`, and `unit: 'complete-pictured-retail-unit'`. Each press adds one complete depicted packet, bag, bar or egg. Pack contents and printed piece counts are not interpreted as individual builder units.

The observations below identify the artwork for review; **they are not approved display names, stock records, variant mappings or confirmed retail specifications**. Saved business names, prices and availability remain absent unless separately approved through settings. Every entry flags display name, retail unit, availability and price for review. There are no inferred inventory mappings.

| Fixed ID / initial order | Exact source and placement filename | Visual observation requiring owner confirmation |
| --- | --- | --- |
| `chocolate-1` / 1 | `chocolate/chocolate-1-builder.webp` | Blue Kinder Joy egg |
| `chocolate-2` / 2 | `chocolate/chocolate-2-builder.webp` | Pink Kinder Joy egg |
| `chocolate-3` / 3 | `chocolate/chocolate-3-builder.webp` | KitKat mini bag, printed 17 breaks |
| `chocolate-4` / 4 | `chocolate/chocolate-4-builder.webp` | KitKat Chunky pistachio/kunafa mini bag |
| `chocolate-5` / 5 | `chocolate/chocolate-5-builder.webp` | Maltesers bag |
| `chocolate-6` / 6 | `chocolate/chocolate-6-builder.webp` | Cadbury Dairy Milk sticky-toffee bag |
| `chocolate-7` / 7 | `chocolate/chocolate-7-builder.webp` | Cadbury Dairy Milk nutty-cream bag |
| `chocolate-8` / 8 | `chocolate/chocolate-8-builder.webp` | Twix minis bag |
| `chocolate-9` / 9 | `chocolate/chocolate-9-builder.webp` | Yellow M&M's peanut bag |
| `chocolate-10` / 10 | `chocolate/chocolate-10-builder.webp` | Brown M&M's chocolate bag |
| `chocolate-11` / 11 | `chocolate/chocolate-11-builder.webp` | Green M&M's cookie packet |
| `chocolate-12` / 12 | `chocolate/chocolate-12-builder.webp` | Cadbury Flake minis bag |
| `chocolate-13` / 13 | `chocolate/chocolate-13-builder.webp` | Blue chocolate-cookie packet; exact brand/unit unconfirmed |
| `chocolate-14` / 14 | `chocolate/chocolate-14-builder.webp` | Hershey's Cookies 'n' Creme wrapped bar |
| `chocolate-15` / 15 | `chocolate/chocolate-15-builder.webp` | Hershey's semi-sweet wrapped bar |
| `chocolate-16` / 16 | `chocolate/chocolate-16-builder.webp` | Chocolate-chip cookie-mix bag; confirm intended builder eligibility |
| `chocolate-17` / 17 | `chocolate/chocolate-17-builder.webp` | Kinder Bueno retail packet |
| `chocolate-18` / 18 | `chocolate/chocolate-18-builder.webp` | Lindt Creation milk-hazelnut package |
| `chocolate-19` / 19 | `chocolate/chocolate-19-builder.webp` | Lindt Swiss Classic almond package |
| `chocolate-20` / 20 | `chocolate/chocolate-20-builder.webp` | Reese's wrapped peanut-butter-cups package |

All 20 are valid single-frame WebP images with visible pixels and real alpha transparency. Dimensions range from 1024–1983 pixels wide and 793–1536 pixels high; exact dimensions, byte sizes, alpha bounds, SHA-256 and decoded RGBA checksums are recorded in `shared/gift-box/asset-manifest.v2.json`. They total 3,064,390 source bytes. No byte-identical or decoded-pixel duplicates exist in the complete collection.

Existing mappings remain unchanged:

- `box-1` through `box-12`: `boxes/box-N.webp` selector → `boxes/box-N-open-top.webp` placement.
- `plush-1` through `plush-17`: `toys/plush-N.webp` selector → `toys/plush-N-builder.webp` placement.
- `rose-red`, `rose-yellow`, `rose-black`: `flowers/COLOR-og.webp` bouquet selector → `flowers/rose-COLOR-builder.webp` single rose. Bouquet cutouts and mixed-flower references are not individual placement images.
- No ribbon or gift-card identities, colors, images, charges or availability were invented.

Versions are now catalog `gift-box-v2.2` and assets `2026-10-28.2`. Geometry remains `gift-box-geometry-v1-draft`. The registry has 52 fixed entries. The manifest has 99 sources: 98 WebP and one reference JPEG, 55 alpha images, 13,740,658 bytes. The new complete inventory checksum is `ffa5e6e01ac8eeb4c3bfe5c2f18dbfd756c5479526a62efd50e85edaf8111dc5`. Filtering out the 20 chocolate files reproduces the original 79-source checksum `5b6ed17d966cc139269ac7fb6e250105db7a2ec4aba5997e2f2999475b82cc02`.

## Customer implementation

`GiftBoxBuilderPage` implements the five approved steps, optional skipping, Back/Next, final review, per-category revealed counts, retained selections, quantities, removal, undo and clearing. Every category starts with at most 12 visible choices; Load More reveals another 12 locally. The current fixed counts produce 12 boxes, three flowers, 12+5 plush toys and 12+8 chocolates. The empty ribbon list does not invent swatches. Future approved ribbons use solid-color buttons with accessible names and selection indicators.

The large preview uses actual owner artwork. Box/plush selectors use the original photographs, roses use bouquet photographs, and chocolate selectors contain text only. Each addition gets an independent UUID. Item depth follows vertical position. Mouse/touch dragging uses Pointer Events and capture, commits one undo entry on release and cancels interrupted drags. Keyboard arrows, explicit direction buttons, Delete/remove buttons and quantity controls provide alternatives. Reduced-motion preferences remove transitions; step changes move focus and scroll without animation. Mobile keeps a measured step bar and compact selection/price summary visible.

Changing a box retains all component instances but resets their placements into a tray. Undo restores the prior box and arrangement. The user explicitly places retained items again in the local layout study; no arrangement is silently certified against a different box.

The optional gift-card checkbox reveals a 500-Unicode-code-point textarea. Drafts stay in page memory and are not saved to browser storage or a request. Blank, malformed or unsupported control-character messages are invalid. Because no gift-card identity/price policy is approved, enabling this draft makes the component estimate unavailable; the interface does not quietly omit a charge or imply a free card. Messages are rendered as text, never HTML or artwork.

The public catalog and estimate use the existing safe API/CSRF helpers. The catalog requests `limit=100` once, then slices locally. This extends the existing bounded list ceiling from 20 to 100; default pagination remains 20 and unknown query fields remain rejected. No new per-option requests or pagination mechanism was introduced. Estimates depend only on pricing selections, not positions, step navigation or revealed counts. Prices and line subtotals come from the server. Pending/refetch/error states do not display a stale successful total. Delivery remains separate. Private estimate queries are scoped to the verified session owner/generation and expire from the cache after use; account transitions remount the draft.

## Geometry safety and review

**All 12 real definitions still have `reviewStatus: 'unreviewed'`, empty approved regions, null physical dimensions/capacity/scales, and no foreground masks. `reviewPlacement` continues to return `GEOMETRY_REVIEW_REQUIRED`.** Neither a valid price nor local movement changes that result. There is no V2 submit, checkout or conversion action.

Local development supports an explicitly labeled **layout study**, clamped to the artwork canvas. Its illustrative category sizes and depth order are composition tools, not interior boundaries, realistic physical scale, approved fit or capacity. Production code does not enable these study movements: items remain unplaced. This intentionally limits release readiness until real placement rules are reviewed. No physical geometry was guessed to make the customer preview appear approved.

Development-only `/dev/gift-box/geometry` provides all 12 boxes, their observed shape and current empty boundary state, polygon tracing for heart wells, ellipse/rectangle regions, separate inside/beside regions, multiple compartments, illustrative scale controls and sample artwork. The preview retains the measured source artwork aspect ratio. A conservative full-footprint check reports fit against **draft** regions separately from the authoritative rejection. Copyable JSON always retains unreviewed status, null physical dimensions/capacity and `productionApproved: false`. Drafts are memory-only; there is no save/approve endpoint or file write. The route is omitted from production builds.

Review must establish: each actual well's boundary and depth, heart-in-square interiors, every independent compartment in box 11, basket openings/rims, inside-versus-beside regions for oversized toys, per-product physical scale, acceptable overlaps/layers, foreground masks and physical capacity. Category study sizes are not a substitute for these measurements. Beside regions are currently limited to the artwork coordinate canvas; the owner must determine whether a larger reviewed scene is needed.

`box-1-open-top.webp` remains blocked for derivatives and selection. Its unwanted right-edge remnants are an explicit open issue, not corrected or approved. The geometry screen explains the issue and blocks boundary tracing for that artwork. A separately supplied corrected source and reviewed version are required.

## Restricted owner interface

`/admin/gift-box/components` uses the existing verified admin guard, shared AdminLayout, AdminForm errors, safe PATCH helper, session-scoped queries and EditConflict workflow. It exposes only name, display order, integer-piastres approved price and enabled status. There are no create/delete controls, uploads, color editors, asset editors, identity editors or geometry edits. Chocolate forms explicitly ask the owner to verify the complete retail unit before enabling it.

Zero requires an explicit complimentary confirmation. Blank clears a price to unpriced; positive saves approve the entered amount through the existing backend. Loaded revisions accompany updates. Whole-category reordering sends every fixed ID and its loaded revision atomically. A concurrent row edit can make an already-open reorder draft stale: the server returns a conflict, the draft remains, and the owner deliberately reloads/reviews the latest list. There is no automatic overwrite or rebase. Successful writes invalidate fixed settings, public catalog and current-owner estimates.

The legacy Components/Customization editors remain available for shared product/engraving dependencies. They are not used by the new builder editor. Historical templates, records and routes were not removed.

## Local media and production isolation

The frontend builder is enabled in local Vite development unless explicitly disabled. Production uses the existing gift-box request page unless `VITE_GIFT_BOX_BUILDER_ENABLED=true` is separately supplied. No environment file or deployed flag was changed. The backend's Phase 2 default-off gate and read-only schema checks remain unchanged. Missing schema/settings never trigger initialization, seeding, approved pricing or availability.

Optimized assets live only under ignored `client/.gift-box-assets/2026-10-28.2/webp-v1/`: 115 derivatives totaling 9,061,306 bytes (about 8.64 MiB). There are 64 photograph derivatives at 320/640 widths and 51 transparent placement derivatives at at most 1200 pixels. Nothing is enlarged, flattened, cropped or substituted. The previous version remains intact. Chocolate selector derivatives are not generated.

Vite's development-only middleware exposes exact allowlisted derivative URLs on loopback connections only. It validates the versioned manifest, role, source identity, issue exclusions, path containment, ancestors/junctions, content size and SHA-256 before returning bytes. References, manifests, unexpected files, defective box-1 artwork, nonlocal requests and cross-origin requests fail closed. Responses are private/no-store and same-origin. Vite's general filesystem handler denies `local-data` and `.gift-box-assets`, preventing a second unrestricted media path. There is no preview/production middleware, public copy, upload or fabricated CDN URL. Production asset resolution returns unavailable until controlled media integration is authorized.

Only visible selector thumbnails and selected placement artwork load; placement assets are not preloaded as a complete collection. No dependency was added. The final production build emits the customer page as a separate 15.55 kB / 5.33 kB gzip chunk, shared gift-box code of 5.46 kB / 2.29 kB gzip and scoped CSS of 12.78 kB / 3.11 kB gzip. No actual builder images or development geometry page are bundled.

## Exact Phase 3 source files

Created:

- `client/scripts/gift-box-local-media.mjs`
- `client/playwright.gift-box.config.js`
- `client/e2e/gift-box-v2.spec.js`
- `client/src/gift-box/api.js`
- `client/src/gift-box/media.js`
- `client/src/gift-box/state.mjs`
- `client/src/gift-box/artwork-dimensions.mjs`
- `client/src/gift-box/Artwork.jsx`
- `client/src/gift-box/Options.jsx`
- `client/src/gift-box/ArrangementCanvas.jsx`
- `client/src/gift-box/gift-box.css`
- `client/src/pages/GiftBoxBuilderPage.jsx`
- `client/src/pages/AdminGiftBoxComponentsPage.jsx`
- `client/src/pages/GiftBoxGeometryReviewPage.jsx`
- `server/test/gift-box-interaction.test.js`
- `docs/GIFT_BOX_BUILDER_V2_PHASE3.md`

Modified from the preserved Phase 2 working tree:

- `client/src/App.jsx` — gated builder/admin routes and development-only review route.
- `client/src/admin/AdminLayout.jsx` — gated restricted-editor navigation link.
- `client/vite.config.js` — allowlisted development middleware and private-directory filesystem denial.
- `client/playwright.config.js` — legacy suite explicitly retains the old gift-box route and excludes the dedicated V2 fixture suite.
- `client/scripts/run-contract-tests.js` — connected legacy regressions explicitly retain the legacy route.
- `shared/gift-box/definitions.mjs` — 20 immutable numbered chocolate definitions and new catalog/asset versions; ribbon/card stay pending.
- `shared/gift-box/asset-manifest.v2.json` — 20 inspected placement images, preserved earlier entries and new checksum/version.
- `server/scripts/lib/gift-box-assets.js` — actual singular chocolate directory, 99-source/84-reference validation and null selector support.
- `server/scripts/lib/prepare-gift-box-assets.js` — omit null selection artwork.
- `server/src/gift-box/validation.js` — bounded 100-item list ceiling for loading the small registry once.
- `server/package.json` — include the focused interaction/media/chocolate tests.
- `server/test/gift-box-assets.test.js` — cumulative manifest/derivative expectations and preserved original checksum.
- `server/test/gift-box-foundation.test.js` — 52 components and two remaining pending categories.
- `server/test/gift-box-api.test.js` — full bounded catalog and chocolate entries, unchanged missing-setting behavior.
- `server/test/gift-box-pricing.test.js` — chocolate definitions now exist; ribbon/card remain absent.

The earlier `.gitignore`, backend model/API registrations and Phase 1/2 files were already uncommitted and preserved. No unrelated local backups, scripts, test results, source assets, lockfiles or credentials were staged, removed or overwritten.

## Verification

| Check | Result |
| --- | --- |
| Full isolated backend `npm.cmd test` | 593 passed; zero failed/skipped |
| Focused `npm.cmd run test:giftbox` | 62 passed; includes the eight new interaction/media/chocolate cases; a subset of the full backend total |
| Server `npm.cmd run check` | 195 JavaScript files passed |
| Dedicated V2 browser suite | 16 passed: step/slice persistence, server estimate payloads, saved ordering, lazy media, media-access denial, drag/keyboard/touch, remove/undo/clear, changing boxes, Unicode card draft, disabled/unpriced/error states, admin restrictions/complimentary/conflicts, geometry outputs and four viewport widths |
| Existing browser regressions | 56 passed; engraving, legacy requests, personalization, catalog, session isolation, admin revisions and checkout recovery/protections |
| Connected real API/React tests | 12 passed; fresh disposable replica set, guarded fixture lifecycle, checkout remains disabled; cleanup completed |
| Client `npm.cmd run lint` | Passed |
| Client `npm.cmd run test:seo` | 64 passed |
| Isolated Vite + offline SEO build | Passed; 1,800 modules, 22 noindex routes, zero indexable routes, checkout offers disabled |
| Source audit | 99 valid sources, 52 mappings, 55 alpha images, no duplicates; original 79-source checksum unchanged; productionReady false |

Database tests use newly created disposable loopback fixtures through scrubbed runners; no existing merchant URI or developer `.env` is loaded. Browser catalog/prices are explicitly synthetic isolated fixtures, while the artwork is the owner's actual local media. These fixture prices are never seeded into a merchant database. Six legacy screenshot-writing tests were excluded from the selected regression run to preserve existing artifacts. Existing `client/dist` and earlier results remain intact.

The first focused run had two obsolete assertions (the former 20-item list ceiling and former three pending categories). The first browser run had one locator that stopped matching after a successful rename changed its heading. Those tests were corrected; no backend security or geometry restriction was relaxed. One JSX apostrophe lint error was also corrected. Contact-sheet font rendering emitted a system font-cache warning but produced the inspected sheet successfully; source/derivative decoding did not fail.

On Windows, the standard browser runner leaves its owned Vite child alive after assertions finish. Only the verified listener belonging to each completed test run was stopped; this allowed the runner to exit normally. The connected fixture runner shut down cleanly through its own IPC lifecycle. No merchant API was started or reused.

Useful ignored local review artifacts:

- `server/.cache/gift-box-phase3/chocolate-contact-sheet.png` — all 20 chocolate artworks, numbered.
- `server/.cache/gift-box-phase3/chocolate-inspection.json` — per-file technical inspection.
- `server/.cache/gift-box-phase3/full-backend.log` and `focused-final.log` — backend verification logs.
- `client/test-results-gift-box-phase3-complete/` — final dedicated browser artifacts: `mixed-arrangement-study.png`, `builder-320.png`, `builder-390.png`, `builder-768.png`, `builder-1440.png`, `geometry-compartments.png`, and `geometry-box-1.png` through `geometry-box-12.png` in their test-owned subdirectories.
- `client/test-results-gift-box-phase3-regressions/` — legacy regression artifacts.
- `client/test-results-gift-box-phase3-build-final/` — final isolated noindex production build; the earlier `client/test-results-gift-box-phase3-build/` is also preserved.

These are development evidence, not approved commercial prices, fit, capacities, stock, photography corrections, provider connectivity or release authorization.

## Remaining blockers and recommended next phase

1. Review the 20 chocolate identities and complete retail units, particularly the cookie-mix artwork and unspecified chocolate-cookie brand. Approve saved names, integer-piastres prices and availability separately; no approval exists merely because an asset was supplied.
2. Supply corrected box-1 artwork as a reviewed source/version. Review the actual boundaries, beside scenes, foreground masks, item scales, dimensions and physical capacity of every box using the local workflow. Only then implement production placement enforcement and box-change revalidation against approved definitions.
3. Approve the fixed ribbon identities/colors and gift-card identity/pricing policy. Add those only through reviewed code-owned definitions and restricted saved settings.
4. Review the customer/admin screenshots and behavior. Any schema provisioning, persistent development/staging settings, controlled R2/media delivery, read-back verification and feature activation require separate authorization.
5. A later explicitly authorized request phase must revalidate selections, prices and geometry server-side, preserve immutable configuration/price/message snapshots, retain quotation history, and prevent conversion until approved inventory/order mappings exist. V2 submission, checkout and order conversion remain unavailable now.

Stop here for Phase 3 review. No commit, push, merge, deployment, persistent database operation or R2 change has been performed.
