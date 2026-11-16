# Final UX pass: operator verification

These commands are for the owner to run. Codex did not run full suites, build, commit, push, renewal or deployment. Run groups in order and stop on a failure. No persistent database, production order, provider delivery or checkout flag change is needed. Use the installed Edge browser; fixture runners scrub inherited merchant configuration.

## 1. Targeted regressions

```powershell
Set-Location C:\Users\youss\Projects\tap-and-wrap\server
npm.cmd test -- test/final-ux.test.js test/phase3-email.test.js test/image-integrity.test.js test/checkout-payment.test.js test/batch1-order-presentation.test.js

Set-Location ..\client
node --test src/components/selected-images.test.mjs src/commerce/final-ux.test.mjs
node --test --test-name-pattern="asset MIME" scripts/seo/worker.test.js
npm.cmd test -- final-ux.spec.js customer-polish.spec.js --output test-results-owner-final-targeted
npm.cmd test -- --config playwright.gift-box-phase4.config.js gift-box-redesign.spec.js -g "final UX:" --output test-results-owner-final-builder
npm.cmd run test:contracts -- checkout-restart-contracts --enabled-checkout -g guest
npm.cmd run test:contracts -- member-checkout-restart-contracts --enabled-checkout
```

The last two commands deliberately use separate disposable fixtures and retain real rate limits. They exercise cancellation failure/retry, no-transfer confirmation and historical references; no live transfer occurs.

## 2. Comprehensive isolated suites

```powershell
Set-Location C:\Users\youss\Projects\tap-and-wrap\server
npm.cmd test

Set-Location ..\client
npm.cmd test -- --output test-results-owner-final-browser
npm.cmd test -- --config playwright.gift-box-phase4.config.js --output test-results-owner-final-giftbox
npm.cmd test -- --config playwright.gift-box-policies.config.js --output test-results-owner-final-policies
npm.cmd test -- --config playwright.ui-polish.config.js --output test-results-owner-final-polish
npm.cmd run test:contracts
```

Do not replace missing cached MongoDB binaries with a merchant URI. The connected runner gives each spec its own local database; it chooses the required enabled-checkout/Gift Box fixture modes itself. Output folders above are dedicated to this review; use a new suffix if you need to preserve an earlier run with the same name.

## 3. SEO, lint, local build, syntax and whitespace

```powershell
Set-Location C:\Users\youss\Projects\tap-and-wrap\client
npm.cmd run test:seo
npm.cmd run lint

# A child process gets an offline/noindex build environment. Parent variables,
# developer .env files and production checkout flags are not changed.
@'
import { spawnSync } from 'node:child_process';
const keys = ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA'];
const env = Object.fromEntries(keys.filter(key => process.env[key] !== undefined).map(key => [key,process.env[key]]));
Object.assign(env, { TAP_WRAP_ISOLATED_TEST:'true', VITE_API_BASE_URL:'http://127.0.0.1:4091/api/v1', VITE_META_ENABLED:'false', VITE_SEO_INDEXING_ENABLED:'false' });
for (const args of [['node_modules/vite/bin/vite.js','build'], ['scripts/generate-seo.js']]) {
  const result = spawnSync(process.execPath,args,{env,stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
'@ | node --input-type=module

Set-Location ..\server
npm.cmd run check
Set-Location ..
git diff --check
```

The build writes the disposable local `client/dist`; it does not prepare a production publication. Do not run a production build with ad-hoc flags, trigger renewal or deploy as part of this verification.

## 4. Exact selective staging and commit review

Run only after reviewing the complete change and verification results. This does not stage unrelated/untracked files, backups, operational scripts, `.env`, artifacts or `local-data`.

```powershell
Set-Location C:\Users\youss\Projects\tap-and-wrap
$uxManifest = Get-Content -Raw docs/FINAL_FULL_SITE_UX_FILES.json | ConvertFrom-Json
$uxPaths = @($uxManifest.modified) + @($uxManifest.new)
git status --short
git diff --stat -- $uxPaths
git diff -- $uxPaths
# Review new files separately; git diff does not display untracked contents.
# Only after owner approval:
git add -- $uxPaths
git diff --cached --check
git diff --cached --stat
git diff --cached
# Commit only when the staged review is approved:
# git commit -m "Finalize storefront, payment UX and owner handover"
```

Do not use `git add .`, reset, clean, push or a deployment command. The manifest is an allowlist, not a declaration that every file currently in the working directory belongs to this pass.

## After an independently authorized release

Read-only asset checks (no orders/payments/files):

```powershell
$uxSite = 'https://tapandwrap.net'
$uxLogin = Invoke-WebRequest -Uri "$uxSite/login" -UseBasicParsing
$uxLogin.StatusCode
$uxLogin.Headers['Content-Type']
$uxLogin.Headers['Cache-Control']
$uxLogin.Headers['X-Robots-Tag']
$uxCssPaths = [regex]::Matches($uxLogin.Content, '(?:href|src)="([^" ]+\.css(?:\?[^" ]*)?)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -like '/assets/*' }
foreach ($uxPath in $uxCssPaths) {
  $uxResponse = Invoke-WebRequest -Uri "$uxSite$uxPath" -UseBasicParsing
  [pscustomobject]@{ Path=$uxPath; Status=$uxResponse.StatusCode; Type=$uxResponse.Headers['Content-Type']; Cache=$uxResponse.Headers['Cache-Control'] }
}
curl.exe -I "$uxSite/assets/does-not-exist-final-review.css"
curl.exe -I "$uxSite/assets/does-not-exist-final-review.js"
curl.exe -I "$uxSite/tap-wrap-email-logo.png"
```

Require real CSS `200 text/css`; scripts `200` JavaScript MIME; missing assets `404 text/plain`, `no-store`, `nosniff`, never the SPA shell. Verify both ordinary refresh and hard refresh, Network cache-disabled and normal-cache views. Compare the actual sealed publication's source commit, ID and expiry against the reviewed release. Inspect canonical product HTML, robots/sitemap, withdrawn 404s and private noindex/no-store. Check Worker routing really includes `/assets/*`; an old Worker/config deployment cannot exercise the new guard.

Use device viewports 320/390/440/768/1024/1440, plus a real phone keyboard. Check builder step 1 selection edges, Review/back, changed options and total errors; drawer/dialog Tab/Shift+Tab, Escape/backdrop and focus return; account feedback; customer proof recovery; owner creation/packing/contact workflows. Verify there are no console errors, missing chunks, overflow or duplicate payments. Do not create live test orders or transfer money without separate authorization.

For ONE received-email smoke after release, use an approved development/staging terminal with privately supplied Gmail settings, a correct `CLIENT_ORIGIN`, an allowlisted recipient and explicit send authorization. Do not change production environment variables or run an outbox batch. The smoke script loads no `.env`:

```powershell
Set-Location C:\Users\youss\Projects\tap-and-wrap\server
# Offline prerequisite; sends nothing:
npm.cmd run email:smoke
# ONLY after separate authorization and private terminal configuration:
# $env:EMAIL_SMOKE_TEST_ENABLED = 'true'
# npm.cmd run email:smoke -- --send --confirm-send --recipient 'YOUR_ALLOWLISTED_ADDRESS'
# Remove-Item Env:\EMAIL_SMOKE_TEST_ENABLED
```

Verify the actual Gmail desktop/mobile message: visible original logo, correct proportions, `Content-ID: <tapwrap-brand-logo>`, readable table layout/plain text, working secure CTA, and no customer attachment. The test is a connection/design smoke, not proof that every real event delivered. Do not resend an ambiguous SMTP result automatically. Existing production receipts can be reviewed read-only with owner consent; provider delivery remains unverified until an actual authorized message is received.

Rollback: retain the previous reviewed source and sealed publication. An operator may restore that complete release through the existing authorized workflow; never mix old HTML with new assets or extend an expired seal. No data migration, order rewrite or financial rollback is introduced here.
