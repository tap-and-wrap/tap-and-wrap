# Release remediation 2 — upload chooser, videos and device experience

Date: 16 October 2026. Scope: F03/F04 and their upload/video regressions. **Local implementation only; no production activation.** This report supplements, and does not supersede, the final release audit or Fix Pass 1.

## 1. Result and preservation

The shared chooser and accessible video controls are implemented. Device/provider acceptance is deliberately incomplete: physical iPhone, Android, Samsung Internet and live R2 remain release gates. The overall release remains **NO-GO** until the other audit findings and infrastructure/data/legal prerequisites are resolved.

Preflight recorded 181 Git status entries and hashes for 410 preexisting non-secret files in ignored `client/test-results/remediation-2/baseline.json`. This is an incremental manifest against that already dirty tree, not a clean-commit diff. Previous batch reports, audit, Fix Pass 1 backend code, shared contracts and Cloudflare redirect code were preserved. No environment files, dependencies, lockfiles, schemas, media originals or posters were changed in this pass. No production/staging database operations, real provider operations, communications, payments, migrations, flags, commits, pushes or deployments occurred.

## 2. Exact changed-file manifest

Modified existing files (including files already untracked before this pass):

- `client/src/admin/AdminImageGallery.jsx`
- `client/src/commerce/ConfiguredFields.jsx`
- `client/src/components/FormFeedback.jsx`
- `client/src/components/PublicContent.jsx`
- `client/src/components/ServiceFilm.jsx`
- `client/src/components/useModalDialog.js`
- `client/src/home-media.css`
- `client/connected-e2e/contracts.spec.js`
- `client/e2e/admin-media.spec.js`
- `client/e2e/batch1-auth.spec.js`
- `client/e2e/batch2-reliability.spec.js`
- `client/e2e/batch3-commerce.spec.js`
- `client/e2e/catalog-preview.spec.js`
- `client/e2e/checkout-foundation.spec.js`
- `client/e2e/commerce.spec.js`
- `client/e2e/product-personalization.spec.js`
- `client/e2e/service-requests.spec.js`

New files:

- `client/src/components/ImageSourceChooser.jsx`
- `client/src/components/image-source.css`
- `client/src/components/useVideoPlayback.js`
- `client/e2e/media-helpers.js`
- `client/e2e/media-experience.spec.js`
- `docs/RELEASE_REMEDIATION_2.md`

Existing browser tests now select files through the real chooser and browser `filechooser` event rather than bypassing the interaction with direct hidden-input selection. Error associations now target the visible upload button. Disabled preview checks assert the disabled trigger and all three hidden inputs. Existing purchase/security assertions were retained. Ignored verification runners, logs, screenshots, synthetic fixture servers and isolated build output under `client/test-results/remediation-2/` and `server/.cache/` are not deliverable source files.

## 3. F03: root cause and correction

Previously, shared customer fields and the admin gallery exposed native file inputs directly. They had no website source-choice step. `ImageSourceChooser.jsx:7–50` now supplies the only active source file-input implementation in `client/src/`:

1. Upload/Replace opens the branded native HTML dialog controlled by the website.
2. Choose from Gallery, Take a Photo or Browse Files invokes a hidden native input synchronously from that choice.
3. The existing customer/admin selection and upload lifecycle receives the selected original files.

Gallery accepts images without `capture`; Files lists supported JPEG/PNG/WebP formats without `capture`; only Take a Photo requests `capture="environment"`, single image. Gallery/Files allow multiple selection where the existing field permits it. The chooser uses no `getUserMedia`, camera stream or CSP/Permissions-Policy change.

The dialog reuses the shared focus/scroll lifecycle, visible focus and generous targets. Escape stops propagation so a nested chooser cannot close the underlying customization dialog (`useModalDialog.js`, `onCancel`). Cancel, backdrop and browser Back dismiss the chooser while preserving the form. Its temporary same-URL history entry preserves router state and only unwinds an entry it owns; history-restricted contexts still have Cancel/Escape. Closing returns focus to the initiating control. Inputs reset after selection so the same filename can be selected again; empty/cancelled selection does not clear the form.

### Updated entry points

| Entry point | Integration and preserved behavior |
| --- | --- |
| Product Customize This and legacy configured product/reference photos | `ConfiguredFields.jsx:28–59`, consumed by `ProductPersonalizationDialog.jsx` and product fields; required fields, variant/quantity and fixed prices preserved |
| Gift Box reference images | `ServiceRequestPage.jsx` → `LocalFileField`; optional multiple images, guest request ownership retained |
| Engraving artwork/reference images | Same shared field; no template requirement added |
| Website InstaPay proof and replacement | `OrderFinancials.jsx:36` → `LocalFileField`; upload remains order-bound, private and separate from payment verification |
| Any configured customer image field | `ConfiguredFields.jsx:65`; same chooser, configured limits and existing submit-time attachment flow |
| Product gallery/add/individual replacement | `AdminProductFormPage.jsx:104` → `AdminImageGallery.jsx`; existing max 23, primary ordering and revision checks retained |
| Category and subcategory image/add/replacement | `AdminWebsitePage.jsx:114` → same gallery, max 1; no relationship/slug changes |
| Component and packaging images | `AdminEditors.jsx:135` → same gallery; existing component identities and galleries preserved |

No visible upload path retains a direct native picker as its first action. Disabled admin draft previews cannot open the chooser. Superseded backup files are not active components and were untouched.

### Platform limitations and HEIC

The website controls the first dialog, not the following browser/OS picker, photo-library permissions or camera permission UI. Gallery and Files can open similar native screens. Native capture is a hint with limited platform support; desktop may show a normal file picker. If camera selection is unavailable/denied, the customer can reopen and use Gallery/Files. Actual camera permission granted/denied/previously-denied behavior is **NOT VERIFIED** on physical devices. See [MDN capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture).

HEIC/HEIF is **not supported** by the approved JPEG/PNG/WebP pipeline. The chooser and recoverable errors explain exporting a JPEG or choosing a compatible copy. Browsers may return a compatible image from native capture, but this is not guaranteed. No conversion library, destructive evidence conversion or metadata rewriting was introduced. Raw unsupported files remain rejected; server validation is authoritative.

## 4. Upload correctness and recovery

`ConfiguredFields.jsx:35–58` validates configured count, MIME, empty files and compressed byte limits before updating the selection. Local object-URL previews are revoked when superseded/unmounted. Invalid selection preserves the previous valid selection and unrelated text. Preview decode errors explain replacement; replacement by the same filename recovers because preview identity follows the new object URL. Individual replacement, append and remove are available for multiple files. Originals stay in browser memory until the existing submission action.

`AdminImageGallery.jsx:28–60` retains upload-first/verify-first/save-later behavior, duplicate prevention, gallery order and stale-save drafts. Stop upload aborts the request and preserves already verified draft references plus remaining selections for explicit retry/discard. It does not claim a server-side accepted upload was deleted. The existing idempotent upload mechanism handles retries; orphaned verified public objects remain subject to the reviewed future retention policy. Existing imported objects are not renamed/deleted.

Fix Pass 1 server decoding, signed upload checks, private owner/generation checks, immutable snapshots and retention transactions are unchanged. A browser preview is not verification, and a proof upload never marks funds Paid. No public artwork/proof URLs or storage keys were added. Public catalog storage remains separate from private evidence. Signed URL expiry, live CORS and actual provider failures still need authorized provider verification.

## 5. F04 and video lifecycle

The original `home-media.css` made the hero button `opacity:0; pointer-events:none`, only exposing keyboard focus. The override now makes it visible and pointer/touch reachable above overlays, with minimum 44px height and visible focus (`home-media.css:47–50`). Service film controls are also always visible. Accessible Play/Pause names follow actual media events.

`useVideoPlayback.js:12–44` centralizes play/pause state, guarded rejected play promises, user pause intent, changing reduced-motion preferences, visibility/page lifecycle and error fallback. Initial reduced motion pauses; a deliberate later Play is allowed. Background/offscreen video pauses, manual pause survives return/orientation, source errors retain a real poster and public links. Autoplay denial leaves a poster and manual retry. See [MDN play()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play).

`PublicContent.jsx:14–29` retains one responsive hero source and approved posters. `ServiceFilm.jsx:5–22` defers sources until intersection, keeps a loaded source to avoid repeated offscreen reloads and pauses when offscreen. The source selection changes at the existing breakpoint. No footage, crop policy, branding or service navigation was replaced.

| Existing asset | Bytes | MP4 AVC codec | Actual local Edge decode |
| --- | ---: | --- | --- |
| Desktop hero | 864,016 | avc1.64001f | 960×570, approximately 11.375s |
| Mobile hero | 835,807 | avc1.64001e | 480×854, approximately 10.958s |
| Gift Box film | 873,964 | avc1.64001e | 480×854, approximately 13.583s |
| Engraving film | 844,812 | avc1.64001e | 480×854, approximately 9.625s |

All four existing files remain below 1 MB and have the movie metadata before media data. Codec inventory is in the previous audit's ignored `video-assets.json`; decoding was rechecked here. A legacy, unrouted `LaserPage.jsx` is not evidence of an active fifth video. AVC packaging and Edge success do not establish Safari/iOS/Android success.

## 6. Verification actually executed

All browser runs use installed Windows **Microsoft Edge 155.0.4283.45**, headless actual Chromium. Responsive/mobile/touch contexts are emulation, not physical devices. API-only browser fixtures intercept provider calls; connected flows use a fresh disposable loopback MongoDB replica set and memory storage. Inherited application configuration and `.env` loading are scrubbed by isolated runners.

| Verification | Actual result and evidence |
| --- | --- |
| Fix Pass 1 baseline | **19/19 PASS**; `server/.cache/remediation-2-baseline.tap` |
| Backend image integrity, storage, catalog media, Fix Pass 1 financial/inventory/intake, personalization, requests, checkout and operations | **108/108 PASS**; `server/.cache/remediation-2-backend.tap` |
| Initial adapted product/admin/checkout/request browser workflows | **30/30 PASS**; `chooser-regression.log` |
| Focused media and admin suite | **15/15 PASS**; `media-final.log` (before the later same-filename preview case) |
| Wider media/personalization/admin/checkout/requests/operations/public suite | **56/57 PASS**, service autoplay/pause expectation timed out; `final-browser.log` |
| Unchanged service-video assertions, isolated diagnostic rerun | **1/1 PASS**, `service-recheck.log`; the prior wider-run failure remains recorded |
| Older upload/focus/field-error/storage/deadline/disabled-preview compatibility | **8/8 PASS**; `legacy-upload.log` |
| Same-filename preview and service-video repeatability | **5/6 PASS**; `repeatability.log`: preview recovery passed all three repetitions, service video passed two and timed out once |
| Instrumented service-video diagnostic repetitions | **3/3 PASS**; `service-diagnostic.log`, unchanged playback assertions; failed-video event diagnostics retained in test code |
| Closure media/admin suite with both new recovery cases | **16/17 PASS**; `closure-media.log`: the new service-fallback test selected its ancestor through the video it then removed, and injected error before lazy source attachment; test setup/locator corrected |
| Corrected service-fallback case | **1/1 PASS**; `service-fallback.log`: first attach lazy source, inject error, then assert loaded poster and service link through stable article locator |
| Real React/API/DB connected journeys | **3/3 case bodies PASS**; `connected.log`; runner teardown stalled and the owned process was interrupted (existing F18), so this is not a clean runner exit |
| Frontend lint | PASS; `lint.log` and final `lint-final.log`; a concurrent attempt encountered removal of the runner's temporary config (ENOENT), then passed when run after runner shutdown |
| Server syntax | PASS, 171 JavaScript files; `server/.cache/remediation-2-syntax.log` |
| Isolated production Vite bundle | PASS; `build.log`, output under ignored test-results; no SEO export/publication or environment loading |

Connected cases exercised: guest COD with shipping null and reload ownership; product chooser/photo/preview/Edit/cart/InstaPay order/proof with explicit protected admin file views and unchanged price; both Gift Box and Engraving with two images, protected admin views, saved quotation, synthetic sharing/WhatsApp acceptance and conversion to an awaiting-payment order. No real WhatsApp, funds or provider calls occurred. These are safe synthetic acceptance actions, not customer communications.

Intermediate failures are disclosed: an early new test expected the wrong existing CTA (`Shop Now` rather than `Shop Gifts`), corrected in the test; an earlier combined run had 40 passes/one touch-control timeout during Vite HMR, subsequently passed without force-click/assertion relaxation. The wider run's separate service timeout is not silently discarded. No unsupported claim that every test is green is made.

**Known F10 remains outstanding:** four previously reproduced inventory/cancellation/custom-COD expectation failures and three obsolete connected contract failures described in `RELEASE_REMEDIATION_1.md:177–179`. They were not repaired or rerun as a full baseline here. Adapting upload interactions does not resolve F10. F18 connected teardown reliability remains outstanding.

## 7. MEDIA, DEVICE COMPATIBILITY & END-TO-END UX ACCEPTANCE

| Capability / source evidence | Test, expected and actual outcome | Status / launch impact |
| --- | --- | --- |
| Chooser-first (`ImageSourceChooser.jsx:33–49`) | Edge: initial click produced dialog with zero native events; each source then produced browser filechooser | PASS, isolated; closes F03 for tested paths |
| Modal navigation (`useModalDialog.js`; chooser history effect) | 320px, landscape 844×390, Tab wrap, Escape, Cancel, browser Back, focus restoration, parent text/scroll lock | PASS, emulated; physical native-picker Back still unverified |
| Native camera hint | Edge filechooser input attributes: only Camera has capture, only Gallery/Files allow multi | PASS simulation; actual camera and permission states NOT VERIFIED, mandatory gate |
| Selection/reselection | Empty selection, reopen, same image twice, multi previews, individual replace/remove, no early uploads | PASS isolated, `media-experience.spec.js` |
| Invalid files | HEIC, empty, oversized preserve draft; corrupted payloads rejected by server decoder regressions | PASS browser/mocked providers and isolated backend; live provider NOT VERIFIED |
| Private ownership/order attachment | Connected product, proof, Gift Box and engraving journeys, explicit admin views of correct images | PASS disposable DB/memory R2; actual R2 and physical phone NOT VERIFIED |
| Admin image management | Multiple upload/order/primary/replacement, category/component save, duplicate/stale revision, failure/retry/stop | PASS mocked provider, `admin-media.spec.js`; public CDN delivery NOT VERIFIED |
| Hero pointer/keyboard/touch control (`home-media.css:47`) | Actual Edge mouse/keyboard and touch-emulated taps pause/resume; state labels and focus visible | PASS; physical touch platforms NOT VERIFIED |
| Motion/source/lifecycle (`useVideoPlayback.js`) | Initial/dynamic reduced motion, responsive source switch, simulated hidden/visible, rejected autoplay, forced error, delayed/aborted network and navigate/back | PASS scoped simulation; physical OS suspension and data saver NOT VERIFIED |
| Service lazy loading/manual pause (`ServiceFilm.jsx`) | Actual Edge decodes both films after intersection, motion changes and pause persistence | PASS focused runs; one wider-run timeout disclosed above, repeatability evidence below |
| Visual layout | Inspected chooser320 and hero390 screenshots; existing public suite covers320/768/1440, admin covers320/768/1440 | PASS limited visual scope; not an exhaustive whole-site visual audit |
| Chrome, Firefox, WebKit/Safari | Standard installed browser/bundled engine paths unavailable; no engine installation attempted | NOT VERIFIED; Chromium Edge is not proof of these engines |
| iPhone Safari/Chrome, Android Chrome, Samsung Internet, physical tablets | No physical devices available | NOT VERIFIED; mandatory before supported-platform release |

Expected fallbacks keep content/links usable, but owner approval and real-device acceptance remain necessary. No exact native Gallery UI or OS permission prompt is promised.

### Mandatory physical-device and live-provider checklist

- On an actual iPhone Safari and Android Chrome, plus Samsung Internet where supported, test Gallery, Camera and Files in every shared customer/admin entry point. Also check iPhone Chrome separately where offered; it is not established by desktop Chromium.
- Test camera allowed, denied and previously denied, camera unavailable, OS library limitations, Cancel/Back, reopen, same file again, multi-select, replacement/removal and HEIC-compatible-copy recovery. Confirm no generic action forces camera and all forms preserve other fields.
- Test tablet portrait/landscape and 320px-equivalent small layouts, software keyboard open/close, dialog scrolling, Escape/external keyboard, screen-reader labels and focus return.
- Complete product personalization → edit → cart → both normal payment methods → correct protected admin attachments. Exercise interrupted PUT, expired signed URL, refresh and deliberate retry without duplicate orders/files.
- Complete both custom requests with multiple images → admin review → quotation/share record/acceptance → order. No mandatory website return/account for WhatsApp quotation payment.
- Complete website InstaPay proof selection/replacement; independently verify association and ownership; a screenshot/upload must leave payment awaiting reconciliation.
- Upload/save/reload product, category/subcategory and component images with authorized synthetic provider data. Verify primary/order, actual public delivery/cache and unchanged imported references. Confirm unauthorized/private URLs cannot be opened publicly.
- Exercise all four videos under real Safari/iOS/Android autoplay, reduced motion, low-power/data-saver, slow network, permission changes, orientation, background/foreground and navigation. Check visible Pause/Play, subjects/crops and readable posters/CTAs on failure.
- Run authorized R2 signed PUT/verification/private view/CORS/expiry/failure smoke checks before activation. Mocks are not sufficient. Keep payments and communications synthetic/separately authorized.

## 8. Performance, configuration and residual risks

No new dependency, provider, camera permission, CSP, database/index or deployment configuration is required by these UI changes. Existing authorized public/private R2 and intake/commerce controls still apply; none was enabled. Accepted requests/orders, nine-hour reminders and twelve-hour dashboard-only overdue obligations are unchanged.

Thumbnail dimensions and lazy/async hints improve layout/loading; they do **not** bound the decoded memory of full-resolution mobile photos. File count/byte limits and server pixel/decode limits remain essential. Physical peak memory, real 3G/4G, large catalog galleries and OS camera formats remain unmeasured. Responsive public derivatives may be a later optimization after source/reference/cache policy review; none were generated or substituted here.

Cancellation can leave a provider-accepted but unreferenced public upload. This is recoverable through idempotent retry and the existing no-delete policy; it does not authorize garbage collection. Browser-memory drafts disappear on full reload by design; owner-bound accepted upload/order recovery remains separate. No new retention duration or historical evidence deletion was introduced.

The exact broader release defects, legal sign-offs, worker/email activation, migration/index plan and infrastructure handoff remain governed by the final audit. Do not start deployment or Fix Pass 3 from this report.

## 9. Final verification and readiness

**F03 and F04 are corrected and locally verified within the available Edge scope. Fix Pass 2 is implemented and ready for review, but is not an unconditional green release gate.** Physical-device/native-picker permission and real-provider checks remain mandatory. The intermittent service-video failure also remains a documented reliability limitation requiring diagnosis or explicit acceptance of its tested poster/link fallback before release.

The service failure recurred in one repeat before three further diagnostic repetitions passed. In the failed trace, the Pause button resolved, then detached; the page showed playback unavailable/fallback while local MP4 responses were HTTP 206. No Vite hot-reload console message explained that repetition. This does not establish an asset defect, a provider defect or a particular decoder/resource cause. Do not attribute it conclusively to HMR or dismiss it as a harmless test flake. Actual playback succeeded in the final closure run, and explicit service-error fallback passed separately. The recoverable video limitation is **P2 pending owner acceptance/diagnosis**; inability to finish uploads/checkout or public exposure of private images would remain **P1 release blockers**. No such exposure was observed in the isolated tested scope.

The latest source build and lint completed successfully; server syntax and the 108 backend regressions passed. No full release suite, physical-device suite or live provider acceptance is claimed. Known F10 and F18 remain open for their designated remediation work.

Final hash comparison: **17 existing baseline files modified, six new files including this report, zero baseline files missing**. The manifest above matches all 23 paths. All server baseline hashes, earlier documents, shared/Cloudflare/SEO code and nine baseline video/poster hashes remain unchanged. There are 199 accumulated Git status entries, nothing staged; `git diff --check` passed (existing line-ending warnings only), and no owned test listeners remained on 4092/5191/5192. No prior work was reset, discarded or committed. Stop here: no Fix Pass 3 or deployment was performed.
