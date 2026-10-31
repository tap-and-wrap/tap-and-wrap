# Tap & Wrap — Gift Box Phase 6B.7B: Packing Editor Region Alignment

**Scope:** Local/admin UI integration; no production policy published, no physical capacity values invented, and no commerce gates opened.

The Phase 6B.7A direct-cart contract accepts beside-box chocolate **only** with independently reviewed physical permission. The existing admin policy editor still said beside was plush-only and filtered out beside regions for chocolates. This patch fixes that inconsistency.

## Implementation

- The editor offers beside regions for **plush and chocolate** component rules; flowers remain inside-only. Server validation and admin approval requirements remain authoritative and unchanged.
- Developers can deliberately copy the **actual existing draft-builder region identities** into an empty policy editor, avoiding incompatible hand-typed labels that could never match customer placement submissions.
- For Box 11, the helper distinguishes `lower-circular-floor` and `raised-circular-floor`, with two separately named draft compartments. **Both maximum counts stay empty** until tested. The extra beside region stays explicitly outside both compartments.
- The helper is entirely local and cannot overwrite existing region/compartment entries, set quantities, grant component permissions, create physical measurements, or save or approve anything automatically.
- Existing approved source photo artwork and original Box 1 artifact are unchanged. The developer-only overlay remains separate.

## Limitations and next actions

The photographed floors and beside proposals are **not measured physical capacities**. A box's visual proposal and the already accepted overall packing direction do not prove that a particular arrangement fits, allows the lid to close, or can be shipped safely. Genuine tested per-box packing counts and compatible combinations still need verified physical evidence before operational policies are approved. Do not silently turn interface IDs into product certification.

Next implementation can use the generated region IDs to record verified compatibility for the 12 boxes, retaining independent server policy approval, revision/withdrawal and checkout gates. The admin page remains a restricted editor, not a public product feature.

Run `node --test client/src/gift-box/policy-region-guide.test.mjs`, client lint/build, `npm.cmd test -- --config=playwright.gift-box-policies.config.js`, and the existing gift-box browser suites. The server code is unchanged. No Atlas/R2/Worker/Render access or production publication is needed.
