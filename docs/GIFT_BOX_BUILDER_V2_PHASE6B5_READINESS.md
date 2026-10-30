# TAP & WRAP — Build Your Gift Box V2
## Phase 6B.5 correction: Web District delivery-owned completion plan

**Date:** 30 October 2026  
**Branch:** `feature/gift-box-builder-v2`  
**Inspected Git commit:** `a606deb22922b38e04ad45738903fe8b354744f2`  
**Status:** Development UI validated; full ordering integration not released.  
**Purpose:** Correct the previous 6B.5 report's allocation of responsibility and confusing approval labels. This plan is documentation only and does not authorize production actions.

### 1. Agreed delivery model

Web District delivers a functioning, tested storefront and gift-builder. The Tap & Wrap owner does **not** need to run asset audits, complete technical spreadsheets, authorize Git branches, manage database schemas, choose API versions, or debug deployment. Those are Web District responsibilities.

The user confirms the owner has already approved the **physical packing direction**; treat that as a settled business-direction decision, **not** as a fresh request for the owner to do technical work. We still need to encode and validate the approved rules so real orders cannot promise unsupported combinations. Existing repository records do not establish the precise measurements and every allowed quantity/combination; keep those values explicitly unknown until they are supplied or demonstrated, and do not invent them.

When essential commercial facts are missing (selling price, physical print option, engraving charge, exact supported packing combination), collect them in **one short business sign-off** after Web District has implemented and previewed everything feasible. Never ask the owner to design the software solution.

### 2. Reconciled status — do not confuse these categories

| Area | Agreed / known | Developer work remaining | Owner burden |
| --- | --- | --- | --- |
| BOX-01 visual design | Existing central-heart builder representation was accepted for the prototype. | Clear the **separate original source asset** hidden RGB/transparent right-strip issue using the already prepared alpha-zero-only candidate, inspect it, adopt under reviewed versioned manifest and re-audit. No visible-pixel alteration is needed. | No repeat design approval by default; raise only a visible design discrepancy. |
| Physical packing | User confirms owner approved overall packing direction. The earlier provisional 25 rose / 2 plush / 6 chocolate limits were **superseded** by a requirement not to impose arbitrary category caps. | Implement actual permitted zones and quantities from approved rules; verify mixed items, stock and box/compartment placement; do not convert visual study into guaranteed measurements. BOX-11 remains two separate regions. | Only genuinely unresolved physical facts, expressed in ordinary product terms if necessary. |
| Builder interface | 66/66 Playwright browser tests passed after hit-testing corrected the trace-confirmed sticky-nav interception. Prior backend report 821/821, lint/build and 99-file audit passed. | Finish production flows and retest with actual media/devices. | Review the polished finished experience once. |
| Art and media | 99 source files were present and the audit was structurally valid, but returned `productionReady:false`, 84 mapped assets not review-approved, and one known BOX-1 issue. 21 bows are separate local assets. | Resolve technical asset gate, review identity/transparency and production derivatives, publish only authorized assets with safe URLs. | Confirm visible wrong product images if any are found. |
| Price, availability and stock | Server-side pricing and stock/policy protections are implemented in isolated tests. Prices for some categories remain unapproved/null in initial plans; do not assume those are real live values. | Build/review admin settings, enter or import verified values without overwriting records, audit amounts and availability; keep unknown amounts unavailable instead of free. | Provide or confirm genuine selling prices and stock, not technical fields. |
| Photos | 48 local preview entries and 64 MiB aggregate source budget are technical limits, **not** a sales quantity approval. Photos currently remain in browser memory. | Implement secure upload, owner/session access, private object storage, retention, quotation, immutable order reference, customer changes, admin previews, failure/retry handling. | Only business choice: which print sizes/products are sold, charge, and handling preference if not already agreed. |
| Engraving | 24 local preview editors and 80 code points per entry are technical safety rules; five color candidates and 12 style labels are not licensed/verified manufacturing specs. | Select properly licensed font assets or safe permitted alternatives; implement material/finish options, server validation and pricing, literal Unicode retention and order instructions. | Only confirm physical offerings/prices where not already known. |
| Checkout | Customer gift Add to Cart / submission / runtime gift checkout remain intentionally closed. Isolated code supports cart and transactional order pathways with synthetic policies. | Finish v2 personalization contract, private attachments, real policy/staging integration, payment/delivery acceptance, then get explicit launch permission before changing production flags. | Final business acceptance of working flow, not engineering implementation. |

### 3. What “photo and engraving fulfillment” actually means

**Photo prints:** Customer selects photos and places them visually. The server accepts and validates owned image files securely; retains them privately (never public product media); associates precise print specifications and price with the immutable order; presents files and packing instructions to the merchant's order dashboard; protects private access and supports cleanup, expiration, failed uploads, corrections, and cancellation. The illustrative on-canvas location must not be sold as a physical-size guarantee.

**Engraving:** Customer types text (including Arabic and dates), selects an offered lettering style and color. The server validates the ordered finish/font/quantity, prices it correctly, retains exact text safely in the order, and gives staff a legible manufacturing instruction. The browser preview must not imply that an unlicensed or unsupported style can actually be produced.

**Both:** Customer sees a complete, *server-authoritative* total before purchase. The draft preview, selected font/color and photo coordinates must never be trusted as prices or as unsupported physical packing approval.

### 4. Delivery-first execution sequence (Web District responsible)

1. **6B.6 — Technical asset cleanup.** Review the already prepared Box-1 invisible-RGB candidate; preserve original, only clear transparent hidden RGB; verify visible-pixel equality and new manifest hash; audit actual mapped source/derivative assets, names and 21 ribbon bows. Prepare reviewed assets in an isolated working area, no production upload.
2. **6B.7 — Encode confirmed packing.** Convert approved owner direction into conservative versioned per-box permissions, quantities, mixed-category and inside/beside rules. Retain separate BOX-11 compartments. No invented 25/2/6 caps; no arbitrary unlimited assumptions. Use reproducible developer-led test fixtures; defer only missing real measurements needed for a specific rule.
3. **6B.8 — Personalization backend and UI integration.** Build or extend a versioned contract for print types, image uploads, file ownership, retention, engraving variants, itemization, immutable order references, admin packing screens and recovery. Feature-test all while public checkout remains shut.
4. **6B.9 — Admin + verified commercial catalog.** Connect available component prices/stocks, photo/engraving pricing and production media to protected admin workflows. Preserve any existing merchant database values; plan exact DB/storage changes and separately authorize each persistent target. Null/unapproved prices remain unorderable.
5. **6B.10 — Staging acceptance.** Test complete six-step flows, mobile/keyboard/touch accessibility, private-upload security, mixed carts and gifts, inventory races, payment proof, guest/account access, pending delivery, failed/retried submissions, cancellations and rollback in an isolated environment. Inspect actual screenshots and owner artwork visually.
6. **Final handoff and controlled release.** Show the owner a finished preview, confirm only genuinely missing commercial/product facts, demonstrate admin packing/fulfillment, then seek one explicit go-live business decision. Deployment, real DB migrations, media publication and any checkout flag change remain separate authorized operations.

### 5. Practical short sign-off — *only* if an item was not already supplied

- Final retail prices/availability for chocolates, ribbons, gift cards, prints and engravings.
- Which physical photo sizes/print materials and engraving surfaces/color/font options are genuinely offered.
- Any specific box/component combination whose real-world fit/closure cannot be established from existing approval or evidence.
- Delivery/payment policy for personalized gifts and preferred order processing responsibilities.

Provide an understandable storefront preview or a short product/pricing sheet, **not** a packing-policy schema, database form, or engineering report. Do not repeat questions already answered.

### 6. Source evidence and limits

Pinned source references:
- `docs/GIFT_BOX_BUILDER_V2_PHASE6B4A_AUDIT.md` (browser validation and blockers).
- `docs/GIFT_BOX_BUILDER_V2_BOX1_CANDIDATE.md` (hidden-RGB alpha-zero-only correction; original preserved).
- `docs/GIFT_BOX_BUILDER_V2_PHASE4.md` (74 IDs / 99-asset audit / initial settings; not real live prices).
- `docs/GIFT_BOX_BUILDER_V2_PHASE5B4.md` and `docs/GIFT_BOX_BUILDER_V2_RELEASE_CHECKLIST.md` (implemented policy infrastructure and independent checkout fences).
- `docs/GIFT_BOX_BUILDER_V2_PHASE6B3C.md` (preview-only memory limits).
- `docs/GIFT_BOX_BUILDER_V2_PHASE6B4B3_PHOTO_REVIEW.md` (photo inspection and final-review UX).

This document is a **workflow correction**, not a claim that database policies or actual measured box capacities have been loaded. The previously produced 6B.5 report over-assigned technical owner responsibilities and conflated accepted visual/packing direction with independent technical-release checks. The development branch and public site remain unchanged; no `main` merge, Atlas writes, R2 publication, deployment, or checkout activation is authorized here.
