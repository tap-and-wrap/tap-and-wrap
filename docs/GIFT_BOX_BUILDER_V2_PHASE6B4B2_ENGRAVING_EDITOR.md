# Tap & Wrap — Phase 6B.4b.2: Compact Engraving Editor

Development-only visual polish; no checkout/estimate/upload changes.

- Use a single-expanded-item editor for multiple engraving drafts, with keyboard-accessible buttons exposing `aria-expanded` and `aria-controls`.
- Summaries preserve literal customer text, color token, and neutral lettering candidate label; no licensed fonts are claimed.
- The first entry begins expanded. Adding a new entry opens it; older entries collapse without being removed from memory. Removing an arbitrary middle entry retains the surviving entry's stable ID and personal settings.
- The 24-entry browser performance cap, 80-code-point text cap, five fixed visual colors and 12 unlicensed font candidate IDs remain unchanged.
- Existing photo previews, placements and component estimates are unaffected; personalized text and files stay local and are never sent to the v1 commerce APIs.
- This does not constitute physical engraving capacity, material or pricing approval.

## Required local validation

From repository root:

```powershell
cd client
npm.cmd test -- --config=playwright.gift-box-phase4.config.js
npm.cmd run lint
npm.cmd run build
cd ..
node server/scripts/audit-gift-box-assets.js
cd server
npm.cmd test
npm.cmd run check
cd ..
git diff --check
git status --short
```

Do not merge, deploy, open checkout or write to production databases.
