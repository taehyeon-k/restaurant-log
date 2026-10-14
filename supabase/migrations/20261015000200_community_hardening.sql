-- 커뮤니티 마무리(보안 권고) — 로그인하지 않은(anon) 호출을 막고, 검색 경로를 고정합니다.
-- 정책 · 뷰 안에서 쓰는 함수라 authenticated 실행 권한은 그대로 둡니다.

alter function public.has_contact(text) set search_path = public;
alter function public.place_of(text, text, text) set search_path = public;

revoke execute on function public.is_friend(uuid, uuid) from public, anon;
revoke execute on function public.is_blocked(uuid) from public, anon;
revoke execute on function public.can_see_record(bigint) from public, anon;
revoke execute on function public.community_unseen() from public, anon;
revoke execute on function public.my_verified_count() from public, anon;
revoke execute on function public.has_been(bigint) from public, anon;

grant execute on function public.is_friend(uuid, uuid) to authenticated;
grant execute on function public.is_blocked(uuid) to authenticated;
grant execute on function public.can_see_record(bigint) to authenticated;
grant execute on function public.community_unseen() to authenticated;
grant execute on function public.my_verified_count() to authenticated;
grant execute on function public.has_been(bigint) to authenticated;
