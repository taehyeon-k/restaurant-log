-- 「지금 뭐 먹지」 hybrid-v3 상호작용 로그 — 나중의 학습형 랭커(LambdaMART 등) · 오프라인 NDCG@5 · 추천→방문 전환 분석용.
-- 새 테이블 셋만 만듭니다. 기존 테이블 · 데이터는 건드리지 않습니다(되돌리기: 아래 세 테이블 drop).
--
--   rec_sessions — 한 번 고른 결과(알고리즘 버전 · 맥락). 화면에 실제로 보인 순간(첫 impression)에만 만들어집니다.
--   rec_items    — 그 결과의 후보: 보여 준 5곳(position 1–5)과 점수 상위 나머지(position null) · 피처 스냅숏.
--   rec_events   — impression · detail_open · kakao_open · wish_start · wish_saved · navigate · visit_confirmed · refresh.
--                  의도(wish_start · navigate)와 완료(wish_saved · visit_confirmed)를 다른 이벤트로 남깁니다.
--
-- 남기지 않는 것: 원시 GPS 좌표(맥락에는 동네 이름 · 거리(m)만), 카카오 가게 이름 · 주소(카카오 장소 id 만), 기록 본문.
-- 보이지 않았거나 누르지 않은 후보를 「싫음」 라벨로 쓰면 안 됩니다 — 노출 위치 편향이 있습니다(문서 참고).

create table if not exists public.rec_sessions (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id      uuid references public.books(id) on delete set null,
  algo_version text not null check (char_length(algo_version) between 1 and 40),
  context      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists rec_sessions_user_time_idx on public.rec_sessions (user_id, created_at desc);

create table if not exists public.rec_items (
  session_id    uuid not null references public.rec_sessions(id) on delete cascade,
  candidate_key text not null check (char_length(candidate_key) between 1 and 300),
  position      smallint check (position between 1 and 10),
  rank          smallint not null check (rank between 1 and 100),
  kakao_id      text check (char_length(kakao_id) <= 40),
  rec_category  text check (char_length(rec_category) <= 20),
  distance_m    int check (distance_m between 0 and 50000),
  score         real not null,
  features      jsonb not null default '{}'::jsonb,
  sources       text[] not null default '{}',
  primary key (session_id, candidate_key)
);

create table if not exists public.rec_events (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references public.rec_sessions(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  candidate_key text check (char_length(candidate_key) <= 300),
  position      smallint check (position between 1 and 10),
  event_type    text not null check (event_type in (
                  'impression', 'detail_open', 'kakao_open', 'wish_start', 'wish_saved', 'navigate', 'visit_confirmed', 'refresh')),
  record_id     bigint references public.restaurants(id) on delete set null,
  wish_id       uuid references public.wishes(id) on delete set null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists rec_events_session_idx on public.rec_events (session_id);
create index if not exists rec_events_user_time_idx on public.rec_events (user_id, created_at desc);

alter table public.rec_sessions enable row level security;
alter table public.rec_items    enable row level security;
alter table public.rec_events   enable row level security;

-- 자기 로그만 읽고 씁니다. 연인 기록장이어도 상대의 로그는 보이지 않습니다. 고치기 · 지우기 정책은 없습니다(추가만).
drop policy if exists "rec_sessions own read"   on public.rec_sessions;
drop policy if exists "rec_sessions own insert" on public.rec_sessions;
create policy "rec_sessions own read" on public.rec_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "rec_sessions own insert" on public.rec_sessions
  for insert to authenticated with check (
    user_id = (select auth.uid()) and (book_id is null or public.is_book_member(book_id))
  );

drop policy if exists "rec_items own read"   on public.rec_items;
drop policy if exists "rec_items own insert" on public.rec_items;
create policy "rec_items own read" on public.rec_items
  for select to authenticated using (
    exists (select 1 from public.rec_sessions s where s.id = rec_items.session_id and s.user_id = (select auth.uid()))
  );
create policy "rec_items own insert" on public.rec_items
  for insert to authenticated with check (
    exists (select 1 from public.rec_sessions s where s.id = rec_items.session_id and s.user_id = (select auth.uid()))
  );

drop policy if exists "rec_events own read"   on public.rec_events;
drop policy if exists "rec_events own insert" on public.rec_events;
create policy "rec_events own read" on public.rec_events
  for select to authenticated using (user_id = (select auth.uid()));
-- 방문 · 위시는 읽을 수 있는(내 기록장의) 것만 이을 수 있습니다 — 하위 질의에도 restaurants · wishes RLS 가 걸립니다.
create policy "rec_events own insert" on public.rec_events
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.rec_sessions s where s.id = rec_events.session_id and s.user_id = (select auth.uid()))
    and (record_id is null or exists (select 1 from public.restaurants r where r.id = rec_events.record_id and r.user_id = (select auth.uid())))
    and (wish_id is null or exists (select 1 from public.wishes w where w.id = rec_events.wish_id))
  );

revoke all on public.rec_sessions, public.rec_items, public.rec_events from anon;
grant select, insert on public.rec_sessions, public.rec_items, public.rec_events to authenticated;
grant usage, select on sequence public.rec_events_id_seq to authenticated;
