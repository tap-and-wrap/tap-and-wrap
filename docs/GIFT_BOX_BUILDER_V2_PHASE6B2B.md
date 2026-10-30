# Phase 6B.2b — Bow image selection and local drag preview

Development checkpoint only, on feature/gift-box-builder-v2. No publication, pricing, upload, checkout or inventory changes.

- Existing 21 ribbon component identities, prices and API behavior remain unchanged. The UI initially renders **12 images**, then **Load More (9 more)**; the selection persists across steps.
- Bow image thumbnails and a draggable, keyboard-movable bow on the front of the selected open box are developer previews. Selecting another color replaces the image in the same position. Bounds are approximate, not approved physical attachment coordinates.
- All files must be transparent WebP at least 512 × 512, within 10 MiB, same approximate canvas aspect. The offline importer verifies 21 identity-matched assets and hashes. Images are served only from ignored local derivatives via exact allowlisted Vite dev routes; there is no production or external URL fallback.
- The 21 bows must NOT be added to the original audited 99-image `local-data/taw-giftbox/` source collection. The importer supports `--move-from-original` to migrate them safely to `local-data/taw-giftbox-bows/ribbons`. The original `ribbons.jpeg` stays put and the original image audit still applies unchanged.
- A browser reload resets the provisional bow position. The v1 commerce contract does not yet record bow coordinates. No release readiness is implied.

## Local usage

From the repo root:

```powershell
node server/scripts/prepare-gift-box-bows.js --move-from-original
node server/scripts/audit-gift-box-assets.js
cd server
npm.cmd test
npm.cmd run check
cd ../client
npm.cmd run lint
npm.cmd test -- --config=playwright.gift-box-phase4.config.js
npm.cmd run build
cd ..
git diff --check
```

On subsequent runs, omit `--move-from-original`. Source is never uploaded, and generated manifest/derivatives stay in `client/.gift-box-assets/` ignored by Git. Check the real bow images, box front alignment, source transparency and all 21 color matches manually before approving an asset manifest for eventual production R2 publication.
