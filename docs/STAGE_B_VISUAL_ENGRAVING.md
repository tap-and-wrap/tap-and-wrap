# Stage B: shared visual engraving editor

Base main: `0b98c1a6e5edb9d85839e496d3a472fc6f289a70`.

This is an isolated reusable editor. It has no production route, purchase action,
upload action, price calculation or automatic persistence. The existing standalone
studio, immutable v1 specifications/orders, inspection-before-payment workflow,
Gift Box Builder, reviews, catalog, inventory, checkout and SEO safeguards remain
unchanged. No backend runtime, environment settings or dependencies change.

## Architecture and host contract

`client/src/engraving/visual/VisualEngravingEditor.jsx` is the shared React entry.
`design.mjs` owns versioned geometry, validation, history, draft reconstruction and
editor readiness. `private-assets.js` uses the existing session-aware Axios client
and private content endpoint for an explicit, authorized read. The scoped stylesheet
uses existing brand tokens and licensed engraving font assets.

The same editor accepts either a selected local surface photograph or an approved
catalog image. Layers contain Text or Image artwork only. No icon picker or new
icon library is included. Existing `DesignPreview` and legacy registries remain
untouched for historical icon/Drawing orders; v1 specifications are deliberately
rejected by the new validator rather than silently converted.

Host inputs:

- `ownerScope`: verified shared session owner/generation combined with the opaque
  cart owner context, as in the existing engraving draft provider. A different scope
  remounts the editor and clears local state/resources. A session generation change
  immediately unmounts private content, including when the host has stale props.
- `initialDraft`: optional `{ ownerScope, design }` produced by `createVisualDraft`.
  Only initialize once per mount; deliberately remount for another saved design.
  A mismatched owner or invalid version/geometry fails closed.
- `assets`: map of opaque asset IDs to `{ ownerScope, blob }` for verified private
  images, or `{ approved: true, src }` for owner-approved catalog image DTOs. Catalog
  approval must come from the trusted host, never a customer-controlled assertion.
  Use the approved image's intrinsic ratio in `design.surface.aspectRatio`.
- `approvedFontIds`: current item/service configuration's approved registry IDs.
  No implicit default font approval. Arabic text requires an Arabic-supporting ID.
- `onChange(draft, resources, readiness)`: committed proportional metadata,
  memory-only resources and editor readiness. The callback does not imply server
  pricing, inventory readiness, file retention or checkout authorization. It is
  emitted for design edits and resource/font approval changes, not zoom/selection.

The production application does not import this module. The browser harness is
an HTML entry under `client/e2e/fixtures/visual-engraving/`, outside the production
input graph. It is absent from the production build. Synthetic image fixtures are
test-only, not supplied customer or product content.

## Geometry and interaction

`visual-engraving-v1` stores the surface asset ID/intrinsic aspect ratio and an
ordered layer array. Each layer has an opaque ID, type, center `x/y` in `[0,1]`,
width relative to the full surface width and its own aspect ratio. Text also stores
literal text, approved font identity and black/white/grey appearance. Image layers
store a separate opaque artwork asset ID. Array order is visual back-to-front.

The full background is shown uncropped with `object-fit: contain`. Layer height is
derived from the two aspect ratios. Movement and uniform resizing keep artwork
inside the surface. Text uses actual licensed fonts with font-ready SVG lettering;
image pixels are rendered directly, without filters, tinting or conversions.

Customers can tap the surface to place a selected layer, drag, resize by the corner,
select layers, bring forward/send backward and use movement/size buttons. Arrow
keys move the focused layer; Shift increases the step. The resize handle accepts
arrow keys. Normal Tab/Shift+Tab navigation and visible focus remain available.

Workspace zoom is independent view state (100–300%), controlled by buttons or
two-finger pinch. Two-finger movement and native scrollbars pan the workspace.
Neither view zoom nor selection is serialized into engraving geometry. A pinch
starting on empty surface cannot accidentally place artwork. Pointer cancellation
discards its temporary drag. A completed drag/resize is one undo entry. Undo/Redo
also cover content, layer order, surface replacement, removal and Reset; Reset
clears the design while retaining the surface. Reduced motion introduces no
animated editor transitions. No customer pixel or physical-dimension fields exist.

## Files, reconstruction and integration boundaries

The existing WAM-style `ImageSourceChooser` remains the native picker. It copies
and validates JPEG/PNG/WebP signatures, size and decode before delivery. Selections
stay in memory; there is no upload until a future host deliberately invokes the
existing private upload pipeline. Object URLs are revoked on resource change or
unmount. No customer text, filenames, bytes or preview URLs enter browser storage.

Surface and artwork asset IDs must differ. Future optional overall item photos
belong to the host's `item_photo` reference, outside this visual design. The surface
maps to `surface_photo`, and actual artwork to `personal_artwork`; do not flatten
these roles into one image or replace originals with a composited proof.

JSON round-trip preserves geometry, text, layering and opaque references. Reopening
after refresh requires the host to reload already saved assets using its existing
owned cart/order metadata and explicit private read. The isolated test performs a
real browser refresh, authorized mocked byte reads and reconstruction. Unsaved
local photos are intentionally not persisted across refresh. Missing/expired files
remain missing and block editor readiness; no retention extension is attempted.

`loadPrivateVisualAsset` only accepts an opaque upload ID, verifies the current
session owner and generation before/after the private request, aborts on session
change and honors caller cancellation. The server still enforces actual upload
ownership, role/item binding and expiry. It accepts no storage key or proof URL.
Cart-owner rotation must also abort the host's outstanding hydration controller.

`designReadiness` rejects absent surface/artwork, empty designs/text and withdrawn
font approval. The host must enforce current business limits and server validation
again when integrating; client readiness is not authorization.

## Stage C and later

Stage C should mount the shared editor in the standalone flow, supplying verified
owner context, actual surface photo and configuration fonts. Add a reviewed,
versioned server/cart/order visual attachment and owned reconstruction path before
enabling submission; the current strict `engraving-spec-v1` must not receive new
fields or lose legacy icon/Drawing history. Keep overall item photos separate,
inspection/acceptance before payment, immutable retries, retention and ownership.

Store-owned product integration remains a later stage. Its approved image comes
from the catalog DTO; pricing belongs to a server-approved host configuration,
separate from the visual attachment. The planned EGP 100 surcharge is not stored
in this model or charged anywhere. No temporary flags/admin switches are added.

## Verification

Final affected browser pass: **13 passed**, consisting of ten new editor cases
and three unchanged Stage A regressions. Screenshots at 390 and 1440 px were
visually inspected and remain in ignored `client/test-results/`; all media is
synthetic. No horizontal overflow was observed.

- Six pure model tests cover strict serialization, proportional bounds/aspect
  ratios, history, Arabic, legacy separation and fail-closed readiness.
- Ten editor browser tests cover 390/1440 px, text/images, actual touch drag,
  pinch, resize, keyboard, cancellation, colors, layering, history, reconstruction,
  owner changes/stale responses, missing/failed assets and current font approval.
- Three unchanged Stage A browser tests cover homepage/menu/reviews at both sizes
  and responsive approved hero sources.
- Three selected existing backend tests use the original scrubbed test runner
  environment and disposable local replica set: wrong owner/role/expiry, guest
  merge/rotation, and historical Drawing/text snapshot compatibility.
- Frontend ESLint and production build passed. Build isolation inspection passed
  across all 82 generated JS/CSS assets: editor code, styles and harness are absent.
  Default build retains noindex output; no database/provider deployment was run.

Frontend commands from `client/`:

```powershell
node --test src/engraving/visual/design.test.mjs
npm.cmd test -- e2e/visual-engraving.spec.js e2e/stage-a.spec.js
npm.cmd run lint
npm.cmd run build
```

All six model tests and three selected disposable backend tests passed. Backend
selection used `--test-name-pattern` in the existing runner's spawned Node process,
retaining its full environment scrubbing and disabled external providers. No broad
engraving, Gift Box or payment suite was run. No production connections, data
mutations, secret changes, push or deployment were performed.

An initial optional backend test command had a PowerShell quoting error before
execution. It was corrected using a literal here-string; no configuration or
merchant database was read. An initial ESLint ref-cleanup warning was corrected.
