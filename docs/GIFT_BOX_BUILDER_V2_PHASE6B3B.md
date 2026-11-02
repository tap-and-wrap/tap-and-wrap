# Gift Box Builder V2 — Phase 6B.3b: Engraving color previews

Status: developer-only local preview. This checkpoint adds **five fixed color candidates** — Black, White, Red, Gold and Yellow — to each optional engraving line. It does not approve a real engraving material, specific ink/laser outcome, or final price.

- Each line stores its own `colorId` in the existing in-memory personalization hook alongside its literal text and unlicensed lettering style candidate. Default is `black`. Unknown or forged color tokens are refused by the hook; preview lookup fails closed to the default known color.
- The editor's text sample and the preview below the arrangement display the selected color. Dark backing is used for White, Gold and Yellow to keep the sample readable.
- Arabic, English, emoji, and entered dates are never reformatted. Existing 80-code-point validation, two-line limit, twelve font candidate IDs and six-photo limit are unchanged.
- Color swatches are semantic buttons with independent group labels and `aria-pressed`; each button has at least a 44px touch target. Mobile layout wraps.
- No image upload, engraving text, color, CSS hex, photos, style ID, or coordinates enter the existing estimation API, cart, checkout or server order. Changing colors does not trigger a price request. A browser reload clears draft choices.
- This is a **color depiction**, not an accurate material or typeface preview; licensing, physical feasibility and owner approvals remain blocking before any release.
- No production changes, database operations, Git commits, deployment or asset manifest edits are performed by the patch.

Validation: read-only original asset audit, backend test suite, `npm run check`, client lint, Playwright gift-box Phase 4 config, client build and `git diff --check`.
