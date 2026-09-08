-- 가고싶다(위시) — 아직 가지 않은 곳을 담아두는 목록. 기록(restaurants)과는
-- 다른 테이블입니다: 인증마크·별점·사진·메뉴가 없고, 그 자리에서 사진을
-- 찍어 인증하는 순간에만 기록으로 바뀝니다(§7, restaurants.from_wish).
--
-- 이 프로젝트는 인증 없이 브라우저(anon key)에서 바로 읽고 쓰는 1인 기록장이라
-- (restaurants 테이블도 user_id·RLS가 없습니다) wishes 도 같은 모양으로 둡니다.

create table if not exists public.wishes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  where_text  text,
  category    text,
  note        text,
  plan_date   date,
  notify      boolean not null default false,
  lat         double precision,
  lng         double precision,
  saved_at    timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- 위시가 기록이 되는 순간 남기는 자취: {"saved_at","days","planned"}. 없으면 null.
alter table public.restaurants
  add column if not exists from_wish jsonb;
