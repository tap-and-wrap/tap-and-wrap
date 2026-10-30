# Phase 6B.2c — owner quantity revision and pointer zone study

Developer-only checkpoint based on commit `0f3e998`.

- No invented **25 flowers / 2 plush / 6 chocolates** per-box selection ceiling. The customer sees counts, not an arbitrary category allowance. An actual verified owner-approved physical policy can still impose restrictions; it remains authoritative for future commerce.
- The existing **100 units of one component / 200 additional items per configured box** remain **computational safeguards**, not packaging claims. Stock-tracked items retain their independent authoritative available-quantity restrictions. **No unbounded request or checkout bypass** was added.
- In the **local layout study**, plush and chocolate can be dragged to the right-side beside area and back inside; dedicated accessible Inside/Beside buttons remain. The preview extends whenever at least one movable plush/chocolate is placed, to make an outside drop area available. Roses stay inside the drafted floor.
- The rose algorithm still refuses to place a new bloom if there is no studied free spot; it does not shrink objects to fit. Other component placement/collision/physical depth is still **approximate** and must not be described as certified.
- Existing strict `gift-box-commerce-v1` contract still prohibits chocolate beside in direct commerce. **Public cart and checkout are not enabled**. Later contract work must version zone rules and test fulfillment, rather than silently relaxing the old order schema.
- The separate photo/engraving draft still has provisional 6-photo / 2-engraving and private-upload limits. Those are scheduled for the personalization patch, not claimed resolved here. Box 1 still has its audited defect block. Bow images stay in local ignored storage.

Test backend, browser (gift-box phase4), ESLint, client build, Git whitespace, inspect box 2 plush/chocolate pointer crossings on a phone and desktop. Stage/push only the allowlisted source files after green tests.
