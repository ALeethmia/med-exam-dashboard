# One-time reset plan — review only, no execution API

This repository's cloud data is stored in shared roots. `createResetPlan` is an offline backup/planning helper, not an authorization or reset endpoint. It accepts supplied snapshots, rejects mismatched UID inputs, hashes a canonical backup, and lists scope. `executable` is always false. Its input UID is not a replacement for a verified Firebase Auth callback. The helper has no Firebase import, network operation, Auth deletion, storage clear or event dispatch.

Candidate user-data paths, subject to independent ownership review:

- `/videos`, `/biochem`, `/physiology`, `/pharmacology`
- `/gamification/v1/days`, `/gamification/v1/awards`
- `/gamification/v2/timeTasks`, `/gamification/v3/planner/tasks`
- `/habits`, `/custom_events`, `/checklist`
- `/questOS/v1/courseFirstCompletion`, `/questOS/v1/training`
- `/questOS/v1/adaptiveStudy/settings`, `/questOS/v1/courseSyncV2`

Do not delete `/`, `/users`, `/questOS`, or `/gamification` wholesale. Unknown children, static definitions, other users, Auth and rules must be preserved. The backup includes all existing candidate leaves, not just nonempty records; an operator must also export the complete database for independent completeness/scope comparison. A checksum verifies byte integrity, not server freshness or ownership.

Local scope is the exact prefix `becoming_uid_v1:<encoded verified UID>:` on every participating origin/device: course projections, dates, XP/reward caches, planner, habits/life/training, settings, pending, journal, revision caches, other user-created records and UI caches. Global legacy `med_exam_*` keys are **not automatically deleted**: their ownership is unproven. Review and quarantine any that can still feed this UID, separately from other users' data. Root `med_exam_theme` and other UID prefixes remain untouched. Current code does not automatically import global legacy keys.

## Future execution sequence

1. Finish the blocking sync recovery/fencing work, pass review, deploy the fix through a separately authorized production process, and obtain the user's acceptance. This Draft does none of these steps.
2. Inventory every device/origin/tab and all writers, including dates, tasks, life, habits and settings, not just course sync. Establish a verified maintenance barrier before backup. The current app has no global reset barrier; do not improvise one using a flag that older clients ignore.
3. Resolve every in-flight SDK call. A missing receipt is an explicit stop condition. Do not treat timeout, logout, goOffline, or rejection alone as proof that a delayed write cannot arrive. Retire/fence older clients and prove they cannot write.
4. Verify the currently authenticated UID and owner rules independently. Review every candidate cloud path and local key. If any cloud path might contain another user's data or static definitions, stop and narrow scope. A plan generated from a snapshot is not permission to delete it.
5. Under that barrier, obtain a fresh server export and all device-local snapshots. Run `createResetPlan` and `verifyResetBackup`, compare counts/values with independent exports, and perform a restore rehearsal in a disposable emulator. Keep the complete backup off the account being reset. Record the accepted digest/path manifest and restore result.
6. Present the final concrete plan and verified backup summary to the user and obtain **new, explicit execution authorization**. No authorization for this step has been given in the present task.
7. An operator may then use only the reviewed exact paths in one atomic cloud update, and clear only the approved UID-local keys on each device. No reset implementation is shipped here. Keep writers fenced through cloud verification, local verification and all-device restart. Record external maintenance phases (prepared / backed-up / authorized / cloud-cleared / devices-cleared / verified); interruption never means complete.
8. Verify null/initial values directly on the server and absence of the approved local records. Load the fixed client from a clean controlled session; check initial course counts, no dates/pending/rewards, lord level 1 and initial buildings. No completion or XP event should be emitted by reset itself.
9. Use a synthetic account first to rehearse refresh, signout/in and offline/reconnect cycles, then allow the accepted real account to resume. Verify other UID/static hashes unchanged. If anything fails, retain the barrier and restore only the reviewed scoped backup; do not resume writers with a partial reset.

No real backup was read or produced, no real reset was attempted, and no production data/rules were changed in this work.
