# Tap & Wrap — JavaScript project

**Plain MERN project like Darb and Wish A Mesh. NO TypeScript. NO pnpm or workspaces.**

- `client/`: React + Vite + JavaScript/JSX + Tailwind CSS 4, React Router, TanStack Query, Axios.
- `server/`: Node.js + Express + JavaScript + Mongoose, cookie sessions, Zod, secure baseline.
- Deployment target: Cloudflare Workers **Static Assets** for `client/dist`, Render for `server`, MongoDB Atlas for DB, R2 for files (later).
- The visual foundation and **Phases 1A–1C** catalog/staging foundation are implemented. **Phase 2** adds server-priced carts, personalization/customization, transactional checkout/orders, protected commerce administration, private-storage integration and durable notifications. See [commerce implementation and integration steps](docs/PHASE_2_COMMERCE_ENGINE.md). Checkout, external uploads and emails remain disabled by default; no persistent catalog import or live provider verification has been performed.
- **Phase 3** adds approved website content/reviews, administration, account recovery, Gmail notifications, consent-gated Meta events and build-time SEO with a Cloudflare Static Assets Worker. Read [Phase 3 verification and staging steps](docs/PHASE_3_WEBSITE_COMPLETION.md) and [SEO activation details](docs/PHASE_3_SEO.md). Owner content, approved catalog export, external credentials and launch authorization remain prerequisites; normal builds stay noindex.
- Business scope comes from `docs/TapAndWrap_Final_Coding_Blueprint_v1.1.md`.

## Start on Windows 11 in VS Code

Use TWO terminals (PowerShell or CMD) and **npm**, no Corepack commands.

### Terminal 1 — frontend

```cmd
cd client
npm install
copy .env.example .env
npm run dev
```

Open http://localhost:5173

### Terminal 2 — API

```cmd
cd server
npm install
copy .env.example .env
npm run dev
```

The API runs at http://localhost:4000 and `/health/live` returns HTTP 200 even without MongoDB. `/health/ready` returns 503 until a staging/local MongoDB URI is configured and connected.

**Before signing up/logging in:** In `server/.env`, set `MONGODB_URI` to a local/staging database URI and `SESSION_SECRET` to a randomly generated secret (minimum 32 characters). Do NOT paste secrets into chat or commit `.env`. Example for generating a secret from the project root:

```cmd
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

For local MongoDB use `mongodb://127.0.0.1:27017/tapandwrap_dev` with `DATABASE_TARGET=local`. Staging requires `DATABASE_TARGET=staging` and the exact database `tapandwrap_staging`. Configuration and the connected target are checked before writes; rejected targets keep readiness at 503. Never use another project's database.

### Verification

```cmd
cd server
npm test
npm run check
```

```cmd
cd client
npm test
npm run lint
npm run build
npm run test:seo
```

Run each in its appropriate folder. No TypeScript/typecheck command is required. No root npm workspace.

Backend tests use a new disposable local MongoDB instance and never use `MONGODB_URI` or a developer `.env`. The first run downloads a MongoDB test binary into `server/.cache/mongodb/`; subsequent runs reuse it. Frontend Playwright tests start their own Vite server and intercept catalog/auth requests with isolated fixtures. They use installed Edge on Windows; another installed Playwright browser can be selected with `PLAYWRIGHT_CHANNEL`. No database or merchant data is needed. See [Phase 1A](docs/PHASE_1A_CATALOG.md) for import safety and [Phase 1B](docs/PHASE_1B_STOREFRONT.md) for frontend/API contracts and staging prerequisites.

## Catalog dry-run

Keep the original workbook at `local-data/TapAndWrap_Website_Product_Master.xlsx`. The entire `local-data/` directory is excluded from Git.

```cmd
cd server
npm run catalog:import
```

This validates the workbook and creates a local report without connecting to MongoDB or uploading images. Blank prices remain blank, stock defaults to 10 provisional units, and customization options/packaging are kept separate from product candidates. Existing records are preserved on reimport. Production imports are disabled; staging writes require explicit flags and a dedicated staging URI. No catalog has been applied to a persistent database as part of Phase 1A.

Phase 1C adds offline schema validation, exact database guards and authenticated saved-product previews at `/admin/products/:id/preview`. Read [Phase 1C staging setup](docs/PHASE_1C_STAGING.md) for the offline `staging:check` command, scoped Atlas prerequisites and the first authorized import procedure. The importer never loads `.env` or falls back to runtime credentials. Preview requires `STAGING_PREVIEW_ENABLED=true`, the staging target and the existing administrator authorization; ordering remains disabled. Persistent staging setup/import and media uploads have not been performed.

## Phase 0 safety

- Public signup **always** creates role `customer`, regardless of request body.
- Session tokens are random and stored **hashed** server-side; cookie is HttpOnly; CSRF and Origin checks protect browser mutation requests.
- No public admin signup, checkout defaults disabled behind both `CHECKOUT_ENABLED` and `COMMERCE_LAUNCH_AUTHORIZED`, and no seeded paid products.
- API health returns readiness separately from liveness.
- All merchant-unknown prices and quantities remain development-only until approved.
- `/shop`, `/products/:slug`, `/admin/products` and product add/edit pages use the catalog APIs. Public products require approved prices/inventory and Ready publication; admin pages verify existing server sessions and roles. Eligible cart operations work against configured transaction-capable databases; checkout remains disabled until explicitly authorized.
- Account recovery and optional email verification use expiring single-use links and a configured backend email provider. Public signup cannot assign administrator roles. The owner must approve account-verification and administrator-access policy before release.

## Why a regular Vite frontend?

This follows the existing JavaScript project pattern. The build now generates meaningful static HTML, unique metadata and a sitemap from an explicit approved catalog export. The Cloudflare Worker serves those files and handles private routes and missing-product 404 responses without asking Render to render pages. A normal build supplies noindex development placeholders. Real product indexing requires approved catalog/media data, an HTTPS canonical domain, explicit indexing flags and separately authorized deployment; fixture tests do not verify Google indexing.

## Current limitations

Dependency installation and advisory checks require registry access. Builds use installed dependencies; tests use disposable databases or isolated API/provider fixtures. All files remain JavaScript/JSX. No commit, push, deployment, persistent import or external provider delivery was performed.
