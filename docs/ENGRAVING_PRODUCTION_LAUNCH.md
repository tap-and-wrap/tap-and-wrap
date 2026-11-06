# One-command production engraving publication

The owner explicitly authorized production configuration, asset approval, later
intake activation and controlled production testing on 6 November 2026. This
utility publishes through the existing authenticated admin API, not raw MongoDB.
It does not require or load a MongoDB URI, developer dotenv or Render credentials.

From the repository in a local PowerShell terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\RUN_ENGRAVING_PRODUCTION_LAUNCH.ps1
```

The execution-policy override applies only to this invocation; it does not change
Windows policy. Where scripts are already allowed, the shorter invocation is
`.\RUN_ENGRAVING_PRODUCTION_LAUNCH.ps1`. Enter an existing production administrator
email and hidden password locally. Never send credentials in chat. No nine manual
form submissions, operator impersonation or database credentials are involved.

The launcher scrubs inherited child configuration and passes credentials only
through stdin. Passwords, cookies and CSRF tokens stay in process memory. The
temporary authenticated session is logged out when the operation ends. A logout
warning requires operator review; no logout failure is hidden.

## Operation

1. Fixed production targets: `https://api.tapandwrap.net` and asset origin
   `https://tapandwrap.net`. Redirects are not followed. Authentication and CSRF
   cookies never accompany asset requests. A process-only DNS resolver uses
   Cloudflare `1.1.1.1` and `1.0.0.1`; OS/server DNS and database guards are unchanged.
2. Require healthy database readiness and existing checkout enabled. Verify the
   two original font hashes, all twelve font/license paths, 48 safe local symbols,
   nine original category illustrations and hosted bytes (85 asset references).
   This verifies asset integrity/provenance notices, not material suitability.
3. Authenticate via login + CSRF, verify the live admin identity through `/auth/me`,
   and load every current configuration page and deployed font/icon registry.
4. Build the entire plan before writes. Refuse duplicate IDs, retired initial
   types or invalid revisions. Existing placement identities, including disabled
   and retired positions, are preserved. Unrelated types remain untouched.
5. Publish only missing/changed initial types through the versioned route using
   loaded `expectedRevision`. Missing types default to active, asset-approved,
   10,000 piastres and text limits 3/80/40. Studio V2 upgrades add twelve font IDs,
   48 symbol IDs and the type's suggested placement IDs. Existing merchant names,
   prices, status, display order, text limits and placement settings are preserved.
   Other retains placement help without a fabricated placement. A line is one
   item and one placement; Office Set is one selected piece.
6. Verify all nine current types and unchanged checkout. A matching rerun publishes
   nothing. An uncertain POST is never automatically repeated: exact single-version
   readback can confirm it, otherwise stop and explicitly rerun after inspection.

No all-nine transaction is claimed: earlier successful publications survive a
later failure. A rerun inspects current revisions and skips completed work. Never
activate intake following an incomplete/uncertain report.

Sanitized report: `client/test-results-engraving-production-launch/latest.json`
(ignored). It contains public configuration summaries and asset hashes, not
credentials, customer data, storage keys or database connection strings.

Optional modes: add `-PreflightOnly` for anonymous, read-only readiness/assets;
add `-VerifyOnly` to authenticate and verify configurations without publications
(login/logout still create/remove the temporary authenticated session).

## Activation and production smoke

Only after the nine-record report succeeds, merge the two authorized Render flags
`ENGRAVING_ENABLED=true` and `ENGRAVING_LAUNCH_AUTHORIZED=true`, preserving
`ENGRAVING_CONFIGURATION_ENABLED=true` and all other settings. The utility never
changes environment flags; use the connected Render management tool separately.
Wait for the deployment to become live and verify the public type endpoint.

Then test the builder with disposable sessions, synthetic images and clearly marked
test content: nine EGP 100 cards, Text/Icons/four Personal types, role-bound private
uploads, Help me choose, review/cart and an unpaid inspection-gated test order.
Do not transfer money, upload real payment proofs, arrange shipment or alter
merchant stock. Gift Box and ordinary commerce require non-mutating smoke checks;
do not place stock-consuming product orders as a regression test.

Activation and end-to-end production results must be reported as actually observed.
Local tests do not prove successful production publication, private storage or orders.

## Focused checks

From `server/`:

```text
npm.cmd test -- test/engraving-production-launch.test.js test/engraving-production-launch-api.test.js
npm.cmd run check
```

The API test uses a fresh disposable local replica set, real authentication,
version publication and audit attribution; it never loads production credentials.

## Executed production result — 6 November 2026

The owner ran the launcher with an existing administrator locally. The sanitized
report confirms all nine configurations at version 1/revision 1, active and asset
approved, 10,000 piastres, both fonts, all icons, no predefined placements, 3/80/40
text limits. Temporary-session logout succeeded. The published IDs are:
`perfume`, `necklace`, `bracelet`, `watch`, `lip-gloss`, `makeup`, `bag`,
`office-set`, `other`. No extra versions were needed.

Only the three engraving Render flags were merged as true, with replacement false.
Activation deployment `dep-dbmoinei0phs73cefqjg` became live at source commit
`c800bbcfd7f6cb9926be3d2575da4c4d89a22aab`. Independent public readback confirms
all nine types available at EGP 100 and checkout still enabled.

Production browser smoke exercised actual item/surface/artwork uploads, Arabic and
English font loading, all three icons, all four Personal subtypes, black/white/grey,
placement help, notes, review and seven distinct cart lines. One synthetic order
was created: **767557**, ID `6aed8a72ae74994980105ffa`, seven service lines, EGP 700,
unpaid, payment collection unauthorized and no transfer instructions. Direct proof
upload signing returned `409 ENGRAVING_PAYMENT_NOT_AUTHORIZED`. No payment or
shipment/fulfillment action was performed. This clearly marked test order and its
synthetic private files remain for merchant review; no physical item exists.

The full smoke then hit a test selector ambiguity between prerendered and hydrating
Gift Box main elements. The selector was corrected without changing Gift Box source.
A separate read-only follow-up passed Gift Box builder and ordinary empty checkout
with all browser mutations blocked and zero additional orders. The initial failure
report remains intact; no complete rerun or second production order is claimed.

Evidence (ignored):

- `client/test-results-engraving-production-launch/published-nine-types.json`
- `client/test-results-engraving-production-launch/active-public-verification.json`
- `client/test-results-engraving-production-smoke/latest.json` (includes selector failure)
- `client/test-results-engraving-production-smoke/read-only-followup.json` (passed)
- Screenshots in the same smoke directory.

Local verification: 13/13 launch tests (including actual isolated API/auth/audit and
no-op rerun), 22/22 existing engraving lifecycle tests, 279 server syntax checks,
smoke-script ESLint/syntax, whitespace checks and actual PowerShell `-PreflightOnly`
invocation passed. No existing application,
Gift Box, payment, database-guard or schema initializer source was changed. No
commit/push was performed for these six new utility/test/documentation files.
