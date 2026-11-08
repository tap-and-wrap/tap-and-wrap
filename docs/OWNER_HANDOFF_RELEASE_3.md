# Owner handoff release 3

## Commerce contract

New orders containing Gift Boxes or standalone engraving use additive accounting version 2. Ordinary product-only orders and existing version-1/historical orders retain their existing contract. One checkout transaction creates one order, freezes all line prices/configurations, consumes only merchant inventory, retains owned private uploads and consumes the original idempotent checkout intent.

Immutable payment groups allocate the exact order total between merchandise (including Gift Boxes, less product-only discounts) and engraving. Delivery and customer-item handoff/return remain separate accepted charges. No price, stock or made-to-order approval is inferred. No database/index migration or historical financial rewrite is required.

Merchandise supports the chosen COD/InstaPay method. Product personalization restrictions remain enforced even in mixed carts. Engraving collection remains deferred until every item is received, inspected and its current final design accepted. The owner then authorizes InstaPay or offers an explicit COD commitment; the customer must accept COD before work starts. COD commitments record no money. Work starts only against the engraving group's verified funds or accepted owner-authorized COD commitment.

Each collection targets one authorized obligation, matches its method, uses actual reconciliation and cannot exceed its outstanding balance. InstaPay requires fresh order-owned proof for that obligation; one proof cannot verify multiple collections or obligations. Existing immutable operation keys, global financial-reference uniqueness and revision/transaction fences remain in effect. Refunds reference actual collection allocations and cannot exceed the remaining collected amount. Additional refund remedies explicitly reduce payable balances; cancellation never invents a refund.

Merchandise fulfillment and customer-property custody are independent. Merchandise delivery does not deliver the whole mixed order. Overall delivery requires all physical groups to finish. Returned merchant stock is inspected/restored once; customer property never becomes inventory. Closed or returned obligations cannot solicit payment. Unworked customer property returned before any collection authorization records the engraving as not provided with no service payable, preserving its original quote and custody evidence. Completion is distinguished from successful engraving delivery. Historical/synthetic order #767557 is not migrated, charged or fulfilled.

Owner and customer order views show the same order with separate obligations. Admin proof views identify the actual obligation and load files only on request. Customer DTOs exclude private acceptance evidence. Notifications and manually shared WhatsApp text direct customers only to currently authorized balances. Version-2 Purchase tracking waits for verified settlement, not a COD commitment. Revenue reporting uses the actual ledger.

## Storefront changes

The previously approved ten-file navigation patch is included intact. Shared product cards use a semantic stretched product link with separate purchase/enquiry controls and no card lift. Canonical destinations and native browser link behavior remain intact.

The homepage's synchronous same-origin ribbon bootstrap presents the original opening frame before prerendered text can paint. React starts that same overlay after mounting; it creates no second animation. Reduced motion, restricted session storage and already-seen sessions skip it. Page hide dismisses it. Failed initialization releases the overlay within six seconds and preserves the meaningful static document. The SEO handoff does not discard static content merely because a timeout elapsed. No-JavaScript documents retain crawlable content, metadata and canonicals.

## Release and owner actions

Local verification: 295 unique affected backend cases passed (the 293-case acceptance run initially had two obsolete Gift Box expectations; the 64-case corrective run passed those and the added mixed-return case; the final 37-case unified suite also covers safe unsuitable-item completion). The comprehensive browser pass passed 90 cases; six focused copy/order-view checks passed after review, and three additional public-information cases verified the corrected operational FAQ/about copy (93 unique browser cases in total). The real disposable API/browser integration passed the combined three-type COD checkout and session-isolation scenario. All 74 SEO tests, lint, syntax checks and production build passed. Screenshots of changed workflows were inspected at 390px, 768px and 1440px. No production order/payment/inventory mutation is evidence for these tests.

Run focused development checks and one comprehensive affected regression pass; report corrective reruns separately, without inflating unique totals. Mutation tests use disposable replica sets and storage adapters. Production verification is read-only and cannot establish that a real payment or fulfillment occurred.

Push reviewed main only after checks pass. Wait for that exact Render backend commit, then dispatch tokenless SEO renewal. Cloudflare deploys the sealed `seo-publication` branch, including the matching main source, assets and expected publication ID. Never deploy a dirty local frontend or push application edits directly to that branch. Preserve expiration and media/catalog verification.

Render intentionally remains Free. The owner will approve always-on hosting immediately before customer launch. Genuine merchant approval is still required for any unapproved privacy, legal, shipping or returns content; code does not invent business policy. External email delivery/scheduling and physical cash/transfer reconciliation remain operational checks, not claims made by disposable fixtures. Once version-2 orders exist, any backend rollback must retain version-2 financial/custody support; never convert them into old totals or ledger records.
