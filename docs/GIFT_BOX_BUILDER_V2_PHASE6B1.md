# Phase 6B.1 — Six-step draft personalization UI

Status: implementation checkpoint, pending verification on the owner's local branch.

New flow: box → flowers → plush → chocolates → personal touches → finishing → unnumbered review.

The personal step supports a memory-only local photo draft (up to 6 verified-by-browser-type JPEG/PNG/WebP files, 8 MB each), center-bottom external stack, reorder/remove, two optional literal engraving lines (80 code points each), a twelve-style internal candidate list with Rochester replacing 42dot Sans, and a separate white engraving text preview. Owner-facing and customer-facing previews clearly state that precise font artwork has not been licensed or installed. The owner must verify the exact internal font names and embedding permissions before a faithful preview can be enabled.

**Security and commerce boundaries:**
- No photo is sent to an API, persisted in storage, or accessible to other customers by this patch; local browser object URLs are revoked when removed or when the page unmounts.
- The existing server v1 quotation and identity contracts are untouched. Personal draft elements are **not priced**; the UI explicitly warns that the current component subtotal excludes them.
- The review/checkout remains deliberately disabled. The page cannot claim a configured gift is cart-ready while local unpriced personalization exists.
- No changes to production data, asset manifests, R2, inventory, payment gates or canonical v1 orders.
- Before Phase 6B is considered complete: implement new fixed billable component settings; approved 20-EGP defaults and admin edit; exact licensed font files; private owner-bound upload API; versioned v2 commerce contracts; order attachment retention/ownership; mixed cart price/identity consistency; and E2E tests.

Verification:
```powershell
cd server
npm.cmd test
npm.cmd run check
cd ../client
npm.cmd run lint
npm.cmd test -- --config=playwright.gift-box.config.js
npm.cmd run build
```

Do not merge to main or deploy solely based on this UI checkpoint.
