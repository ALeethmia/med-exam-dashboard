# Durable course sync review — not ready for production

Base reviewed: `faf357ceab5752c4399bd6712c68a9ad2b1c2587` (main on 2026-10-16, Taipei). PRs #22–24 are merged. #25 remains a separate passing Draft; this change does not merge or depend on it. Version remains 1.0.0.

**The full “no recurring reset” acceptance standard is not yet met.** Unknown writes without a positive receipt remain quarantined. Old clients can bypass the cooperative protocol. Do not merge, deploy, or reset a real account from this Draft.

## Causes and changes

- `observeDatabase.ref()` passed `''` to Firebase `database.ref(path)`. The real compat SDK rejects this root reference. The mock accepted it, hiding a direct cause of multi-location update failures. Omit the optional argument for a root reference.
- Legacy pending entries contained only values. Equal values could delete a newer true → false → true intent; offline/readiness changes converted all new edits into review entries.
- Single-course and chapter handlers exposed memory/cache changes before pending persistence. Some chapter handlers bypassed the shared course facade entirely.
- First-date edits mutated memory before local persistence. A storage exception could leave a date visible without a durable record.

New authenticated course edits use one immutable UID-scoped localStorage record per batch. Each record has a unique ID, exact group membership, base values/revisions, delivery phase and original-day date handoffs. Appending one record is the local commit; UI state changes afterward. Repeated same-value saves create no request or date event. The four projection caches can be rebuilt from the journal. Explicit local demo mode uses the same durable commit/failure path, without any Firebase calls.

Web Locks serialize send/finalization across same-origin tabs. A server root transaction compares every base value **and revision**, reserving a cooperative gate without changing course values. A single SDK multi-location update then commits the entire group, revision IDs and immutable receipt together. The one original Promise owns success/failure. Newer operations are never deleted by an older callback. Acknowledgement persistence/cleanup failures retry local work only.

A restarted session can close a previously committed operation using an exact receipt confirmed by a successful server transaction. Boolean equality, connected, ready, value callbacks and once/get never acknowledge an operation. Conflicting unsent groups remain intact; choosing a copy acts on the complete group. Legacy v1 pending is not imported, replayed or silently cleared.

Loaded local course views remain editable when disconnected. Firebase writes remain connection/readiness gated; reconnect refreshes subscriptions. New first dates are durably handed to the existing first-only date store using the original operation day. There is no new XP emitter or legacy reward replay.

## Local and server footprint

All local keys below are under `becoming_uid_v1:<encoded verified UID>:`:

- `med_exam_course_write_v2:<UUID>`: immutable batch plus delivery phase/base/date payload.
- `med_exam_course_revision_v2:<subject>/<course>`: last acknowledged local revision, protecting against delayed pre-commit callbacks.
- Existing four course projection caches and `med_exam_course_dates_v1`.
- `med_exam_pending_writes_v1` remains the historical/non-course queue; historical course entries stay review-only.

The existing four course roots retain Boolean values. New coordination data is under `questOS/v1/courseSyncV2/{gate,versions,receipts}`. Receipts contain ID, UID and a fingerprint string; Firebase object keys cannot contain `/`. The reservation transaction preserves other root fields. No Firebase rules, Auth accounts, definitions or artwork are changed.

## Blocking limitations

1. **Unknown reservation/write without a server receipt:** the original sender may still deliver a delayed write. The current rules do not enforce a fencing token. Releasing its gate, discarding it, or reapplying automatically could allow that write to overwrite a newer choice. The implementation stops and preserves all evidence. A same-value cached snapshot is not a recovery path. This is a reproducible unresolved pending case, not a passed acceptance criterion.
2. **Older clients:** they write Boolean values without updating revisions or honoring the gate. Changed-value conflicts are detected, but an old-client ABA cannot always be detected. Deployment needs an independently verified old-client retirement/fencing strategy. No production rules were edited to provide one.
3. **Topology/reset:** production code uses owner-authorized shared root paths, not `/users/<uid>`. A verified Auth UID alone cannot prove ownership of each cloud child. Automated account deletion is therefore deliberately absent.
4. **Scale/browser coverage:** root transactions read the account tree; immutable receipts currently have no safe bounded retention policy. Large-account latency/cost needs review. Chromium and emulated mobile viewports are covered; physical iPhone/Safari/Firefox are not. Unsupported Web Locks preserves local requests and stops sending.
5. The broad pre-existing Playwright suite contains fixture/storage assumptions that predate UID isolation. One adaptive fixture failure was independently reproduced on untouched main. The complete broad result is recorded below; passing focused checks must not be described as all-browser acceptance.

A robust automatic no-receipt recovery requires server-enforced fencing or a different server commit primitive. Neither is supplied by the existing permissive owner-only rules plus an unconditional multi-location update. This Draft does not pretend to solve that constraint with timeouts or leases.

## Verification

All data used here is synthetic. Emulator tests start their own loopback instance, pin SDK 9.22.0 / Emulator 4.11.2 hashes and block non-loopback browser requests. Emulator rules are local to that disposable instance; production rules are untouched.

- `npm test`: production/core, lifecycle, dates, growth, layout and new journal/reset-plan Node tests.
- New journal regression: group success/cancel, no-op, offline/restart, ABA, delayed original Promise, local ack failure, receipt recovery, same UID tabs, cross-device revisions, pre/post-commit rejection, cached equality rejection, storage quota, UID/epoch invalidation, missing locks, 200 rounds, delayed snapshots and date handoff failure.
- `npx playwright test tests/browser/durable-course-sync.spec.js tests/browser/sync-ux.spec.js`: actual Chromium localStorage/Web Locks, two-tab ABA, quota/cleanup faults, restart and retained sync UX.
- `B2B1_EMULATOR_JAR=<local jar> FIREBASE_SDK_DIR=<local SDK directory> node tests/sync-queue/durable-course-emulator.mjs`: real SDK reservation, atomic chapter update, offline/reconnect, ABA/no-op, receipt recovery, stale device, permission failure and history preservation (7 checks).
- Full Dashboard RAM fixtures exercise the production engine, task/course projections, four subjects, dates, calendar, planning, XP/kingdom, empty initial state and signout. The fixtures never connect to Firebase.
- Backup plan tests verify exact paths, SHA-256, restore, unknown/static subtree preservation and other UID preservation. They simulate deletion only on cloned RAM objects; no shipped deletion function exists.

Observed local results (2026-10-16 Taipei):

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run build` | Passed; version unchanged |
| `npm test` | 20 test files passed, including 17 new journal cases and 4 reset-plan cases |
| Isolated B1 / B2-A / B2-B.1 Node regressions | 3 test files passed |
| Focused Chromium sync/UX/version/date selection | 20 passed, plus 1 separate real course-UI quota/rollback check passed |
| Real SDK / disposable Emulator | 7 passed |
| Full Dashboard fixtures, 1440 / 390 | 48 passed |
| Failure + batch / four-subject learning fixtures | 8 / 14 passed |
| Canonical Auth + local-mode host bridge | 6 passed |
| HTTP compatibility | 32 legacy URLs, 18 browser checks passed |
| Exploratory broad pre-existing Playwright suite | **111 passed, 85 failed** (196 discovered at start of that run) |
| Untouched-main baseline reproduction | The adaptive `priority/date edits...` failure also fails at `faf357c` |

The broad run preceded the final projection-recovery/local-mode defensive follow-ups; focused tests cover those follow-ups. Only one broad failure was independently compared against main; the remaining 84 must not be labelled pre-existing without triage. Broad regression is not green. No data loss or duplicate group dispatch was found in the passing tests. The no-receipt rejection test intentionally retains an unresolved pending/gate, demonstrating the blocking limitation rather than claiming recovery. Physical devices and non-Chromium browsers were not tested.
