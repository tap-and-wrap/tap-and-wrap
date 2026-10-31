# Tap & Wrap — Phase 6B.8A: Personalization intent contract and local customer review

**Branch:** `feature/gift-box-builder-v2`
**Status:** Implemented as an offline, unverified integration foundation. **No uploads, pricing, cart integration, checkout, database access or publication.**

## Why this phase exists

The customer can already arrange browser-memory photos and draft engraving text. The existing direct-commerce serializer intentionally excludes all that content. Phase 6B.8A establishes a separate versioned, strict shape for **future** private-upload references and engraving manufacturing choices, without making unverified drafts orderable or misleading customers about pricing.

## Changes

- Shared `gift-box-personalization-intent-v1` shape with strict allowlisting. Photo references are server-created 24-hex private upload IDs, never browser object URLs, filenames, raw files or storage keys. The draft shape records ordered photos, selected print-option identifiers and **non-authoritative** normalized positions. Print options must be resolved/approved later; placeholder IDs in unit tests are never live prices.
- Engraving candidates preserve literal Unicode text, color ID, style ID and a requested surface-option ID. The current 12 lettering labels are **not** proof of font licensing or production capability. Actual available options and fees must be server verified.
- Server-only wrapper marks all five approval/ownership/pricing/checkout gates `false`. Neither parser nor wrapper authorizes access to uploaded files, or validates ownership, attachment retention or real physical packing.
- Customer review now reports inside/beside/unpositioned photo previews and engraving drafts without leaking object URLs, filenames or text into a network request. All preview files and words stay local. No extra commerce API calls are made.
- Cross-layer offline tests assert strict rejection of unexpected amounts, raw files, unknown variants, unsafe coordinates, duplicate images and malformed Unicode.

## Still blocked

This is **not** Phase 6B.8 completion. Remaining: private photo intent/upload/complete/verified ownership flow using the existing secure Upload model, actual print offerings, physical policies, manufacturing-approved fonts/colors/materials, server-authoritative photo/engraving piastres, immutable order snapshots, admin private View access, retries/cleanup, and comprehensive isolated staging tests. No new public endpoints or runtime checkout changes are part of this patch.

Technical preview limits (`48` photos, `24` engraving editors, `80` Unicode code points) are computational bounds and **must not** be presented as owner-approved physical packing capacities or retail quantities.

## Local verification

```powershell
node --test client/src/gift-box/personalization-review.test.mjs
cd server
node scripts/run-tests.js test/gift-box-personalization-intent.test.js
npm.cmd test
npm.cmd run check
cd ..\client
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --config=playwright.gift-box-phase4.config.js
cd ..
git diff --check
git status --short
```

No production connection, R2 upload, migrations, checkout flags, merge, deployment, commit or push is authorized by this patch.
