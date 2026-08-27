-- restaurant-log · backfill 003
-- Run AFTER 002_search_and_map.sql. Every statement is safe to re-run.

-- 1. Split cafes out of the default kind, by category text.
update restaurants
set kind = 'cafe'
where category ilike any (array['%cafe%', '%카페%', '%커피%', '%coffee%', '%디저트%', '%dessert%', '%베이커리%', '%bakery%', '%차%']);

-- Check the split before moving on:
--   select kind, category, count(*) from restaurants group by 1, 2 order by 1, 3 desc;
-- Fix strays individually:
--   update restaurants set kind = 'cafe' where name = '연남 로스터스';

-- 2. Normalize category values to the ones the design's chips expect.
update restaurants set category = '한식'   where category ilike any (array['korean%', '한식%']);
update restaurants set category = '중식'   where category ilike any (array['chinese%', '중식%']);
update restaurants set category = '일식'   where category ilike any (array['japanese%', '일식%']);
update restaurants set category = '양식'   where category ilike any (array['western%', 'italian%', 'french%', '양식%']);
update restaurants set category = '아시안' where category ilike any (array['asian%', 'thai%', 'viet%', '아시안%']);
update restaurants set category = '커피'   where kind = 'cafe' and category ilike any (array['cafe%', 'coffee%', '카페%', '커피%']);

-- 3. Seed keywords from what the existing rows already say.
--    Price threshold assumes price_range is per-person KRW.
update restaurants set keywords = array_remove(array[
  case when price_range is not null and price_range <= 12000            then '가성비'   end,
  case when rating >= 4.5                                              then '분위기'   end,
  case when review ilike any (array['%혼자%', '%혼밥%'])                 then '혼밥'     end,
  case when review ilike any (array['%데이트%', '%기념일%'])              then '데이트'   end,
  case when review ilike any (array['%대기%', '%줄%', '%웨이팅%'])         then '줄서는곳' end,
  case when review ilike any (array['%작업%', '%콘센트%', '%노트북%'])      then '작업'     end
], null)
where keywords = '{}';

-- 4. Region: strip the city prefix so chips read 중구, not 서울 중구.
update restaurants
set region = trim(replace(replace(region, '서울시', ''), '서울', ''))
where region ilike '서울%';

-- 5. Rows with no visit date sort last under 최근순 (nullsFirst: false),
--    which is intended. To place them by creation instead:
-- update restaurants set visited_at = created_at::date where visited_at is null;

-- 6. Coordinates. Nothing here can invent them — MapPane scatters rows with
--    null lat/lng to stable placeholder spots. Fill them as you geocode:
-- update restaurants set lat = 37.5665, lng = 126.9780 where id = 1;
select id, name, region, address from restaurants where lat is null order by id;
