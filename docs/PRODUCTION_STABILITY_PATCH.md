# Production stability patch — 9 November 2026

## Scope and evidence

Started from `01a2488bb8a9c781b85d75f430d07f2845eaf82d` with no tracked local changes. Unrelated untracked files are excluded. No server implementation, database, payment, inventory, storage policy or checkout flag changes.

The previous investigation observed HTTP serving a 200 document and `www` returning NXDOMAIN. The owner corrected Cloudflare before this patch. Read-only checks now confirm HTTP → HTTPS and www → apex 301 redirects, preserving `/shop?sort=newest&page=2`. Apex TLS 1.2 and TLS 1.3 both validate normally; the certificate covers `tapandwrap.net` and `*.tapandwrap.net`, issued by WE1, valid 10 October 2026–8 January 2027. No Cloudflare settings were changed by this patch.

The pre-patch site also reproduced a 503 after successful HTTPS negotiation and redirects, then returned 200. The Worker code and isolated timeout tests establish the failure path: public catalog dependency verification throws after its four-second deadline and reaches the global 503 handler. This is independent of certificate negotiation. Historical Samsung warning causality cannot be reconstructed from that HTTP response alone. During development, the owner reported testing both Samsung browsers successfully on the then-current production site; this is owner-reported evidence for the Cloudflare corrections, not physical verification of the subsequently deployed picker patch.

## Native image selection

The supplied `C:/Users/youss/wish-and-mesh` path does not exist here. Inspected the actual WAM checkout read-only at `C:/Users/youss/Projects/wish-and-mesh`, including:

- `client/src/lib/uploadPickerLifecycle.js`: synchronous native input activation, selection hold/release and cancellation lifecycle.
- `client/src/lib/selectedImagePreview.js`: read bytes and create an application-owned `File`.
- `client/src/components/customize/HomeCustomCreator.jsx`: unrestricted image input (`accept` undefined), no forced capture, detach images before releasing the input.
- WAM payment/reference inputs, which have MIME hints; WAM does not use one universal accept configuration for every field.

Tap & Wrap's existing shared `ImageSourceChooser` now directly clicks one mounted native input from the existing Upload button. The React source modal, three source buttons, capture hint and chooser-only instructions/styles are removed. The existing exported component name remains to avoid unrelated caller churn. The input has no accept/capture restriction, matching WAM's home reference image pattern; browser/OS chooses available actions.

Existing signature, declared MIME, decoded image dimensions, per-file/count/total limits and JPEG/PNG/WebP checks remain. Bytes are copied to an independent File before the native input resets. Android-provider FileReader fallback, previous drafts on cancellation/read failure, same-name replacement, unmount cancellation and account-generation fencing remain. No new storage or logging of customer files is introduced. This shared component covers Gift Box photos, engraving reference/artwork, product personalization, order payment proofs and admin images.

## Public browse fallback

Only homepage, Shop and category dependency-verification failures may fall back to `/spa.html`. A typed authority error identifies transport, timeout, cached or invalid authority responses. Configuration errors, missing shell/assets and browser-policy errors retain the global fail-closed behavior.

Fallback returns an empty React shell with `private, no-store`, `noindex, nofollow, noarchive`, its canonical path and `X-Tap-Wrap-SEO: authority-unverified`. No stale static catalog, Offer, product ownership or cached authority is substituted. React retains its existing bounded query retry and user retry controls. One fixed-shape diagnostic per failure logs only route kind and a bounded reason; never a URL/query, slug, response body or exception message.

Product/customization routes and sitemap authority checks still fail closed. Explicit withdrawals precede fallback, category alias redirects are preserved, and live fingerprints, exact publication IDs, expiry and private-route safeguards are unchanged. Render remains Free.

## Mobile navigation

Below 1024px, the existing left-opening native modal uses a three-line icon. Account access moves into the menu with a visible User icon and Sign In/My Orders/Dashboard destination from the verified session. The original logo remains centered; cart and owner-only notifications remain in the storefront header. Drawer links start beneath its header. The eight admin sections, nested customization links, storefront return and admin sign-out remain. Desktop horizontal navigation is unchanged.

The shared dialog and staggered animation lifecycle remains responsible for focus containment, Escape/backdrop dismissal, restoration and reduced motion. Reviewed screenshots cover 390, 768, 1024 and 1440px for guest/customer/admin; upload checks additionally cover 320 and 440px.

## Verification

- Final affected regression: 55 browser cases passed, including JPEG/PNG/WebP native selection, decoded previews, byte-for-byte PUT bodies, replacement, read failures, owner changes, admin uploads, InstaPay order-bound proof, mobile/desktop navigation and keyboard containment/restoration.
- Gift Box native picker/replacement: six viewport cases passed.
- Three focused real local API/browser cases passed: ordinary product personalization with checkout disabled; standalone engraving private images/draft continuity; Gift Box photo PUT, retained cart record, private content bytes and another-session denial. Fresh disposable fixtures only; external storage is test-only.
- 81 SEO/Worker tests passed, including timeout recovery, HTTP/network/malformed/oversized/cached responses, expired/mismatched publications, hidden/withdrawn products, canonicals, aliases, private routes and failures that must remain 503.
- Existing selected-image byte lifecycle/validation unit tests passed; lint, Worker syntax, production build and diff whitespace checks passed.

Corrective runs are not additional unique passes. One command initially ran npm from the root and failed (there is no root package); it was rerun in client. An older Gift Box sequential scenario successfully uploaded/retained photos but then failed its pre-Release-3 expectation that COD is absent. No checkout change was made; a new upload-only scenario supplies focused evidence. That new test initially expected public cart photo bytes after reload; the DTO intentionally supplies placement placeholders. The corrected test checks retained placement/count and authorized private content instead. These fixture corrections changed no production logic.

## Deployment and physical checks

Commit intended source/tests/report only to main after checks, then dispatch the existing `seo-renewal.yml` workflow. The tokenless publication chain verifies current public catalog/media and publishes matching main through `seo-publication`; its live verification checks exact ID/expiry, indexable product HTML, canonical, robots, sitemap and real 404. Do not deploy a local noindex build or bypass publication guards. Deployment identifiers and actual live results belong in the final execution report.

Post-deployment Samsung acceptance remains separate: test Chrome and Samsung Internet from apex HTTP/HTTPS and www links, including WhatsApp/in-app entry, on Wi-Fi and mobile data. Confirm no security bypass, direct native picker, photo preview/replacement/cancel, and an authorized upload without placing an order or transferring money. Capture exact starting URL/browser/version if anything fails. Android's native actions depend on the OS/browser; desktop emulation cannot prove their appearance. No physical iOS test was available during implementation.
