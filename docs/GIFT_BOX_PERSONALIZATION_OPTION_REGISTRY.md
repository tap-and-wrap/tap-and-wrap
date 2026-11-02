# Gift Box — private personalization option registry (default OFF)

**Based on:** `feature/gift-box-builder-v2` @ `fb8dfc4`.

Adds an authenticated/audited administrator registry for photo-print and engraving-surface option prices, applied to explicit supported boxes. The public view exposes only approved priced/available options. The registry is deliberately disabled until its unique index has been intentionally provisioned using the existing guarded schema initialization workflow. There are no automatic runtime DDL writes.

**Feature gate:** `GIFT_BOX_PERSONALIZATION_OPTIONS_ENABLED=false` (independent of `GIFT_BOX_BUILDER_BACKEND_ENABLED`; default OFF). Do **not** turn on in production until the new collection and index exist, merchant enters exact prices and confirms compatible box IDs and fonts, and the next cart/order integration is complete. With the gate off no new model is included in normal schema readiness checks.

Authenticated routes (normal session/CSRF/Origin protection from existing Gift Box routers):

- `GET /api/v1/admin/gift-box/personalization-options` — configurations and revisions, no secret file references.
- `PATCH /api/v1/admin/gift-box/personalization-options/:optionId` — create/update with `expectedRevision`; no client approval metadata. New IDs need `kind` and `displayName`; changes are audited transactionally.
- `GET /api/v1/gift-box/personalization-options` — only fully priced, available, enabled options, no unapproved or pending prices. Returns `personalizationCheckoutEnabled:false`.
- `POST /api/v1/gift-box/personalization-quote` — read-only owner-bound price preview using the **actual saved options and verified private Upload records** in one snapshot read; never returns an order or authorizes checkout.

Example initial **pending** configuration: `{"expectedRevision":0,"kind":"photo_print","displayName":"Standard Print","boxIds":["box-1"],"enabled":false,"available":false}`. Subsequent price approval must be a real merchant-provided integer amount in piastres, with zero requiring `confirmComplimentary:true`. Engraving options additionally require approved style IDs, colors and an affirmative licensing confirmation. No fees, fonts, quantities or physical compatibility are invented by the code.

This patch does **not** connect optional personalization to persisted Gift Box cart lines, orders or private photo attachment retention, and does not enable checkout. Order integration must read these saved records inside the same MongoDB transaction as cart/order writes and use `priceGiftBoxPersonalization` with verified Upload records; missing or stale options fail closed.

Offline tests: `node --test server/test/gift-box-personalization-options-contract.test.js`. Also run complete backend tests + syntax, client lint/build and `git diff --check` on the developer machine. No production database, Cloudflare, Render, or deployment operations are performed by installing this patch.
