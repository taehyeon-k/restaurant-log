# Technical remediation implementation

Date: 2026-10-18

This records the implementation of the revised [technical brief](technical-assessment-and-remediation.md). Implementation is prepared on `main`. Production migrations have not been applied, and no OTA update has been published. See Git history for local commits.

## Implemented behavior

| Finding | Implementation |
| --- | --- |
| F02 — Book isolation | Books throw on failure and use account-specific query keys. Record/wishlist reads require a resolved book; null-book recommendation input contributes no private history. The boot overlay follows Appendix A, including reduced motion, minimum display time, slow/offline/error states, retry, recovery, and the capture escape. Successful book selections and account profiles are stored locally for offline recovery. |
| F04 — Capture | Missing/invalid fixes and distances cannot produce verified app captures. Save awaits the in-flight fix for at most eight seconds and rechecks the actual distance. The existing unverified form receives a persisted photo, visit date, and available place metadata; captured-photo forms can enqueue offline. No accuracy threshold was added. Web behavior and historical records are unchanged. |
| F08 — Recap time evidence | Creation time is excluded. Meal analysis uses `captured_at` when present, otherwise a valid legacy verified timestamp. Hour statistics are hidden below `MIN_TIME_RECORDS = 5`; date totals and weekday information remain available. The main ranker's meal-slot evidence uses the same timestamp helper. |
| F03 — Queue ownership | Guarded SQLite ALTERs add/backfill owner and operation IDs, preserving existing jobs. Malformed payloads are quarantined, not deleted. Queue reads, retries, stage writes, and deletion are owner-scoped. Session changes stop processing without consuming attempts. User-specific transient recommendation state is cleared and geofence updates are serialized on account changes. |
| F01 — Idempotent uploads | A pure injectable state machine resumes stable photo upload, record insertion, wishlist reconciliation, attribution handoff, and cleanup. Existing committed operations are looked up before retrying. Immutable photo paths avoid storage UPDATE/upsert permission requirements. Duplicate inserts recover the existing record. Only data errors exhaust the three-attempt budget. |
| F11 — Verification | Compatible ESLint/Expo configuration and a `npm run check` command were added. The EAS Update workflow now invokes that command before publishing. Regression coverage includes fault injection, real in-memory SQLite upgrades, boot-state rules, recap evidence, import coverage, and history pagination. |
| F05 — Store imports | Default imports upsert only. Closure reconciliation requires `--full`; coverage below 90% aborts closure changes unless `--force`. Required headers for all files are checked before writes. `--full --dry-run` performs reads only and prints the expected closure count. |
| F09 — Visit measurement | Shown recommendations persist per account with the existing 12-hour/30-item bounds. Attribution is captured at photo time in a separate queue column, so delayed uploads retain it. A small account-specific AsyncStorage outbox persists visit delivery before capture cleanup; stable event IDs deduplicate retries. Shown matches are removed only after confirmed event delivery. |
| F07 — Community recommendations | Each contributor supplies one averaged rating observation. Ratings shrink toward the main engine's rating prior; distinct-contributor popularity is capped. Personal category evidence requires positive ratings/revisit evidence. Branch matching replaces name-only exclusion. Dislikes use account-specific keys with one-time legacy migration. Explanations distinguish smoothed scores. |
| F06 — Full history | Shared pagination continues until an empty page, even if the server returns fewer than the requested 1,000 rows. Ordering includes IDs; duplicate IDs trigger a retryable error instead of silently returning an ambiguous history. Reads remain account/book scoped. |
| F10 — Impressions | Focus, foreground app activity, non-loading results, and 700 ms continuous dwell are required. Backgrounding cancels dwell. Events record `impression_rule: 1`. No viewport measurement or layout changes were introduced. |

Recommendation logs use `hybrid-v4.1` to distinguish the corrected book isolation and capture-time evidence from v4.0. Ranking weights are unchanged.

## Required production migrations — not applied

The client now depends on all three columns. Apply and verify these migrations before any push that triggers the production EAS Update workflow:

1. `supabase/migrations/20261018023738_restaurants_client_op_id.sql`
2. `supabase/migrations/20261018023743_rec_events_client_event_id.sql`
3. `supabase/migrations/20261018023747_restaurants_captured_at.sql`

Each new column is nullable, preserving old app/web writes. Unique indexes include `user_id`, so one user's operation/event ID does not reserve another user's ID. Existing RLS policies and grants stay unchanged.

The operation migration also adds an invoker trigger to preserve operation IDs on updates and clear them on personal copies. This is required because `copy_record_to_personal` copies new columns dynamically. Without that compatibility measure, the new unique index would reject a copy of the same user's capture. The capture-time column is intentionally copied through that existing function.

`verified_at` remains the existing server stamp. `captured_at` is client-supplied meal-time evidence and must never grant verification, rewards, or access. No legacy capture times are invented or backfilled.

Use the project's migration deployment procedure after explicit owner approval. Review the pending migration list first and apply only reviewed changes. Do not publish the client while these columns are absent; the queue preserves jobs on schema-cache failures, but uploads cannot complete until the schema is ready.

Read-only verification after application:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('restaurants', 'client_op_id'),
    ('rec_events', 'client_event_id'),
    ('restaurants', 'captured_at')
  );

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in ('restaurants_client_op_id_owner_idx', 'rec_events_client_event_id_owner_idx');

select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.restaurants'::regclass
  and tgname = 'preserve_restaurant_operation_id';
```

Before release, validate owner-authorized retry, cross-account denial, and couple-to-personal copying in a staging environment with the migrations applied. No such deployed-database validation is claimed here.

## Local storage and recovery

SQLite keeps existing `pending_records` rows and adds `owner_id`, `op_id`, `photo_path`, `stage`, `record_id`, `attribution`, and `extra_photos`. Queue-only fields are never spread into restaurant inserts. Ownerless/malformed legacy entries remain quarantined on disk for investigation.

Stages are `pending` → `uploaded` → `inserted` → `reconciled` → cleanup. A lost insert response is resolved by operation ID. Failed wishlist reconciliation resumes after insertion. Visit-event delivery has a separate persistent handoff so analytics outages do not require uploading the photo again.

Local account keys include `activeBookId:{userId}`, `account.profile:{userId}`, `rec.shown:{userId}`, `rec.pending-visits:{userId}`, and `community.recs.dislikes:{userId}`. Shown recommendations expire after 12 hours. Pending visit deliveries retain the original capture/exposure relationship until delivery; they are not discarded merely because upload was delayed.

Remote orphan cleanup is deferred as specified. Stable paths bound an abandoned one-photo capture to one object; a normal unverified form can include additional photo objects. Existing pre-upgrade ambiguous operations have no server operation ID and cannot be retroactively deduplicated reliably.

## Validation

Run `npm run check` for the same gate used before EAS publication. The suite requires Node 22 with `node:sqlite` support (local verification used Node 22.16.0). Expo 57's ESLint preset and ESLint 9 are pinned in the lockfile.

React Compiler migration diagnostics are warnings across the existing app, including existing Reanimated shared-value/ref patterns. Hooks-order correctness remains an error. A passing lint command therefore does not mean there are no warnings; these diagnostics remain visible for separate remediation.

Verified results:

- `npm run check`: TypeScript passed; 72 tests passed, 0 failed; lint completed with 0 errors and 92 warnings. React Compiler migration and existing code warnings remain visible.
- Android JavaScript export: succeeded for the final source; the exported Hermes bundle was checked to contain `hybrid-v4.1`. Output: `/tmp/dinary-remediation-export-verified`.
- `node scripts/test-remediation-migrations.cjs /tmp/dinary-sql-check`: passed against an in-memory PGlite database. All three migrations apply and reapply; nullable old-client writes, owner-scoped duplicate rejection, immutable operation IDs, personal-copy compatibility, and capture-time preservation passed. This uses a minimal schema fixture, not production RLS.
- `git diff --check`: passed.

The SQL smoke-test dependency was installed only under `/tmp/dinary-sql-check`; it is not an app or CI dependency. Production schemas and device workflows were not changed or exercised.

## Device acceptance checks still required

No physical device or simulator was available for this implementation. Complete these checks on iOS and Android before release:

- Normal cold start: native splash → branded boot screen for at least 800 ms → 250 ms fade; only the selected book appears. Background return does not replay boot.
- Reduced motion: character, shadow, and dots remain static.
- Start offline after a successful signed-in launch: boot shows offline state, capture opens, and a normal or unverified captured photo can be saved locally. Closing capture/form returns to boot; reconnecting recovers automatically.
- GPS: delayed fix, denied permission, failed fix, invalid coordinates, distance over 50 m, and nearby fix. No accuracy cutoff is enforced. Unverified handoff keeps the photo.
- Account A queues a capture, then account B signs in: B cannot see/retry A's queue; A can resume it after signing back in.
- Interrupt uploads after each stage; inject a lost insert acknowledgement and failed wishlist deletion. Confirm one logical capture, no repeated insert, and eventual reconciliation.
- Observe a recommendation, restart, capture offline, and reconnect later: one visit event is delivered with capture-time attribution. Background during dwell: no impression.
- Copy a new couple record to personal after migration: it succeeds, preserves `captured_at`, and has a null `client_op_id`.

## Remaining limits

- Production migrations require separate owner approval and have not been applied. Existing backend authorization was inspected from migration definitions, not exercised against production.
- Device acceptance, OS geofencing reliability, and native performance remain unverified. An Android JavaScript export is not a device test.
- Other recommendation events remain best-effort; this implements durable visit delivery, not a full event outbox or unbiased learning dataset. Exploration remains disabled.
- Legacy `verified_at` can still reflect delayed upload time when no `captured_at` exists. No reliable reconstruction is available for old records.
- Offset pagination is not a transactional snapshot during concurrent server edits. Deterministic order and duplicate detection improve reliability but cannot eliminate every concurrent deletion/insert race.
- Offline boot capture relies on a cached profile to know the signed-in user's established nickname, and on local session persistence. Brand-new sign-in/onboarding still requires connectivity.
- No production import was run. Closure protection is tested with fixtures; operators must supply a complete regional snapshot for `--full`.
- No empirical recommendation-uplift claim is made. Weight calibration, complete exposure measurement, and future ML work remain separate.

## References

Immutable retry uploads follow [Supabase standard upload behavior](https://supabase.com/docs/guides/storage/uploads/standard-uploads). Explicit pages use the [Supabase range API](https://supabase.com/docs/reference/javascript/range). These references support implementation contracts, not claims that this project's production policies have been tested.
