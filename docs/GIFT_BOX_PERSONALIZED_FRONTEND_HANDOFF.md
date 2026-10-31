# Gift Box V2 — Customer-facing personalization handoff

**Base commit:** `0fcb4ceab6db8d26dc2bc39cc4f9135e6c7bbfaa` (`feature/gift-box-builder-v2`).

This patch connects the existing memory-only photo/engraving drafts to the
server-managed personalization options and the existing Gift Box cart API.

## Customer behavior

- The user chooses photos and writes engraving text without uploading anything.
- The Personal step lists only enabled, available, server-approved and priced
  photo-print/engraving options for the selected box. Engraving surface choices
  also filter by the selected lettering style and color.
- The Review step displays an **estimate** based on those public approved
  option amounts plus the ordinary component estimate. It is not a quote or
  permission to fulfill an unreviewed physical arrangement.
- Pressing **Add completed gift to cart** starts the private photo uploads.
  The existing upload API verifies the images and owner/box scope, then a
  read-only server quote recalculates personalization prices. The browser
  compares the server quote with the displayed option estimate. A change
  stops the Add and asks the user to review the new amount.
- The final cart mutation sends only the versioned intent and canonical
  configuration. No File, blob URL, private storage key, original filename,
  client-priced total, unapproved font or assumption of physical fit is sent.
- Session changes, box changes, photo repositioning, reordering and engraving
  edits invalidate an in-flight submission; uploads are scoped to the current
  session/box. Pending retries retain the immutable operation key.

## Boundaries and remaining work

- Private photos are only uploaded on the Add to Cart action. Abandoned
  unretained uploads are handled by the existing storage TTL/cleanup.
- The existing private storage quota is 20 active files per owner, **not** a
  product packing limit. The browser memory-only editor may preview more.
- This patch **does not** edit MongoDB collections, administer prices or
  approve physical arrangements. It does not enable checkout, production
  launch flags, customer file sharing, or orders.
- A box is addable only if the existing backend's direct-commerce/physical
  approval gates allow it. Real print/surface prices and licensed styles must
  be configured through the existing approved admin APIs.
- Final admin settings UI, staff fulfillment workflow, browser integration
  tests, device-specific accessibility checks and production launch review
  remain separate work.

## Verify locally

From the repository root:

```powershell
node --test client/src/gift-box/personalization-submission.test.mjs client/src/gift-box/private-photo-upload.test.mjs client/src/gift-box/personalization-handoff.test.mjs
cd client
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --config=playwright.gift-box-phase4.config.js
cd ..
git diff --check
```

The last three commands require installed client dependencies and the project's
local browser fixture environment. Never direct the browser runner at production.
