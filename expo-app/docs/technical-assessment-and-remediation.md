# Dinary technical assessment and remediation plan

Date: 2026-10-18\
Scope: Expo/React Native mobile application in `expo-app`\
Status: Implementation prepared; production migrations and device acceptance remain pending — see [implementation record](technical-remediation-implementation.md)\
Review: Independent review added 2026-10-18 (see “Independent review” and the “Review note” under each finding)

## Overall assessment

Dinary has a sound application foundation and a modular, interpretable recommendation engine. The highest-priority gaps are data integrity during retries, account and diary isolation, location-verification rules, and safe data ingestion. These should be addressed before optimizing ranking weights or introducing machine learning.

The recommendation methods are substantially implemented. Production reliability and measured recommendation effectiveness remain incomplete. This report does not assign a numerical completeness score because backend behavior, deployed policies, and device workflows have not been verified.

## Evidence and limits

The review inspected mobile source code, configuration, algorithm documentation, and existing tests. No backend code outside `expo-app` was inspected, and no production data was changed.

Checks executed during the assessment:

| Check | Result | Interpretation |
| --- | --- | --- |
| `npm run typecheck` | Passed | Static types passed for the application. |
| `npm test` | 55 passed, 0 failed | Existing recommendation tests passed. |
| `npm run eval:rec` | Completed | Synthetic diagnostics ran; this does not measure real user satisfaction or uplift. |
| `CI=1 npm run lint` | Failed to start: missing `eslint` | Lint verification is incomplete. |
| Physical-device and simulator workflows | Not performed | Camera, geofencing, lifecycle, and native integration remain unverified. |
| Deployed APIs, schema, triggers, storage policies, and RLS | Not independently verified | Client findings do not establish whether backend safeguards already mitigate them. |

Priorities below describe remediation urgency, not confirmed production incidents. “High” means a plausible failure can affect stored data, privacy boundaries, or the meaning of verification. “Medium” means quality, completeness, or measurement can degrade without a clear user-visible error.

## Independent review

Reviewer: Claude (code review, 2026-10-18). Each finding was re-checked against the source files cited, and the backend assumptions were checked read-only against `supabase/migrations/` in the parent repository. `npm run typecheck` (pass), `npm test` (55/55), and the missing-ESLint result were reproduced. No files other than this report were changed.

**Verdict.** All eleven findings are factually correct. The proposed solutions point in the right direction and need no native code, so they can ship as OTA updates. Three of them would break existing app behavior if implemented literally (F01, F02, F04); the review notes below give a safe direction for each. Two priorities are overstated once deployed RLS is taken into account (F03, F05).

**What the migrations settle:**

| Question left open by the report | Answer from `supabase/migrations/` |
| --- | --- |
| Can another account write queued records? (F03) | No. `restaurants insert` requires `auth.uid() = user_id`, and the queued payload carries the original `user_id`. |
| Is legacy null-book compatibility still needed? (F02) | No. `20261015000000_add_couple_books.sql` backfills `book_id` and makes it `NOT NULL`; inserts without `book_id` go to the personal book via the `fill_book_id` trigger. |
| What does `verified_at` mean? (F04, F08) | Upload/insert time. The `set_restaurants_verified_at` trigger stamps `now()` and ignores client values, so a queued upload is stamped when it reaches the server, not when the photo was taken. |
| Can a retry overwrite a stable photo path? (F01) | No. `storage.objects` has INSERT, SELECT, and DELETE policies for `restaurant-photos` but no UPDATE policy, so `upload(..., { upsert: true })` would be rejected. |
| Is there evidence of a missing GPS fix on stored records? (F04) | Yes. `acc` is saved as `null` exactly when no fix was available at save time (`geo?.acc ?? null`). |

**Rollout rules that apply to every fix:**

1. **Migrations before client code.** A push to `main` publishes an EAS Update to the production channel immediately (`.github/workflows`). If an app change sends a column the database doesn't have yet, every insert fails with an unknown-column error. Apply the migration first and confirm it, then push the client change.
2. **New columns must be nullable or defaulted.** The web app and older app builds write to the same tables and won't send them.
3. **Local SQLite changes need an explicit migration.** `db()` only runs `CREATE TABLE IF NOT EXISTS`, which never adds columns to an existing table. Use a guarded `ALTER TABLE … ADD COLUMN` (check `PRAGMA table_info` first) and backfill, so rows already waiting on users' phones keep uploading after the update.
4. **Offline capture is a hard requirement.** The queue exists so capture works with no connection (e.g., basement restaurants). No fix may make capture depend on a successful network read.
5. **Extra queue data must not go into `payload`.** `payload` is spread directly into `restaurants.insert`; an unknown key would make the insert fail. Use new queue columns instead.

**Revised priorities:**

| Finding | Report | Review | Reason |
| --- | --- | --- | --- |
| F02 | High | High (do first) | Most likely to reach users: a network failure at startup is cached as success, never retried, and mixes personal and couple data for the whole session. |
| F01 | High | High | Rare, but it corrupts stored data and inflates verified counts (`my_verified_count`, community boards). |
| F04 | High | High for the selection race; product decision for the rest | See review note. |
| F03 | High | Medium | RLS blocks cross-account writes; remaining impact is local visibility and stuck queue entries. |
| F05 | High | Medium | Offline admin script; only sets `closed_at`, and the next full import clears it. No app risk. |
| F06 | Medium | Low–Medium | Correct in principle; per-book histories are unlikely to approach the default 1000-row response limit soon. Project setting not verified. |
| F10 | Medium | Low | Accurate, but lowest value for the effort. |

## Findings and proposed solutions

### F01 — Upload retries can duplicate records and photos

**Priority:** High\
**Evidence:** `src/features/queue/process.ts`, `src/features/queue/db.ts`, `src/lib/photos.ts`

Each processing attempt uploads a photo under a new generated path and inserts a new restaurant record. The local queue entry is removed afterward. If the insert commits but its response is lost, or the app terminates before removing the queue entry, a later attempt can repeat the operation. Serialization protects against simultaneous local drains, but does not make retries idempotent. Wishlist deletion errors are also not checked before the job is considered complete.

**Proposed solution**

- Generate a stable operation UUID when enqueueing and persist it with the queue entry.
- Give each operation a stable photo path and persist upload progress.
- Enforce uniqueness of the operation ID on the backend and return the existing record when retrying an already committed operation.
- Model upload, record creation, wishlist reconciliation, and cleanup as recoverable stages. A cleanup failure must not cause a second record insert.
- Classify transient, authentication, and permanent errors so connectivity or session problems do not consume the same retry budget as invalid data.
- Reconcile unused remote objects after failed operations with an ownership-safe cleanup process.

**Validation:** Simulate a committed insert with a lost response, restart after each processing stage, and retry the same operation concurrently. Confirm one logical record, one intended photo object, and eventual wishlist reconciliation.

**Dependency:** Review the actual restaurant schema and storage policies before choosing the backend uniqueness constraint and upload permissions. SQL and backend changes outside `expo-app` require a separately scoped implementation.

**Review note:** Confirmed. Two parts of the proposal need care. A stable photo path will hit “already exists” on retry, and overwriting with `upsert: true` is rejected because `storage.objects` has no UPDATE policy. Existing queue rows also won't receive a new column without a SQLite migration.

**Recommended direction:**

1. *Backend, applied first:* add `restaurants.client_op_id uuid null` with a partial unique index `where client_op_id is not null`. Being nullable, it doesn't affect the web app or older builds.
2. *Local queue:* add `op_id TEXT`, `photo_path TEXT`, and `stage TEXT` columns with a guarded `ALTER TABLE`; backfill `op_id` with a fresh UUID for rows already queued.
3. *`processOne` as resumable stages:*
   - **Upload:** if `photo_path` is empty, set it to `{op_id}.jpg` and save it *before* uploading. On “already exists”, treat the upload as done; don't use `upsert`.
   - **Insert:** send `client_op_id`. On a unique violation (`23505`), select the existing row's `id` by `client_op_id` and continue.
   - **Wish reconciliation:** check the `wishes.delete` error. On failure, record `stage = 'inserted'` and retry only this step later; never repeat the insert.
   - **Local cleanup:** delete the local photo and the queue row last.
4. *Retry budget:* only count data errors (e.g., constraint or validation failures) toward `MAX_ATTEMPTS`. Network and expired-session errors should reschedule without consuming attempts.
5. *Orphans:* defer object cleanup. With stable paths, at most one orphan object per abandoned operation is possible, and the existing `photos delete own` policy allows removing it.

This stays within the existing visual design; no UI change is needed.

### F02 — Book lookup failure can remove diary filtering

**Priority:** High\
**Evidence:** `src/data/books.ts`, `src/data/queries.ts`, `src/lib/rec/taste.ts`

`useBooks` returns `null` on lookup errors. Downstream hooks can consider loading complete with a null book ID, and record/wishlist queries then omit the book filter. The recommendation helper also leaves records unfiltered for a null book ID. Personal and couple data accessible to the account can therefore become mixed in screens and calculations.

This is a client isolation failure path, not evidence that database RLS allows unauthorized access.

**Proposed solution**

- Distinguish loading, successful resolution, missing setup, and lookup failure.
- Require a resolved, authorized book before issuing book-specific queries or mutations.
- Remove implicit unfiltered fallback from normal production flows. If legacy compatibility is still required, make it explicit and narrowly scoped.
- Include account identity in user-specific query keys and ensure transitions cannot reuse another account's cached data.
- Propagate lookup errors to a recoverable error state instead of treating them as an empty legacy configuration.

**Validation:** Inject lookup failures and delayed responses; switch personal/couple books and accounts. Confirm no unfiltered query runs and personal recaps, labels, and recommendations use only their intended book.

**Review note:** Confirmed, and the impact is broader than described. Because `useBooks` *returns* `null` instead of throwing, React Query records a success and never retries, so one network failure at startup affects the whole session. RLS limits the mix to books the user belongs to (personal + couple), so this is a correctness and couple-privacy problem, not unauthorized access. The legacy null-book mode is obsolete (see Independent review). One caution: there is no persisted query cache, so on an offline cold start the books lookup always fails. Today capture still works through the null path, because the server files the record into the personal book. A strict “require a resolved book before mutations” rule would break offline capture.

**Recommended direction:**

1. In `useBooks`, throw on error so React Query retries and reports `isError`. Remove the “before migration” comments and the fallback.
2. In `useActiveBook` and `usePersonalBook`, set `ready` only on `isSuccess` and expose an `error` flag. Keep book-scoped queries disabled until a real `bookId` exists (`enabled: ready && !!bookId`). Change `bookScoped(list, null)` to return `[]` instead of the whole list.
3. **Exception for capture:** never block capture on the books query. If books are unavailable, use the persisted `activeBookId:{userId}` from AsyncStorage. If nothing is stored, omit `book_id` and let the server trigger file the record into the personal book (current behavior).
4. Add `userId` to the `["books"]` query key. Sign-out already calls `qc.clear()`, so this is extra safety rather than a fix.
5. **Owner decision (2026-10-18):** show a dedicated boot loading screen every time the app opens. It stays up until the books lookup succeeds, and longer while the lookup keeps failing. Full design in **Appendix A**. Add “books resolved for the current user” to the `Gate` readiness in `app/_layout.tsx`, so no screen renders book data before then.

### F03 — Offline queue ownership is not enforced locally

**Priority:** High\
**Evidence:** `src/features/queue/db.ts`, `src/features/queue/useQueue.ts`, `src/features/queue/process.ts`, `app/_layout.tsx`

The queue stores the original `user_id` inside JSON, but queue listing and draining are not filtered by the current account. Queue triggers start whenever a session exists. Another account on the same device can receive queued draft entries and attempt to process them with its session. Whether remote writes are rejected depends on deployed policies.

**Proposed solution**

- Add an explicit owner column and migrate existing entries from their payloads; quarantine malformed entries.
- Filter display, retry, deletion, and processing by current owner.
- Check identity before each remote processing stage and stop safely when the session changes.
- Clear account-specific transient state on logout/account changes without silently deleting another account's unsent records.
- Review geofence and recommendation state cleanup during the same lifecycle audit.

**Validation:** Queue a photo as account A, sign out, sign in as B, and reconnect. Confirm B cannot see or process A's entries, then confirm A can resume them after signing back in.

**Review note:** Confirmed, but Medium rather than High. B's inserts are rejected by RLS (`auth.uid() = user_id`), so no record is written to the wrong account. What actually happens: B can see A's pending entries (photo and place name) in the archive, and each of B's attempts uploads an orphan photo. A's entries are marked failed after three attempts, so automatic draining skips them and A must retry manually.

**Recommended direction:**

1. Add an `owner_id TEXT` column (guarded `ALTER TABLE`) and backfill it from `payload.user_id`. Quarantine rows whose payload doesn't parse (set `failed = 1`; don't delete them).
2. Make `listQueue(ownerId)` filter by owner, and pass the current user from `useQueue` and `drainQueue`.
3. In `processOne`, read the session first and *skip* (don't fail) any row whose owner differs. Never call `markFailure` for an ownership mismatch.
4. Leave other accounts' rows untouched on logout; they resume when their owner signs back in.
5. Low risk and invisible to the normal single-account user.

### F04 — Verification can be saved without sufficient location evidence

**Priority:** High\
**Evidence:** `app/capture.tsx`, `src/features/capture/logic.ts`

Location acquisition is asynchronous. Candidate selection permits unknown distance in relevant paths, and the saved capture payload sets `verified: true` unconditionally. Accuracy is recorded and displayed but is not used to decide verification eligibility. A selected restaurant's coordinates are stored; they are not independent proof of the device's position.

**Proposed solution**

- Define one shared verification decision function covering location availability, finite coordinates, fix age, reported accuracy, and restaurant distance.
- Require a usable fix before granting verified status. Preserve the existing unverified-record path when evidence is unavailable.
- Recheck eligibility at commit time, not only when rendering candidates.
- Agree on an accuracy threshold using device observations; document how uncertainty affects the distance rule.
- Inspect backend enforcement and timestamp semantics. Do not treat client-supplied flags as sufficient evidence for trusted community aggregates.
- Preserve capture time separately from upload/acceptance time so delayed uploads do not become incorrect meal-time evidence.

**Validation:** Test denied permission, failed and slow fixes, poor accuracy, stale fixes, boundary distances, malformed coordinates, and delayed uploads on iOS and Android. Verify backend handling of invalid verification submissions.

**Limit:** GPS proximity cannot establish that a meal occurred or fully prevent spoofing. The verification label should have a precise, supportable meaning.

**Review note:** Confirmed, but this finding mixes a bug with a product policy, and they should be handled separately.

- *Bug:* `readGeo` runs in parallel with the photo. A user who taps a candidate before the fix arrives gets `geo = null`, so `pickList` applies no distance limit, even though a fix might arrive a second later.
- *Policy:* “No fix, no limit” is deliberate. The `pickList` comment says so, and `logic.ts` notes that the rules mirror the web `CaptureFlow` and must change together. Basement and indoor restaurants, the same case the offline queue was built for, often have no GPS fix. Requiring one would mark many genuine visits unverified, and `verified` feeds character draws, community boards, and stamps. The server also can't enforce a device-location rule, because the app deliberately doesn't upload the device's coordinates (“읽은 위치는 저장하지 않습니다”).

**Recommended direction:**

1. *Now (bug fix, no policy change):* keep the pending `readGeo` promise. In `commit`, if `geo` is still null, wait for that promise for a short bounded time, then recompute the distance from the fix to the picked place. If it exceeds `PICK_MAX_M`, follow the existing “too far” path. If there is still no fix, apply the strict rule in step 3. Also reject non-finite coordinates. Use a bounded wait of about 8 s; while waiting, the save button shows the existing “위치 읽는 중…” text.
2. *Now (no client change):* when community or ranking features need stronger evidence, filter on `acc is not null`. It already marks records saved with a real fix, including historical records.
3. **Owner decision (2026-10-18): strict (option B), for now.** A capture without a usable GPS fix is *not* verified. Implementation rules:
   - In `src/features/capture/logic.ts`, `pickList` must treat “no geo” and “unknown distance” as far: `far = !geo || c.distance == null || c.distance > PICK_MAX_M`. Update the comment (“위치를 못 읽었으면 제한하지 않습니다”) to describe the new rule.
   - In `app/capture.tsx`, the search-hit tap (`if (searching && c.distance != null && c.distance > PICK_MAX_M)`) must also send unknown distance to the unverified path.
   - In `commit`, after the bounded wait from step 1, refuse to save `verified: true` unless a fix exists, the coordinates are finite, and the distance from the fix to the picked place is ≤ `PICK_MAX_M`. Otherwise, take the unverified path. This check at save time is the real guarantee; the list rules only guide the user.
   - **The photo must not be lost.** Today `onUnverified` opens `/record/edit` with only `name` and `kind`, which drops the photo already taken. The unverified path must carry the shot (e.g., pass its persisted URI so the record form attaches it as a normal album photo). If `/record/edit` can't accept an initial photo without a UI change, stop and ask the owner before changing the form's layout.
   - Copy shown when there's no fix: reuse the existing strings (“위치를 읽지 못했어요”, the existing unverified button text). Don't add new screens.
   - No accuracy threshold for now. Revisit with data from: `select count(*) filter (where verified) as verified, count(*) filter (where verified and acc is null) as no_gps, count(*) filter (where verified and acc > 100) as acc_over_100m from restaurants;`
   - Only the app changes. The web `CaptureFlow` keeps its lenient rule under the app-only scope, so app and web will temporarily disagree; note this in the commit message.
   - Existing records aren't changed retroactively.
4. *Capture time:* add a nullable `captured_at timestamptz` column (backend first) set from `shotAt`, and use it only for meal-time analysis. Keep `verified_at` as the tamper-resistant server stamp. `captured_at` is client-supplied and shouldn't be trusted for community aggregates.

### F05 — Partial imports can incorrectly mark businesses closed

**Priority:** High\
**Evidence:** `scripts/import-stores.ts`

After importing any nonzero number of matching rows, the script marks older, untouched businesses in the selected province as closed. A valid but partial input can therefore mark operating businesses closed. The nonzero-row guard protects against empty imports, not incomplete regional snapshots.

**Proposed solution**

- Validate required headers, input scope, snapshot date, unique IDs, and row counts before changing business status.
- Separate partial upserts from explicitly declared full-region reconciliation.
- Stage a complete import with a run identifier, then reconcile only after successful coverage checks.
- Produce a closure preview and stop when counts differ substantially from the previous accepted snapshot.
- Preserve import provenance and enough prior state to reverse an incorrect reconciliation.

**Validation:** Use complete, truncated, wrong-region, duplicate, and malformed fixtures. Confirm partial imports cannot trigger province-wide closure updates and failed runs do not finalize reconciliation.

**Review note:** Confirmed, but Medium rather than High. This is a manual quarterly script run from a laptop or codespace with the service-role key, not app runtime code. It only sets `closed_at` (nothing is deleted), and the next complete import resets `closed_at` to null through the upsert. The impact is that some stores are temporarily missing from nearby-place results. The fix carries no risk to the app.

**Recommended direction:**

1. Run the closure step only with an explicit `--full` flag; without it, upsert only.
2. Before closing, count currently open stores in the region (`closed_at is null`). **Owner decision (2026-10-18): abort the closure step if this run's total is below 90% of that count**, unless `--force` is given. Upserts already written stay; only the closure update is skipped. Print both numbers and the ratio. Reference point: on 2026-10-13, Seoul (`sido_code = 11`) had 137,743 open stores from one import and 0 closed, so the next import will be the first to close anything.
3. Make `--dry-run` connect read-only and print how many stores *would* be closed.
4. Check required CSV headers up front; `head.indexOf(k)` currently returns `-1` silently and yields empty fields.

### F06 — History retrieval does not establish completeness

**Priority:** Medium\
**Evidence:** `src/data/queries.ts`

Restaurant and wishlist queries request all rows without pagination. If the deployed API caps responses, larger histories can be silently truncated. This affects calendars, recaps, labels, taste profiles, and candidate generation. The actual deployed row limit was not verified.

**Proposed solution**

- Implement explicit pagination with deterministic ordering and an ID tie-breaker.
- Return a complete logical dataset to consumers that require full history, and represent incomplete/error states explicitly.
- Use bounded or aggregated queries for screens that do not require full history.
- Profile representative history sizes before moving expensive aggregation to the backend.

**Validation:** Load fixtures beyond the configured API response limit, including tied dates and pending records. Confirm all rows appear exactly once and calculations match the full fixture.

**Review note:** Correct in principle; Low–Medium urgency. Supabase's default `max_rows` is 1000, and one book's history is unlikely to reach that soon. Check the project's API setting (Dashboard → API) first.

**Recommended direction:** Add a small `fetchAll` helper that pages with `.range()` in steps of 1000, ordered by `visited_at` then `id`, and use it in `useBookRows` and `useBookWishes`. Query keys and return types stay the same, so callers don't change. Use it only where full history is needed. The cost is one extra request per 1000 rows; there is no functional risk.

### F07 — Community ranking uses weaker evidence controls

**Priority:** Medium\
**Evidence:** `src/features/community/recs.ts`

Community ranking uses raw rating averages, an uncapped record-count boost, and personal category frequency. Frequent contributors can disproportionately influence results, and frequent visits can be interpreted as preference without satisfaction evidence. Name-only exclusion can also hide a different branch of a restaurant the user has visited.

**Proposed solution**

- Smooth ratings toward a neutral prior and cap evidence per contributor/business.
- Bound popularity boosts and distinguish visit frequency from satisfaction.
- Reuse suitable satisfaction and identity helpers from the main recommendation modules while keeping the community feature's social purpose explicit.
- Prefer provider IDs and geographic branch identity over name-only exclusion.
- Scope stored dislikes by account and, where appropriate, book; the current storage key is shared on the device.

**Validation:** Compare one prolific contributor with many independent contributors; test sparse ratings, repeated disliked meals, and same-name branches. Check explanations against the evidence actually used.

**Review note:** Confirmed: raw averages, an uncapped `list.length * 0.2` boost, `myNames` exclusion by normalized name only, and one device-wide dislikes key (`community.recs.dislikes`). Fixing it changes the order users see but cannot break anything.

**Recommended direction:**

1. Count distinct contributors instead of records (`new Set(list.map(r => r.user_id)).size`) and cap the boost.
2. Replace the raw average with a smoothed one, `(sum + m·prior) / (n + m)`. Reuse the prior and strength from `src/lib/rec/config` so the community and main engines agree.
3. Exclude visited places with the same `place_key` / `samePlace` (name + distance) check used in capture, not name alone.
4. Move dislikes to `community.recs.dislikes:{userId}`. On first load, copy the old key into the current account's key once so nobody loses their hidden places.
5. Keep the displayed reasons in sync with the evidence actually used.

### F08 — Recap meal-time statistics can use entry time

**Priority:** Medium\
**Evidence:** `src/features/recap/compute.ts`

Recaps use `verified_at` or fall back to `created_at` to compute hour-based statistics. A user entering yesterday's lunch at midnight can contribute to midnight eating statistics. The main ranker is more conservative about time evidence, so the methodologies are inconsistent.

**Proposed solution**

- Use only timestamps whose meaning supports meal-time analysis.
- Exclude unknown meal times from hour-based statistics and retain date-only records for date-based totals.
- Track how many records have usable time evidence so sparse evidence does not produce overstated conclusions.
- Audit `verified_at` for delayed uploads before relying on it as capture time.

**Validation:** Enter a backdated lunch at midnight, include date-only records and delayed captures, and check Korean time boundaries. Confirm meal-hour statistics exclude unsupported timestamps.

**Review note:** Confirmed (`stampOf = r.verified_at ?? r.created_at`). The migrations also confirm the second half: `verified_at` is the server insert time, so queued uploads carry their upload time.

**Recommended direction:**

1. *Now, client-only:* drop the `created_at` fallback for hour-based statistics. Unverified records still count in date-based totals through `visited_at`.
2. *After F04's `captured_at` column exists:* use `captured_at ?? verified_at` for hour statistics.
3. **Owner decision (2026-10-18): hide (option A).** When a recap period has **fewer than 5** records with a usable meal time, hide the hour-based cards: peak time, hour histogram, and the midnight count. Leave the rest of the recap unchanged. No note or new copy. Make `5` a named constant in `compute.ts`, and expose “time stats available” as a flag on the computed recap so the screen can skip those cards without its own counting.

### F09 — Recommendation outcome delivery and attribution are not durable

**Priority:** Medium\
**Evidence:** `src/features/recommend/log.ts`, `src/lib/rec/delivery.ts`, `src/data/store.ts`, `app/capture.tsx`, `src/features/queue/process.ts`

Delivery caches and recently shown recommendations live in memory. Restarting loses attribution context. Immediate capture completion calls `linkVisit`, but later background queue processing does not. Linking removes its local match before event delivery is confirmed. These paths can lose outcomes and bias conversion estimates toward online, uninterrupted sessions.

**Proposed solution**

- Add a durable, account-scoped event outbox with stable event IDs and backend deduplication.
- Persist only the attribution context needed, with expiry and cleanup rules.
- Carry attribution through capture queue entries and emit the visit outcome after record creation succeeds, including delayed uploads.
- Remove pending attribution only after durable handoff or confirmed delivery.
- Measure delivery failures and completeness; separate observed association from causal recommendation impact.

**Validation:** Exercise offline exposure, restart, delayed record upload, lost acknowledgements, duplicate retries, and account changes. Confirm events survive recovery and do not duplicate logical outcomes.

**Review note:** Confirmed. `recShown` lives only in the in-memory store; `linkVisit` runs only when `drainQueue(qc, queueId)` returns an id immediately; and the match is removed before `logRec` resolves. `rec_events` uses an identity primary key with no client key, so duplicates can't be detected server-side yet. This only affects measurement, not app behavior, so it can follow F01–F04.

**Recommended direction:**

1. *Backend first:* add a nullable `rec_events.client_event_id uuid` with a partial unique index; treat `23505` as delivered (the same pattern `persist` already uses).
2. Save the visit-attribution hint in a new queue column (`attribution TEXT`), not in `payload` (see rollout rule 5). Call `linkVisit` from `process.ts` after a successful insert, so delayed uploads are attributed too.
3. Save `recShown` to AsyncStorage per account, keeping the existing 12-hour TTL and 30-entry cap.
4. Only remove a matched `recShown` entry after `logRec` returns `true`.
5. A full SQLite event outbox is the complete solution, but it can wait until the steps above show how often events are actually lost.

### F10 — Impression tracking approximates visibility

**Priority:** Medium\
**Evidence:** `src/features/recommend/NowMode.tsx`

An impression is logged after 700 ms when the route is focused and a selected card exists. The check does not establish actual viewport visibility or foreground app activity. A focused route can therefore produce an impression without confirmed exposure.

**Proposed solution**

- Require foreground app state, route focus, a measurable visible card area, and continuous dwell time.
- Cancel dwell when loading, navigating away, backgrounding, or scrolling the card out of view.
- Record the impression-rule version and distinguish generated, displayed, and observed candidates.
- Route successful observations through the durable event outbox from F09.

**Validation:** Background the app during dwell, scroll cards out of view, switch tabs quickly, and change results while loading. Confirm only qualifying exposure logs an impression.

**Review note:** Accurate, but low priority. The selected card is the one on screen, so route focus plus 700 ms is a reasonable approximation. The main gap is the app being sent to the background during the dwell.

**Recommended direction:** Add an `AppState === "active"` condition to the dwell effect and cancel the timer when the app goes to the background. Add `impression_rule: 1` to the event payload so later rule changes can be told apart. Viewport measurement isn't worth the complexity unless the card layout changes to a scrolling list.

### F11 — Verification coverage is concentrated in the ranker

**Priority:** Medium\
**Evidence:** `package.json`, `tsconfig.test.json`, `src/lib/rec/__tests__/`

The existing tests provide useful algorithm coverage, but they do not verify the full capture, offline, account-switching, geofence, and authorization workflows. Linting cannot currently start because ESLint is absent.

**Proposed solution**

- Restore a compatible lint setup and run typechecking, meaningful tests, and lint in CI.
- Add fault-injection integration tests for the data-integrity fixes above.
- Establish device checks for permissions, camera, deep links, maps, notifications, and offline recovery.
- Verify backend authorization separately with allowed and denied account/book cases.
- Define release gates using actual workflow results and unresolved defects.

**Validation:** CI runs without missing tooling, regression tests fail against the original defect paths, and device results are recorded with platform/build details.

**Review note:** Confirmed (no `eslint` in `node_modules/.bin`).

**Recommended direction:**

1. Run `npx expo lint` once to install `eslint` and `eslint-config-expo` as dev dependencies. This doesn't change the JavaScript bundle or the runtime version, so OTA updates are unaffected.
2. Pull the queue stage logic out of `processOne` behind injectable `upload` / `insert` / `deleteWish` functions, and add fault-injection tests to the existing `tsconfig.test.json` suite. This covers F01 and F03 without a device.
3. Add a typecheck + test step to the existing EAS Update workflow, *before* `eas update`, so a failing change can't be published to production.

## Recommendation methodology assessment

The main engine implements candidate generation, contextual heuristic scoring, and greedy MMR selection in separate modules under `src/lib/rec/`.

Its current score is:

```text
S = 0.36 taste + 0.20 distance + 0.12 wishlist
  + 0.14 personal_satisfaction + 0.08 community
  + 0.06 meal_context + 0.04 novelty
  - place_repetition - cuisine_repetition
```

Important properties already present:

- Bayesian-style taste shrinkage with a neutral prior, recency weighting, and capped evidence per restaurant.
- Hierarchical cuisine/dish preferences and explicit menu-vote handling.
- Continuous distance decay with a comfort zone and bounded contextual adjustments.
- Soft repetition penalties, with explicit user exclusions enforced separately.
- Diversity reranking that accounts for cuisine, dish, geography, price when known, and chain identity.
- Versioned configuration, deterministic tie-breaking, feature snapshots, explanations, and diagnostic comparisons.
- Graceful missing-weather behavior and no presentation of heuristic scores as calibrated probabilities.

Remaining methodological limits:

1. **Weights are hypotheses.** Synthetic scenarios test intended behavior; they do not prove satisfaction, conversion, or superiority over simpler methods.
2. **Data quality limits ranking quality.** Category dictionaries, restaurant identity, timestamp semantics, and missing metadata affect evidence before scoring begins.
3. **Community revisits are imperfect satisfaction signals.** Convenience and repeated exposure can contribute to revisits.
4. **Shared ratings describe a shared average.** Couple averaging does not represent each person's preferences or vetoes.
5. **Candidate retrieval completeness is unverified.** The backend provider retrieval, pagination, rate limits, and coverage need separate inspection.
6. **Diagnostics add client computation.** The pipeline also computes feature ablations and baseline rankings. Profile this on representative devices and candidate pools before deciding whether to sample or move diagnostics off the interaction path.
7. **Learning data is not yet dependable enough for model training.** Repair exposure and outcome delivery before interpreting missing interactions as labels. Keep exploration disabled until its delivery and evaluation prerequisites are verified.

The proposed approach is to preserve this architecture, correct evidence and reliability problems, then evaluate versioned changes using real observations and explicit limitations. No ML migration is required to complete these fixes.

## Implementation order

| Phase | Work | Completion criterion |
| --- | --- | --- |
| 1 — Isolation and evidence | F02, F03, F04 | Book errors do not broaden queries; account switching preserves isolation; verification requires documented evidence. |
| 2 — Data integrity | F01, F05 | Retry/restart tests produce one logical record; partial imports cannot finalize regional closures. |
| 3 — Complete and consistent calculations | F06, F07, F08 | Full histories are retrieved; community evidence is bounded; recap times use supportable timestamps. |
| 4 — Dependable measurement | F09, F10 | Events and attribution survive offline recovery; impressions satisfy a versioned visibility rule. |
| 5 — Release verification | F11, plus device profiling | Required checks pass and critical device/backend workflows have recorded evidence. |

Each phase should include targeted regression checks as it is implemented; testing is not deferred to phase 5. Backend-dependent changes need schema/policy inspection, backwards-compatible migrations, and coordinated client/backend rollout. Device checks and client-only fixes can proceed independently where they do not depend on unresolved backend contracts.

## Scope and decisions before implementation

- This report authorizes no deployment or database mutation. It documents proposed work for review.
- Implementation should stay within the documented `expo-app` boundary unless backend scope is explicitly extended.
- Confirm deployed schema, RLS, storage access, verification triggers, and provider contracts before finalizing backend-dependent fixes.
- Decide the accuracy/fix-age rules from product requirements and device evidence rather than inventing thresholds.
- Determine whether legacy null-book compatibility is still needed and how existing queue entries should migrate.
- Preserve existing visual design. Any change to verification labels or error presentation that requires a product decision should be agreed before implementation.
- Real recommendation performance remains an open empirical question even after correctness and reliability fixes pass.

## Reviewer's recommended direction

**Overall opinion.** The report's diagnosis is sound and its main principle is right: keep the recommendation architecture and fix evidence and reliability first. No ML migration and no native changes are needed. The adjustments are about sequencing and about not trading one failure for another. Integrity fixes must keep offline capture working, schema changes must reach the database before the auto-published OTA update, and the GPS verification policy is a product decision, not a bug fix.

**Revised implementation order:**

| Step | Work | Backend change first? | User-visible change |
| --- | --- | --- | --- |
| 1 | F02: throw on books error, disable book-scoped queries until a book resolves, keep the capture fallback, **boot loading screen (Appendix A)** | No | New loading screen on every app open; couple users no longer see mixed data |
| 2 | F04: wait for the in-flight GPS read at commit, recheck distance, **strict no-fix rule**, keep the photo on the unverified path | No | Captures without a GPS fix are saved unverified |
| 3 | F08: drop `created_at` from hour statistics; **hide hour cards below 5 usable records** | No | Some recaps no longer show the hour cards |
| 4 | F03: queue owner column, filtering, skip-not-fail | No (SQLite only) | None for single-account users |
| 5 | F01: `client_op_id` + resumable stages + retry classification | **Yes**: `restaurants.client_op_id` + partial unique index | None |
| 6 | F11: ESLint setup, queue fault-injection tests, CI gate before `eas update` | No | None |
| 7 | F05: `--full` flag, coverage guard, dry-run preview | No (script only) | None |
| 8 | F09: attribution in a queue column, `linkVisit` after queued upload, persisted `recShown` | **Yes**: `rec_events.client_event_id` | None |
| 9 | F07, F06, F10 | No | Community ranking order changes (F07) |
| 10 | `captured_at` for F04/F08 meal-time evidence | **Yes**: `restaurants.captured_at` | None |

Steps 1–4 are client-only and can each ship independently. Each step should land with its regression test, as the report already requires.

**Owner decisions (2026-10-18). These are final for this round:**

| # | Topic | Decision | Where specified |
| --- | --- | --- | --- |
| 1 | F04: capture with no GPS fix | **Strict (B):** not verified; saved as a normal record with its photo kept. No accuracy threshold for now. App only; web unchanged. | F04 review note, step 3 |
| 2 | F02: while books are loading or failing | **A dedicated boot loading screen on every app open**, staying up longer while the lookup keeps failing. | Appendix A |
| 3 | F08: few usable meal times | **Hide (A)** the hour-based recap cards below **5** usable records. | F08 review note, step 3 |
| 4 | F05: closure guard | **Abort closures below 90%** of currently open stores in the region, unless `--force`. | F05 review note, step 2 |
| 5 | Backend scope | **Approved** for exactly three migrations: `restaurants.client_op_id`, `rec_events.client_event_id`, `restaurants.captured_at`. | Rollout rules; order table |

Still deferred (not decided, don't implement): a GPS accuracy threshold, and bringing the web `CaptureFlow` in line with the app.

## Instructions for the implementing agent

This document is the implementation brief. The fixes are to be done by another agent; this review only defines the direction.

- **Scope.** Edit only `expo-app/`, plus the three approved migration files under `supabase/migrations/`. Don't touch the web project (`src/` in the parent repository).
- **Git.** Work in place on `main` (no worktree or branch). Commit and push only when the owner says so. **A push to `main` publishes an OTA update to production immediately.**
- **Migrations.** Write each migration file, then ask the owner before applying it to the production database. Apply and verify it *before* pushing the client change that uses it (rollout rule 1).
- **One step per commit.** Follow the revised implementation order. After each step, run `npm run typecheck` and `npm test`, and add the regression test the finding asks for.
- **Design.** Build the boot screen exactly as in Appendix A, using existing tokens and components. Don't make other visual changes. If a fix turns out to need a design or copy decision not covered here (for example, F04's photo hand-off needing a form change), stop and ask the owner.
- **Offline capture must keep working at every step** (rollout rule 4). Test with airplane mode.

## Appendix A — Boot loading screen (design spec for F02)

**Purpose.** Every app open shows a calm branded screen until the user's 기록장 list has loaded, so no screen ever renders with mixed personal and couple data. If loading is slow or fails, the screen stays up, says so, retries by itself, and still lets the user take a verification photo, since capture works offline.

**When it shows**

- Cold start, after the native splash (app icon on `#f6f3ec`, unchanged).
- After signing in, until the new account's 기록장 list has loaded.
- Not when returning from the background.
- Logged-out users see it for the minimum time only, then go to login as today.

**Layout** (portrait, centered column, inside safe area, background `C.paper` so the hand-off from the native splash is seamless):

```text
┌──────────────────────────────┐        ┌──────────────────────────────┐
│                              │        │                              │
│                              │        │                              │
│            ( 🍽 )            │        │            ( 🍽 )            │
│          character           │        │          character           │
│         ‿‿‿‿‿‿‿‿‿            │        │         ‿‿‿‿‿‿‿‿‿            │
│                              │        │                              │
│           D I N A R Y        │        │           D I N A R Y        │
│                              │        │                              │
│    기록장을 펼치는 중이에요   │        │   기록장을 불러오지 못했어요   │
│                              │        │  인터넷 연결을 확인해 주세요.  │
│            ●  ●  ●           │        │ 연결되면 자동으로 다시 불러와요.│
│                              │        │                              │
│                              │        │      [    다시 시도    ]     │
│                              │        │      [ 지금 인증 사진 찍기 ]   │
│                              │        │                              │
└──────────────────────────────┘        └──────────────────────────────┘
        Loading / Slow                          Failed / Offline
```

| Element | Spec |
| --- | --- |
| Character | `<Character id={account?.characterId ?? DEFAULT_CHARACTER} size={112} />` from `src/components/Character.tsx`: the user's own 대표 캐릭터, so the screen feels personal. |
| Character motion | Gentle bob: `translateY` 0 → −6 → 0, 1400 ms, ease-in-out, repeating (Reanimated `withRepeat`). |
| Shadow | Ellipse 56 × 8, `C.lineSoft`, 10 px below the character, scaling 1 → 0.9 in sync with the bob. |
| Wordmark | `DINARY`, `F.serif`, 34, `C.ink`, `letterSpacing: 2`. Identical to the login screen. 22 px below the character. |
| Status line | `F.sans`, 13, `C.muted`, centered, 10 px below the wordmark. |
| Progress dots | Three 6 × 6 circles, `C.brick`, 8 px apart, 20 px below the status line. Opacity 0.25 → 1 → 0.25, 900 ms cycle, each dot offset by 180 ms. |
| Failed title | Replaces the status line: `F.sansBd`, 15, `C.ink`. |
| Failed body | `F.sans`, 13, `C.muted`, centered, max width 260, 6 px below the title. |
| Primary button | Existing `Button` from `src/components/ui.tsx`, `kind="brick"`, width 220, 24 px below the body. |
| Secondary button | Existing `Button`, `kind="line"`, width 220, 12 px below. Only shown for a signed-in user with a nickname. |
| Exit | When loading finishes: fade the whole screen out over 250 ms. |

**States, timing, and copy**

| State | Enters when | Status / title | Body | Controls |
| --- | --- | --- | --- | --- |
| Loading | Screen mounts | 기록장을 펼치는 중이에요 | — | Dots |
| Slow | Still loading after **4 s** (React Query retrying) | 연결이 느려요. 계속 불러오고 있어요 | — | Dots |
| Offline | NetInfo reports no connection while books aren't loaded | 인터넷에 연결되어 있지 않아요 | 연결되면 자동으로 다시 불러와요. | 다시 시도 · 지금 인증 사진 찍기 |
| Failed | Books query `isError` after its retries (React Query default: 3 retries) | 기록장을 불러오지 못했어요 | 인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 불러와요. | 다시 시도 · 지금 인증 사진 찍기 |
| Done | Books query succeeded for the current user **and** the screen has been visible ≥ **800 ms** | — | — | Fade out |

- **Minimum 800 ms.** The owner wants the screen seen on every open. Keep the minimum at 800 ms so a fast load doesn't look like a flicker, without adding noticeable delay.
- **Retry button:** calls `refetch()` on the books query. While fetching it shows `불러오는 중…` and is disabled, and the state returns to Loading.
- **Automatic recovery:** refetch the books query when NetInfo reports the connection is back and when `AppState` becomes `active`. On success the screen fades out with no tap needed.
- **지금 인증 사진 찍기:** `router.push("/capture")`. While the capture route is open, hide the boot screen. When capture closes and books still aren't loaded, the boot screen returns in its current state.

**Accessibility**

- Container: `accessibilityRole="progressbar"`, `accessibilityLabel` = the current status/title text, `accessibilityLiveRegion="polite"` (Android) so state changes are announced.
- Respect reduced motion (Reanimated `useReducedMotion()`): no bob, no shadow scaling, dots static at full opacity.
- Buttons keep the existing 50 px minimum height.

**Implementation notes**

- New presentational component `src/components/BootScreen.tsx`. Props: `state`, `characterId`, `onRetry`, `onCapture` (optional), `onHidden`. No data fetching inside.
- In `Gate` (`app/_layout.tsx`), keep rendering the `Stack` once the existing `ready` is true. Render `<BootScreen>` as an absolute-fill overlay *above* the `Stack`, following the `CommunityTransition` overlay pattern (use `zIndex` 999, below the transition's 1000). An overlay, rather than replacing the `Stack`, keeps the capture route reachable while books are unavailable.
- Derive the boot state in `Gate` from the F02-fixed `useBooks()` (now throwing on error, key `["books", userId]`), NetInfo, and a mount timestamp for the 4 s and 800 ms rules.
- Use NetInfo and `AppState` listeners scoped to the boot logic for automatic recovery. **Don't** globally wire React Query's `onlineManager`/`focusManager` in this change; that would change offline behavior for every query in the app.
- Don't change the native splash, `app.json`, or app icon.
- Screens under the overlay may mount, but their book-scoped queries stay disabled until a book id exists (F02 step 2), so nothing mixed is fetched.

**Acceptance checks** (iOS and Android)

1. Normal open: the native splash hands off to the boot screen with no visible jump, the screen shows for at least 800 ms, then fades into the map. Only the active 기록장's records appear.
2. Cold start in airplane mode: the Offline state appears. 지금 인증 사진 찍기 opens capture, a capture saves to the queue, and closing capture returns to the boot screen. Turning the network on dismisses the screen automatically.
3. Books request forced to fail: Loading → Slow at 4 s → Failed after retries. 다시 시도 recovers once the request succeeds.
4. Reduced motion enabled: no movement.
5. Sign out, then sign in as another account: the boot screen shows until that account's books load, and no data from the previous account appears.
6. Logged out: the boot screen shows for 800 ms, then login.
