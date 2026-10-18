-- Meal-time evidence only. This is client-supplied and MUST NOT authorize
-- verification, rewards, rankings, or community access. verified_at stays unchanged.
alter table public.restaurants add column if not exists captured_at timestamptz;
comment on column public.restaurants.captured_at is
  'Client photo capture time for personal meal analysis. Not a trusted verification timestamp. Null for legacy/web records.';
-- Do not backfill upload time as capture time. Existing copy_record_to_personal
-- includes this new column automatically, preserving original meal-time evidence.
