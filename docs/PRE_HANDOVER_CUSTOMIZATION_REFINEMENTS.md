# Pre-handover sticker and engraving refinements

Baseline: `6fe05af1cbf8c06b61bb9b465053fff69e46cc60`.

## Design and compatibility decisions

Keep three distinct experiences: a one-sticker photo workspace, the existing full
standalone text/artwork engine, and a compact text-only merchandise engraving form.
Shared lettering controls reuse the licensed engraving registry and three existing
appearance values. Sticker fonts and colors retain their separate approved IDs.
Extracted visual styles have their own scope; Gift Box's six-step navigation and
arrangement geometry are not changed.

The alternative of reinterpreting existing engraving/sticker specifications was
rejected because accepted orders must retain their original meaning. Both new
contracts pass the existing server pricing, transaction, operation identity and
order snapshot infrastructure. No database migration or production configuration
write is needed.

## Dedicated sticker proofs

`shared/gift-box/sticker-placement.mjs` is the immutable proof-image/version and
visible-surface registry. The source photos were individually inspected. Copies
are byte-identical originals under `client/public/assets/gift-box/stickers/v1/`:

- Box 1: box-1-left-sticker.webp / box-1-right-sticker.webp.
- Box 2: box-2-sticker.webp, exterior only.
- Boxes 3 and 5: box-3-5-left-sticker.webp / box-3-5-right-sticker.webp.
- Boxes 4 and 6: box-4-6-left-sticker.webp / box-4-6-right-sticker.webp.
- Boxes 7, 8, 9, 10 and 11: corresponding box-N-sticker.webp.
- Box 12: original text proof and existing v2 intent, no replacement image.

All twelve distinct supplied files have real alpha (minimum 0, maximum 255),
including Box 9. No background removal, image generation, resizing, re-encoding,
arrangement-photo replacement or asset-directory import was performed.

The board uses the entire intrinsic image, including transparent margins. Text
center/width/height are proportional to this same image coordinate system. Safe
rectangles lie within its visible exterior; client bounds and strict shared server
validation use the same registry. These are preview bounds, not a change to the
main arrangement or an automatic physical manufacturing approval.

One selected side produces one sticker and one approved option charge. Text/font/
color survive side changes. Per-box poses and undo/redo live in the owner-scoped
memory draft above route boundaries. Tap, pointer drag, corner resize, keyboard,
directional controls and view-only pinch/button zoom are independent of pricing.
Reset uses the existing branded confirmation and preserves the lettering.

`gift-box-personalization-intent-v3` uses the exterior application plus a strict sticker `placement` containing
`box-sticker-proof-v1`, exact box/view and proportional geometry. It is bound to
the selected box during commerce parsing and pricing, included in canonical design
identity, copied into the immutable snapshot and allowlisted into order/cart proof
presentation. v1/v2 retain their shapes and meaning. Existing sticker pricing and
font-license/option approval remain authoritative. New positions never call the
arrangement estimator or change its geometry.

## Standalone engraving

The public builder retains the existing visual engine and v2 specification. New
drafts use its existing neutral `{kind:'help'}` placement; customer-facing position
suggestions/review rows are removed, while admin configuration and historical data
remain intact. The scoped three-step progress follows Gift Box's circle/connector/
completed-check visual pattern without changing Gift Box's six steps.

Required surface, optional three overall photos, and actual artwork remain separate
roles. Upload areas are a visual option on the existing native picker; its file
input, cancel/session/abort lifecycle, byte validation and memory-only selection
are preserved. Overall photos use a styled native details accordion, compact
removable thumbnails and reduced-motion-aware expansion.

Real font samples, accessible language tabs, approved swatches and compact Lucide
movement/size controls replace technical dropdowns and word-heavy buttons. Existing
font IDs and original black/white/grey values are preserved. Outer and nested editor
errors appear once near the top and receive focus; fields and files stay intact.
Inspection, final acceptance, payment grouping and authorization are unchanged.

## Product text-only engraving

`product-engraving-v2` strictly stores designKey, configurationVersion, exact text,
fontId, colorId and approved material. Product/variant identity comes from the
ordinary cart envelope and immutable snapshot. Geometry, backgrounds, image uploads
and client amounts are rejected. New snapshots use product-engraving-order-v2.

A valid owner-saved mode=text configuration requires approved fonts, appearances
and material(s), with no mandatory surface. Existing visual configurations remain
capable and can accept new text designs using their existing approved registry;
their references are preserved. Admin edits explicitly save the new mode, advance
the existing monotonic configuration revision and retain historical image metadata.
No production records are silently converted. Price/readiness/launch requirements
remain the same server-derived decisions.

The existing dashboard surcharge, initially 10000 piastres, is reused. React never
hardcodes it. Server quotations and pricing/version fingerprints gate add and edit;
changed settings invalidate stale approvals. Accepted snapshot amounts stay fixed.
Product engraving remains merchandise, with ordinary stock/variant/checkout rules,
not the customer-owned inspection/payment service.

The compact form has real text proof, font gallery, swatches and server prices.
New orders have no canvas or artwork upload. Owner-scoped requests abort on unmount;
only opaque operation markers persist. Exact retries and cart-edit fingerprints
reuse the existing infrastructure. Legacy visual v1 carts route to the retained
legacy builder, and old owner/order views still reconstruct and retrieve original
artwork through existing authorization.

## Verification and release

Use only disposable local databases and synthetic customer files. Focused backend
coverage checks both new contracts, exact sticker snapshots, legacy compatibility,
server prices, stock, private uploads, inspection and order accounting. Browser
coverage includes real connected cart/order editing and legacy paths, native picker,
touch/keyboard/history/zoom, responsive proofs, no overflow, and all five requested
widths (320, 390, 768, 1024, 1440). The isolated sticker harness exercises all eleven
proofs without bypassing the existing development guard on Box 1's arrangement
artwork; the normal Box 2 flow verifies the customer/cart integration.

Release uses explicit file staging, main push, exact Render deployment verification
and the existing tokenless Production SEO renewal. Backend deployment alone is not
frontend release. If supported dispatch is unavailable: GitHub Actions > Production
SEO renewal > Run workflow > main, then verify the sealed source/publication and
Cloudflare's exact live identity. Never weaken expiry/indexing checks.

Checkout/cart/homepage refinement, new photo-product capabilities, catalog changes,
prices/inventory, production orders/settings, launch state and secrets are outside
this task. D2.1 photo collection is preserved. No real production order, payment or
personal-file upload is used for verification.

### Recorded local verification

- 79 affected backend tests passed, including both legacy and new contracts.
- Six visual-model tests passed.
- 42 distinct focused browser cases passed: 21 shared-editor/mandatory-fields,
  six Gift Box mapping/interaction/pricing/owner-view cases, and 15 connected
  product/standalone/inspection/photo-collection cases. Targeted reruns corrected
  outdated selectors/default-font assumptions and an old payment fixture choice.
- Genuine corrections found during verification: legacy stepper CSS collision,
  mobile dialog gutter overflow, server-quote readiness before Add, and the owner
  viewer's v2-only photo-coordinate recognition. All were corrected and covered.
- Frontend lint/build, server syntax and 84 SEO tests passed. Vite emitted a
  nonfatal plugin-timing advisory; the production build completed successfully.
- Actual screenshots were inspected at all five requested widths. Local copies
  are retained under ignored local-data/pre-handover-screenshots, including short
  Arabic lettering, long English/Arabic text and the real transparent box proofs.
- Twelve sticker copies match their source bytes. 205 pre-existing unrelated
  files match the preservation hashes. Production records were not modified.
