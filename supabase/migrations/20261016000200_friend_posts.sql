-- 친구 소식 직접 올리기(expo-app HANDOFF-friend-posts §1).
-- 친구 탭은 restaurants.visibility 가 아니라 내가 골라 올린 friend_posts 만 봅니다.
-- 인증 기록만 · 만료 없음 · 받는 사람은 친구 전체 / 친한 친구 · 조회 기록은 남기지 않음.
-- shared_records 는 추천(recs.ts)이 계속 쓰므로 그대로 둡니다.

/* ───────────── 친한 친구 ───────────── */

-- 내가 고른 친구 목록(상대에게 알리지 않음). 친구를 끊으면 남아 있어도 is_friend 조건 때문에 효력이 없습니다.
create table if not exists public.close_friends (
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.close_friends enable row level security;
drop policy if exists "own close friends" on public.close_friends;
create policy "own close friends" on public.close_friends for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id and public.is_friend(user_id, friend_id));

/* ───────────── 친구 소식 ───────────── */

-- 기록 하나당 하나. photo_index 는 기록 photo_urls 의 순번(누른 순서, 첫 칸이 대표).
create table if not exists public.friend_posts (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_id   bigint not null references public.restaurants(id) on delete cascade,
  photo_index int[] not null default '{}',
  note        varchar(40),
  audience    text not null default 'friends' check (audience in ('friends', 'close')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, record_id)
);
create index if not exists friend_posts_created_idx on public.friend_posts (created_at desc);
create index if not exists friend_posts_record_idx on public.friend_posts (record_id);
alter table public.friend_posts enable row level security;

-- 내가 볼 수 있는 소식인지: 내 것 / 친구 전체 + 친구 / 친한 친구 + 상대가 나를 친한 친구로 고름
create or replace function public.can_see_post(p_user uuid, p_audience text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
      or (not public.is_blocked(p_user) and public.is_friend(auth.uid(), p_user) and (
            p_audience = 'friends'
         or exists (select 1 from public.close_friends c where c.user_id = p_user and c.friend_id = auth.uid())));
$$;
revoke execute on function public.can_see_post(uuid, text) from public, anon;
grant execute on function public.can_see_post(uuid, text) to authenticated;

drop policy if exists "posts read" on public.friend_posts;
drop policy if exists "posts remove" on public.friend_posts;
create policy "posts read"   on public.friend_posts for select to authenticated using (public.can_see_post(user_id, audience));
create policy "posts remove" on public.friend_posts for delete to authenticated using (auth.uid() = user_id);
-- 올리기 · 고치기는 아래 함수로만(인증 기록 확인).

create or replace function public.upsert_friend_post(
  p_record_id bigint, p_photo_index int[], p_note text, p_audience text
) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_photos int[];
  n_photos int;
  new_id bigint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_audience not in ('friends', 'close') then raise exception 'bad_audience'; end if;
  if coalesce(length(v_note), 0) > 40 then raise exception 'note_too_long'; end if;
  if public.has_contact(v_note) then raise exception 'no_contact'; end if;
  select coalesce(array_length(r.photo_urls, 1), 0) into strict n_photos
    from public.restaurants r
    where r.id = p_record_id and r.user_id = uid and r.verified and coalesce(r.pending, false) = false;
  -- 기록에 없는 순번은 버립니다(중복도 하나로).
  select coalesce(array_agg(i order by o), '{}') into v_photos
    from (select distinct on (i) i, o from unnest(coalesce(p_photo_index, '{}')) with ordinality as t(i, o)
          where i >= 0 and i < n_photos order by i, o) s;
  insert into public.friend_posts (user_id, record_id, photo_index, note, audience)
  values (uid, p_record_id, v_photos, v_note, p_audience)
  on conflict (user_id, record_id) do update
    set photo_index = excluded.photo_index, note = excluded.note, audience = excluded.audience, updated_at = now()
  returning id into new_id;
  return new_id;
exception
  when no_data_found then raise exception 'record_not_verified';
end $$;
revoke execute on function public.upsert_friend_post(bigint, int[], text, text) from public, anon;
grant execute on function public.upsert_friend_post(bigint, int[], text, text) to authenticated;

-- 친구 탭이 읽는 뷰 — 소식 + 기록에서 보여도 되는 칸(메모 review · 메뉴 · 정확도는 빼고).
create or replace view public.friend_feed as
  select p.id, p.user_id, p.record_id, p.photo_index, p.note, p.audience, p.created_at, p.updated_at,
         r.name, r.category, r.region, r.address, r.rating, r.verified_at,
         r.photo_urls, r.cover_index, r.photo_url, r.lat, r.lng,
         public.place_of(r.place_key, r.name, r.address) as place
  from public.friend_posts p
  join public.restaurants r on r.id = p.record_id
  where public.can_see_post(p.user_id, p.audience);
revoke all on public.friend_feed from anon;
grant select on public.friend_feed to authenticated;

/* ───────────── 함께 고치는 것 ───────────── */

-- 공감 · 댓글: 소식에 올라간 기록이면 visibility = private 이어도 볼 수 있게.
create or replace function public.can_see_record(p_record_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurants r
    where r.id = p_record_id
      and (r.user_id = auth.uid() or r.visibility = 'public' or (r.visibility = 'friends' and public.is_friend(auth.uid(), r.user_id)))
  ) or exists (
    select 1 from public.friend_posts p
    where p.record_id = p_record_id and public.can_see_post(p.user_id, p.audience)
  );
$$;

-- 탭바 새 소식 점: 커뮤니티를 마지막으로 본 뒤 친구가 올린 소식 수(내 것 제외).
create or replace function public.community_unseen() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.friend_feed f
  where f.user_id <> auth.uid()
    and f.created_at > coalesce((select last_seen_community_at from public.profiles where id = auth.uid()), '-infinity'::timestamptz);
$$;
