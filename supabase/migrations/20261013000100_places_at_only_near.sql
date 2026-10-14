-- places_at_lookup 에 only_near 추가 — 앱에서 반경 칩(25/50/100m)을 바꿀 때는 건물을 찾지 않고 둘레 가게만 돌려줍니다.
drop function if exists public.places_at_lookup(double precision, double precision, text, int);

create or replace function public.places_at_lookup(
  lat double precision, lng double precision, bld text default null, radius_m int default null, only_near boolean default false
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
  if not only_near then
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

revoke execute on function public.places_at_lookup(double precision, double precision, text, int, boolean) from anon, public;
grant execute on function public.places_at_lookup(double precision, double precision, text, int, boolean) to authenticated, service_role;
