# Tap & Wrap project instructions

## Structure and scope
- Read `README.md` and `docs/` before editing. Current user instructions and the JavaScript restart take precedence over older TypeScript/pnpm/SSR architecture in the blueprint.
- `client/`: React + Vite, JavaScript/JSX, React Router, Tailwind CSS/CSS. Components are in `client/src/components/`, pages in `client/src/pages/`, and API calls in `client/src/services/`.
- `server/`: Node.js + Express, JavaScript, MongoDB/Mongoose. Keep the separate folders and use npm from the appropriate folder; there is no root npm package or workspace.
- Do not introduce TypeScript, Next.js, pnpm, a monorepo, or unrelated architecture changes.

## Visual conventions
- `client/src/main.jsx` imports `styles.css` for layout, then `design-system.css` for brand tokens and visual overrides, followed by scoped catalog/admin styles. Keep that order and use the existing tokens.
- Use white-led surfaces: background `#FFFCFB`, white `#FFFFFF`, brand rose `#DA9B8D`, rose-brown `#915B50`, text `#62483F`, primary button `#795045`, borders `#EADAD5`. Avoid large pink sections.
- Preserve Cormorant Garamond for headings and DM Sans for body/UI.
- Reuse `client/public/tap-wrap-logo.webp` unchanged. Its intrinsic size is 2000 × 667; provide those image dimensions and keep height auto. Never redraw, crop, stretch, or replace it with a wordmark.
- Keep the header logo centered using equal side columns. Drawer navigation uses existing routes and a native modal dialog for keyboard focus, Escape dismissal, and background isolation.
- Check 320px phones, common mobile/tablet sizes, and desktop. Preserve visible focus, comfortable targets, reduced-motion support, and layout stability; fix overflow at its source.

## Safe editing
- Work only within this project and preserve working routes and behavior. Inspect the current files before changing them; do not overwrite unrelated user work.
- Do not alter MongoDB, R2, payments, checkout, or order logic unless explicitly requested. Never print secrets or commit `.env` files.
- Do not fabricate prices, reviews, product data, or business statistics. Catalog and commerce UI use real API contracts; fixtures belong only in isolated tests. Read `docs/PHASE_2_COMMERCE_ENGINE.md` before commerce changes and `docs/PHASE_3_WEBSITE_COMPLETION.md` before website, email, tracking or SEO changes. Reviews require authorized admin entry, explicit approval and quote permission; customers cannot submit reviews. Checkout remains disabled by default behind two explicit launch flags.
- Catalog contracts and safety are documented in `docs/PHASE_1A_CATALOG.md`. Keep imported IDs/classifications and selected image order. Products must be Ready with approved prices and inventory, resolved review flags, and active categories before public exposure.
- Read `docs/PHASE_1B_STOREFRONT.md` for URL filters, approved media serialization and admin forms. Product requests cap at 20, homepage selections at eight; never fetch the whole catalog to filter in React. Keep raw image references admin-only and preserve omitted personalization/customization fields on edits.
- `local-data/` is Git-ignored. Catalog imports default to dry-run; never apply an import or connect to an existing database without explicit authorization. Reimports preserve existing merchant records. No inferred prices, variant selections, personalization, or customization eligibility.
- Read `docs/PHASE_1C_STAGING.md` before database or preview changes. The exact staging database is `tapandwrap_staging`; local development uses loopback `tapandwrap_dev`. Keep URI and connected-target guards before writes/index creation, redact driver diagnostics, and never relax existing session, role, CSRF or Origin checks. Draft previews require the explicit staging setting and admin authorization, with noindex/no-store headers and disabled ordering.
- Do not commit, push, or deploy without explicit permission. Make focused changes and avoid unnecessary dependencies.
- Commerce mutations require a transaction-capable dedicated local/staging database. Keep atomic order/inventory/upload retention/discount/outbox writes, immutable order snapshots, server pricing in integer piastres, approval gates and idempotency. Never reserve inventory just for a cart add or attach a guest order using an unverified phone.
- Customer files stay in browser memory until Add to Cart or Place Order. Private uploads use short-lived direct PUTs and verified private copies; never expose storage keys or public proof URLs. Admin proof/files load only on explicit View actions. Storage/provider mocks are test-only; missing providers must fail honestly.
- `npm run commerce:jobs` defaults to an offline dry-run. Applying a worker batch, sending emails, enabling checkout, importing catalog data or using external storage requires explicit authorization and safe target configuration. Never clear or bypass runtime rate limits to make tests pass; independent isolated test cases may reset their counters through guarded test helpers.
- Gmail credentials stay backend-only; delivery is disabled by default and development recipients must be allowlisted. Keep expiring encrypted account links, bounded outbox retries and manual review for ambiguous SMTP delivery. The smoke command is an offline dry-run unless explicitly enabled and authorized.
- Optional Meta tracking requires owner-approved policy, explicit consent and feature flags. Browser events consume sanitized server receipts with matching CAPI event IDs; never transmit customer text, private files, proof, passwords or unnecessary personal information. Preserve durable Purchase deduplication/acknowledgements and consent revocation.
- SEO builds default to noindex and never query databases automatically. Read `docs/PHASE_3_SEO.md`; export approved records only after separately authorized safe reads. Rebuild static product snapshots when approval, publication, media, prices or stock change. Keep the default Cloudflare Worker private-route headers and real 404 behavior.

## Verification
- From `client/`, run `npm test`, `npm run lint` and `npm run build` for frontend changes. On Windows PowerShell use `npm.cmd` if execution policy blocks `npm`.
- Run `npm run test:seo` for metadata, exporter-contract integration, build-generation or Cloudflare routing changes. Default `npm run seo:export` and `npm run email:smoke` from `server/` stay offline; they do not verify live providers.
- Frontend tests use Playwright with isolated API fixtures and their own Vite server (5191), never a live merchant database. Windows uses installed Edge; `PLAYWRIGHT_CHANNEL` can select another installed Playwright browser. Keep traces/screenshots under ignored `test-results/`.
- Start the frontend from `client/` with `npm run dev`. For UI changes, verify desktop/tablet/mobile, no horizontal overflow, logo alignment, routes, Tab/Shift+Tab containment, Escape/backdrop dismissal, focus restoration, and browser console errors.
- For explicitly authorized backend changes only, run `npm test` and `npm run check` from `server/`. Do not connect to or mutate a database as part of visual work.
- Backend tests create isolated local MongoDB fixtures under `server/.cache/`; they must never load developer credentials or use an existing `MONGODB_URI`. `npm run catalog:import` validates the local workbook without database writes. Run it for importer changes when the source workbook is available.
- `npm run staging:check` validates explicit terminal staging variables offline; it never connects or loads `.env`. Do not treat this check or disposable test fixtures as proof of Atlas connectivity or approval to perform a persistent import.
- Report files changed, implementation, actual verification results, and remaining starter limitations. Explain any failed command and its cause.
