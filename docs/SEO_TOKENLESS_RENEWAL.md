# Production SEO renewal through Cloudflare Git Builds

## Verified integration and architecture

On 8 November 2026 the signed-in Cloudflare dashboard confirmed that production Worker `tapandwrap-frontend` is connected to `tap-and-wrap/tap-and-wrap`, production branch `main`, with builds enabled. The active version `98c2a3dd` came from a successful native Build of commit `36d768132e10f12654e245c899a7d2efac67984f`. Existing build commands were `cd client && npm ci && npm run build` and `cd client && npx wrangler deploy`. Cloudflare already holds its own `tapandwrap-frontend-deploy` deployment credential. That credential is not copied, exposed or replaced. Existing Wrangler OAuth could inspect Workers but received HTTP 403 from the Builds API; dashboard inspection supplied the actual integration evidence.

GitHub `main` was unprotected and had no repository rulesets when inspected. Renewal must nevertheless never write it, force push, or bypass branch rules. Render watches `main` for backend deployments. A separate `seo-publication` branch therefore isolates scheduled publication commits from Render. Cloudflare's production branch must be set to that branch after the first reviewed publication exists. Application releases remain reviewed commits on `main`; dispatch the renewal workflow after the API is healthy to publish their matching frontend. A six-hour schedule also picks up current main automatically.

GitHub Actions uses only the job-scoped `GITHUB_TOKEN` with `contents: write` (the permission needed to update the dedicated branch). Checkout does not persist credentials. The token enters only the final publication step, is passed to Git through a child-process environment header, and never appears in arguments, files or logs. No Cloudflare token, account secret or database credentials are consumed. The already configured account ID secret may remain unused.

## Publication chain

1. Read the bounded, allowlisted public SEO API over the exact production HTTPS origin. No database, cookies, private files or admin dump is involved.
2. Read every selected public main image, check actual type, byte limits, full decode, dimensions, hash and object version. Repeat the public catalog export and reject any content/checkout drift.
3. Seal the reviewed snapshot within ten minutes of its source timestamp. Every product must remain eligible and have current approved media. Record exact source commit, artifact hashes, creation, expiry and publication ID. Lifetime remains at most 86,400 seconds and is bounded by source/media expiry.
4. Build and validate locally in Actions. Commit only `seo-publication/catalog.json`, `content.json` and `lock.json`. All other tree entries come directly from reviewed main. The commit keeps the prior publication and reviewed main as parents; the push is ordinary fast-forward. Recheck main immediately before pushing. Concurrent changes reject instead of overwriting.
5. Cloudflare's native Git Build checks that source main still matches the lock and that only the three permitted artifacts differ. It reads the current public API and rejects catalog drift. It validates real-time freshness before reconstructing the exact sealed ID, builds Vite, generates the matching SEO assets and derives the corresponding Worker configuration.
6. One native Worker deployment publishes matching assets and the expected ID. `--keep-vars` with only the two explicit SEO vars preserves operational withdrawals, CSP and other production runtime variables. No separate API operation changes the expected ID before assets exist.
7. Actions polls the real product HTML for that exact ID/expiry, canonical, indexable bootstrap and headers; checks robots, sitemap index/child and a real 404. A webhook/build failure becomes a failed workflow, not a claimed renewal.

Public artifacts contain already approved catalog information and opaque routing attestations. Bundles and 1,800 HTML files are rebuilt, not committed every six hours. The public catalog source endpoint remains paginated at 20.

## Cloudflare production build settings

After the publication branch exists, set:

- Production branch: `seo-publication`.
- Root directory: `/`.
- Build command: `npm ci --prefix client && node client/scripts/build-sealed-seo.js`.
- Deploy command: `cd client && npx wrangler deploy --config test-results/seo-renewal/wrangler.json --keep-vars`.
- Keep the existing build credential, approved Vite variables and watch paths. The build script sets the indexing build value explicitly for this validated production path only. Ordinary development builds stay noindex.

These settings are the required activation contract, not evidence that activation has occurred. Record the actual settings save, first GitHub-token push, Cloudflare build/version and live checks in the Release 2 report before calling automation operational. External Git App webhook delivery from a `GITHUB_TOKEN` push must be tested; GitHub's suppression of recursive Actions alone does not establish that behavior.

## Failure and recovery

Source drift, failed public API/media reads, incomplete eligibility, tampered inputs, expired verification, mismatched IDs or unexpected branch changes stop publication. Existing production remains deployed with its original expiry; it never gains extra time from a failed refresh. After expiry robots disallows crawling and documents fail closed according to the existing Worker guards. Failed live verification requires inspecting the actual native build before dispatching a fresh renewal; never reuse an expired lock or silently extend it.

Actions schedules can be delayed or disabled after repository inactivity. Check workflow failures/notifications and retain manual `workflow_dispatch` recovery. Four attempts daily provide margin within the finite one-day lifetime, not a promise of uninterrupted third-party scheduling. No CI permission change, new credential or weakening of fail-closed indexing is part of this design.

The API currently uses Render Free. [Render documents](https://render.com/docs/free) idle spin-down after fifteen minutes and approximately one minute to wake. Explicit renewal/build preparation therefore makes at most eight public readiness attempts (15-second request deadlines, ten-second delays). Failed readiness never creates a snapshot. This is bounded release preparation, not a keep-alive service. The production Worker still has its strict live authority deadline and fails closed while the API is sleeping/unavailable. For dependable first-visit product routes and crawling, the owner should move the API to an appropriate always-on production compute plan; this release does not authorize new hosting charges or silently change the plan.

Ordinary owner price/stock saves are immediately authoritative in the API. Until renewal, the Worker's existing live routing fingerprints prevent stale price/stock snapshots from being indexed. A new approved snapshot restores eligible routes. Hidden/withdrawn products never become public through renewal. Unpriced published products are truthful product-information pages with no fabricated Offer. Legal/content approval remains separate from catalog publication.
