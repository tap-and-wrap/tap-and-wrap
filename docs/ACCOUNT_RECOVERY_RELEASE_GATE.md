# Account recovery and browser release gate

Verification baseline: `c5f8a46e10de804f0dc5e82c4988cba42bcdd89f`. The results below
were recorded before staging or committing the local implementation.
This closes the account-lifecycle follow-up to the standalone engraving release
review. It does not reopen engraving, Gift Box, schema, payments or production.

## Corrective design

The password-reset request rotated the authentication generation correctly, but
that also remounted the owner-keyed subtree containing AccountRecoveryPage. The
page had already stripped its one-use token from the fragment, so the replacement
page could neither restore the original form nor show the unmounted mutation's
success result.

`PasswordResetResultProvider` now lives above that keyed subtree. It retains only
an opaque route scope and idle/pending/success/error status. The explicit request
uses the unchanged authentication transition, verified session probe and private
cache invalidation. Success requires the actual API contract's `passwordReset:true`
and `signInRequired:true`; failed, uncertain or malformed acknowledgments cannot
show success. Credentials are transient call arguments, never provider state/refs,
browser storage or a restored URL. The form clears its password on explicit submit.

Navigation invalidates the active public result. Late completion cannot populate a
different attempt; a new tab/session owns separate React state, and reload destroys
the result. Secret-fragment removal and no-referrer effects remain in place. The
original password-reset test and its strict success assertion are unchanged.

Password reset also explicitly opts out of automatic POST retry after INVALID_CSRF.
The API helper still invalidates the rejected cached CSRF token; other mutations
retain the existing single bounded CSRF recovery. No Origin/auth check or server
policy was relaxed. A rejected reset requires a new explicit user attempt.

## Files in this follow-up

- `client/src/auth/PasswordResetResultProvider.jsx`: tab-local public result lifecycle.
- `client/src/App.jsx`: wraps existing providers without removing/rekeying them.
- `client/src/pages/AccountRecoveryPage.jsx`: reset uses the public result; forgot
  password and email verification retain their original local mutation behavior.
- `client/src/auth/session.js`: reset-only no-CSRF-retry option; owner rotation,
  broadcast, probe, cancellation and private-query invalidation remain unchanged.
- `client/src/services/api.js`: honor that explicit no-retry option while clearing
  the rejected cached token and retaining ordinary mutation recovery.
- `client/e2e/account-recovery-lifecycle.spec.js`: six meaningful lifecycle cases:
  actual draft/cache clearing and generation rotation, rejection, CSRF rejection,
  uncertain network response, unconfirmed acknowledgment, and late completion after
  navigation. Also covers one POST, storage, refresh, new attempt, tab and session.
- `client/e2e/batch1-auth.spec.js`: records sanitized test-only session transitions
  and request paths/methods. Owner-isolation assertions and timeouts are unchanged.
- This report: verification, preservation evidence and final release-gate result.

No backend source changed or backend tests rerun. Both private draft providers,
engraving files, custody/payment/cart/pricing logic and merchant data are unchanged.

## Verification record

- Original password-reset scenario, unchanged: 3/3 independent runs passed initially.
- Final focused account/website/auth selection: 39/39 passed.
- Final three independent repetitions of recovery/forgot/verification cases:
  27/27 passed, including the unchanged reset test three more times.
- Unchanged cross-tab account-change case: 10/10 consecutive runs passed.
- Actual isolated production build/SEO and production lazy-loading fixture: 3/3
  passed with clean fixture shutdown. Build output is ignored; no .env/provider/DB
  configuration was loaded and no merchant dist was overwritten.
- Source lint passed with generated `test-results*/**` excluded.
- The first new draft-isolation fixture imported a duplicate QueryClient module;
  it failed before reaching production behavior. It was corrected to use the app's
  actual versioned optimized module. Its final lifecycle cases pass.
- A preliminary 405-case run was stopped before completion when the explicit reset
  no-retry edge case was added. It is not claimed as a completed release-gate run.

All browser executions are serial, isolated, one worker, using the owned Vite
launcher. No timeouts, owner assertions or production feature defaults were changed.
The complete default fixture retains disabled engraving/Gift Box intake. The enabled
Gift Box production-loading fixture remains separate.

Final complete default suite: **406/406 passed, zero failures, 15.2 minutes, exit 0**.
The owned fixture stopped cleanly. This is an actually completed default run, not
an inference from focused reruns. Log: `server/.cache/account-recovery-default-final.log`.
The unchanged reset scenario passed as case 401, forgot password as case 400,
email verification as case 402, and logout/account behavior as case 403. The strict
cross-tab case passed as case 27, with its recipient timeline saved under the
ignored default-final output. No new application regressions were observed.

The earlier intermediate selection after fixing the duplicate-context fixture also
passed 38/38, and the pre-CSRF-edge repeated selection passed 24/24. Those were
superseded by the final 39/39 and 27/27 selections; they are not separate coverage
totals. No failed production behavior was concealed by the fixture correction.
Focused results above overlap; do not sum them as a unique test total.

## Cross-tab investigation

The original complete-run timeout was not reproduced in ten unchanged repetitions
or the final focused auth run. Recorded recipient transitions show Account A ready,
then a new generation with no owner while checking, then verified Account B ready.
The old owner's cached order must disappear and B's heading must render; both strict
assertions remain. The fixture's shared API owner and the recipient's verified owner
agree. Diagnostic files contain only synthetic owner IDs, generation/phase/timing,
visibility and request paths/methods, not credentials, tokens or request bodies.

The same case passed in the completed 406-case default run. Its recorded recipient
went from Account A generation 0 to ownerless checking generation 1, then verified
Account B generation 1 in approximately 33 ms. No refresh/focus was injected.

No incorrect-account state or privacy/cache race was demonstrated. Historical trace
inspection indicated incomplete verification during the timeout; the original cause
is not proven. Resource contention/navigation timing remains a possibility rather
than an established diagnosis. No blind timeout increase, added focus event, forced
session refresh or synchronization delay was used to hide it. The final default run
also exercises the same strict case and saves its diagnostic independently.

## Preservation and safety

Starting hashes were captured for all 81 intended engraving/review files. Only App
and the already-modified auth browser test changed within that existing inventory;
the other 79 remain byte-identical. In particular, both draft providers, all backend
files and the existing strict website-public reset test are preserved.

No commit, staging, push, deploy, database connection/write, migration, seed,
inventory/payment flag change or public service activation is authorized or performed.
The earlier sanitized ZIP remains a historical review snapshot; it was not rewritten
to disguise this follow-up delta. Production release and merchant approvals remain
separate from a passing local browser gate.

Final Git check: **52 tracked files modified, 35 intended new files across engraving
and this follow-up, zero staged files**. All prior untracked paths remain present.
The 49 original tracked modifications remain; the additional three tracked changes
are AccountRecoveryPage, auth/session and services/api. Only App and auth-test
diagnostics changed inside the earlier 81-file inventory; its other 79 files remain
byte-identical. Preservation details and exact Git status are saved in the ignored
account-recovery test output. No prior review ZIP was overwritten.

## Final decision

**READY TO COMMIT.** The local account-lifecycle/browser release gate is closed.
This supersedes the account-related BLOCKED conclusion in the preceding engraving
review. The owner subsequently authorized an explicit 87-file local commit only;
push, deployment, schema operations, merchant data changes and activation remain unauthorized.
