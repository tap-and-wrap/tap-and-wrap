# Gift Box — Private Photo Guest-to-Account Cart Merge

**Scope:** Guest-cart transfer of already verified, server-priced Gift Box photos. Offline patch on `feature/gift-box-builder-v2`. No production writes.

- The incoming guest Gift Box is first priced using the guest owner and original cart ID. A foreign, expired, wrongly scoped or stale upload aborts the transaction; it is **not silently skipped**.
- The existing account's Gift Box lines are validated under the account owner and account cart ID before changes.
- Incoming lines retain distinct canonical configuration identities. A personalized gift that cannot fit (cart/quantity limit) aborts without clearing the guest cart.
- The existing private upload transfer updates ownership, quota counters and destination cart binding within the same MongoDB transaction.
- The whole merged Gift Box cart is re-quoted and inventory-checked *after* transfer, under the account owner and destination cart ID. A failure rolls back upload updates, quota changes, and cart writes.
- Replaying a successful merge has no guest cart to transfer and leaves account-owned images in place.
- Historical unpersonalized Gift Box and ordinary Product merge paths retain their existing skip/merge behavior.

**Still blocked:** Live public Gift Box checkout (independent launch gates), real image-upload/browser handoff, final admin/fulfillment experience, price provisioning and physical packing approvals. Never enable live checkout from this patch alone.

**Regression tests** (`NODE_ENV=test`, disposable Mongo replica set only):
`node scripts/run-tests.js test/gift-box-personal-merge.test.js test/gift-box-cart.test.js test/product-personalization.test.js`

This test file creates synthetic `Upload` records on the *disposable test database* without invoking R2. It validates ownership and cart-reference transaction semantics, not a live network upload.
