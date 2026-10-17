# Batch 5 — Emails, owner attention and operational readiness

**Local implementation ready for review. Production remains unchanged.** No production/staging database access, actual messages/emails/payments/uploads, infrastructure changes, scheduled jobs, live activation, commits, pushes or deployments occurred. Batches 1–4B and Cloudflare product redirect work are preserved. Batch 6 is not implemented.

Reviewed the five current batch reports, README, commerce/website/operations/release contracts, current source, uncommitted work and affected tests. As already noted in BATCH_3_RELEASE.md, the original standalone numbered launch-audit document is absent from this repository; this report does not claim that unavailable prose was read. Current business instructions and actual implementation take precedence over historical summaries.

## 1. Confirmed initial-contact rule

The existing NotificationEvent outbox owns delivery. No competing notification or payment system was introduced.

| Original submission age | Owner email | Dashboard |
|---|---|---|
| 0 hours | One immediately eligible new-submission email | Initial contact required; original deadline visible |
| Before 9 hours | No reminder | Remaining time shown |
| At/after 9 hours, before 12 hours | One reminder, only while initial contact remains unrecorded | Three-hour reminder window; exact deadline visible |
| At/after 12 hours | No additional initial-contact email; an unsent reminder is suppressed | Overdue until actual contact is recorded |
| Mark as Contacted | Suppress the undispatched reminder | Clear active initial-contact overdue; keep timestamps/history |
| Cancelled/completed work | Suppress irrelevant initial-contact delivery | Exclude from active attention; retain original history |

There are exactly two possible outbox event keys per original submission for this sequence, independent of retries or concurrent workers. Other transactional/payment alerts are separately keyed and do not count toward this limit. The worker rechecks authoritative contact/closure state before dispatch. Contact recording transactionally suppresses queued, failed or claimed-but-undispatched reminders. An email whose dispatch already began cannot be recalled; it is never replayed automatically after ambiguous acceptance. Late recording still clears the active warning and retains the late audit timestamp.

All calculations use immutable `createdAt`, not dashboard opening time or a new staff-entered deadline. UTC instants use elapsed 9/12-hour intervals; owner emails label submission/deadline times in Cairo time using the runtime timezone database. The dashboard refreshes attention every 30 seconds, so displayed state follows the authoritative boundary on its next refresh. A converted bespoke order retains the original request's initial-contact obligation; conversion does not create another sequence or restart its clock. Payment exceptions on that order still generate independent owner alerts.

“Immediate” means the new-submission event is queued atomically and eligible immediately. Delivery is asynchronous and depends on an authorized healthy worker/provider; the proposed one-minute schedule bounds normal polling latency, not inbox arrival. If the worker misses the entire 9–12-hour window, no misleading late reminder is sent. The dashboard overdue indicator remains active.

## 2. Customer email and template coverage

Every email has responsive HTML and readable plain text, with Tap & Wrap colors, white surfaces and the approved “Unlock the Magic of Giving” / “Thoughtful gifts, made personal” copy. Typography uses email-safe serif/sans-serif fallbacks. No remote tracking image, advertising or private attachment is added. Product names and charge labels are escaped; private personalization text, artwork, proof, storage keys, customer address and internal admin notes are excluded from snapshots.

| Authoritative trigger | Customer coverage / next step |
|---|---|
| Regular order received — COD | Order reference, approved merchandise, unpaid collection status, pending separate delivery |
| Regular order received — InstaPay | Order created first; merchandise-only transfer to 01060673073; secure order-bound proof upload; independent verification |
| Proof submitted/replaced | Evidence received, awaiting verification; explicitly not Paid |
| Reconciled collection | Actual recorded funds, current payment status and outstanding balance; partial collection is not described as full payment |
| Payment rejection | Action needed; contact owner before another transfer |
| Delivery/add-on quoted | Saved separate charges, pending vs confirmed/Free state, customer acceptance required |
| Additional-charge acceptance | Agreed amounts and collection method; original merchandise settlement preserved |
| Confirmed/preparing/out for delivery/delivered | Saved fulfillment status and next step |
| Cancellation requested/cancelled | Request vs accepted cancellation distinguished; no automatic refund promise |
| Refund recorded/return/delivery failed | Actual refund totals or review/coordination state; no blanket refund denial |
| Custom request received | Request reference, WhatsApp contact within 12 hours, no payment collected |
| Custom quotation actually shared | Immutable saved quotation version, base work, add-ons, discount and delivery breakdown |
| Custom acceptance recorded | Accepted version; wait for actual order reference and inventory allocation before transfer |
| Custom request closed | Contact owner; closure does not confirm a refund |
| Account verification/reset/password changed | Existing expiring encrypted links and security/session-revocation protections retained |

Existing order-update/inventory/discount notification events remain supported. Supporting custom-request email is optional; a missing customer email does not block requests, owner alerts or WhatsApp contact. Customer email delivery never marks money reconciled, a quote accepted, a customer contacted or an order paid.

Custom-order emails preserve the WhatsApp-first flow: no website return visit or website proof upload is required. Ordinary website InstaPay keeps its secure proof-upload path. No business payment, shipping, inventory or customization eligibility rules were relaxed.

## 3. Owner attention and WhatsApp workflow

New admin route: `/admin/attention`, available through shared admin navigation.

- A paginated, bounded unified queue shows regular orders and custom requests, including a converted request's linked order state. Closed/delivered work is excluded from active attention.
- Filters cover initial contact, overdue, delivery confirmation, quotes to prepare/share, acceptance awaited, payment review, payment pending and response follow-up.
- Each card shows reference, customer name, original submission time, deadline, remaining/overdue/contacted status, response state, payment and fulfillment state, and a full-record link.
- Contact actions require the loaded revision, a private evidence note and an immutable retry UUID. Stale edits return 409 and keep the draft. Uncertain responses retry the same operation. Initial contact cannot be silently reset or lose its original history.
- Explicit response controls distinguish Requires Action, Waiting for Customer and No Response Outstanding.
- Ordinary delivery quotation sharing is recorded separately, only for a saved offered charge; it never accepts the charge or marks payment. A newer charge quotation requires sharing again. Bespoke sharing/acceptance uses Batch 4B's existing versioned actions.
- The owner can select saved prefilled messages for initial contact, delivery, quotation, payment instructions, payment follow-up and preparation/delivery coordination. Links are generated from saved references, amounts, methods and status; private files are absent.
- Opening WhatsApp records no send/delivery/contact/acceptance. The owner sends manually, then uses Mark as Contacted and the appropriate separate quote-sharing/acceptance action. No WhatsApp API is required.
- A settled known balance does not generate a new transfer request. Pending charges remain separately confirmable. Owner-quotation payments use the actual linked order reference.
- Existing order/request overdue filters were corrected to exclude recorded initial contact and use original submission time. Delivery awaiting confirmation remains a separate task after contact.

The contact endpoint only changes communication fields/history. It cannot change product approvals, payment state, financial records, stock, fulfillment or quotation acceptance.

## 4. Owner alerts and failure diagnostics

Owner email is opt-in and requires a valid separately configured recipient plus explicit confirmation. The public support address is never inferred as the operations recipient.

Immediate owner alerts cover new orders and custom requests. Independently deduplicated action alerts cover proofs awaiting verification, quotation acceptance, accepted additional charges, rejected/partial/excess/exceptional payment, cancellation requests, refused delivery and returns. Converted custom-order payment exceptions remain covered without a duplicate initial-contact sequence.

Failed jobs and undelivered customer messages are shown in the admin diagnostics, rather than recursively attempting email alerts through a failing email provider. The dashboard shows configuration-only readiness, queued/scheduled counts, retry/review counts, messages held by activation cutoff, last job/late heartbeat, recent failed/interrupted job history and bounded notification-review entries. Related-record links reveal no private snapshot data.

Merchant-facing text explains recovery instead of showing internal event/error codes as the primary message. The existing Email Delivery page retains technical codes in expandable details. Review actions on dead/uncertain notifications record provider-confirmed delivery or closure without resending. They require explicit confirmation and evidence and retain a private audited review. These actions never modify accounting or account verification.

Provider acceptance is not proof of inbox delivery or customer contact. Bounces/spam placement require external provider/inbox verification; no bounce webhook or inbox-read integration is claimed implemented.

## 5. Worker reliability and activation safety

`run-commerce-jobs.js` remains one bounded invocation, offline dry-run by default. No timer loop was added to the web API. Exact target/topology/production-write guards, read-only schema readiness, job journal and interrupted-run recovery remain intact.

- Shared outbox: unique event keys, two-minute leases, bounded claims and six-attempt exponential backoff (existing maximum six hours).
- Every provider dispatch has a durable dispatch-start marker. An expired dispatched lease is uncertain, rather than silently replayed. Gmail transport ambiguity and uncertain Resend/network/5xx/response acknowledgement require operator review. Explicit Resend rate limits can retry safely; no assumed unlimited provider-idempotency window is used.
- Resend now observes the worker's cancellation signal; all adapters remain test-injection-only under test runtime. Gmail pool/shutdown/security protections are retained.
- Cooperative stage budgets reserve time for independent tracking/upload maintenance, rather than allowing one slow notification stage to consume the entire invocation. Parent shutdown/deadline still bounds the child stages. Existing job counters remain sanitized.
- Private temporary-upload cleanup retains its current expiry, leases, retry/review limits and evidence protections. Retained request/order evidence is not deleted. Public-media garbage collection is not added.
- Existing Meta work stays behind its own policy/delivery flags and authorization. No marketing or indexing flag was enabled.

**New required worker delivery cutoff:** `NOTIFICATION_DELIVERY_NOT_BEFORE`, a reviewed UTC ISO instant. Real outbox sending is held without a valid cutoff. The claim query excludes events created before it, including older queued/failed/undispatched-processing messages. These remain visible as held history. Enabling a provider/live-recipient flag alone cannot flush the old queue. Do not move this instant backwards to replay history; old cases require separate owner/operator review. Worker maintenance can still erase expired account secrets and mark interrupted delivery uncertain while sending is disabled.

New owner events are not backfilled for historical submissions or newly enabled recipients. Existing records remain visible in attention, with missing initial contact treated as unrecorded. Review historical active records and mark genuine contact manually; do not automatically infer it from paid or accepted state.

## 6. Provider-specific setup and offline checks

Engineering recommendation: **Resend with a verified branded sending domain** is the simpler operational choice for new transactional delivery because the existing API adapter exposes explicit responses, provider identifiers and idempotency keys. Gmail remains supported if an authorized business account is preferred. This is a recommendation, not a live-provider verification.

| Configuration | Purpose / repository default | Prerequisite and safe activation |
|---|---|---|
| EMAIL_PROVIDER | `.env.example`: gmail; code fallback: resend | Choose one provider deliberately |
| EMAIL_ENABLED | Gmail flag; false in example | Authorized Gmail sender, private app password, restricted synthetic verification first |
| EMAIL_USER / EMAIL_APP_PASSWORD / EMAIL_FROM_NAME | Backend-only Gmail sender/authentication; blank credentials, branded default name | Privately provision on the runtime; never copy values to reports/frontend |
| NOTIFICATIONS_ENABLED | Resend flag; false | Authorized sender/domain and privately provisioned RESEND_API_KEY / NOTIFICATION_FROM |
| NOTIFICATION_SAFE_RECIPIENTS | Blank | Operator-controlled synthetic test recipients; allowlist applies unless separate production live delivery is authorized |
| NOTIFICATION_LIVE_DELIVERY_ENABLED | false | Requires production runtime AND production database target; only after synthetic verification and owner approval |
| NOTIFICATION_DELIVERY_NOT_BEFORE | New; missing means real outbox held | Review historical queue, choose an explicit current activation instant; configure before synthetic outbox test and later live activation |
| OWNER_NOTIFICATIONS_ENABLED | New; false when absent | Confirm actual internal recipient and provider readiness before new submissions are opened |
| OWNER_NOTIFICATION_RECIPIENT | New; blank | Separate confirmed operations mailbox, not inferred public support |
| OWNER_NOTIFICATION_RECIPIENT_CONFIRMED | New; false | Recipient owner/operator confirms destination privately |
| EMAIL_SMOKE_TEST_ENABLED | false | Separate explicit send authorization, restricted developer/staging runtime and allowlisted recipient |
| PRODUCTION_WORKER_AUTHORIZED | false | Separate worker authorization plus exact database approvals and command confirmations |
| STORAGE_ENABLED | false | Separate private R2/provider authorization and cleanup verification |
| META_ENABLED / META_POLICY_APPROVED / META_CAPI_ENABLED | false | Remain off until independent policy/consent/provider approval |

No `.env` or `.env.example` was modified. No new Cloudflare/browser variables are required. Repository/example defaults are not evidence of actual Render values.

Gmail requires an account eligible for App Passwords and 2-Step Verification. The adapter authenticates as that sender, uses strict TLS, one pooled connection, disables provider logging/URL/file attachments and treats ambiguous SMTP acceptance as manual review. Google documents account-specific sending limits; verify the actual account's capacity before launch. See [App Password requirements](https://support.google.com/mail/answer/185833?hl=en) and [Gmail limits](https://support.google.com/mail/answer/22839?hl=en-GB).

Resend requires a sender on an owner-authorized verified domain and the provider-supplied DNS records, including SPF/DKIM; review DMARC with the domain owner. Provision a suitably scoped API key privately. Provider API acceptance is not inbox placement. Resend documents a 24-hour idempotency-key window; this implementation conservatively stops ambiguous dispatch rather than assuming deduplication indefinitely. See [domain verification](https://resend.com/changelog/domain-verification-events) and [idempotency keys](https://resend.com/changelog/idempotency-keys).

`npm.cmd run email:check` is an offline, no-dotenv, no-database, no-provider-call validation command. Its output contains only booleans, counts/status and provider name, never sender/recipient/credential values. The admin receives the same non-secret readiness concepts. Configuration validity does not verify credentials, DNS, sender permissions or delivery.

`npm.cmd run email:smoke` remains an offline dry-run by default and now supports the selected Gmail or Resend provider. Actual sending still requires `--send --confirm-send --recipient <privately configured allowlisted recipient>`, EMAIL_SMOKE_TEST_ENABLED=true and existing restricted developer/staging runtime rules. This direct synthetic smoke test has no historical database queue to release. Neither send mode nor a real provider was invoked here.

## 7. Proposed production scheduling — not created

Use one Render Cron Job from the same reviewed repository revision, with `server/` as root and `npm ci` as build command. Proposed UTC schedule: `* * * * *` (once per minute), with one bounded run and a reviewed batch-size/duration budget. This meets ordinary near-immediate polling needs without an uncontrolled worker inside Express.

The prepared command, **only after separate deployment/scheduling/database/provider authorization**, is:

```text
npm run commerce:jobs -- --once --target production --confirm-writes --confirm-production-writes --batch-size 20 --max-duration-ms 45000
```

This is not authorization to run it. Required infrastructure: supported Node runtime, exact guarded Atlas production target and transaction-capable topology, scoped read/write credentials, verified schema/indexes, approved egress/network access, correct storefront origin, separate provider/owner/cutoff configuration, optional private R2 cleanup credentials and monitored UTC clocks. No disk or new queue broker is required by this implementation.

Render evaluates cron schedules in UTC and provides a single active run per cron service; platform scheduling does not replace database leases/deduplication. The platform has a minimum cron-service charge. Verify current billing/capacity with the owner before provisioning. See [Render Cron Jobs](https://render.com/docs/cronjobs).

Operator checks: monitor job exits, last successful run, backlog/retry counts and clock health; configure a separately confirmed infrastructure alert recipient. The admin warns when the recorded heartbeat is older than ten minutes, but an external infrastructure monitor is needed if the API/dashboard itself is unavailable. Cron failure emails are not recursively generated by this email queue.

Recovery: stop/disable scheduled execution or provider sending after a fault, preserve durable records, inspect provider acceptance and sanitized job history, and restart only the authorized bounded command after correction. Never clear ambiguous dispatch state, reset rate limits, recreate accepted orders, or widen the cutoff to force delivery.

## 8. Privacy and retention limitations

Admin routes require verified active admin, strict Origin and CSRF protection for writes, bounded rate limits and private/no-store/noindex responses. Query keys and contact/review drafts remain scoped to the verified session. No raw provider errors, recipients, transfer references, files, URLs with private credentials, customer text or secrets enter job logs. The outbox retains minimum event-specific snapshots; private review/contact evidence remains admin-only.

Proposed owner-review policy, **not a legal retention determination or destructive cleanup authorization**:

| Data | Specific handling proposed |
|---|---|
| Unsubmitted temporary images | Keep existing short upload expiry and signed-URL-safe cleanup; the current technical lifetime is unchanged. Validate cleanup with a synthetic provider test before activation. |
| Submitted but abandoned/declined custom requests | Keep protected while contact/review is active. Owner explicitly closes the request, resolves any payment/dispute/hold and reviews a deletion candidate list. Approve a post-closure retention duration before implementing deletion. |
| Accepted order artwork and payment evidence | Keep protected through fulfillment, returns/refunds/disputes and the owner/legal-approved record period; never delete merely because a delivery completed or the request became an order. |
| Contact/quotation/ledger/audit/outbox history | Preserve immutable references and financial evidence. Approve minimization/retention schedules separately; no new TTL was added. |
| Public-media leftovers | Reference-aware report/quarantine only; check every catalog record and immutable order reference before any future deletion. No garbage collector was added. |

The owner must select actual durations and hold/release authority with appropriate professional advice. No legally approved duration is invented here. Retained request uploads continue using existing quota behavior; no automatic extension, evidence destruction or public-file exposure was introduced.

## 9. Schema compatibility and release blockers

Additive fields: Order/ServiceRequest initialContactAt, responseState and bounded contactHistory; Order lastQuotationSharedAt; NotificationEvent owner event types/audience, dispatch provider, private review and suppressed state. A requestId/createdAt notification index is added. Existing customer events with no audience remain customer events; an immutable audience default was intentionally avoided to preserve hydration of projected legacy records.

Existing records are not rewritten, bulk-contacted or inferred approved. New indexes require a separately authorized guarded schema initialization before a release; normal API/jobs remain read-only for schema verification. Do not deploy against missing indexes or bypass readiness. A code rollback must stop worker delivery first and review new owner/suppressed event types with the older worker; do not run an old worker blindly against new queued records.

Production blockers remain: authorized deployment/schema preparation; actual owner mailbox confirmation; provider sender/DNS/credential and restricted inbox verification; guarded queue cutoff review; scheduler and external monitoring approval; R2 cleanup readiness if enabled; merchant staffing/follow-up procedure; retention approval; and the prior catalog/commerce/provider launch gates. Public legal pages and broader merchant UI polish remain Batch 6.

## 10. Actual focused verification

All database fixtures were fresh disposable loopback replica sets through the scrubbed runner. Storage/email providers were mocked; no developer `.env`, merchant database or real recipient was used.

- 16 new operational integration cases pass: exact 0/9/12-hour boundaries for both sources, concurrent claim deduplication, late contact, queued/claimed reminder cancellation, in-flight dispatch handling, Resend crash recovery past 24 hours, optional email/configuration, actual checkout/request transaction hooks, owner action alerts, cutoff safety, failure isolation, quote-sharing independence, legacy overdue filters, authorization and template safety.
- Existing focused email, retention, provider/storage, worker/job, checkout, personalization, quotation, website-admin and account suites pass across the targeted runs. **165 distinct backend tests passed**, with overlap counted once.
- **26 distinct browser cases passed**: attention queue (3), responsive email previews (1), checkout (4), product personalization (9), Gift Box/engraving quotations (8), existing email diagnostics (1). Includes 320px/tablet/desktop overflow, stale revisions, immutable network retries, private-upload reuse, permanent product URL navigation and ordinary payment regressions.
- Targeted changed-file ESLint, server syntax checks and environment-scrubbed Vite build passed. Build artifacts/screenshots stay under ignored test-results; no release SEO export/build or provider operations were performed. Email/customer/owner and attention screenshots were inspected locally.
- Initial failures corrected: immutable default on a newly added projected notification audience; obsolete automatic-shipping test expectation; stale account test expecting 401 instead of the existing 200/anonymous `/me` contract; accessible UI locator disambiguation. Authentication, shipping safety guards and financial rules were not weakened.
- Preflight hashes verify the five previous batch reports and Cloudflare redirect files remain unchanged. Exact manifest follows.

## 11. Exact Batch 5 file manifest

<!-- Generated from the task preflight hash baseline. -->

- `client/e2e/operational-readiness.spec.js`
- `client/e2e/website-admin.spec.js`
- `client/src/App.jsx`
- `client/src/admin/AdminLayout.jsx`
- `client/src/admin/notification-labels.js`
- `client/src/commerce/operations.css`
- `client/src/pages/AdminAttentionPage.jsx`
- `client/src/pages/AdminWebsitePage.jsx`
- `docs/BATCH_5_OPERATIONS.md`
- `server/package.json`
- `server/scripts/check-email.js`
- `server/scripts/email-smoke-test.js`
- `server/scripts/run-commerce-jobs.js`
- `server/src/commerce/notifications.js`
- `server/src/commerce/operations.js`
- `server/src/commerce/owner-notifications.js`
- `server/src/commerce/owner-settings.js`
- `server/src/commerce/routes.js`
- `server/src/commerce/service-request.routes.js`
- `server/src/email/resend.js`
- `server/src/email/settings.js`
- `server/src/email/templates.js`
- `server/src/models/NotificationEvent.js`
- `server/src/models/Order.js`
- `server/src/models/ServiceRequest.js`
- `server/src/website/service.js`
- `server/test/batch3-commerce.test.js`
- `server/test/operational-readiness.test.js`
- `server/test/phase3-account.test.js`
