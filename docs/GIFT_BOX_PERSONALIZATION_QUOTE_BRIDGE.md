# Tap & Wrap — Gift Box private personalization pricing/handoff bridge

Baseline `feature/gift-box-builder-v2` at `980335b191e838f30f084c24c82e33909e5da141`.

## What this provides

- A browser-only adapter that takes **already verified** private upload receipts, the current local photo order/visual placement, explicit print option IDs, and selected engraving surfaces/styles. It turns these into the existing strict v1 intent with no local filename, File, object URL, R2 storage key, or browser price.
- A pure backend calculator that accepts that intent together with **server-verified** Upload records and **server-saved** print/engraving option records. It fails closed for missing prices, unapproved complimentary zero prices, different session/box/cart, expired files, or unlicensed lettering styles. The result is a bounded integer-piastres adjustment, per-option pricing snapshot and opaque upload IDs.
- It deliberately does **not** grant fit compatibility, checkout or production release authority. Neither module is wired into cart or order runtime yet. No new collection is created or read by this patch; option records must come from future server-side persisted configuration.

## Why not silently enable checkout now

The current production DB has no configured Gift Box print/engraving prices or reviewed physical policies. A customer amount cannot be charged from a guessed price, and raw browser files cannot become orders without owner-scoped retention. The next integration needs saved pricing/admin settings and transactionally attaching uploads, including guest-cart merge, removal and order/admin presentation.

## Commands

From the repo root:

```powershell
node --test client/src/gift-box/personalization-handoff.test.mjs
node --test server/test/gift-box-personalization-pricing.test.js
cd server
npm.cmd test
npm.cmd run check
cd ..\client
npm.cmd run lint
npm.cmd run build
cd ..
git diff --check
git status --short
```

This patch is offline-only, creates exactly five files, and never accesses R2, MongoDB, Render, Cloudflare or checkout.
