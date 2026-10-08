# Tap & Wrap JS Restart — Locked Rules

Source: user's final Blueprint v1.1; this file does NOT override it.

## Storefront
- English-only; EGP-only.
- Home: hero (under 1 MB developer-controlled video once supplied), trust, active bundles, featured categories, exactly 8 best sellers, Customize, admin reviews, FAQ, footer.
- `/customize` has exactly 2 featured public services: Gift Box and Laser Engraving.
- Photo/text-required purchases are **normal personalization**. `Customize This` only for enabled products. Trays are product-level.
- 20 product/order/customer records max per page. Backend enforced, not frontend-only.
- Upload photos on Add to Cart; InstaPay proof only on Place Order; private admin viewer loads on click in-page.
- COD and full-payment InstaPay; InstaPay number `01060673073`. WhatsApp `+201508216472`.
- Shipping starter values: Cairo/Giza 90 EGP, other Egypt 120 EGP, editable later.
- Public reviews cannot be submitted. Admin only.
- Random 6-digit order references; guest tracking requires checkout phone + privacy/rate-limit controls.
- Meta Pixel + CAPI deduplication and SEO prerender **before public launch**.
- Estimated prices / 10 tracked stock are NOT authorized sellable defaults. Checkout OFF until approval.

## Phase 0 only
- React+Vite JS / Express JS, npm, `client/` & `server/`.
- Auth foundations and branded starter UI; no real checkout, catalog import, product images or R2 uploads implemented.
- Never ship placeholder FAQ/policy text as final content or leave noindex enabled at launch.
- Deployment needs staging-specific configuration, tests, security review, backups, and verified sender domain.

## Source repository audit limitations
- Repository URLs recorded in prior handoff: `darbcomp/darb` and `wishamesh/WishAMesh`.
- Direct GitHub source was unavailable during this creation turn (repo connector returned 404 / no accessible repos).
- Therefore the restart follows **documented historical project conventions**, not a current GitHub-main code audit.
