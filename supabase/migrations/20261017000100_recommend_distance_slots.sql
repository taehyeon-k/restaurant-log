-- 추천 탭 수정 — 도보 시간 · 영업시간 제거(expo-app/HANDOFF-recommend-fix-distance-hours.md).
-- 화면의 숫자는 좌표 계산 또는 인증 기록에서만: 「지금 영업 중」 대신 「최근 4주 같은 시간대에 인증 있음」.
-- 시간대 수는 materialized view(place_hourly) 대신 rec_places 안에서 그때그때 셉니다 — 갱신 일정이 따로 필요 없고,
-- 뷰를 public 에 두면 PostgREST 로 바로 읽혀 3명 미만 원칙을 우회할 수 있어서입니다.

-- 카카오 장소 페이지(「카카오맵에서 보기」) — 검색 · 둘레 후보에서 고른 가게만 있습니다. 직접 적은 가게는 null.
alter table public.restaurants add column if not exists place_url text;
alter table public.tour_places add column if not exists place_url text;

-- 돌려주는 칸이 바뀌어 다시 만듭니다.
drop function if exists public.rec_next_after(text);
drop function if exists public.rec_courses(float8, float8, int);
drop function if exists public.rec_pairs(int);
drop function if exists public.rec_places(float8, float8, int);
drop function if exists public.tour_detail(uuid);
drop function if exists public.rec_visits();

create function public.rec_visits()
returns table (user_id uuid, place text, name text, category text, kind text, address text, lat float8, lng float8, place_url text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.user_id, public.place_of(r.place_key, r.name, r.address), r.name, r.category, r.kind, r.address,
         r.lat::float8, r.lng::float8, r.place_url, r.verified_at
  from public.restaurants r
  where r.verified_at is not null
    and coalesce(r.pending, false) = false
    and r.source_record_id is null and r.copied_at is null;
$$;
revoke all on function public.rec_visits() from public, anon, authenticated;

-- 한국 시간 하루 중 분(0–1439).
create or replace function public.seoul_minute(t timestamptz) returns int
language sql immutable as $$
  select (extract(hour from t at time zone 'Asia/Seoul') * 60 + extract(minute from t at time zone 'Asia/Seoul'))::int;
$$;

-- 두 시각(하루 중 분)이 ±p_min 안인지 — 자정을 넘어도.
create or replace function public.within_minutes(a int, b int, p_min int) returns boolean
language sql immutable as $$
  select least(abs(a - b), 1440 - abs(a - b)) <= p_min;
$$;

/* ───────────── 가게별 숫자 ───────────── */

-- slot_dow — 최근 4주, 오늘과 같은 요일, 지금 시각 ±1시간 안 인증 수.
-- slot_any — 최근 4주, 요일 상관없이 지금 시각 ±1시간 안 인증 수.
create function public.rec_places(p_lat float8, p_lng float8, p_radius_m int default 1000)
returns table (
  place text, name text, category text, kind text, address text, lat float8, lng float8, distance_m int, place_url text,
  users int, revisit_rate numeric, today_count int, last_at timestamptz, week_count int, steady_years int, mine int,
  slot_dow int, slot_any int
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
  urls as (
    select distinct on (v.place) v.place, v.place_url from v where v.place_url is not null order by v.place, v.at desc
  ),
  counts as (
    select v.place,
           count(*) filter (where (v.at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date)::int as today_count,
           max(v.at) as last_at,
           count(*) filter (where v.at >= date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')::int as week_count,
           count(*) filter (where v.user_id = auth.uid())::int as mine,
           count(*) filter (where v.at > now() - interval '28 days'
                              and public.within_minutes(public.seoul_minute(v.at), public.seoul_minute(now()), 60)
                              and extract(dow from v.at at time zone 'Asia/Seoul') = extract(dow from now() at time zone 'Asia/Seoul'))::int as slot_dow,
           count(*) filter (where v.at > now() - interval '28 days'
                              and public.within_minutes(public.seoul_minute(v.at), public.seoul_minute(now()), 60))::int as slot_any
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
         round(public.meters_between(p_lat, p_lng, l.lat, l.lng))::int as distance_m, u.place_url,
         a.users, a.revisit_rate, c.today_count, c.last_at, c.week_count,
         coalesce(s.n, 0) / 4 as steady_years, c.mine, c.slot_dow, c.slot_any
  from agg a
  join latest l on l.place = a.place
  join counts c on c.place = a.place
  left join urls u on u.place = a.place
  left join steady s on s.place = a.place
  where l.lat is not null and l.lng is not null
    and public.meters_between(p_lat, p_lng, l.lat, l.lng) <= p_radius_m
  order by a.revisit_rate desc, a.users desc;
$$;
revoke all on function public.rec_places(float8, float8, int) from public, anon;
grant execute on function public.rec_places(float8, float8, int) to authenticated;

/* ───────────── 이어 간 동선 · 코스 ───────────── */

-- 같은 사람이 같은 날 A 인증 후 2시간 안에 B 를 인증한 쌍. 최근 8주, 3명 이상. 머무는 시간은 더 세지 않습니다.
create function public.rec_pairs(p_weeks int default 8)
returns table (
  a_place text, a_name text, a_category text, a_lat float8, a_lng float8,
  b_place text, b_name text, b_category text, b_lat float8, b_lng float8, users int
)
language sql stable security definer set search_path = public as $$
  with v as (
    select * from public.rec_visits() x where x.at >= now() - make_interval(weeks => p_weeks)
  ),
  agg as (
    select a.place as a_place, b.place as b_place, count(distinct a.user_id)::int as users
    from v a join v b
      on b.user_id = a.user_id and b.place <> a.place
     and (b.at at time zone 'Asia/Seoul')::date = (a.at at time zone 'Asia/Seoul')::date
     and b.at > a.at and b.at <= a.at + interval '2 hours'
    group by a.place, b.place having count(distinct a.user_id) >= 3
  ),
  latest as (
    select distinct on (v.place) v.place, v.name, v.category, v.lat, v.lng from v order by v.place, v.at desc
  )
  select g.a_place, la.name, la.category, la.lat, la.lng, g.b_place, lb.name, lb.category, lb.lat, lb.lng, g.users
  from agg g join latest la on la.place = g.a_place join latest lb on lb.place = g.b_place
  where la.lat is not null and lb.lat is not null;
$$;
revoke all on function public.rec_pairs(int) from public, anon, authenticated;

-- 지금 자리 p_radius_m 안에서 출발하고, 두 곳 모두 최근 4주 지금 시간대(±1시간)에 인증이 있는 코스.
create function public.rec_courses(p_lat float8, p_lng float8, p_radius_m int default 2000)
returns table (
  id text, a_place text, a_name text, a_category text, a_lat float8, a_lng float8, a_distance_m int, a_place_url text,
  a_revisit_rate numeric, a_today_count int, a_last_at timestamptz,
  b_place text, b_name text, b_category text, b_lat float8, b_lng float8, b_place_url text,
  b_revisit_rate numeric, b_today_count int, b_last_at timestamptz,
  between_m int, users int
)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.rec_places(p_lat, p_lng, p_radius_m * 2))
  select md5(p.a_place || '>' || p.b_place), p.a_place, p.a_name, p.a_category, p.a_lat, p.a_lng,
         round(public.meters_between(p_lat, p_lng, p.a_lat, p.a_lng))::int, sa.place_url,
         sa.revisit_rate, sa.today_count, sa.last_at,
         p.b_place, p.b_name, p.b_category, p.b_lat, p.b_lng, sb.place_url,
         sb.revisit_rate, sb.today_count, sb.last_at,
         round(public.meters_between(p.a_lat, p.a_lng, p.b_lat, p.b_lng))::int,
         p.users
  from public.rec_pairs(8) p
  join s sa on sa.place = p.a_place
  join s sb on sb.place = p.b_place
  where public.meters_between(p_lat, p_lng, p.a_lat, p.a_lng) <= p_radius_m
    and sa.slot_any > 0 and sb.slot_any > 0
  order by p.users desc
  limit 10;
$$;
revoke all on function public.rec_courses(float8, float8, int) from public, anon;
grant execute on function public.rec_courses(float8, float8, int) to authenticated;

create function public.rec_next_after(p_place text)
returns table (place text, name text, category text, lat float8, lng float8, users int)
language sql stable security definer set search_path = public as $$
  select p.b_place, p.b_name, p.b_category, p.b_lat, p.b_lng, p.users
  from public.rec_pairs(8) p where p.a_place = p_place
  order by p.users desc limit 5;
$$;
revoke all on function public.rec_next_after(text) from public, anon;
grant execute on function public.rec_next_after(text) to authenticated;

/* ───────────── 투어 후보 ───────────── */

create function public.tour_detail(p_tour uuid)
returns table (
  place text, name text, category text, address text, lat float8, lng float8, place_url text,
  my_first_at timestamptz, users int, revisit_rate numeric
)
language sql stable security definer set search_path = public as $$
  with all_v as (
    select v.user_id, v.place, v.place_url, v.at, (v.at at time zone 'Asia/Seoul')::date as day
    from public.rec_visits() v join public.tour_places tp on tp.tour_id = p_tour and tp.place_key = v.place
  ),
  pu as (select a.place, a.user_id, count(distinct a.day) as days from all_v a group by a.place, a.user_id),
  agg as (
    select pu.place, count(*)::int as users, round(count(*) filter (where pu.days >= 2)::numeric / count(*), 3) as rate
    from pu group by pu.place
  ),
  urls as (
    select distinct on (a.place) a.place, a.place_url from all_v a where a.place_url is not null order by a.place, a.at desc
  )
  select tp.place_key, tp.name, tp.category, tp.address, tp.lat, tp.lng, coalesce(tp.place_url, urls.place_url),
         (select min(tv.at) from public.tour_visits(p_tour) tv where tv.user_id = auth.uid() and tv.place = tp.place_key),
         case when agg.users >= 3 then agg.users end,
         case when agg.users >= 3 then agg.rate end
  from public.tour_places tp
  left join agg on agg.place = tp.place_key
  left join urls on urls.place = tp.place_key
  where tp.tour_id = p_tour;
$$;
revoke all on function public.tour_detail(uuid) from public, anon;
grant execute on function public.tour_detail(uuid) to authenticated;
