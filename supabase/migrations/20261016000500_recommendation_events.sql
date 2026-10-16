-- "지금 뭐 먹지?" (hybrid-v1) — 표시/탭/위시 작성 시작 행동을 기록합니다.
-- 원시 GPS 좌표, 사용자의 음식 일기나 프로필 원문은 저장하지 않습니다.
create table if not exists public.recommendation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete set null,
  batch_id text not null check (char_length(batch_id) between 1 and 120),
  candidate_id text not null check (char_length(candidate_id) between 1 and 120),
  event_type text not null check (event_type in ('impression','open','wish_start')),
  position smallint not null check (position between 1 and 5),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_events_user_time_idx
  on public.recommendation_events (user_id, created_at desc);
create index if not exists recommendation_events_batch_idx
  on public.recommendation_events (batch_id);

alter table public.recommendation_events enable row level security;

create policy "recommendation_events own select" on public.recommendation_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "recommendation_events own insert" on public.recommendation_events
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (book_id is null or exists (
      select 1 from public.book_members bm
      where bm.book_id = recommendation_events.book_id and bm.user_id = (select auth.uid())
    ))
  );

revoke all on public.recommendation_events from anon;
grant select, insert on public.recommendation_events to authenticated;
grant usage, select on sequence public.recommendation_events_id_seq to authenticated;
