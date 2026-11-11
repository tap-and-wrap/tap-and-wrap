# Final payment policy and delivery address

Owner decision, 12 November 2026. Supersedes earlier personalized COD restrictions and the prior repeated checkout deactivation instruction.

## New website orders

All eligible carts offer COD and InstaPay: ordinary products, optional photo collections, catalog text engraving, required configured personalization, Gift Boxes including stickers/photo prints, standalone engraving, and mixed carts. No personalized-product quotation or per-product payment activation is required. New checkout fingerprints and immutable order snapshots carry `paymentPolicyVersion: all-methods-v1`. Existing accepted orders and quotations without that marker keep their original methods and financial rules. Newly issued bespoke price quotations also include both methods automatically and carry the marker into conversion; no COD authorization checkbox is required.

COD starts unpaid, including discounted orders. Only actual cash collection at an authorized delivery/handoff can enter the settlement ledger. InstaPay retains order-bound private proof and actual account reconciliation; proof submission never marks payment paid. The approved recipient was reconfirmed by the owner. Standalone prices are included at checkout, but receipt, inspection and acceptance of the current final design still gate work. A new COD engraving order uses the customer's accepted checkout method after work approval, without another COD quotation. Historical engraving commitments retain their old approval path.

Delivery and return fees remain separately quoted and accepted. Price verification, stock transactions, private upload scope/retention, immutable retries, variants and customization contracts are unchanged.

## Address compatibility

The checkout submits `delivery-address-v3`: required city/area and street, separate optional Building, Floor and Apartment, and optional notes. The server validates each field and stores both the structured immutable values and a clearly labelled formatted address for existing admin/customer views and notifications. V2 keeps its combined building details. Legacy plain addresses remain readable and valid; v2 cannot ambiguously accept the new fields.

## Verification and release procedure

The focused payment matrix covers six item families and a mixed cart with each method against fresh disposable API/database fixtures. Additional cases cover private proof recovery, old terms, physical inspection gates, pricing, inventory and split-address retry. Screenshots include 320, 390, 768 and 1440 pixels. Run logs and screenshots stay in ignored acceptance artifacts; no customer details or credentials belong in source.

After verification, deploy the exact reviewed main commit. Merge only the two approved global commerce flags to true and leave them operational. Renew the existing tokenless Production SEO publication after activation; verify its reviewed source, publication identity and public routes. A main push alone is not proof of frontend publication. See FINAL_OWNER_HANDOVER.md and SEO_TOKENLESS_RENEWAL.md.

Use only clearly labelled test orders and owner-approved contacts during production acceptance. Never transfer funds, mark test evidence paid, invent custody/fulfilment events, delete test audit history or resend ambiguous old notifications. The owner must independently review uncertain SMTP receipts. A refund cannot be demonstrated live by inventing a collection; use isolated accounting tests and inspect live guards instead.
