-- 추천 탭 v2 — 「지금 뭐 먹지 / 둘러보기」 · 코스 · 투어 (expo-app/HANDOFF-recommend-all.md §4–11).
--
-- 기록은 비공개라 남의 기록은 아래 security definer 함수로만, 숫자로만 읽습니다.
--   · 사용자 id · 닉네임 · 사진 · 메모는 돌려주지 않습니다.
--   · 인증한 사람이 3명 미만인 가게 · 코스는 내보내지 않습니다(개인 특정 방지).
--   · 셈에는 인증된 기록만 — verified_at 있음, 보관함(pending) 제외, 「내 기록에도 남기기」 복사본 제외.
-- 데이터가 아직 작아서 materialized view 대신 부를 때마다 셉니다. 느려지면 rec_visits 를 view 로 굳히세요.

/* ───────────── 0) 인증 방문 ───────────── */

create or replace function public.rec_visits()
returns table (user_id uuid, place text, name text, category text, kind text, address text, lat float8, lng float8, at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.user_id, public.place_of(r.place_key, r.name, r.address), r.name, r.category, r.kind, r.address,
         r.lat::float8, r.lng::float8, r.verified_at
  from public.restaurants r
  where r.verified_at is not null
    and coalesce(r.pending, false) = false
    and r.source_record_id is null and r.copied_at is null;
$$;
-- 사용자 id 를 돌려주므로 앱에서는 부를 수 없게 — 아래 함수들 안에서만 씁니다.
revoke all on function public.rec_visits() from public, anon, authenticated;

-- 두 좌표 사이 거리(m) — PostGIS 없이 하버사인.
create or replace function public.meters_between(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

/* ───────────── 1) 가게별 숫자 (§4-0 핵심 지표) ───────────── */

-- p_lat/p_lng 둘레 p_radius_m 안의 가게. 재방문율 = 그 가게를 인증한 사람 중 2번 이상(다른 날) 인증한 사람 비율.
-- steady_years — 지난 분기(이번 분기는 아직 진행 중이라 비어도 됨)부터 거꾸로 매 분기 인증이 이어진 햇수.
-- mine — 내가 그 가게를 인증한 횟수(「아직 안 간 곳」 보너스용).
create or replace function public.rec_places(p_lat float8, p_lng float8, p_radius_m int default 1200)
returns table (
  place text, name text, category text, kind text, address text, lat float8, lng float8, distance_m int,
  users int, revisit_rate numeric, today_count int, last_at timestamptz, week_count int, steady_years int, mine int
)
language sql stable security definer set search_path = public as $$
  with box as (
    select p_radius_m / 111320.0 as dlat, p_radius_m / (111320.0 * greatest(cos(radians(p_lat)), 0.2)) as dlng
  ),
  v as (
    select x.* from public.rec_visits() x, box
    where x.lat between p_lat - box.dlat and p_lat + box.dlat
      and x.lng between p_lng - box.dlng and p_lng + box.dlng
  ),
  per_user as (
    select v.place, v.user_id, count(distinct (v.at at time zone 'Asia/Seoul')::date) as days
    from v group by v.place, v.user_id
  ),
  agg as (
    select pu.place, count(*)::int as users,
           round(count(*) filter (where pu.days >= 2)::numeric / count(*), 3) as revisit_rate
    from per_user pu group by pu.place having count(*) >= 3
  ),
  latest as (
    select distinct on (v.place) v.place, v.name, v.category, v.kind, v.address, v.lat, v.lng
    from v order by v.place, v.at desc
  ),
  counts as (
    select v.place,
           count(*) filter (where (v.at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date)::int as today_count,
           max(v.at) as last_at,
           count(*) filter (where v.at >= date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')::int as week_count,
           count(*) filter (where v.user_id = auth.uid())::int as mine
    from v group by v.place
  ),
  quarters as (
    select distinct v.place,
           (extract(year from v.at at time zone 'Asia/Seoul') * 4 + extract(quarter from v.at at time zone 'Asia/Seoul') - 1)::int as q
    from v
  ),
  now_q as (
    select (extract(year from now() at time zone 'Asia/Seoul') * 4 + extract(quarter from now() at time zone 'Asia/Seoul') - 1)::int as q
  ),
  -- 지난 분기에서 거꾸로 이어진 분기 수 — q + 순번이 같으면 한 줄로 이어진 것.
  runs as (
    select qs.place, qs.q, qs.q + row_number() over (partition by qs.place order by qs.q desc) as grp
    from quarters qs, now_q where qs.q <= now_q.q - 1
  ),
  steady as (
    select r.place, count(*)::int as n
    from runs r, now_q
    where r.grp = (select r2.grp from runs r2 where r2.place = r.place and r2.q = now_q.q - 1)
    group by r.place
  )
  select a.place, l.name, l.category, l.kind, l.address, l.lat, l.lng,
         round(public.meters_between(p_lat, p_lng, l.lat, l.lng))::int as distance_m,
         a.users, a.revisit_rate, c.today_count, c.last_at, c.week_count,
         coalesce(s.n, 0) / 4 as steady_years, c.mine
  from agg a
  join latest l on l.place = a.place
  join counts c on c.place = a.place
  left join steady s on s.place = a.place
  where l.lat is not null and l.lng is not null
    and public.meters_between(p_lat, p_lng, l.lat, l.lng) <= p_radius_m
  order by a.revisit_rate desc, a.users desc;
$$;
revoke all on function public.rec_places(float8, float8, int) from public, anon;
grant execute on function public.rec_places(float8, float8, int) to authenticated;

/* ───────────── 2) 이어 간 동선 · 코스 (§4-0 · §7) ───────────── */

-- 같은 사람이 같은 날 A 인증 후 2시간 안에 B 를 인증한 쌍. 최근 8주, 3명 이상.
-- gap_min — A·B 인증 간격의 중앙값(= A 에서 머무는 시간), start_min — A 인증 시각(한국 시간, 0시부터 분)의 중앙값.
create or replace function public.rec_pairs(p_weeks int default 8)
returns table (
  a_place text, a_name text, a_category text, a_lat float8, a_lng float8,
  b_place text, b_name text, b_category text, b_lat float8, b_lng float8,
  users int, gap_min int, start_min int
)
language sql stable security definer set search_path = public as $$
  with v as (
    select * from public.rec_visits() x where x.at >= now() - make_interval(weeks => p_weeks)
  ),
  pairs as (
    select a.user_id, a.place as a_place, b.place as b_place,
           extract(epoch from b.at - a.at) / 60 as gap,
           extract(hour from a.at at time zone 'Asia/Seoul') * 60 + extract(minute from a.at at time zone 'Asia/Seoul') as start
    from v a join v b
      on b.user_id = a.user_id and b.place <> a.place
     and (b.at at time zone 'Asia/Seoul')::date = (a.at at time zone 'Asia/Seoul')::date
     and b.at > a.at and b.at <= a.at + interval '2 hours'
  ),
  agg as (
    select p.a_place, p.b_place, count(distinct p.user_id)::int as users,
           round(percentile_cont(0.5) within group (order by p.gap))::int as gap_min,
           round(percentile_cont(0.5) within group (order by p.start))::int as start_min
    from pairs p group by p.a_place, p.b_place having count(distinct p.user_id) >= 3
  ),
  latest as (
    select distinct on (v.place) v.place, v.name, v.category, v.lat, v.lng from v order by v.place, v.at desc
  )
  select g.a_place, la.name, la.category, la.lat, la.lng, g.b_place, lb.name, lb.category, lb.lat, lb.lng, g.users, g.gap_min, g.start_min
  from agg g join latest la on la.place = g.a_place join latest lb on lb.place = g.b_place
  where la.lat is not null and lb.lat is not null;
$$;
revoke all on function public.rec_pairs(int) from public, anon, authenticated;

-- 지금 위치 도보 p_radius_m 안에서 출발하는 코스(§6-1). 지금 시각과 출발 시각이 가까운 순.
-- 영업 시간은 아직 출처가 없어 거르지 않습니다(앱이 「영업 정보 없음」).
create or replace function public.rec_courses(p_lat float8, p_lng float8, p_radius_m int default 1200)
returns table (
  id text, a_place text, a_name text, a_category text, a_lat float8, a_lng float8, a_distance_m int,
  b_place text, b_name text, b_category text, b_lat float8, b_lng float8,
  walk_m int, users int, gap_min int, start_min int
)
language sql stable security definer set search_path = public as $$
  select md5(p.a_place || '>' || p.b_place), p.a_place, p.a_name, p.a_category, p.a_lat, p.a_lng,
         round(public.meters_between(p_lat, p_lng, p.a_lat, p.a_lng))::int,
         p.b_place, p.b_name, p.b_category, p.b_lat, p.b_lng,
         round(public.meters_between(p.a_lat, p.a_lng, p.b_lat, p.b_lng))::int,
         p.users, p.gap_min, p.start_min
  from public.rec_pairs(8) p
  where public.meters_between(p_lat, p_lng, p.a_lat, p.a_lng) <= p_radius_m
  order by least(
             abs(p.start_min - (extract(hour from now() at time zone 'Asia/Seoul') * 60 + extract(minute from now() at time zone 'Asia/Seoul'))),
             1440 - abs(p.start_min - (extract(hour from now() at time zone 'Asia/Seoul') * 60 + extract(minute from now() at time zone 'Asia/Seoul')))
           ),
           p.users desc
  limit 10;
$$;
revoke all on function public.rec_courses(float8, float8, int) from public, anon;
grant execute on function public.rec_courses(float8, float8, int) to authenticated;

-- 여기서 인증한 사람들이 다음에 간 곳(§10).
create or replace function public.rec_next_after(p_place text)
returns table (place text, name text, category text, lat float8, lng float8, users int, gap_min int)
language sql stable security definer set search_path = public as $$
  select p.b_place, p.b_name, p.b_category, p.b_lat, p.b_lng, p.users, p.gap_min
  from public.rec_pairs(8) p where p.a_place = p_place
  order by p.users desc limit 5;
$$;
revoke all on function public.rec_next_after(text) from public, anon;
grant execute on function public.rec_next_after(text) to authenticated;

/* ───────────── 3) 투어 (§8 · §9) ───────────── */

-- 같은 주제 후보 10곳 중 아무 곳이나 need 곳을 인증하면 완주. 진행도는 내 인증 기록과 tour_places 조인으로(별도 테이블 없음).
-- 투어 · 후보는 운영자가 SQL 로 넣습니다(유료 입점 없음 — 후보는 인증 데이터의 재방문율로만 고름).
create table if not exists public.tours (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('menu', 'season', 'trend')),
  title       text not null,
  region      text,
  need        int not null default 3 check (need > 0),
  -- 화제 투어의 외부 출처 메모(방송 회차 등). 실제 프로그램명 · 로고는 쓰지 않습니다.
  source_note text,
  aired_at    date,
  starts_at   date,
  ends_at     date,
  -- 완주 마크 이름 — 「2026 겨울 모찌」. 없으면 「{title} 완주」.
  mark_name   text,
  created_at  timestamptz not null default now()
);
create table if not exists public.tour_places (
  tour_id   uuid not null references public.tours(id) on delete cascade,
  -- public.place_of(place_key, name, address) 와 같은 열쇠
  place_key text not null,
  name      text not null,
  category  text,
  address   text,
  lat       double precision,
  lng       double precision,
  primary key (tour_id, place_key)
);

alter table public.tours enable row level security;
alter table public.tour_places enable row level security;
drop policy if exists "tours read" on public.tours;
drop policy if exists "tour places read" on public.tour_places;
create policy "tours read"       on public.tours       for select to authenticated using (true);
create policy "tour places read" on public.tour_places for select to authenticated using (true);

-- 투어 방문 — 기간 안(starts_at ~ ends_at) 인증만. 화제 투어는 방송 전 방문도 칩니다(「방송 전 방문」 태그).
create or replace function public.tour_visits(p_tour uuid)
returns table (user_id uuid, place text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.user_id, v.place, v.at
  from public.rec_visits() v
  join public.tour_places tp on tp.tour_id = p_tour and tp.place_key = v.place
  join public.tours t on t.id = p_tour
  where (t.starts_at is null or (v.at at time zone 'Asia/Seoul')::date >= t.starts_at)
    and (t.ends_at is null or (v.at at time zone 'Asia/Seoul')::date <= t.ends_at);
$$;
revoke all on function public.tour_visits(uuid) from public, anon, authenticated;

-- 열린 투어 + 내 진행도. 완주 · 진행 중 사람 수와 재방문율은 3명 미만이면 null.
create or replace function public.my_tours()
returns table (
  id uuid, kind text, title text, region text, need int, source_note text, aired_at date, ends_at date, mark_name text,
  total int, done int, finishers int, in_progress int, revisit_rate numeric, completed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.id, t.kind, t.title, t.region, t.need, t.source_note, t.aired_at, t.ends_at, t.mark_name,
         (select count(*)::int from public.tour_places tp where tp.tour_id = t.id),
         coalesce(st.mine, 0),
         case when st.finishers >= 3 then st.finishers end,
         case when st.in_progress >= 3 then st.in_progress end,
         case when st.users >= 3 then st.revisit_rate end,
         st.completed_at
  from public.tours t
  left join lateral (
    with pf as (
      select tv.user_id, tv.place, min(tv.at) as first_at, count(distinct (tv.at at time zone 'Asia/Seoul')::date) as days
      from public.tour_visits(t.id) tv group by tv.user_id, tv.place
    ),
    pu as (select pf.user_id, count(*) as places from pf group by pf.user_id),
    -- need 곳째를 처음 채운 시각
    ranked as (select pf.user_id, pf.first_at, row_number() over (partition by pf.user_id order by pf.first_at) as rn from pf)
    select (select pu.places from pu where pu.user_id = auth.uid())::int as mine,
           (select r.first_at from ranked r where r.user_id = auth.uid() and r.rn = t.need) as completed_at,
           (select count(*) from pu where pu.places >= t.need)::int as finishers,
           (select count(*) from pu where pu.places < t.need)::int as in_progress,
           (select count(*) from pu)::int as users,
           (select round(count(*) filter (where pf.days >= 2)::numeric / nullif(count(*), 0), 3) from pf) as revisit_rate
  ) st on true
  where t.ends_at is null or t.ends_at >= (now() at time zone 'Asia/Seoul')::date
  order by (coalesce(st.mine, 0) > 0 and coalesce(st.mine, 0) < t.need) desc, t.kind = 'season' desc, t.created_at desc;
$$;
revoke all on function public.my_tours() from public, anon;
grant execute on function public.my_tours() to authenticated;

-- 투어 후보 10곳 — 내가 처음 인증한 시각 · 재방문율(3명 미만이면 null).
create or replace function public.tour_detail(p_tour uuid)
returns table (place text, name text, category text, address text, lat float8, lng float8, my_first_at timestamptz, users int, revisit_rate numeric)
language sql stable security definer set search_path = public as $$
  with all_v as (
    select v.user_id, v.place, (v.at at time zone 'Asia/Seoul')::date as day
    from public.rec_visits() v join public.tour_places tp on tp.tour_id = p_tour and tp.place_key = v.place
  ),
  pu as (select a.place, a.user_id, count(distinct a.day) as days from all_v a group by a.place, a.user_id),
  agg as (
    select pu.place, count(*)::int as users, round(count(*) filter (where pu.days >= 2)::numeric / count(*), 3) as rate
    from pu group by pu.place
  )
  select tp.place_key, tp.name, tp.category, tp.address, tp.lat, tp.lng,
         (select min(tv.at) from public.tour_visits(p_tour) tv where tv.user_id = auth.uid() and tv.place = tp.place_key),
         case when agg.users >= 3 then agg.users end,
         case when agg.users >= 3 then agg.rate end
  from public.tour_places tp left join agg on agg.place = tp.place_key
  where tp.tour_id = p_tour;
$$;
revoke all on function public.tour_detail(uuid) from public, anon;
grant execute on function public.tour_detail(uuid) to authenticated;

-- 화제 투어의 「방송 뒤에도 다시 갈까」 — 후보 10곳 합산 주간 인증 12주. 방송이 12주보다 오래면 방송 4주 전부터.
create or replace function public.tour_weekly(p_tour uuid)
returns table (week_start date, n int)
language sql stable security definer set search_path = public as $$
  with t as (select * from public.tours where id = p_tour),
  span as (
    select case
             when t.aired_at is not null and t.aired_at < (date_trunc('week', now() at time zone 'Asia/Seoul') - interval '11 weeks')::date
               then (date_trunc('week', t.aired_at) - interval '4 weeks')::date
             else (date_trunc('week', now() at time zone 'Asia/Seoul') - interval '11 weeks')::date
           end as start
    from t
  ),
  weeks as (select (span.start + (i * 7))::date as w from span, generate_series(0, 11) i),
  v as (
    select date_trunc('week', x.at at time zone 'Asia/Seoul')::date as w
    from public.rec_visits() x join public.tour_places tp on tp.tour_id = p_tour and tp.place_key = x.place
  )
  select weeks.w, (select count(*) from v where v.w = weeks.w)::int from weeks order by weeks.w;
$$;
revoke all on function public.tour_weekly(uuid) from public, anon;
grant execute on function public.tour_weekly(uuid) to authenticated;

-- 「틀린 곳은 알려 주세요」 — 투어도 신고 대상으로.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('post', 'answer', 'comment', 'user', 'tour'));
