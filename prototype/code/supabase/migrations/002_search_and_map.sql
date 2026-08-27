-- restaurant-log · migration 002
-- Adds the columns the two-pane map + search UI needs.

alter table restaurants
  add column if not exists kind text not null default 'restaurant',
  add column if not exists keywords text[] not null default '{}',
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists photo_url text;

alter table restaurants
  add constraint restaurants_kind_check check (kind in ('restaurant', 'cafe'));

create index if not exists restaurants_kind_idx on restaurants (kind);
create index if not exists restaurants_keywords_idx on restaurants using gin (keywords);
create index if not exists restaurants_visited_at_idx on restaurants (visited_at desc);

-- Keyword facet counts for the KEYWORD chip row (cheaper than pulling every row).
create or replace view restaurant_keyword_facets as
  select kind, keyword, count(*)::int as n
  from restaurants, unnest(keywords) as keyword
  group by kind, keyword
  order by n desc;

-- Photos: create a public-read bucket named `restaurant-photos` in the Storage UI,
-- then store the public URL in photo_url.
