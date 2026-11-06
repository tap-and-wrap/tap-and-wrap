# Narrow engraving schema preparation

Prepared locally; no production connection or DDL was executed. The owner reports
34 production collections, no engraving configuration collection and no Order
recovery index. Full production index options still require operator verification.

## Scope and safeguards

Run `server/scripts/prepare-engraving-schema.js` instead of the global initializer.
No arguments gives an offline dry-run, without importing models or loading dotenv.
`--inspect --target production` explicitly connects read-only. Apply requires
`--apply --target production --confirm-engraving-schema-writes --confirm-production-schema`.
These confirmations are not a substitute for separate owner write authorization.

The only permitted DDL is:

| Collection | Object |
| --- | --- |
| engravingserviceconfigurations | Create collection if absent (automatic `_id_` index included) |
| engravingserviceconfigurations | `typeId_1_version_1`, `{typeId:1,version:1}`, unique |
| engravingserviceconfigurations | `typeId_1`, `{typeId:1}`, unique, partial exactly `{current:true}` |
| orders | `owner_1_cartAddOperations.key_1`, `{owner:1,'cartAddOperations.key':1}`, nonunique, nonsparse, no partial filter/TTL |

Equivalent differently named indexes are accepted; same-name or same-key incompatible
indexes stop the operation. Comparisons include ordered keys, unique, sparse, partial
filter and TTL; collation, hidden and prepareUnique variants also fail closed.
Unexpected additional configuration indexes or nonstandard collection options stop
for review. Unrelated Order indexes are read, never repaired or removed.

The complete preflight runs before DDL and is repeated immediately before apply.
An existing engraving collection receives only a bounded existence probe with `_id`
projection; no document is returned or logged. Any existing record stops for manual
review, even when indexes are already correct. Thus repeat execution is supported
while the collection remains empty; after merchant configuration, use normal runtime
verification rather than this preparation tool. No seed/update/delete API exists.

The script cannot make multi-command DDL atomic. Run during an operator-controlled
window without concurrent configuration/schema changes. A failed/uncertain command
may leave additive objects behind: stop, inspect, then explicitly rerun only after
review. No automatic drop, rebuild or destructive rollback occurs.

## Operator procedure

1. Independently confirm approved Atlas project/cluster and exact host. Privately
   supply terminal-only `MONGODB_URI` with authenticated TLS and exact database path
   `/tapandwrap_production`, `NODE_ENV=production`, `DATABASE_TARGET=production`,
   `PRODUCTION_DATABASE_AUTHORIZED=true`, and exact `PRODUCTION_DATABASE_HOST`.
   Use a scoped principal with metadata reads, configuration existence-read access,
   and (only for authorized apply) createCollection/createIndex permissions on the
   two named collections. Do not copy credentials into command arguments or reports.
2. Keep all production service/checkout/payment/Gift Box settings unchanged. This
   script needs no engraving feature flag and never sets one. Keep intake disabled.
3. From `server/`, run the offline plan:

   `node scripts/prepare-engraving-schema.js`

4. Read-only production inspection, **NOT EXECUTED here**:

   `node scripts/prepare-engraving-schema.js --inspect --target production`

   Resolve `ENGRAVING_INDEX_MISMATCH`, unexpected records/options/indexes or missing
   orders through independent review. `MISSING_SCHEMA` is an additive plan, not a
   conflict. A failure returns a stable code without driver messages or credentials.
5. After separate write authorization, **NOT EXECUTED here**:

   `node scripts/prepare-engraving-schema.js --apply --target production --confirm-engraving-schema-writes --confirm-production-schema`

6. Rerun step 4: require `SCHEMA_READY`, empty missing list and `writes:false`.
   Review full `listIndexes` output privately for exact options and same-name/key
   conflicts; verify the rest of the deployed model registry separately. This tool
   certifies only its narrow delta, not global production readiness.
7. Release compatible backend first with intake disabled; check read-only readiness
   and existing commerce, then frontend. Merchant definitions, asset approval,
   topology/storage smoke checks and activation remain separately authorized.

Rollback closes intake while preserving additive schema and compatible historical
order/payment/custody readers. Do not remove indexes or configuration/order records.

## Local verification

Focused tests exercise offline and connected read-only plans, target rejection,
explicit confirmations, index option conflicts, unexpected records, idempotency and
actual disposable MongoDB command monitoring. No production provider is used.
Run from `server/`:

`npm.cmd test -- test/engraving-schema-preparation.test.js test/database-safety.test.js`

`npm.cmd run check`

Executed locally: 29/29 focused tests passed (including real disposable MongoDB),
offline CLI returned `connected:false`, `writes:false`; server syntax checks passed
for 276 JavaScript files. No full commerce/browser suite was rerun because runtime
commerce/frontend source is unchanged.
