-- 사진 비공개화 1단계: 보는 규칙(정책)을 먼저 깝니다. 버킷은 아직 공개라 지금 앱에는 영향이 없습니다.
-- 새 앱(서명 주소로 사진을 보는 빌드)을 확인한 뒤 20261016000400_private_photos_bucket.sql 로 버킷을 닫습니다.
--
-- 누가 사진을 볼 수 있나 — 기록을 볼 수 있는 사람과 같습니다.
--   · 올린 사람 / 같은 기록장(연인) 사람
--   · 기록이 public 이면 로그인한 누구나, friends 면 친구
--   · 친구 소식(friend_posts)에 올렸으면 그 받는 사람(친한 친구 포함)
--   · 게시판 글에 붙은 기록 / 게시판 답으로 고른 기록이면 로그인한 누구나(차단한 사람 제외)
--   · 프로필 사진(profiles.avatar_url)은 로그인한 누구나(public_profiles 와 같은 범위)
-- 비로그인(anon)은 아무것도 볼 수 없고, 올릴 수도 없습니다.

-- DB 에 든 값은 새 기록은 「경로」, 예전 기록은 「공개 주소」입니다. 둘 다 같은 파일로 봅니다.
create or replace function public.photo_ref_is(ref text, obj text) returns boolean
language sql immutable as $$
  select ref = obj or right(ref, length(obj) + 1) = '/' || obj;
$$;

create or replace function public.can_see_photo(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.profiles p where public.photo_ref_is(p.avatar_url, obj))
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
             or exists (select 1 from public.board_posts bp where bp.record_id = r.id and not public.is_blocked(bp.author_id))
             or exists (select 1 from public.board_answers ba where ba.record_id = r.id and not public.is_blocked(ba.author_id))
          ))
        )
    )
  );
$$;
revoke execute on function public.can_see_photo(text) from public, anon;
grant execute on function public.can_see_photo(text) to authenticated;

-- 읽기: 위 규칙 + 방금 내가 올린 파일(기록에 붙이기 전에도 내 것은 보여야 함).
drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select to authenticated
  using (bucket_id = 'restaurant-photos' and (owner_id = auth.uid()::text or public.can_see_photo(name)));

-- 올리기: 로그인한 사람만(예전엔 anon 도 가능했습니다).
drop policy if exists "restaurant photos public upload" on storage.objects;
drop policy if exists "photos upload" on storage.objects;
create policy "photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'restaurant-photos');

-- 지우기: 내가 올린 파일만.
drop policy if exists "photos delete own" on storage.objects;
create policy "photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'restaurant-photos' and owner_id = auth.uid()::text);
