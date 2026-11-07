# Owner handoff — Release 1

Baseline: `a3ef4700c1259a318456c3c65d9130c4742f32ee`. Owner-approved scope:
original photographs, Kalam UI typography, premium navigation and regression
verification. No merchant records, business prices, inventory, configuration,
payment policy, launch/indexing flags or saved orders are changed. Synthetic
engraving order #767557 is untouched. Existing unrelated untracked files are
preserved. This supersedes the older Cormorant/DM Sans visual convention.

## Original box photographs

All twelve cards use the already-published uncropped `selection` derivatives in
`gift-box-media-2026-10-31.1`, at widths 320 and 640. All 24 objects were retrieved
and matched to the immutable registry's SHA-256 and byte count; each retains its
portrait proportions and surrounding shop environment. Box 1 is included. No
photograph was cropped, retouched, generated, replaced or republished.

| Box | Selection 320 | Selection 640 | Uncropped viewer | Verification |
| --- | --- | --- | --- | --- |
| 1 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 2 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 3 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 4 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 5 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 6 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 7 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 8 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 9 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 10 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 11 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |
| 12 | 320 x 427 | 640 x 853 | 960 x 1280 | All three hashes/bytes pass |

The square frame uses absolute image containment so the portrait's intrinsic
height cannot stretch the card or move its controls. Grid/card widths remain
unchanged. Vertical padding and the photograph gap are rebalanced against the
44px information row to retain the previous card footprint. The transparent placement registry, corrected Box 1 overlay and all
geometry remain unchanged. Batch 2 media stays published for rollback; its
uncropped 960 x 1280 masters remain the lightbox source. The viewer's fit, zoom,
wheel, pinch, pan, keyboard and dialog implementation is unchanged.

The 44 x 44 enlarge control is a sibling of the selection button and is always
visible, positioned in the information row beside the name. The photograph and
remaining selection control select normally. Disabled selections remain
inspectable. Selection uses a strong border and a no-wrap badge; small cards use
the checkmark while `aria-pressed` retains the selected-state announcement. Long
display names truncate visually while the complete accessible label is retained.

## Typography contract

`--tw-font-ui`, `--tw-font-body`, `--tw-font-display` and `--tw-font-heading`
resolve to Kalam with the independent `TapWrap Arabic` Amiri fallback. Hardcoded
old brand faces in catalog, admin, notifications, commerce and website styles
are replaced at their source. Headings, controls, Sonner and the engraving UI
signature inherit the approved UI font. Logo artwork, technical monospace,
engraving galleries/proofs and sticker choices retain their own font identities.

`client/public/fonts/ui-v1/` contains unmodified official Google Fonts WOFF2:

| Family/subset | Weights | Total bytes | Loading |
| --- | --- | ---: | --- |
| Kalam Latin | 300, 400, 700 | 65,956 | Regular preload; other weights on use |
| Amiri Arabic | 400, 700 | 208,528 | Only when Arabic glyphs are used |

Unicode ranges prevent Arabic from requesting Kalam. `font-display:swap` keeps
text available; no external font request is needed. The versioned path has
one-year immutable caching. Both OFL licenses, upstream provenance URLs and a
SHA-256 manifest ship beside the fonts. The Cloudflare asset allowlist exposes
these exact license/provenance documents; unknown documents remain real 404s.

The earlier serif heading scale is moderated for Kalam. Existing scoped spacing
and responsive data layouts remain; controls inherit the shared token without
an indiscriminate global `!important` rule. Browser QA checks actual platform
fonts, Arabic shaping, prices, forms, tables and key pages at all six widths.

## Navigation contract

Original, dependency-free CSS implements the public React Bits StaggeredMenu
visual direction: coordinated panel movement, rose edge, staggered large links,
two-line hamburger/close treatment and restrained ivory/brown surfaces. No
upstream component source is copied, so no upstream code license is introduced.
Reference: https://reactbits.dev/components/staggered-menu.

The existing native-modal hook still owns Tab containment, Escape/backdrop,
opener restoration and stacked body scroll locks. Exit has one bounded timer,
cleared on unmount; reduced motion closes directly and suppresses animation.
The drawer scrolls internally in short viewports. Native top-layer placement
keeps it above builder/cart overlays. Route changes close it without remounting
the draft providers. Desktop links retain visible primary navigation.

Verified session role rules are unchanged: public links and account/order
destinations; owner profile to `/admin`; dashboard Home to `/`; eight approved
admin sections with the two Customization destinations. No guessed role or new
authentication state is introduced.

## Verification and release evidence

Tests use isolated API fixtures and disposable connected databases. Real media
verification is read-only. No production cart additions, uploads, orders,
payments, inventory writes or fulfillment are used for smoke testing.

Completed verification: 407 default storefront browser cases, 117 enabled Gift
Box cases, 15 focused photo/cart cases, 13 typography/navigation journeys,
three production-bundle cases, five repeated drawer regressions, 67 SEO/font/
asset tests, 19 focused server tests, and two connected API/browser journeys.
Server syntax checks covered 284 JavaScript files; frontend lint passed.
All passed. Screenshot review covered 123 final isolated screenshots at 320,
390, 440, 768, 1024 and 1440px, including owner/payment screens and Arabic
rendering. Platform-font inspection verified actual Kalam and Amiri glyph use.

Commit and deployment identities and live smoke results are included in the
final release report. Local detailed evidence and the screenshot gallery are
kept under ignored `local-data/handoff-r1/`. Responsive Edge and touch emulation do not constitute
physical iOS/Safari certification. Mixed engraving checkout, inspection-aware
payment and COD policy remain a separate commerce milestone.
