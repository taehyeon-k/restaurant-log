-- 공유 갤러리(expo-app/HANDOFF-gallery.md) — 커뮤니티 「탐색」 자리. 내 기록의 사진 한 장씩 올리고, 좋아요 · 댓글.
-- 사진을 올려도 기록의 visibility 는 그대로이고, 그 사진 한 장만 갤러리에 나갑니다(can_see_photo).
-- 댓글 규칙은 게시판(20261018200000_board_v2)과 같습니다: 링크 · 정지 · 답글의 답글 금지, 문턱 없음.

/* ───────────── 1) 사진 ───────────── */

create table if not exists public.gallery_photos (
  id         bigserial primary key,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_id  bigint not null references public.restaurants(id) on delete cascade,
  photo_ref  text not null,            -- 그 기록의 photo_urls 중 하나(같은 값 그대로)
  menu       varchar(40),              -- 고른 메뉴 · 직접 쓴 메뉴 · null(메뉴 없이)
  caption    varchar(120),             -- 한 줄(선택)
  area       text,                     -- "서울 마포구 망원동" 꼴, 올릴 때 기록 주소에서
  hidden_at  timestamptz,              -- 관리자 숨김
  hidden_by  uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (record_id, photo_ref)        -- 같은 사진 두 번 올리기 금지
);
create index if not exists gallery_created_idx on public.gallery_photos (created_at desc);
create index if not exists gallery_menu_idx on public.gallery_photos (lower(menu));
create index if not exists gallery_author_idx on public.gallery_photos (author_id, created_at desc);

alter table public.gallery_photos enable row level security;
drop policy if exists "gallery read" on public.gallery_photos;
drop policy if exists "gallery remove" on public.gallery_photos;
create policy "gallery read"   on public.gallery_photos for select to authenticated
  using (not public.is_blocked(author_id) and (hidden_at is null or author_id = auth.uid() or public.is_admin()));
create policy "gallery remove" on public.gallery_photos for delete to authenticated using (auth.uid() = author_id);
-- 쓰기는 post_gallery_photo 로만.

/* ───────────── 2) 좋아요 · 댓글 ───────────── */

create table if not exists public.gallery_likes (
  photo_id   bigint not null references public.gallery_photos(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
alter table public.gallery_likes enable row level security;
drop policy if exists "gallery likes read" on public.gallery_likes;
drop policy if exists "gallery likes write" on public.gallery_likes;
drop policy if exists "gallery likes remove" on public.gallery_likes;
create policy "gallery likes read"   on public.gallery_likes for select to authenticated using (true);
create policy "gallery likes write"  on public.gallery_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "gallery likes remove" on public.gallery_likes for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.gallery_comments (
  id         bigserial primary key,
  photo_id   bigint not null references public.gallery_photos(id) on delete cascade,
  parent_id  bigint references public.gallery_comments(id) on delete cascade,   -- 답글 한 단계
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       varchar(500) not null check (length(trim(body)) > 0),
  hidden_at  timestamptz,
  hidden_by  uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists gallery_comments_photo_idx on public.gallery_comments (photo_id, created_at);
alter table public.gallery_comments enable row level security;
drop policy if exists "gallery comments read" on public.gallery_comments;
drop policy if exists "gallery comments remove" on public.gallery_comments;
create policy "gallery comments read"   on public.gallery_comments for select to authenticated
  using (not public.is_blocked(author_id) and (hidden_at is null or author_id = auth.uid() or public.is_admin()));
create policy "gallery comments remove" on public.gallery_comments for delete to authenticated using (auth.uid() = author_id);

create or replace function public.add_gallery_comment(p_photo_id bigint, p_body text, p_parent_id bigint default null)
returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  new_id bigint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if public.is_sanctioned(uid) then raise exception 'sanctioned'; end if;
  if length(v_body) = 0 then raise exception 'empty'; end if;
  if length(v_body) > 500 then raise exception 'too_long'; end if;
  if public.has_contact(v_body) then raise exception 'no_contact'; end if;
  if not exists (select 1 from public.gallery_photos where id = p_photo_id and hidden_at is null and not public.is_blocked(author_id)) then
    raise exception 'no_post';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.gallery_comments where id = p_parent_id and photo_id = p_photo_id and parent_id is null) then
    raise exception 'one_level';
  end if;
  insert into public.gallery_comments (photo_id, parent_id, author_id, body)
  values (p_photo_id, p_parent_id, uid, v_body)
  returning id into new_id;
  return new_id;
end $$;

/* ───────────── 3) 올리기 ───────────── */

-- 기록 주소 → 「시 구 동」(동이 없으면 「시 구」). 앱이 행정구역으로 다듬은 값(p_area)을 주면 그걸 씁니다.
create or replace function public.area_of(p_address text) returns text
language sql immutable set search_path = public as $$
  select nullif(array_to_string((regexp_match(coalesce(p_address, ''), '^(\S+\s+\S+[시군구](?:\s+\S+구)?(?:\s+\S+[동읍면가])?)'))[1:1], ''), '');
$$;

create or replace function public.post_gallery_photo(
  p_record_id bigint, p_photo_ref text, p_menu text default null,
  p_caption text default null, p_add_menu_to_record boolean default false, p_area text default null
) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  admin     boolean := public.is_admin();
  v_menu    text := nullif(trim(coalesce(p_menu, '')), '');
  v_caption text := nullif(trim(coalesce(p_caption, '')), '');
  rec       public.restaurants%rowtype;
  new_id    bigint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if public.is_sanctioned(uid) then raise exception 'sanctioned'; end if;
  if not admin and public.my_verified_count() < 5 then raise exception 'need_5_verified'; end if;
  if not admin and (select count(*) from public.gallery_photos
      where author_id = uid
        and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) >= 10 then
    raise exception 'daily_limit';
  end if;
  if coalesce(length(v_menu), 0) > 40 or coalesce(length(v_caption), 0) > 120 then raise exception 'too_long'; end if;
  if public.has_contact(v_caption) or public.has_contact(v_menu) then raise exception 'no_contact'; end if;

  select * into rec from public.restaurants where id = p_record_id and user_id = uid and coalesce(pending, false) = false;
  if not found then raise exception 'not_my_record'; end if;
  if not (p_photo_ref = any(coalesce(rec.photo_urls, '{}')) or p_photo_ref = rec.photo_url) then raise exception 'not_my_photo'; end if;
  if exists (select 1 from public.gallery_photos where record_id = p_record_id and photo_ref = p_photo_ref) then
    raise exception 'already_posted';
  end if;

  -- 직접 쓴 메뉴를 기록에도 — 같은 이름(공백 · 대소문자 무시)이 없을 때만.
  if p_add_menu_to_record and v_menu is not null and not exists (
    select 1 from jsonb_array_elements(coalesce(rec.menus, '[]'::jsonb)) m
    where lower(regexp_replace(coalesce(m->>'name', ''), '\s', '', 'g')) = lower(regexp_replace(v_menu, '\s', '', 'g'))) then
    update public.restaurants
       set menus = coalesce(menus, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name', v_menu, 'vote', null))
     where id = p_record_id;
  end if;

  insert into public.gallery_photos (author_id, record_id, photo_ref, menu, caption, area)
  values (uid, p_record_id, p_photo_ref, v_menu, v_caption,
          coalesce(nullif(left(trim(coalesce(p_area, '')), 40), ''), public.area_of(rec.address)))
  returning id into new_id;
  return new_id;
end $$;

/* ───────────── 4) 신고 · 관리자 ───────────── */

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'answer', 'comment', 'board_comment', 'gallery_photo', 'gallery_comment', 'user', 'tour'));

create or replace function public.admin_hide_gallery_photo(p_id bigint, p_hide boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.gallery_photos
     set hidden_at = case when p_hide then now() end, hidden_by = case when p_hide then auth.uid() end
   where id = p_id;
  perform public.admin_log(case when p_hide then 'hide_gallery_photo' else 'unhide_gallery_photo' end, 'gallery_photo', p_id::text);
end $$;

create or replace function public.admin_hide_gallery_comment(p_id bigint, p_hide boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.gallery_comments
     set hidden_at = case when p_hide then now() end, hidden_by = case when p_hide then auth.uid() end
   where id = p_id;
  perform public.admin_log(case when p_hide then 'hide_gallery_comment' else 'unhide_gallery_comment' end, 'gallery_comment', p_id::text);
end $$;

/* ───────────── 5) 사진 공개 — 갤러리에 올린 사진 한 장만 더 ───────────── */

create or replace function public.can_see_photo(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.profiles p where public.photo_ref_is(p.avatar_url, obj))
    or exists (select 1 from public.gallery_photos g
               where public.photo_ref_is(g.photo_ref, obj) and g.hidden_at is null and not public.is_blocked(g.author_id))
    or exists (
      select 1 from public.restaurants r
      where (public.photo_ref_is(r.photo_url, obj)
             or exists (select 1 from unnest(r.photo_urls) u where public.photo_ref_is(u, obj)))
        and (
          r.user_id = auth.uid()
          or public.is_book_member(r.book_id)
          or (not public.is_blocked(r.user_id) and (
                r.visibility = 'public'
             or (r.visibility = 'friends' and public.is_friend(auth.uid(), r.user_id))
             or exists (select 1 from public.friend_posts fp
                        where fp.record_id = r.id and public.can_see_post(fp.user_id, fp.audience))
             or exists (select 1 from public.board_posts bp where bp.record_id = r.id and bp.hidden_at is null and not public.is_blocked(bp.author_id))
             or exists (select 1 from public.board_post_records pr join public.board_posts bp on bp.id = pr.post_id
                        where pr.record_id = r.id and bp.hidden_at is null and not public.is_blocked(bp.author_id))
             or exists (select 1 from public.board_comments bc where bc.record_id = r.id and bc.hidden_at is null and not public.is_blocked(bc.author_id))
             or exists (select 1 from public.board_answers ba where ba.record_id = r.id and not public.is_blocked(ba.author_id))
          ))
        )
    )
  );
$$;

/* ───────────── 6) 목록 · 댓글 뷰 ───────────── */

-- 사진 한 장 + 올린 사람 + 가게(보여도 되는 칸만). 숨긴 사진은 관리자에게만 줄이 오고, 앱 목록은 hidden_at is null 로 거릅니다.
create or replace view public.gallery_feed as
  select g.id, g.author_id, a.nickname, a.avatar_url, a.character_id, a.title_label_id, a.role as author_role,
         g.record_id, g.photo_ref, g.menu, g.caption, g.area, g.created_at, g.hidden_at,
         r.name as place_name, r.kind, r.category, r.address, r.verified, r.verified_at, r.lat, r.lng,
         public.place_of(r.place_key, r.name, r.address) as place,
         public.is_friend(auth.uid(), g.author_id) as by_friend,
         (select count(*) from public.gallery_likes l where l.photo_id = g.id)::int as like_count,
         (select count(*) from public.gallery_comments c
           where c.photo_id = g.id and c.hidden_at is null and not public.is_blocked(c.author_id))::int as comment_count,
         exists (select 1 from public.gallery_likes l where l.photo_id = g.id and l.user_id = auth.uid()) as my_like
  from public.gallery_photos g
  join public.profiles a on a.id = g.author_id
  join public.restaurants r on r.id = g.record_id
  where not public.is_blocked(g.author_id) and (g.hidden_at is null or public.is_admin());
revoke all on public.gallery_feed from anon;
grant select on public.gallery_feed to authenticated;

create or replace view public.gallery_comment_rows as
  select c.id, c.photo_id, c.parent_id, c.author_id, c.created_at, c.hidden_at,
         case when c.hidden_at is null or public.is_admin() then c.body end as body,
         a.nickname, a.avatar_url, a.character_id, a.title_label_id, a.role as author_role
  from public.gallery_comments c
  join public.profiles a on a.id = c.author_id
  where not public.is_blocked(c.author_id);
revoke all on public.gallery_comment_rows from anon;
grant select on public.gallery_comment_rows to authenticated;

/* ───────────── 7) 검색 ───────────── */

-- 검색어 비교 — 공백 빼고 소문자.
create or replace function public.norm_q(t text) returns text
language sql immutable set search_path = public as $$
  select lower(regexp_replace(coalesce(t, ''), '\s', '', 'g'));
$$;

-- scope: all · menu · place · area · person. 차단한 사람 · 숨긴 사진은 gallery_feed 에서 이미 빠집니다. 묶음마다 30개까지.
create or replace function public.gallery_search(p_q text, p_scope text default 'all') returns json
language sql stable security definer set search_path = public as $$
  with q as (select public.norm_q(p_q) as s),
  base as (select f.* from public.gallery_feed f where f.hidden_at is null)
  select case when (select s from q) = '' then
    json_build_object('menu', '[]'::json, 'places', '[]'::json, 'areas', '[]'::json, 'people', '[]'::json)
  else json_build_object(
    'menu', case when p_scope in ('all', 'menu') then coalesce((
      select json_agg(m) from (
        select b.* from base b, q where strpos(public.norm_q(b.menu), q.s) > 0
        order by b.like_count desc, b.created_at desc limit 30) m), '[]'::json) else '[]'::json end,
    'places', case when p_scope in ('all', 'place') then coalesce((
      select json_agg(pl) from (
        select b.place, min(b.place_name) as name, min(b.address) as address, min(b.category) as category, min(b.area) as area,
               count(*)::int as photo_count,
               (array_agg(b.photo_ref order by b.like_count desc, b.created_at desc))[1] as cover_ref
        from base b, q where strpos(public.norm_q(b.place_name), q.s) > 0
        group by b.place order by count(*) desc, min(b.place_name) limit 30) pl), '[]'::json) else '[]'::json end,
    'areas', case when p_scope in ('all', 'area') then coalesce((
      select json_agg(ar) from (
        select b.area, count(*)::int as photo_count,
               (array_agg(b.photo_ref order by b.like_count desc, b.created_at desc))[1] as cover_ref
        from base b, q where b.area is not null and strpos(public.norm_q(b.area), q.s) > 0
        group by b.area order by count(*) desc, b.area limit 30) ar), '[]'::json) else '[]'::json end,
    'people', case when p_scope in ('all', 'person') then coalesce((
      select json_agg(pp) from (
        select p.id, p.nickname, p.avatar_url, p.character_id, p.title_label_id, p.role,
               (select count(*) from base b where b.author_id = p.id)::int as photo_count
        from public.profiles p, q
        where p.nickname is not null and not public.is_blocked(p.id) and strpos(public.norm_q(p.nickname), q.s) > 0
        order by photo_count desc, p.nickname limit 30) pp), '[]'::json) else '[]'::json end
  ) end;
$$;

-- 요즘 많이 찾는 메뉴 — 최근 7일 갤러리 메뉴 빈도 상위 4개(검색어 기록은 쌓지 않습니다).
create or replace function public.gallery_top_menus() returns table (menu text, n int)
language sql stable security definer set search_path = public as $$
  select min(g.menu)::text, count(*)::int
  from public.gallery_photos g
  where g.menu is not null and g.hidden_at is null and g.created_at > now() - interval '7 days'
  group by public.norm_q(g.menu)
  order by 2 desc, 1
  limit 4;
$$;

/* ───────────── 8) 권한 ───────────── */

revoke execute on function public.add_gallery_comment(bigint, text, bigint) from public, anon;
revoke execute on function public.post_gallery_photo(bigint, text, text, text, boolean, text) from public, anon;
revoke execute on function public.admin_hide_gallery_photo(bigint, boolean) from public, anon;
revoke execute on function public.admin_hide_gallery_comment(bigint, boolean) from public, anon;
revoke execute on function public.gallery_search(text, text) from public, anon;
revoke execute on function public.gallery_top_menus() from public, anon;
grant execute on function public.add_gallery_comment(bigint, text, bigint) to authenticated;
grant execute on function public.post_gallery_photo(bigint, text, text, text, boolean, text) to authenticated;
grant execute on function public.admin_hide_gallery_photo(bigint, boolean) to authenticated;
grant execute on function public.admin_hide_gallery_comment(bigint, boolean) to authenticated;
grant execute on function public.gallery_search(text, text) to authenticated;
grant execute on function public.gallery_top_menus() to authenticated;
