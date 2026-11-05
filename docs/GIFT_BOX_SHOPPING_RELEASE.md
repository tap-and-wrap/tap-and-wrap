# Gift Box shopping handoff

This change does not connect to persistent databases, run imports, deploy, or alter environment files/launch switches.

- New arrangements use `gift-box-commerce-v2`: normalized square workspace, explicit object footprints, inside/beside intent and a saved ribbon pose. Historical v1 data retains its original coordinates and validation. New free-placement purchases require the existing flexible made-to-order authorization.
- Personalization v2 adds one genuine `box_sticker` with an `exterior-front` instruction. Historical engraving surfaces and the separate Laser Engraving service retain their identities.
- Photo files stay in browser memory until Add to Cart. Existing owner/box-bound sign, direct PUT, verified private copy, cart attachment, expiry and transactional retention remain in force. Admin design photos load only on explicit View, through the existing authenticated order-file endpoint.
- Prices come from approved saved component/options records. New UI presets suggest the owner's confirmed 2,000 piastres per photo/sticker; no initializer runs automatically, and no component prices are modified.

## Explicit owner configuration, later

1. If the personalization registry has not been provisioned, follow the existing guarded schema initialization runbook (`BATCH_3_OPERATIONS.md`) only with separate authorization for the exact database target. Runtime remains read-only for schema checks. No additional index is introduced by this change.
2. In Gift Box Personalization, use Prepare Photo print and Prepare Personalized box sticker. Review the proposed EGP 20 amount, choose applicable boxes and confirm the bundled font permissions for the sticker. Save reviewed options. Enable/available are separate explicit controls; preparing an option does not write to MongoDB.
3. Existing options are edited with their loaded revision. A conflict preserves edits until explicit reload. Do not convert old engraving surfaces into stickers.
4. Keep general checkout, direct Gift Box ordering, flexible ordering and personalized checkout launch switches disabled until separate launch authorization and live-provider verification. Schema readiness, isolated tests and saved prices do not grant launch authorization.

## Fonts and assembly

Twelve unmodified Google Fonts families are locally served, each with its copyright/license file and a pinned upstream revision in `client/public/fonts/gift-sticker/SOURCE.txt`. Rochester uses Apache 2.0; the others use SIL OFL. New sticker IDs do not reuse legacy engraving IDs.

The admin design uses saved configuration, purchase prices, asset version and private photo references. Unsupported historical designs show saved instructions without inventing positions. On-screen proportions do not certify physical fit. Controlled release still needs owner-applied configuration, deployment authorization and separately verified real private storage/provider behavior.
