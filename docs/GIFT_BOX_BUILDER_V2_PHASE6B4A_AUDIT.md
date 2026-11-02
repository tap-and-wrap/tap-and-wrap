# Tap & Wrap — Phase 6B.4a: Complete Builder Audit (development-only)

Pinned source: `feature/gift-box-builder-v2`, `8edab18e1e4ef42483e54d9d14249c7e1bcb553a`.

## Scope and method

This phase **adds browser regression/audit coverage only**, with synthetic local fixtures and screenshots. It does **not** redesign the app, adjust server contracts, persist photos, deploy, merge, or enable checkout. The installer adds a new Playwright spec to `playwright.gift-box-phase4.config.js`.

### Automated evidence

The audit tests cover the six customer steps at 320, 390, 768 and 1440px; one 200%-text enlargement case at 320px; and a two-level Box 11 example. The tests verify that the component estimate stays unchanged while local photos and engraving drafts change; that the final request stays disabled; that no order/upload/cart/checkout endpoints are called; that the document does not overflow horizontally; and that no uncaught browser page errors occur. Synthetic screenshots are saved under `client/test-results-gift-box-phase4` (see test output paths).

All test cases must pass on a developer machine before this phase can be considered validated. Passing these tests is **not** a visual design sign-off or physical fulfillment approval.

### Code findings from source inspection

- The builder has six steps and the personalized review action is disabled. The current development preview uses `import.meta.env.DEV` for drag-based study. **This is not a public production-ready interactive builder.**
- Component pricing is keyed to the selected components; photo files, engraving colors/words and placement positions are local preview information and must not be added to estimates or submitted to existing APIs.
- Box 1 has a known blocking source-artwork issue (right-edge remnants). The source asset audit was last reported valid for the 99 expected files but `productionReady` remained `false`. A valid manifest is not an approved image/physical scale.
- All boxes still require real-world owner-approved fit, dimensions, compartment rules, and handling instructions. Box 11 needs separate compartment validation.
- Font names supplied from screenshots are *candidates*, not proof of licensing for redistribution or web embedding. The five engraving colors are visual candidates, not guaranteed physical material colors.
- Photo drafts have local safety budgets (48 entries, 64 MiB aggregate source bytes; 8 MiB/file), engraving drafts have a 24-entry technical limit and 80-code-point per-entry bound. These are not merchant-approved order quantities.
- Beside-zone photos, chocolates, plush and other provisional placement data are not authoritative production packing instructions.

### Owner-dependent release blockers

1. Correct Box 1 artwork, replace it through a newly reviewed manifest, and re-audit full asset alpha/dimensions.
2. Approve physical box floors/masks, size, allowable inside/beside placement, and packing/mixed-content capacity for each box. Include both wells for Box 11.
3. Confirm which photos are sold as physical prints, sizes, prices, upload/retention rules and how their positions map into a future versioned server contract.
4. Confirm engraving material/finish options, colors, prices, licensed fonts, text limits and manufacturing feasibility.
5. Approve a versioned personalization quote/storage/order flow and explicitly authorize the separate public checkout launch; **do not enable checkout from this audit**.
6. Human review of screenshot evidence on desktop, 320/390px mobile, 200% text, assistive-tech keyboard interaction and 200% browser zoom. Inspect stacking, cropping, overlays, focus, legibility and touch hit targets. Tests are signals, not a replacement for inspection.

### Commands

From project root:

```powershell
node server/scripts/audit-gift-box-assets.js
cd client
npm.cmd test -- --config=playwright.gift-box-phase4.config.js
npm.cmd run lint
npm.cmd run build
cd ..
cd server
npm.cmd test
npm.cmd run check
cd ..
git diff --check
```

Inspect generated `phase6b4-*` screenshots in `client/test-results-gift-box-phase4`, and attach any visual issues before committing. Do not merge to `main`, deploy, write production data, enable checkout, or stage unrelated untracked files.
