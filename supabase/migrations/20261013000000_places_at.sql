-- 지도 길게 누르기 → 그 건물 식당 보기(places-at).
-- 공공 상가 데이터(소상공인시장진흥공단 상가(상권)정보)를 미리 적재해 두고,
-- Edge Function places-at 이 건물관리번호나 좌표로 한 번에 찾아 씁니다.
-- 읽기는 로그인 사용자, 쓰기는 service role(적재 스크립트·Edge Function)만.

create extension if not exists postgis with schema extensions;

/* ── 공공 상가 ─────────────────────────────── */

create table if not exists public.public_stores (
  store_id    text primary key,            -- 상가업소번호
  name        text not null,               -- 상호명
  branch      text,                        -- 지점명
  cat_large   text,                        -- 상권업종대분류명 (음식 …)
  cat_mid     text,                        -- 상권업종중분류명 (한식 · 비알코올 …)
  cat_small   text,                        -- 상권업종소분류명 (백반/한정식 · 카페 …)
  sido_code   text,                        -- 시도코드 (서울 11)
  bld_mgt_no  text,                        -- 건물관리번호 (juso bdMgtSn 과 같은 25자리)
  bld_name    text,
  road_addr   text,
  floor       text,                        -- 층정보 — 없으면 null
  unit        text,                        -- 호정보
  geom        extensions.geography(Point, 4326) not null,
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz                  -- 최신 파일에서 빠진 날. 바로 지우지 않습니다.
);

create index if not exists public_stores_bld_idx on public.public_stores (bld_mgt_no) where closed_at is null;
create index if not exists public_stores_geom_idx on public.public_stores using gist (geom);
create index if not exists public_stores_sido_idx on public.public_stores (sido_code, updated_at);

/* ── 건물 경계(VWorld) 캐시 ────────────────── */

create table if not exists public.buildings (
  bld_mgt_no  text primary key,
  name        text,
  road_addr   text,
  footprint   extensions.geography(Polygon, 4326),
  fetched_at  timestamptz not null default now()
);

create index if not exists buildings_footprint_idx on public.buildings using gist (footprint);

/* ── 공공 상가 ↔ 카카오 장소 매칭 캐시 ───────── */

create table if not exists public.place_links (
  store_id        text primary key references public.public_stores (store_id) on delete cascade,
  kakao_place_id  text not null,
  matched_at      timestamptz not null default now()
);

create index if not exists place_links_kakao_idx on public.place_links (kakao_place_id);

/* ── RLS: 읽기는 로그인 사용자, 쓰기는 service role 만(정책 없음 = 막힘) ── */

alter table public.public_stores enable row level security;
alter table public.buildings     enable row level security;
alter table public.place_links   enable row level security;

drop policy if exists "public_stores read" on public.public_stores;
create policy "public_stores read" on public.public_stores for select to authenticated using (true);
drop policy if exists "buildings read" on public.buildings;
create policy "buildings read" on public.buildings for select to authenticated using (true);
drop policy if exists "place_links read" on public.place_links;
create policy "place_links read" on public.place_links for select to authenticated using (true);

revoke insert, update, delete, truncate on public.public_stores, public.buildings, public.place_links from anon, authenticated;
revoke select on public.public_stores, public.buildings, public.place_links from anon;

/* ── RPC ───────────────────────────────────── */

-- 한 건물의 음식 업종 가게(영업 중). 건물 안이라 거리 대신 층·호 순.
create or replace function public.stores_in_building(bld text)
returns table (
  store_id text, name text, branch text, cat_mid text, cat_small text,
  floor text, unit text, lat double precision, lng double precision, kakao_place_id text
)
language sql stable security invoker set search_path = public, extensions
as $$
  select s.store_id, s.name, s.branch, s.cat_mid, s.cat_small, s.floor, s.unit,
         st_y(s.geom::geometry), st_x(s.geom::geometry), l.kakao_place_id
  from public_stores s
  left join place_links l on l.store_id = s.store_id
  where s.bld_mgt_no = bld and s.closed_at is null and s.cat_large = '음식'
  order by s.floor nulls last, s.unit nulls last, s.name;
$$;

-- 좌표 둘레 radius_m 안의 음식 업종 가게, 가까운 순.
create or replace function public.stores_near(lat double precision, lng double precision, radius_m int)
returns table (
  store_id text, name text, branch text, cat_mid text, cat_small text, floor text, road_addr text,
  lat double precision, lng double precision, distance_m double precision, kakao_place_id text
)
language sql stable security invoker set search_path = public, extensions
as $$
  with p as (select st_setsrid(st_makepoint(stores_near.lng, stores_near.lat), 4326)::geography as g)
  select s.store_id, s.name, s.branch, s.cat_mid, s.cat_small, s.floor, s.road_addr,
         st_y(s.geom::geometry), st_x(s.geom::geometry), st_distance(s.geom, p.g), l.kakao_place_id
  from public_stores s
  cross join p
  left join place_links l on l.store_id = s.store_id
  where st_dwithin(s.geom, p.g, least(greatest(radius_m, 1), 300))
    and s.closed_at is null and s.cat_large = '음식'
  order by st_distance(s.geom, p.g)
  limit 80;
$$;

-- places-at 이 DB 를 한 번만 다녀오게 묶은 조회(앱 → 서울 함수 → 시드니 DB 왕복을 줄입니다).
--   bld 가 없으면: 24시간 안에 받아 둔 건물 경계 중 이 좌표를 품은 건물을 찾습니다(같은 건물 재요청의 빠른 길).
--   그 건물의 가게가 없고 radius_m 이 있으면: 둘레 가게(near).
--   mine / wishes: 부른 사용자(auth.uid())의 둘레 300m 기록·위시 — 함수가 이름+거리로 가게에 붙입니다.
create or replace function public.places_at_lookup(
  lat double precision, lng double precision, bld text default null, radius_m int default null
)
returns jsonb
language plpgsql stable security invoker set search_path = public, extensions
as $$
declare
  p geography := st_setsrid(st_makepoint(places_at_lookup.lng, places_at_lookup.lat), 4326)::geography;
  b buildings%rowtype;
  target text;
  stores jsonb := '[]'::jsonb;
  near jsonb := null;
begin
  if bld is null then
    select * into b from buildings
    where footprint is not null and fetched_at > now() - interval '24 hours' and st_covers(footprint, p)
    order by st_area(footprint) limit 1;
  else
    select * into b from buildings where bld_mgt_no = bld;
  end if;

  target := coalesce(bld, b.bld_mgt_no);
  if target is not null then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into stores from stores_in_building(target) x;
  end if;

  if jsonb_array_length(stores) = 0 and radius_m is not null then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into near
    from stores_near(places_at_lookup.lat, places_at_lookup.lng, radius_m) x;
  end if;

  return jsonb_build_object(
    'building', case when b.bld_mgt_no is null then null else jsonb_build_object(
      'id', b.bld_mgt_no, 'name', b.name, 'roadAddr', b.road_addr,
      'fresh', b.fetched_at > now() - interval '24 hours',
      -- [lat, lng] 순서(앱의 Pt 와 같음). 바깥 고리만.
      'footprint', (
        select jsonb_agg(jsonb_build_array(st_y(d.geom), st_x(d.geom)) order by d.path)
        from st_dumppoints(st_exteriorring(b.footprint::geometry)) d
      )
    ) end,
    'stores', stores,
    'near', near,
    'mine', (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'lat', r.lat, 'lng', r.lng)), '[]'::jsonb)
      from restaurants r
      where r.user_id = auth.uid() and not r.pending and r.lat is not null and r.lng is not null
        and st_dwithin(st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography, p, 300)
    ),
    'wishes', (
      select coalesce(jsonb_agg(jsonb_build_object('name', w.name, 'lat', w.lat, 'lng', w.lng)), '[]'::jsonb)
      from wishes w
      where w.user_id = auth.uid() and w.lat is not null and w.lng is not null
        and st_dwithin(st_setsrid(st_makepoint(w.lng, w.lat), 4326)::geography, p, 300)
    )
  );
end;
$$;

revoke execute on function public.stores_in_building(text) from anon, public;
revoke execute on function public.stores_near(double precision, double precision, int) from anon, public;
revoke execute on function public.places_at_lookup(double precision, double precision, text, int) from anon, public;
grant execute on function public.stores_in_building(text) to authenticated, service_role;
grant execute on function public.stores_near(double precision, double precision, int) to authenticated, service_role;
grant execute on function public.places_at_lookup(double precision, double precision, text, int) to authenticated, service_role;
