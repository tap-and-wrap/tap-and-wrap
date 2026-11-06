# Standalone engraving — local implementation and release review

The final local browser/account gate passed **406/406**; see
[ACCOUNT_RECOVERY_RELEASE_GATE.md](ACCOUNT_RECOVERY_RELEASE_GATE.md) and the reconciled
[87-file commit inventory](STANDALONE_ENGRAVING_FILES.txt). Production preparation and activation
remain separately authorized operations.

Baseline: `c5f8a46e10de804f0dc5e82c4988cba42bcdd89f`.

This feature sells work on customer-owned property. It does not create Products,
reserve/decrement stock, change imported catalog data, or implement product-level
engraving. Gift Box business behavior is preserved. All merchant configuration,
production database/provider changes, deployment and activation remain separate.

## Contracts

- Line kind: `engraving_service_v1`; quantity is exactly one. One Office Set line
  means one selected physical piece. Each deliberate new item gets a fresh UUID.
- Specification: `engraving-spec-v1`. Exactly one Text / Icons / Personal payload.
  Personal subtypes: photo, drawing, handwriting, fingerprint. No biometric work.
- Appearance: exactly black / white / grey, a preference without a finish guarantee.
- Initial reviewable definitions: nine types, 10,000 piastres each, disabled. These
  are exported definitions and disposable fixtures, never startup seed records.
- Configuration: stable type and placement IDs, immutable published content and
  monotonically increasing versions/revisions. Disable/retire through publication;
  preserve every placement ID. Retired IDs cannot be reactivated or recycled.
- Only the type price contributes to the service amount. No placement, font,
  appearance, icon or mode adjustment exists in the schema. Initially excluded
  from product bundles/coupons. Mixed merchandise/Gift Box + engraving checkout
  fails before order writes and leaves the cart unchanged.
- Default text ceilings: three lines, 80 Unicode code points total, 40 per line;
  merchant-configurable bounded limits. Arabic text requires an Arabic-supporting
  approved font. Preserve text/newlines; no product-photo overlay.
- Snapshot: `engraving-order-v1`, strict historical configuration, specification,
  font/icon asset identity, private role references and positive approved amount.
  No inventory claims. Operational changes do not rewrite immutable order lines.

## Private data and recovery

Purpose `engraving_service`, roles `item_photo`, `surface_photo`, `personal_artwork`.
Each upload belongs to an exact verified owner, physical-item UUID and role.
Signing also requires the current opaque cart owner context; a stale/rotated guest
cannot upload a previous owner's local draft into a new shopping session.

The item photograph is required, surface photograph optional, and Personal mode
requires one separate artwork image. JPEG/PNG/WebP, up to 8 MiB per file. The real
existing pipeline verifies bytes/dimensions and freezes a private copy after PUT.
Existing owner quotas, signing windows and 24-hour temporary expiry remain intact.
Cart addition never extends expiry. Expired images require explicit replacement.
Order creation atomically retains files and releases temporary quota.

Builder content/files remain in memory above route boundaries, scoped to verified
session generation and cart owner context. Navigation preserves them; refreshing
clears the draft. Object URLs are revoked when previews unmount. Browser storage
contains only opaque owner-scoped recovery keys and pending flags, never content,
filenames, file bytes or preview URLs.

Add and edit operations have immutable UUIDs/request hashes. Identical retries
acknowledge the original write; changed bodies conflict. Edits require the loaded
line fingerprint and replace atomically. Two identical designs on two physical
items remain separate. Cart merge atomically transfers uploads/quotas and verifies
them under the receiving owner, rebinding the owner-bound price review fingerprint.
Invalid private service lines abort merge instead of silently losing guest files.

Checkout preserves add-operation receipts privately on engraving orders, so a lost
Add response cannot recreate the line after another tab already ordered it. Reusing
an already ordered physical-item UUID for a different operation is rejected.

Cart/order summaries omit raw private upload references. The verified owner can
explicitly load editing/file metadata; admin bytes load only through deliberate
audited View actions. Existing private/no-store streams and dialog lifecycle apply.

## Payment and custody

Checkout records a positive-priced website order, unpaid, with collection pending.
The service price is not zero; amount due now is zero while authorization is pending.
An explicit collection capability gates payment instructions, normal proof signing,
proof submission, ledger collection, email and WhatsApp payment invitations, tracking
qualification and work transitions. A missing/corrupt service gate fails closed.

Per-item workflow:

1. Awaiting customer item.
2. Receive the item, recording condition/accessories.
3. Begin physical inspection.
4. Clarification or unsuitable outcome, or propose the inspected final placement.
5. Customer accepts the current final proposal on the owned order page, or admin
   records actual acceptance with private evidence. Proposal versions never reset
   after clarification. Placement help can resolve to a described merchant proposal
   without fabricating a placement ID.
6. Admin authorizes payment only when every item is physically held, inspected and
   its final specification accepted. This unlocks InstaPay; it records no funds.
7. Existing order-bound proof and independent receiving-account reconciliation
   determine payment verification through the existing `OrderSettlement` ledger.
8. Engraving starts only after authorization, accepted design and verified payment.
9. Complete engraving.
10. Record actual return arrangements; resolve separately agreed logistics charges,
    including explicit Free where applicable; record dispatch or customer collection.
11. Record actual return to the customer. This is `returned_to_customer` in custody,
    not the existing merchandise `returned` state.

Cancellation does not erase custody. Unsuitable/unengraved items retain safe return
actions. New review outcomes cannot bypass an already authorized/paid specification;
use explicit cancellation/reconciliation and safe return. A multi-item order remains
unpayable until all items qualify; partial acceptance/repricing requires a separately
reviewed replacement order rather than silently deleting immutable lines.

Unsolicited actual funds may be recorded only through an explicit admin reconciliation
exception. This does not authorize work or emit a premature Purchase. Refunds retain
existing actual-collection references and amount protections. No second ledger exists.
Separate charge quotation on engraving orders is restricted to logistics; a font,
placement or other engraving add-on cannot be introduced through the generic charge API.

Inbound handoff and outbound return are manual agreements. No courier, fee, timeline,
guarantee, compensation or new retention policy is invented. Website checkout keeps
its normal required contact fields and labels the service address as return/contact.

## APIs

All paths below are relative to `/api/v1`; existing auth, CSRF, Origin, database,
rate-limit and private response boundaries apply.

| Path | Contract |
| --- | --- |
| GET `/commerce/engraving/types?page=1` | Verified capability and current approved types, at most 20 per page; font/icon registries. Disabled returns no selectable types. |
| POST `/commerce/engraving/quote` | Strict specification, server price and owner-bound review fingerprint; does not verify local placeholder files or approve suitability. |
| POST `/commerce/cart/items` | New strict discriminated line; transaction, full file verification, current configuration fence. |
| GET `/commerce/cart/operations/:key` | Minimal exact-owner acknowledgment, including an already accepted order when applicable. |
| GET `/commerce/engraving/cart/:lineId` | Exact-owner editable specification and fingerprint. |
| POST `/commerce/cart/items` with replacement fields | Atomic engraving replacement with a new operation key and loaded fingerprint. |
| GET `/commerce/orders/:id/engraving-files` | Exact-owner role metadata, no public storage URL. |
| POST `/commerce/orders/:id/engraving/accept` | Exact-owner acceptance of the current proposed final specification. |
| GET/POST `/admin/commerce/engraving/types` | Bounded configuration list/publication; `expectedRevision` required; audited transaction. |
| POST `/admin/commerce/orders/:id/engraving-actions` | Bounded, strict, revision-safe workflow with immutable operation receipts. |

The builder stays on `/customize/laser-engraving`. While the new capability is disabled,
the existing legacy request page retains its own established intake gate. Historical
requests remain on the existing Requests administration pages and are not migrated.

## Assets and merchant prerequisites

Initial standalone font IDs reference versioned byte-for-byte copies of the existing
unmodified Amiri and Rochester binaries and their source/license notices. They are independent
IDs; existing Gift Box lettering/sticker identities are unchanged. Symbols are
original local geometric SVG assets under versioned paths with an origin/license
notice. They contain no scripts, external references or customer-provided SVG.

The merchant must explicitly review production font/symbol suitability and licenses
and approve the configured IDs. Disabled/incomplete definitions cannot become active
without positive prices and approved registries. Never overwrite a historical asset
path; add a new registry ID/version. The current task approves no production asset.

Owner decisions before activation: real per-type placements/material restrictions,
handoff/return procedures and fees, handling/damage/failed-work policies, retained
artwork/custody retention policy and staffed inspection/reconciliation procedure.

## Schema delta and separately authorized preparation

New collection: `engravingserviceconfigurations`.

- Unique `{ typeId: 1, version: 1 }`.
- Unique partial `{ typeId: 1 }` with `{ current: true }`.
- Existing `orders`: non-unique `{ owner: 1, 'cartAddOperations.key': 1 }` for owned
  post-checkout add recovery. Declared only when engraving configuration is enabled.
- Additive Order workflow/private add receipts and Upload item binding/purpose.
  No rewriting of historical records, TTL additions or Product inventory migration.

Both configuration model registration and the optional Order index are controlled
by `ENGRAVING_CONFIGURATION_ENABLED`. Normal startup verifies schema read-only with
autoCreate/autoIndex disabled. Missing required schema blocks readiness.

Future procedure, **not executed or authorized by this local implementation**:

1. Independently authorize exact-target read-only schema inspection, backup/recovery
   and model/index delta review. Confirm the actual approved production host and
   `tapandwrap_production`; never infer permission from a URI or existing flags.
2. Keep `ENGRAVING_ENABLED=false` and `ENGRAVING_LAUNCH_AUTHORIZED=false`. Set only
   `ENGRAVING_CONFIGURATION_ENABLED=true` for the reviewed preparation model list.
3. From `server/`, `npm.cmd run schema:init` remains the offline dry-run. The existing
   initializer includes the complete declared registry: review that full list and
   existing indexes before authorizing writes; it is not a narrow automatic repair.
4. Only with separate database-write authorization and privately supplied exact target,
   host, TLS, runtime and authorization settings, the guarded command is:

   `npm.cmd run schema:init -- --apply --target production --confirm-schema-writes --confirm-production-schema`

5. Reverify indexes/readiness read-only. Do not drop/rename incompatible indexes,
   backfill records, seed configurations or run importers as part of this command.
6. Release compatible backend first with engraving intake disabled, then frontend.
   Do not change existing checkout/payment flags or Gift Box settings.
7. Separately authorize merchant configuration and synthetic real-topology smoke
   tests for cookies/CSRF, storage/CORS/private viewing, ownership, inspection/payment
   gates, accounting and safe return. No real payment is part of this implementation.
8. Only after release/merchant approval authorize engraving intake flags. Keep
   reconciliation and custody/return operations available if intake is disabled later.

Rollback: close new engraving intake without deleting configurations, orders, files,
settlements or custody. Keep a compatible reader/operator backend. Do not roll back
to code that rejects accepted engraving line kinds or bypasses their collection gate.

## Verification record

Final executed results, screenshots and exact changed-file inventory are recorded in
`STANDALONE_ENGRAVING_VERIFICATION.md` and `STANDALONE_ENGRAVING_FILES.txt`.
All test provider behavior is isolated. Builds and disposable tests do not prove
production connectivity, live storage/email delivery, real payment or launch readiness.
