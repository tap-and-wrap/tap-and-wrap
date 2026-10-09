# Batch 3 — SEO publication, browser policies and font/boot reliability

This report covers F15 and F38–F43. The main Batch 3 report owns the full F01–F52 reconciliation and final combined regression totals. All changes retain JavaScript/JSX, Vite/React and the existing static Cloudflare Worker. No merchant database, credentials, live media object, provider, publication or deployment was accessed.

## Verified roots and implemented corrections

| Finding | Verified root | Implemented local correction | Verification / remaining boundary |
| --- | --- | --- | --- |
| F15 | Flat route files were overwritten sequentially before the manifest changed; source approval/stock changes could leave old static URLs/schema indefinitely. Reading cleanup/diff baselines before the output lock could miss an intervening commit. | Version-2 publication manifest; SHA-256 route/source fingerprints; immutable generation files; atomic manifest switch; exclusive bounded-output lock with baseline reads inside it; explicit added/changed/withdrawn report; offline reconciliation; expected-publication ID; finite snapshot freshness; exact emergency withdrawals and dynamically filtered sitemap. | Offline price/stock/media/approval/slug changes, pre-commit interruption, post-commit failure reporting, concurrent generation and delayed-lock acquisition passed. The delayed-writer regression first reproduced a missed withdrawal against the old implementation. Actual authorized export, refresh scheduling, purge/deployment and rollback remain pending. |
| F38 | A syntactically safe HTTPS image URL was treated as sufficient even when no object existed. | Separate approved object-verification evidence matching the exact main URL, checksum, object version, MIME, dimensions, size and review validity. Missing, expired, contradictory/private/unsafe evidence prevents product indexing and Product schema. | Synthetic exporter-to-generator contracts passed. This code validates an attestation; it does not independently prove that a live R2 object exists. Actual authorized verification remains pending. |
| F39 | Every active category was indexable regardless of actual eligible snapshot contents; runtime metadata checked only a nonzero current count. | Retain category URLs/HTML/parent-child links; recount media-verified eligible products; default minimum of three products for indexing, explicitly configurable from 1–20. Carry that reviewed minimum into the allowlisted bootstrap contract and revoke runtime indexing if the public count becomes thin. Ignore inflated input counts for snapshot eligibility. | Zero/one/two/three-product, configured threshold, malformed count and unverified-media cases passed. Merchant review of category usefulness and eventual threshold remains necessary. |
| F40 | Every orderable offer was labelled InStock, including Made by Request; individually available variants could contradict a globally unavailable parent. | Tracked available stock: InStock. Made by Request (`made_to_order`): PreOrder. Unavailable parent or variant: OutOfStock. Unknown/mixed variant modes omit a false shared availability. Export each actual mode; preserve approved integer EGP values and disabled-checkout offer omission. | Actual DTO and all three/mixed/parent-unavailable availability tests passed. No fulfillment lead times or merchant promises invented. |
| F41 | React replaced semantic HTML with loading shells; passive metadata effects overwrote a reviewed static head during loading. A route-only boot gate could then index changed API media/prices/stock without matching reviewed evidence. | Bounded semantic fallback-to-real-React handoff; reveal on actual non-loading heading/error, with six-second escape; layout-phase metadata updates; exact initial route/origin/publication-expiry gate; normalized public-product signature matching the real exporter and API serializers; preserve a matching reviewed head while pending; clear robots/JSON-LD at expiry using one timer. | Actual React delayed-success/404 handoffs, shared metadata gate, normalized real-serializer parity, malformed/expired boot fixtures and actual-component changed-media/price/stock browser assertions passed. This is not SSR/hydration and does not guarantee zero CLS. |
| F42 | The frontend Worker supplied nosniff only; framing, referrer, feature and CSP contracts were absent. | DENY framing, restrictive permissions, strict-origin-when-cross-origin referrer and nosniff; report-only CSP by default; exact bounded approved API/public-media/private-upload origins; separate consented-tracking allowance; no external reporting endpoint. Static assets have baseline `_headers` too. | Header coverage and invalid-origin redaction passed. Isolated enforced browser test allowed self-hosted JS and blocked inline/foreign scripts and forbidden connections before network requests. Actual deployment policy review remains pending. |
| F43 | A nested CSS Google Fonts import delayed discovery and `swap` allowed late typography changes. | Discover the unchanged Cormorant Garamond / DM Sans families directly in HTML; preconnect to font hosts; optional display; keep Georgia/Arial fallbacks; no copied/downloaded font binaries. | HTML/CSS source assertions and four-width local fallback geometry checks passed. Real font delivery, whole-page CLS and field Core Web Vitals are unverified. |

## Actual focused verification

- Offline frontend SEO suite: **54 passed, 0 failed/skipped**. This includes 26 new publication/media/security/boot cases over the previous 28.
- Guarded backend exporter suite: **16 passed, 0 failed/skipped**; three new actual-exporter-to-generator/inventory/public-DTO signature contracts. Synthetic adapters only; no MongoDB connection.
- Focused Edge/Playwright SEO cases: **eight distinct cases passed across focused runs**. The initial seven covered real local Vite/React boot, mocked product API, isolated browser CSP enforcement and 320/390/768/1440px blocked-font/installed-local-font substitutions. The eighth exercises actual `PageMetadata` against changed media/prices/stock at a completely intercepted synthetic HTTPS origin. Its final targeted rerun was **1 passed, 0 failed** (8.8 seconds runner time; 1.1 seconds case time). No remote font assets were downloaded. The final complete-file/cross-batch result is owned by the main report.
- The eighth browser fixture initially failed because its synthetic HTML omitted Vite's React-refresh preamble/module; a subsequent trace showed its missing `env.mjs` dependency and installed Vite's CommonJS ReactDOM default-export contract. The fixture now uses the actual development preamble/default export, proxies only explicit loopback modules and blocks WebSockets. Assertions require the real React render function and zero page errors before validating metadata; none of the application gates were weakened.
- All four font geometry cases assert identical intrinsic logo/gallery width and height before/after local font substitution and no document overflow. The captured local measurements are below; each before/after difference is zero. These measurements describe those elements, not a measured whole-page CLS score or real brand-font rendering.
- One intermediate offline run failed because a synthetic manifest used two separate millisecond clocks, creating a one-millisecond lifetime overflow. The fixture now uses one clock; the strict age boundary was retained. The lock-baseline race regression deliberately failed before its source fix, then passed. All 54 tests passed afterward.
- Final cross-batch browser/backend/lint/build/syntax totals are recorded by the parent in the main Batch 3 report; this focused report does not infer those results.

| Synthetic viewport | Logo width × height, CSS px | Gallery width × height, CSS px | Before/after size difference |
| --- | --- | --- | --- |
| 320 | 90 × 30 | 258 × 258 | 0 |
| 390 | 98 × 32.671875 | 328 × 328 | 0 |
| 768 | 153.59375 × 51.21875 | 343.90625 × 343.90625 | 0 |
| 1440 | 210 × 70.03125 | 650.421875 × 650.421875 | 0 |

## Safe publication and withdrawal runbook

These are **future instructions**, not authorization to perform a live read/export, deployment, indexing or media check. Normal build remains noindex; normal exporter remains offline.

1. Obtain separate authorization for public catalog/media verification and database reads. Use a read-only scoped database user; retain exact local/staging target guards. Production exports remain rejected by this exporter.
2. Resolve merchant publication/review/price/inventory approval and verify each public main object through a separately authorized object read. Do not use a temporary/customer/private bucket or URL as public catalog media.
3. Save reviewed verification evidence inside ignored `local-data/`, using this contract (all example values are synthetic):

```json
{
  "version": 1,
  "source": "authorized-media-object-verification",
  "objects": [{
    "approved": true,
    "url": "https://approved-media.example/catalog/fixture.webp",
    "sha256": "actual 64-character lowercase SHA-256 from the authorized object bytes",
    "objectVersion": "actual stable object version or reviewed ETag identifier",
    "contentType": "image/webp",
    "sizeBytes": 18000,
    "width": 1200,
    "height": 900,
    "verifiedAt": "actual ISO verification timestamp",
    "validUntil": "explicit reviewed ISO evidence-validity timestamp"
  }]
}
```

The example is intentionally not valid evidence. Never copy invented checksum/timestamps into a publish input. Supported verified formats are WebP/JPEG/PNG/AVIF, maximum 20 MiB, bounded positive dimensions. Conflicting duplicates fail closed. Evidence expiry is configured by the authorized verifier, not inferred from a URL or customer retention policy.

4. After separately authorized staging reads, from `server/`, export with explicit terminal staging variables and:

```powershell
npm.cmd run seo:export -- --target staging --confirm-read --output local-data/approved-seo-export.json --content-output local-data/approved-site-content.json --media-verification local-data/approved-media-verification.json
```

This command is **not authorized here**. The script does not load `.env`, initialize schema or write a database. Without `--confirm-read`, it reads neither the database nor verification file. The exporter omits unverified product images from its evidence list and reports verified/unverified counts; it never silently marks them verified.

5. Compare two reviewed local exports without writing, connecting or deploying:

```powershell
# From client/; paths are relative to the repository root.
node scripts/reconcile-seo.js --previous local-data/previous-approved-export.json --input local-data/approved-seo-export.json --site-origin https://OWNER-APPROVED-HOST --previous-content local-data/previous-approved-content.json --content local-data/approved-site-content.json
```

Historical evidence may already be expired; reconciliation reports the present eligibility difference without approving a publication. It includes public price/stock/text/category/media fingerprints. Review every withdrawn path and change.

6. Generate a noindex review first. Only with separate indexing/deployment authorization use `--publish`, a freshly generated export, explicit canonical origin and a reviewed operational maximum age:

```powershell
node scripts/generate-seo.js --input local-data/approved-seo-export.json --content local-data/approved-site-content.json --site-origin https://OWNER-APPROVED-HOST --max-age-seconds 3600 --minimum-category-products 3
```

`--publish` is intentionally absent above. Indexing inputs require an actual source timestamp, current media evidence and all existing publication gates. The default freshness budget is one hour, configurable from 60 seconds to 24 hours; evidence expiry can shorten it. This is an engineering freshness bound, not a legal/customer-data retention policy. The owner/operator must select and schedule an authorized refresh cadence before activation; expiry deliberately makes published documents unavailable rather than serving stale product prices/schema indefinitely.

7. Review ignored `client/dist/seo-change-report.json`, canonical HTML, sitemap and manifest. Match the exact report `publicationId` to future `SEO_EXPECTED_PUBLICATION_ID`; indexing requires this ID, canonical host, manifest eligibility and both explicit indexing flags. Never make a deployed Worker accept an unreviewed generation automatically.
8. For an urgent separately authorized withdrawal, set exact comma-separated product/category paths in `SEO_WITHDRAWN_PATHS`, deploy/review that configuration and purge affected existing CDN/document caches. The Worker then returns noindex/no-store 404 for those routes and excludes them from sitemap output even while the remaining snapshot is current. Do not mistake a local config edit for a live withdrawal. Re-export/rebuild/deploy the complete reviewed removal afterward.
9. Expired snapshots produce a generic no-store/noindex 503 without product prices or schema, with Retry-After. Robots disallows indexing and the sitemap is empty. Private account/admin documents still use their authorized app shells/no-store/noindex; runtime authorization is unchanged.
10. Before rollback, verify that the old snapshot is still approved/current and no withdrawn item would return. Keep withdrawals during rollback. A stale snapshot cannot become eligible merely by selecting its old publication ID. No rollback/deployment occurred in this task.

## Failure recovery and operational limits

- A generation writes immutable `seo-pages/<publicationId>/…` first and atomically changes the Worker-visible manifest only after all documents are complete. Flat HTML files are compatible local-preview copies; the Worker always follows immutable `routeFiles`.
- Before-commit failure retains the previous complete publication. After-commit compatibility/cleanup failure explicitly reports `SEO_OUTPUT_FINALIZATION_FAILED` and `publicationCommitted=true`; rebuild and review before deployment. Do not interpret a failed process as proof that no local manifest changed.
- The generator serializes only the same output directory. A second writer fails on `.seo-generation.lock`; unrelated repositories/outputs are not globally serialized. Previous publication/owned-file baseline reads happen after lock acquisition, so a writer delayed before acquiring it correctly journals and removes files from an intervening completed publication. A process crash can leave that ignored lock/orphan preparation files. Confirm no generator is running, inspect the manifest and rebuild a clean ignored Vite output under separate operational review; never recursively delete a computed arbitrary path or merchant data.
- Worker publication reads come from the static-assets binding, not Render/MongoDB. There is no runtime catalog export, external object probe or per-page SSR. Publication validity is checked on every document request; cache lifetime cannot outlive snapshot expiry.
- The refreshed version-2 manifest and Worker must be released together. Old version-1 manifests fail closed. No live existing artifact is migrated here.
- Product snapshots and React are deliberately separate renderers. The handoff removes an avoidable empty/loading flash, but actual layouts may differ. Measure browser layout shifts after real approved photos/fonts/content are available; do not claim hydration or perfect visual continuity.
- Browser CSP enforcement is test-only here. Production default stays report-only. Configure exact HTTPS API/upload/media origins, inspect violations with the owner's approved topology and only then authorize enforcement. `style-src 'unsafe-inline'` accommodates React dynamic style attributes; executable inline scripts/eval are not allowed. Tracking hosts remain absent unless explicitly reviewed/allowed; consent and feature gates are independent.
- Font `display=optional` favors stable fallbacks on slow first visits. Fast/warm visits can display the original brand fonts. The chosen families/weights remain unchanged. No font license/asset redistribution was performed; real licensed self-hosting can be a later reviewed option.

## Files created or modified by this SEO work

Created (8):

- `client/e2e/batch3-seo.spec.js`
- `client/scripts/reconcile-seo.js`
- `client/scripts/seo/publication.js`
- `client/scripts/seo/publication.test.js`
- `client/src/seo/boot.js`
- `client/src/seo/media-verification.js`
- `client/worker/browser-policy.js`
- `docs/BATCH_3_SEO_OPERATIONS.md`

Modified (18):

- `client/e2e/seo.spec.js`
- `client/index.html`
- `client/public/_headers`
- `client/public/seo-static.css`
- `client/scripts/generate-seo.js`
- `client/scripts/seo/generator.js`
- `client/scripts/seo/generator.test.js`
- `client/scripts/seo/worker.test.js`
- `client/src/design-system.css`
- `client/src/main.jsx`
- `client/src/pages/CategoryPage.jsx`
- `client/src/seo/PageMetadata.jsx`
- `client/src/seo/metadata.js`
- `client/worker/seo-worker.js`
- `client/wrangler.jsonc`
- `docs/PHASE_3_SEO.md`
- `server/scripts/export-seo-catalog.js`
- `server/test/seo-export.test.js`

Preexisting Batch 1/2 edits were preserved. No package/dependency addition, original-logo modification, image upload, owner-claim approval, checkout activation, existing-database read/write, commit, push or deployment occurred.
