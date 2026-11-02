# Phase 6B.2a — image-derived visual arrangement study

Status: developer preview, pending the owner's local test run and manual visual acceptance.

- Single roses now start at estimated bloom-width ratios (0.15–0.18 of the relevant photographed well) rather than the earlier 0.22. These are **relative on-screen assumptions**, not centimeters or approved packing measurements.
- In the local development study, adding a rose finds the nearest unoccupied staggered slot, uses only the selected box interior polygon/ellipse and preserves all previously manually moved items. Its fallback is to refuse a rose when the studied floor has no free candidate; no rose is silently resized.
- Chocolate packages and plush can be toggled between inside and beside in the development layout. Moving either item does not mutate price/quantity. The existing v1 commerce contract **continues to reject chocolate beside**, and production launch gates remain closed.
- Box 11 preserves independent lower and raised regions. Existing limits, stock controls, published physical policies, private customer assets and all order schemas remain unchanged in this checkpoint.
- **Box 1 is still blocked**: the raw `boxes/box-1-open-top.webp` in `taw-giftbox(4).zip` has distinct horizontal dark/red extensions on its right side when viewed against transparency. A separate corrected asset and audited manifest are required before clearing `ASSET_ISSUES`.
- No changes yet to photo dragging or to the owner's new no-business-quantity-ceilings requirement. The existing 25/2/6 and 6-photo/2-engraving restrictions are NOT claimed resolved; those require coordinated server validation, upload-ownership and versioned commerce changes.

## Acceptance checklist

- Run backend tests and syntax checks, lint/build and all gift-box browser tests.
- Visually inspect the automatic red/yellow/black rose growth in boxes 2–12. Try dragging a rose and adding another; older roses should retain their positions.
- Verify chocolate/plush inside ↔ beside moves are available only within the dev study, preserve price and clearly mark physical fit as approximate.
- Keep Box 1 blocked. Do not enable public gift checkout, move to main or deploy this provisional packing study.
- Commit/push *only these ten files* to the feature branch after passing tests.
