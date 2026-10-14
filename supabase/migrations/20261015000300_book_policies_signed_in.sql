-- 기록장(연인) · 커뮤니티 정책을 로그인한 사용자(authenticated)에게만 겁니다.
-- 이 정책들은 anon 실행 권한을 뺀 함수(is_book_member · book_writable · record_book · shares_book ·
-- can_see_record · has_been)를 부릅니다. 역할을 비워 두면(public) 세션이 아직 없을 때의 요청(앱 시작 직후 등)이
-- 「permission denied for function is_book_member」로 실패합니다 — 이제는 빈 결과만 돌려받습니다.

alter policy "anniversary_picks read"  on public.anniversary_picks to authenticated;
alter policy "anniversary_picks write" on public.anniversary_picks to authenticated;
alter policy "book_members read"       on public.book_members      to authenticated;
alter policy "books edit"              on public.books             to authenticated;
alter policy "books read"              on public.books             to authenticated;
alter policy "shared profile read"     on public.profiles          to authenticated;
alter policy "record_notes read"       on public.record_notes      to authenticated;
alter policy "record_notes write"      on public.record_notes      to authenticated;
alter policy "restaurants delete"      on public.restaurants       to authenticated;
alter policy "restaurants insert"      on public.restaurants       to authenticated;
alter policy "restaurants read"        on public.restaurants       to authenticated;
alter policy "restaurants update"      on public.restaurants       to authenticated;
alter policy "wishes delete"           on public.wishes            to authenticated;
alter policy "wishes insert"           on public.wishes            to authenticated;
alter policy "wishes read"             on public.wishes            to authenticated;
alter policy "wishes update"           on public.wishes            to authenticated;

alter policy "cheers read"      on public.record_cheers   to authenticated;
alter policy "cheers write"     on public.record_cheers   to authenticated;
alter policy "comments read"    on public.record_comments to authenticated;
alter policy "comments write"   on public.record_comments to authenticated;
alter policy "reactions write"  on public.board_reactions to authenticated;
