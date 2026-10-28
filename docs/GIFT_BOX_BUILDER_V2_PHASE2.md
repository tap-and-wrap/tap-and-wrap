# Gift Box Builder V2 — Phase 2 backend foundation

28 October 2026. Implements the owner's approved fixed settings, restricted APIs and server-authoritative component estimates on `feature/gift-box-builder-v2`. Phase 1 source assets, asset hashes, geometry definitions and unrelated local work are preserved. This phase adds no customer/admin interface, request submission, order conversion, migration, provider operation or checkout activation.

The latest approved chocolate selector is a **text button showing the saved chocolate name**; each tap will add one approved transparent chocolate image. The chocolate catalog remains empty. New owner photographs may remain source/reference assets, but existing catalog photographs are never substituted for the new builder artwork. Ribbon buttons use immutable approved solid colors; gift cards use text only. Neither pending category has an invented identity, price, availability or color.

## Model and approval semantics

`GiftBoxComponentSetting` uses collection `giftboxcomponentsettings`. It has a unique `componentId` index, strict unknown-field rejection, optimistic concurrency and disabled automatic collection/index creation.

| Field | Contract |
| --- | --- |
| `componentId` | Required immutable string; must exist in the code-owned fixed registry |
| `displayName` | Nullable until configured; saved names are trimmed, nonempty and at most 120 UTF-16 units, without control characters |
| `displayOrder` | Integer 0–1,000,000; first save inherits authoritative numeric source order unless explicitly changed |
| `pricePiastres` | Null or a nonnegative safe integer; never floating-point EGP |
| `enabled` | Boolean, default false |
| `priceApproval` | Server-owned `pending`, `paid` or `complimentary` |
| `priceApprovedBy`, `priceApprovedAt` | Server-owned approval actor/time, absent when price is null |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Server-controlled audit metadata; creation actor is immutable |
| `__v` | Internal optimistic revision; exposed only as admin `revision` or estimate `settingsRevision` |

Categories, assets, hashes, geometry, ribbon colors and internal definitions are not setting fields. No `ComponentOption` or Product records are created, updated, linked or used as pricing fallbacks. Missing settings are represented virtually as revision 0, disabled, unnamed and unpriced; listing the catalog does not seed records.

A positive price explicitly saved by an authenticated administrator is approved as `paid`. Null clears the price and its approval metadata. Zero requires the simultaneous `confirmComplimentary: true` approval intent. This flag is an update envelope, not a fifth editable catalog property, and is not stored as a configurable default. It is rejected unless `pricePiastres` is explicitly zero. Later name/order/availability edits preserve the saved approval state. An invalid or absent price never becomes free.

## Feature and schema safety

The new source setting `GIFT_BOX_BUILDER_BACKEND_ENABLED` defaults false. No `.env`, production configuration or deployed service was changed. This is a backend foundation gate, not a launch authorization or checkout flag.

With the flag absent/false, the model is excluded from the normal required-schema list. Importing it does not create a collection or indexes. New APIs return `GIFT_BOX_BACKEND_DISABLED` once normal API readiness/authentication checks pass; existing Laser Engraving and customization routes retain their current behavior.

When explicitly enabled in a future authorized environment, normal startup includes the new model in read-only schema verification. Every new builder service also verifies its collection and unique index read-only before use. Missing schema returns `DATABASE_SCHEMA_NOT_READY`, not an implicit collection creation or seed. An enabled deployment with missing required schema will fail normal readiness; prepare/verify schema separately before any authorized activation.

Existing guarded schema tooling remains the only initialization path. No initialization, migration or existing-database connection was performed. Backend writes and estimate snapshots require a dedicated transaction-capable local/staging target under the existing target/topology rules. Production operation is outside this authorization.

## API contracts

All paths are relative to `/api/v1`. Responses follow the existing `{ ok, data }` / `{ ok: false, error }` envelopes. All new responses are private/no-store and noindex. Public endpoints are rate-limited to 90 requests per minute per validated client IP. POST estimates require the existing signed CSRF token/cookie and exact Origin even though estimates do not persist selections.

| Method and path | Contract |
| --- | --- |
| `GET /admin/gift-box/components` | Admin-only fixed catalog with virtual/saved settings and revisions |
| `GET /admin/gift-box/components/:componentId` | Admin-only single known component and its current revision |
| `PATCH /admin/gift-box/components/:componentId` | Revision-aware update/create of settings for an existing registry identity only |
| `PATCH /admin/gift-box/components/reorder` | Atomic, revision-aware reorder of one complete category |
| `GET /gift-box/catalog` | Public read of fixed component presentation/pricing availability; no private settings metadata or source image paths |
| `POST /gift-box/estimate` | Public, accountless, read-only component estimate; no cart, request, inventory or order writes |

Both lists accept only `category`, `page`, `limit`. Categories are `box`, `flower`, `plush`, `chocolate`, `ribbon`, `gift_card`. Page is 1–200; limit is 1–20, default 20. Results remain grouped by category, sorted by saved display order with authoritative initial order as the stable tie-break. Pending categories return empty component arrays. Public `availableForEstimate` describes pricing eligibility only, never physical fit or permission to submit.

Admin DTOs include `componentId`, derived `category`, display name/order, enabled status, approved `pricePiastres`, `pricing`, `availableForEstimate`, `revision`, `configured` and relevant timestamps. Public DTOs omit admin revisions/approval timestamps/actors. They do not return local paths, asset hashes, source URLs, or fabricated CDN URLs. Future ribbons expose only their approved code-owned color. Asset delivery integration remains Phase 3 work.

The single-setting PATCH accepts only:

- `expectedRevision` — required loaded revision.
- Any of `displayName`, `displayOrder`, `pricePiastres`, `enabled` — at least one.
- `confirmComplimentary: true` — only with an explicit zero price.

Unknown identities or properties are rejected, including attempted category, asset, hash, geometry, color, approval-actor and internal-revision changes. There are no component POST/create, DELETE, submission or conversion endpoints. Legacy component editors cannot address these string registry identities as ComponentOption ObjectIds.

The reorder body is `{ category, items: [{ componentId, expectedRevision }, ...] }`. Include every fixed identity in exactly one nonempty category once, in the desired order. Cross-category, missing, duplicate, unknown or revision-less entries fail validation. Display orders become 1…N within that category. Each setting's revision is checked; any conflict rolls back the entire batch. Single-setting display-order edits are also allowed; ties remain deterministic.

## Revision and audit behavior

A missing setting has virtual revision 0. Its first successful PATCH creates revision 1 atomically with approval metadata and an `AdminAudit` event. Mongoose normally initializes new version keys to zero; the service explicitly consumes that initial revision inside the transaction so another stale zero draft cannot overwrite the first save.

Later saves use Mongoose optimistic concurrency and `expectedRevision`; even same-value saves advance the revision. Concurrent creation is protected by the unique index. Duplicate creation or stale-save races return HTTP 409 `EDIT_CONFLICT`. No automatic merge or overwrite is attempted. Future editors must retain drafts and offer an explicit reload/review action.

Settings updates and reorder batches share the transaction with `gift_box.component.updated` or `gift_box.category.reordered` audit records. Audit failure rolls back the setting changes. Audit details contain bounded IDs, changed field names, revision/approval mode or category/count, not customer messages. Actor identity comes from the verified admin session, never the body.

## Estimate and pricing validation

The strict estimate body contains:

```json
{
  "boxId": "box-2",
  "items": [{ "componentId": "rose-red", "quantity": 2 }],
  "ribbonId": null,
  "giftCard": null
}
```

This is a selection example, not an availability, price, stock or physical-fit claim. Exactly one box is required; its quantity is always one. Optional `items` contains distinct flower/plush/chocolate IDs with integer quantities. Ribbon and gift-card choices are at most one each, addressed by approved fixed IDs once those catalogs exist. Box IDs cannot be used as item lines; other categories cannot impersonate a box, ribbon or card. No known product catalog entries are inferred as builder components.

Computational limits are 100 per item line, 100 distinct additional lines and 200 total additional units. These are abuse/processing bounds, not approved box capacity. Zero, negative, fractional, string, nonfinite, duplicate or over-limit quantities are rejected. A duplicate component must be represented as one quantity line, while the later UI may keep individual placement instances independently.

All selected identities must have enabled saved settings and internally consistent approved prices. Positive approved paid prices and explicitly approved complimentary zero prices are accepted. Missing, disabled, pending, negative, fractional, unsafe or inconsistent prices are rejected. Client prices, totals, delivery fees, placement data and approval flags are unknown fields and fail validation rather than influencing the result.

The estimate reads all selected settings in one read-only snapshot transaction, multiplies each saved unit price by its quantity and sums the lines with safe-integer overflow guards. It returns item IDs/categories/names, quantities, approved unit prices, line subtotals, setting revisions, and the summed `componentSubtotalPiastres`. Currency is EGP; all amounts remain integer piastres. Delivery is a separate `{ status: "pending_confirmation", pricePiastres: null }` value and is not treated as free or included in the component subtotal.

This is a nonbinding component estimate. It does not reserve inventory, persist messages/selections, issue a checkout token or promise that a future request will use the same prices. Future submission must revalidate saved settings and customer review, then preserve immutable price/configuration snapshots. Accepted quotations/order accounting remain untouched.

Every estimate explicitly returns `arrangementApproved: false`, `submissionAllowed: false`, `orderConversionAllowed: false`, the current catalog/asset/geometry versions and relevant blockers. Price eligibility does not override the Phase 1 unreviewed geometry or the box-1 artwork issue. No builder ID/message can be submitted through the strict legacy request schema.

## Gift-card text and pending categories

The exported backend message validator accepts nonblank, well-formed Unicode text up to 500 code points (including 500 supplementary-plane emoji), with normal line breaks/tabs permitted and other control characters rejected. Objects, malformed surrogate strings, blank text and over-limit messages fail. Markup is preserved as literal customer text; it is never interpreted, executed, rendered to an image or inserted into audit metadata. The later interface must render it as text and use the shared policy limit, not JavaScript string length alone.

An eventual selected card has `{ componentId, message }`, but today any supplied card identity is unknown and rejected. The backend does not infer a complimentary card or accept a message as an approved card product. No message is stored in Phase 2. Chocolate and ribbon identities likewise remain pending; adding them requires reviewed code-owned definitions, stable IDs, approved artwork/colors and approved saved prices. No database product placeholders or stock mappings were created.

## Files in this phase

Created:

- `server/src/models/GiftBoxComponentSetting.js`
- `server/src/gift-box/validation.js`
- `server/src/gift-box/pricing.js`
- `server/src/gift-box/catalog.js`
- `server/src/gift-box/routes.js`
- `server/test/gift-box-pricing.test.js`
- `server/test/gift-box-api.test.js`
- `docs/GIFT_BOX_BUILDER_V2_PHASE2.md`

Modified:

- `server/src/app.js` — isolated route mounts.
- `server/src/config/env.js` — default-off backend source setting.
- `server/src/config/schema.js` — conditional read-only schema registration.
- `server/package.json` — include new files in the existing focused test command.
- `shared/gift-box/definitions.mjs` — pending chocolate presentation is now a text button with one addition per tap.

The `.gitignore`, Phase 1 files and unrelated untracked files were already present; they are not new Phase 2 edits. No dependency/lockfile, existing commerce model, engraving route, customer route, source image or production configuration was changed.

## Verification and limits

| Executed check | Final result |
| --- | --- |
| `server/npm.cmd run test:giftbox` | 54 passed, zero failed/skipped: 24 Phase 1 cases plus 30 pricing/API cases |
| `server/npm.cmd test` | 585 passed, zero failed/cancelled/skipped, five suites; includes the 54 focused cases, not an additional 585 distinct gift-box cases |
| `server/npm.cmd run check` | Passed for 194 JavaScript files |
| `client/npm.cmd run lint` | Passed |
| Isolated Vite build plus offline SEO generation | Passed: 1,789 modules, 22 noindex development routes, zero indexable routes, checkout offers disabled |
| `server/npm.cmd run giftbox:assets:audit` | All 79 sources valid; 32 component mappings, 35 alpha images, zero duplicates; original checksum unchanged |
| Git whitespace/output review | Passed; generated output remains ignored and source assets remain outside the application build |

All database tests use fresh disposable loopback replica sets through the environment-scrubbed runner, never developer credentials or an existing merchant database. Test-only collection/index initialization and missing-schema/index simulations operate exclusively on those disposable fixtures. No live providers, persistent imports, emails, stock changes or external calls were performed.

Coverage includes unknown IDs, invalid/missing/complimentary prices, disabled settings, quantity limits, reorder/name edits, concurrent first saves and updates, whole-batch rollback, audit failure, authorization/CSRF/Origin denial, immutable-field rejection, tampered client amounts, HTTP and arithmetic overflow, Unicode/card validation, current saved-price refresh, pending catalogs, absent collections/indexes and legacy-request rejection of builder payloads. Existing full-suite engraving, product customization, requests, orders, ownership and schema/operations coverage also passed.

The first focused run failed seven API assertions because Mongoose reset the inserted version key to zero, allowing a stale virtual revision-zero save to succeed. The first-save revision is now advanced atomically within the settings/audit transaction; concurrency, stale-save and batch tests passed after the fix. Three further HTTP cases then verified fresh estimates, arithmetic overflow and absent-collection behavior; the final full suite above includes them. No authorization/rate-limit/schema guard was weakened to make tests pass.

Final full-suite logs are in ignored `server/.cache/gift-box-phase2-full-tests-2.log`. The build uses ignored `client/test-results-gift-box-phase2-20261028/build`, environment-file loading disabled and no publication inputs. Existing `client/dist`, Phase 1 results, source media, backups and unrelated untracked files were preserved. No browser UI or connected React contract tests were rerun in this backend-only phase. Existing-database initialization, production activation, physical geometry and UI behavior remain outside this verification.

## Recommended Phase 3

After owner review, build the dedicated five-step interface and restricted owner settings editor against these contracts. Keep navigation state, image-based box/plush choices, bouquet-based flower choices, chocolate name buttons, solid ribbon swatches and card text consistent with the final brief. Introduce only a narrow allowlisted local asset resolver; preserve the original source collection and existing site routes.

Obtain reviewed usable box regions, physical scale/capacity and foreground masks before treating real placement as valid. Keep pending options clearly unavailable, all geometry approval checks intact, and submission/conversion disabled. Correct and re-audit box 1 under a new reviewed asset version. Admin conflict recovery must preserve drafts; price updates require server recalculation and customer review. Submission/snapshots and any inventory/order mapping remain separately authorized later work, not incidental Phase 3 activation.
