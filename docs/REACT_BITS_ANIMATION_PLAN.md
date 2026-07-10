# React Bits Animation Plan for Tap & Wrap

Status: planning only. No animation was added during the audit. Implement only after every item in `docs/CODEX_FIX_PLAN.md` under “Must fix before animations” passes.

## Design principles

- Premium, warm, calm, and elegant. Motion should support gift discovery and confidence, not call attention to the library.
- Preserve the supplied Tap & Wrap logo; never replace it with an animated generic gift icon.
- Use motion for hierarchy, feedback, and continuity. Do not animate legal text, prices while the user is deciding, form labels, proof uploads, or critical payment state.
- Prefer transform/opacity. Avoid layout animation, large blur fields, continuous loops, cursor replacement, particles, and WebGL.
- Animate once on entry; keep most durations around 300–700 ms and stagger under 50 ms.
- Keep semantic HTML readable before/without JavaScript. Never split accessible heading text into a broken screen-reader experience.
- Respect `prefers-reduced-motion` in JavaScript and CSS. Reduced mode must render the final state immediately with no delay/blur/parallax.
- Disable pointer/tilt interactions on coarse pointers and small screens.
- Do not add a second animation runtime casually. The project already includes `framer-motion`; the current main bundle is already 871.93 kB.

## The four highest-value motion moments

### 1. Home hero headline reveal

- Location: `client/src/components/home/HeroSection.jsx`.
- Preferred React Bits option: **Split Text**, JS + Tailwind, split by words rather than characters, one run, small vertical movement, no looping.
- Exact extra dependencies in the current React Bits catalog: `gsap` and `@gsap/react`.
- Cost: medium. GSAP becomes worthwhile only if reused for moment 2; lazy-load home-only animation code after route splitting.
- Reduced motion: render a normal `<h1>` immediately. Preserve one accessible heading string; mark decorative split fragments hidden if needed.
- Mobile: shorter duration/stagger, no blur, no parallax.
- Fallback: retain/refine the existing `framer-motion` hero reveal; zero new dependency and likely the best first implementation given the bundle warning.
- Reference: https://reactbits.dev/text-animations/split-text

### 2. Home “How it works” or services narrative reveal

- Location: `client/src/components/home/HowItWorks.jsx` or one short introductory paragraph in `ServicesPreview.jsx`—not every paragraph.
- React Bits option: **Scroll Reveal**, with low/no rotation, low blur, one trigger.
- Exact extra dependency: `gsap`. Reuse the GSAP installed for Split Text; do not add it only for this effect.
- Cost: medium CPU on scroll and extra runtime code; use for one section only.
- Reduced motion: ordinary static text; no opacity delay.
- Mobile: disable blur/rotation; simple opacity/translate reveal.
- Fallback: IntersectionObserver + existing `framer-motion` variants.
- Reference: https://reactbits.dev/text-animations/scroll-reveal

### 3. One featured product image interaction

- Location: the featured/best-seller showcase on Home, not every card in large shop/category grids.
- React Bits option: **Tilted Card**, with rotation amplitude reduced to roughly 2–4 degrees, tooltip off, overlay content off.
- Exact extra dependency: `motion`. Note that the currently installed `framer-motion` package is not the same package name; adding `motion` duplicates animation capability unless dependencies are consolidated.
- Cost: low for one card, medium/high when repeated. Pointer calculations can cost mobile battery.
- Reduced motion/coarse pointer/mobile: static card with the existing CSS hover/focus treatment.
- Fallback: existing CSS `transform: scale()` on hover/focus; preferred if bundle budget is tight.
- Reference: https://reactbits.dev/components/tilted-card

### 4. Order success confirmation entrance

- Location: `client/src/pages/OrderSuccessPage.jsx` after the response is already final; optionally the confirmed-paid state in `PaymentResultPage.jsx`.
- Effect category: a single **fade/scale content entrance** inspired by React Bits Fade/Animated Content, implemented with the already installed `framer-motion` rather than adding another runtime.
- Exact extra dependency: none; use existing `framer-motion`.
- Cost: very low if only the decorative confirmation mark/card enters.
- Reduced motion: static final state. Never delay status, order number, retry action, or tracking link.
- Mobile: identical but shorter; no confetti/particles/canvas.
- Fallback: CSS opacity transition or no animation.

## Page-by-page recommendations

| Page/section | Recommendation | Why/constraint |
| --- | --- | --- |
| Home hero | Moment 1 only | Highest brand impact; existing Framer Motion may be enough |
| Home categories/products | Existing subtle CSS hover; optional moment 3 on one featured item | Avoid dozens of pointer listeners and repeated motion |
| Home services/how-it-works | Moment 2 on one narrative block | Adds pacing without making every section a demo |
| Home final CTA | Simple existing opacity/translate, at most once | CTA must remain immediately actionable |
| Shop/category grids | No entry animation for every card; keep focus/hover transitions | Protect scroll performance and product comparison |
| Product detail | Static gallery; optional 150–250 ms image crossfade | Do not tilt/blur customization controls or prices |
| Cart | No decorative entry motion | Quantities/totals must feel stable |
| Checkout | No React Bits | Highest-stakes form; avoid delayed fields, motion, or extra runtime |
| Order success | Moment 4 | Calm confirmation after state is known |
| Payment result | Moment 4 only for confirmed final state | Never animate pending/failed into a misleading success impression |
| Track order | Optional CSS progress-state transition after data loads | Status text and history remain immediately available |
| Services request | Static form; optional moment 2 only in page introduction | Do not animate validation/upload fields |
| FAQ | Native details disclosure; no extra library | Browser semantics and clarity are more valuable |
| Contact/policies/delivery | Static or one subtle section fade | Long-form readability first |
| Admin login | Static | Authentication should be fast and predictable |
| Admin dashboard/analytics | No React Bits initially | Avoid misleading animated numbers and extra admin payload |
| Admin orders/catalog/promotions/services/settings | No decorative animation | Dense operational workflows; motion adds cost and risk |
| Navigation/mobile menu | Functional transition only after focus behavior is fixed | Accessibility before flourish |

## Dependency strategy

Current relevant dependency: `framer-motion@^12.42.2`.

Candidate dependency sets:

| Choice | Added packages | Recommendation |
| --- | --- | --- |
| Existing-runtime plan | None | Preferred first; reproduce the four calm effects with current Framer Motion/CSS |
| GSAP React Bits plan | `gsap`, `@gsap/react` | Use only if Split Text and Scroll Reveal both survive performance review |
| Tilted Card plan | `motion` | Avoid unless consolidating away from `framer-motion`; otherwise use CSS fallback |
| Heavy visual effects | `three`, `ogl`, `matter-js`, `lenis`, `mathjs`, canvas/WebGL packages | Do not add for this store launch |

React Bits components are copied into the codebase in JS/TS + CSS/Tailwind variants; review copied code and licenses/dependencies rather than treating it as an opaque package. The current catalog explicitly lists Split Text as `gsap` + `@gsap/react`, Scroll Reveal as `gsap`, and Tilted Card as `motion`. Re-check the official component page at implementation time because React Bits evolves.

## Performance budget

- First fix route splitting so shopper entry does not include admin code.
- Compare production build before/after; do not merely raise Vite's chunk warning.
- Target no more than one new animation runtime. Prefer zero.
- Lazy-load home-only animation modules.
- No continuous `requestAnimationFrame` work when effects are offscreen.
- No WebGL/canvas, cursor trails, particle fields, infinite marquees, or scroll hijacking.
- Keep CLS at zero: reserve all image/text dimensions and avoid font-dependent split reflow.
- Measure on a mid-tier Android device with 4x CPU throttling and reduced-motion enabled/disabled.

## Reduced-motion behavior

- Create one `useReducedMotion` policy used by all motion code.
- When reduced: no stagger delays, blur, rotation, parallax, spring overshoot, auto-scroll, or animated counters.
- Final content must be present on the first render; do not use opacity zero while hydration/JS loads.
- Focus, validation, toast, payment, and status changes remain perceivable through text/ARIA, not motion alone.

## Mobile behavior

- Treat `(pointer: coarse)` as static for hover/tilt effects.
- Use opacity and at most 8–16 px translation.
- Avoid backdrop blur animation and large composited layers.
- Do not animate while the virtual keyboard/form is active.
- Pause/offload observers when the document is hidden.

## What not to animate

- Header logo continuously, navigation cursor, cart count, prices/totals, discount calculations.
- Checkout fields, payment method selection, proof upload progress beyond a normal progress indicator.
- Payment pending/failure/refund wording or admin payment controls.
- Admin tables, filters, settings toggles, order state transitions.
- Policy/legal copy.
- Every product card or every scroll section.
- Any background effect requiring WebGL, Three.js, OGL, particles, or a custom cursor.

## Implementation order

1. Complete all must-fix audit items and record clean performance/accessibility baselines.
2. Implement moment 4 with existing Framer Motion; verify status accessibility.
3. Refine the existing hero with Framer Motion. Compare it against a Split Text spike in a disposable branch; keep the cheaper result unless the brand gain is material.
4. Add one narrative reveal, reusing the chosen runtime.
5. Trial one featured product interaction on desktop only; remove it if it duplicates runtime or harms product usability.
6. Stop at three or four moments. Do not fill remaining pages with effects.

## Acceptance checklist

- [ ] All P0/P1 and “must fix before animations” items are closed.
- [ ] Supplied logo is used and remains crisp/static/readable.
- [ ] No animation changes the meaning/timing of order/payment state.
- [ ] One animation runtime maximum; dependency list and lockfile reviewed.
- [ ] Main/public/admin chunks remain within agreed budgets.
- [ ] No new Vite chunk warning attributable to animation.
- [ ] Reduced-motion renders final content immediately.
- [ ] Keyboard focus and screen reader output remain correct.
- [ ] Effects are disabled or simplified on coarse-pointer/mobile devices.
- [ ] No CLS from text splitting or images.
- [ ] Lighthouse/mobile profiling completed before and after.
- [ ] Checkout/admin/policy pages remain effectively static.
- [ ] Owner approves the warm, calm visual tone on real content.
