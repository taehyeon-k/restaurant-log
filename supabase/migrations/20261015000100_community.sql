-- 커뮤니티 — 친구 · 추천 · 랭킹 · 게시판 (expo-app design_handoff_community README §Data).
--
-- restaurants 의 RLS(본인·함께 쓰는 기록장)는 건드리지 않습니다. 정책을 하나 더 얹으면 select('*') 로
-- 내 기록을 읽는 화면(앱·웹)에 친구 기록이 섞이기 때문입니다. 남의 기록은 아래 뷰(shared_records ·
-- board_feed · board_answer_rows)로만, 보여도 되는 칸만 읽습니다.

/* ───────────── 1) 공개 범위 · 프로필 ───────────── */

-- 기록 공개 범위. 기본은 나만 봄. 기록 작성 화면의 선택 UI 는 아직 설계 중입니다(record/edit.tsx TODO).
alter table public.restaurants add column if not exists visibility text not null default 'private';
alter table public.restaurants drop constraint if exists restaurants_visibility_check;
alter table public.restaurants add constraint restaurants_visibility_check check (visibility in ('private', 'friends', 'public'));

-- 랭킹 참여(기본 구경만) · 커뮤니티를 마지막으로 본 때(탭바 새 소식 점)
alter table public.profiles add column if not exists leaderboard_opt_in boolean not null default false;
alter table public.profiles add column if not exists last_seen_community_at timestamptz;

/* ───────────── 2) 친구 · 차단 ───────────── */

-- user_id 가 신청한 쪽, friend_id 가 받은 쪽. 받은 쪽이 accepted 로 바꿉니다.
create table if not exists public.friendships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

alter table public.friendships enable row level security;
drop policy if exists "friendships read" on public.friendships;
drop policy if exists "friendships request" on public.friendships;
drop policy if exists "friendships accept" on public.friendships;
drop policy if exists "friendships remove" on public.friendships;
create policy "friendships read"    on public.friendships for select using (auth.uid() in (user_id, friend_id));
create policy "friendships request" on public.friendships for insert with check (auth.uid() = user_id and status = 'pending');
create policy "friendships accept"  on public.friendships for update using (auth.uid() = friend_id) with check (auth.uid() = friend_id and status = 'accepted');
create policy "friendships remove"  on public.friendships for delete using (auth.uid() in (user_id, friend_id));

-- 숨기기 · 차단 — 그 사람의 기록 · 글 · 답이 내 화면에서 빠집니다.
create table if not exists public.user_blocks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "own blocks" on public.user_blocks;
create policy "own blocks" on public.user_blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted' and ((user_id = a and friend_id = b) or (user_id = b and friend_id = a))
  );
$$;

create or replace function public.is_blocked(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_blocks where user_id = auth.uid() and blocked_id = other);
$$;

-- 남에게 보여도 되는 프로필 칸만. (profiles 자체는 "own profile" 정책 그대로)
create or replace view public.public_profiles as
  select id, nickname, avatar_url, character_id, title_label_id, leaderboard_opt_in
  from public.profiles
  where nickname is not null;
revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;

/* ───────────── 3) 친구 소식 ───────────── */

-- 가게를 하나로 묶는 열쇠 — 앱 groupPlaces 와 같은 기준.
create or replace function public.place_of(p_place_key text, p_name text, p_address text) returns text
language sql immutable as $$
  select coalesce(p_place_key, lower(p_name || '|' || coalesce(p_address, '')));
$$;

-- 내가 볼 수 있는 남의 기록: 전체 공개, 또는 친구 공개 + 친구. 메모(review)는 공유 카드에 쓰므로 넣고, 정확도(acc)·메뉴 값은 뺍니다.
create or replace view public.shared_records as
  select r.id, r.user_id, r.kind, r.name, r.category, r.region, r.address, r.rating, r.review,
         r.visited_at, r.created_at, r.verified, r.verified_at, r.photo_urls, r.cover_index, r.photo_url,
         r.lat, r.lng, r.place_key, r.visibility,
         public.place_of(r.place_key, r.name, r.address) as place,
         public.is_friend(auth.uid(), r.user_id) as by_friend
  from public.restaurants r
  where coalesce(r.pending, false) = false
    and r.user_id <> auth.uid()
    and (r.visibility = 'public' or (r.visibility = 'friends' and public.is_friend(auth.uid(), r.user_id)))
    and not public.is_blocked(r.user_id);
revoke all on public.shared_records from anon;
grant select on public.shared_records to authenticated;

create or replace function public.can_see_record(p_record_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurants r
    where r.id = p_record_id
      and (r.user_id = auth.uid() or r.visibility = 'public' or (r.visibility = 'friends' and public.is_friend(auth.uid(), r.user_id)))
  );
$$;

-- 링크 · 연락처가 들었는지(게시판 · 댓글 공통).
create or replace function public.has_contact(t text) returns boolean
language sql immutable as $$
  select coalesce(t, '') ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|kr|co|io|me|ly|gl|link)(/|\s|$)|open\.kakao)'
      or coalesce(t, '') ~ '0[0-9]{1,2}[- .)]?[0-9]{3,4}[- .]?[0-9]{4}';
$$;

-- 공감 · 댓글 (친구 소식 카드 아래)
create table if not exists public.record_cheers (
  record_id  bigint not null references public.restaurants(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (record_id, user_id)
);
create table if not exists public.record_comments (
  id         bigserial primary key,
  record_id  bigint not null references public.restaurants(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       varchar(120) not null check (length(trim(body)) > 0 and not public.has_contact(body)),
  created_at timestamptz not null default now()
);
create index if not exists record_comments_record_idx on public.record_comments (record_id);

alter table public.record_cheers enable row level security;
alter table public.record_comments enable row level security;
drop policy if exists "cheers read" on public.record_cheers;
drop policy if exists "cheers write" on public.record_cheers;
drop policy if exists "cheers remove" on public.record_cheers;
drop policy if exists "comments read" on public.record_comments;
drop policy if exists "comments write" on public.record_comments;
drop policy if exists "comments remove" on public.record_comments;
create policy "cheers read"     on public.record_cheers for select using (public.can_see_record(record_id));
create policy "cheers write"    on public.record_cheers for insert with check (auth.uid() = user_id and public.can_see_record(record_id));
create policy "cheers remove"   on public.record_cheers for delete using (auth.uid() = user_id);
create policy "comments read"   on public.record_comments for select using (public.can_see_record(record_id) and not public.is_blocked(user_id));
create policy "comments write"  on public.record_comments for insert with check (auth.uid() = user_id and public.can_see_record(record_id));
create policy "comments remove" on public.record_comments for delete using (auth.uid() = user_id);

-- 댓글 단 사람의 이름 — 댓글 시트가 씁니다.
create or replace view public.record_comment_rows as
  select c.id, c.record_id, c.user_id, c.body, c.created_at, p.nickname, p.avatar_url, p.character_id
  from public.record_comments c join public.profiles p on p.id = c.user_id
  where public.can_see_record(c.record_id) and not public.is_blocked(c.user_id);
revoke all on public.record_comment_rows from anon;
grant select on public.record_comment_rows to authenticated;

-- 탭바 새 소식 점: 커뮤니티를 마지막으로 본 뒤 친구가 공유한 기록 수.
create or replace function public.community_unseen() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.restaurants r
  where coalesce(r.pending, false) = false
    and r.visibility in ('friends', 'public')
    and public.is_friend(auth.uid(), r.user_id)
    and r.created_at > coalesce((select last_seen_community_at from public.profiles where id = auth.uid()), '-infinity'::timestamptz);
$$;

/* ───────────── 4) 랭킹 ───────────── */

-- 참여한 사람만, 인증된 방문만, 같은 가게는 하루 한 번. 기록 내용(가게 · 위치 · 사진)은 돌려주지 않고 숫자만.
-- p_board: verified · explorer · regular · district · streak · category(p_category)
-- p_period: week · month · quarter (한국 시간) / p_scope: friends(나 + 친구) · all
create or replace function public.leaderboard(p_board text, p_period text, p_scope text, p_category text default null)
returns table (user_id uuid, nickname text, avatar_url text, character_id text, title_label_id text, value int, rank int)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select (case p_period
              when 'week' then date_trunc('week', now() at time zone 'Asia/Seoul')
              when 'quarter' then date_trunc('quarter', now() at time zone 'Asia/Seoul')
              else date_trunc('month', now() at time zone 'Asia/Seoul')
            end)::date as since,
           date_trunc('week', now() at time zone 'Asia/Seoul')::date as this_week
  ),
  people as (
    select p.id, p.nickname, p.avatar_url, p.character_id, p.title_label_id
    from public.profiles p
    where p.leaderboard_opt_in and p.nickname is not null
      and (p_scope = 'all' or p.id = auth.uid() or public.is_friend(auth.uid(), p.id))
  ),
  visits as (
    select distinct on (r.user_id, place, day)
      r.user_id,
      public.place_of(r.place_key, r.name, r.address) as place,
      (r.verified_at at time zone 'Asia/Seoul')::date as day,
      r.category,
      substring(coalesce(r.address, '') from '([가-힣]+[구군])(\s|$)') as gu
    from public.restaurants r
    join people pe on pe.id = r.user_id
    where r.verified and r.verified_at is not null and coalesce(r.pending, false) = false
  ),
  in_period as (select v.* from visits v, bounds b where v.day >= b.since),
  firsts as (
    select v.user_id, v.place, min(v.day) as first_day from visits v group by v.user_id, v.place
  ),
  per_place as (
    select v.user_id, v.place, count(*) as n from in_period v group by v.user_id, v.place
  ),
  -- 꾸준함: 이번 주(또는 지난주)에서 끝나는 연속 주 수
  wk as (select distinct v.user_id, date_trunc('week', v.day)::date as w from visits v),
  isl as (select wk.user_id, wk.w, wk.w - (row_number() over (partition by wk.user_id order by wk.w) * 7)::int as grp from wk),
  runs as (select isl.user_id, max(isl.w) as last_w, count(*) as len from isl group by isl.user_id, isl.grp),
  scores as (
    select pe.id as uid,
      (case p_board
        when 'verified' then (select count(*) from in_period v where v.user_id = pe.id)
        when 'category' then (select count(*) from in_period v where v.user_id = pe.id and v.category = p_category)
        when 'explorer' then (select count(*) from firsts f, bounds b where f.user_id = pe.id and f.first_day >= b.since)
        when 'regular'  then (select coalesce(max(pp.n) - 1, 0) from per_place pp where pp.user_id = pe.id)
        when 'district' then (select count(distinct v.gu) from in_period v where v.user_id = pe.id)
        when 'streak'   then (select coalesce(max(ru.len), 0) from runs ru, bounds b where ru.user_id = pe.id and ru.last_w >= b.this_week - 7)
        else 0
      end)::int as value
    from people pe
  )
  select pe.id, pe.nickname, pe.avatar_url, pe.character_id, pe.title_label_id, s.value,
         (rank() over (order by s.value desc))::int
  from scores s join people pe on pe.id = s.uid
  where s.value > 0
  order by 7, pe.nickname;
$$;
revoke execute on function public.leaderboard(text, text, text, text) from public, anon;
grant execute on function public.leaderboard(text, text, text, text) to authenticated;

/* ───────────── 5) 게시판 ───────────── */

-- 이번 주 주제 — DINARY 가 엽니다(대시보드에서 직접 넣습니다). 앱은 읽기만.
create table if not exists public.board_themes (
  id         bigserial primary key,
  title      text not null,
  starts_on  date not null,
  ends_on    date not null,
  created_at timestamptz not null default now()
);
alter table public.board_themes enable row level security;
drop policy if exists "themes read" on public.board_themes;
create policy "themes read" on public.board_themes for select to authenticated using (true);

insert into public.board_themes (title, starts_on, ends_on)
select '비 오는 날의 국물', date '2026-10-12', date '2026-10-18'
where not exists (select 1 from public.board_themes);

-- 글은 세 형식뿐. 사진 · 가게는 글쓴이의 인증 기록(record_id)에서만 옵니다.
create table if not exists public.board_posts (
  id         bigserial primary key,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type       text not null check (type in ('record_share', 'theme_answer', 'ask')),
  record_id  bigint references public.restaurants(id) on delete cascade,
  theme_id   bigint references public.board_themes(id) on delete set null,
  ask_area   text,
  ask_tags   text[] not null default '{}',
  -- 동네(구) 거르기 — "서울 성동구" 꼴
  area       text,
  note       varchar(120),
  created_at timestamptz not null default now(),
  check ((type = 'ask') = (record_id is null)),
  check (type <> 'ask' or ask_area is not null)
);
create index if not exists board_posts_created_idx on public.board_posts (created_at desc);
create index if not exists board_posts_author_idx on public.board_posts (author_id, created_at desc);

create table if not exists public.board_answers (
  id         bigserial primary key,
  post_id    bigint not null references public.board_posts(id) on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_id  bigint not null references public.restaurants(id) on delete cascade,
  reason     varchar(60),
  created_at timestamptz not null default now(),
  unique (post_id, author_id, record_id)
);
create index if not exists board_answers_post_idx on public.board_answers (post_id);

create table if not exists public.board_reactions (
  post_id    bigint not null references public.board_posts(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('want', 'been')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

create table if not exists public.reports (
  id          bigserial primary key,
  target_type text not null check (target_type in ('post', 'answer', 'comment', 'user')),
  target_id   text not null,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);

alter table public.board_posts enable row level security;
alter table public.board_answers enable row level security;
alter table public.board_reactions enable row level security;
alter table public.reports enable row level security;

-- 글 · 답 쓰기는 아래 함수로만(문턱 · 하루 제한 · 인증 기록 확인). 지우기만 직접.
drop policy if exists "posts read" on public.board_posts;
drop policy if exists "posts remove" on public.board_posts;
drop policy if exists "answers read" on public.board_answers;
drop policy if exists "answers remove" on public.board_answers;
drop policy if exists "reactions read" on public.board_reactions;
drop policy if exists "reactions write" on public.board_reactions;
drop policy if exists "reactions remove" on public.board_reactions;
drop policy if exists "reports write" on public.reports;
create policy "posts read"       on public.board_posts for select to authenticated using (not public.is_blocked(author_id));
create policy "posts remove"     on public.board_posts for delete using (auth.uid() = author_id);
create policy "answers read"     on public.board_answers for select to authenticated using (not public.is_blocked(author_id));
create policy "answers remove"   on public.board_answers for delete using (auth.uid() = author_id);
create policy "reactions read"   on public.board_reactions for select to authenticated using (true);
create policy "reports write"    on public.reports for insert with check (auth.uid() = reporter_id);

-- 인증 기록 수(보관함 제외)
create or replace function public.my_verified_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.restaurants
  where user_id = auth.uid() and verified is true and coalesce(pending, false) = false;
$$;

-- 그 글의 가게에 내 인증 기록이 있는지 — 「가봤어요」는 이때만.
create or replace function public.has_been(p_post_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.board_posts p
    join public.restaurants pr on pr.id = p.record_id
    join public.restaurants mine on mine.user_id = auth.uid() and mine.verified and coalesce(mine.pending, false) = false
    where p.id = p_post_id
      and (public.place_of(mine.place_key, mine.name, mine.address) = public.place_of(pr.place_key, pr.name, pr.address)
           or lower(replace(mine.name, ' ', '')) = lower(replace(pr.name, ' ', '')))
  );
$$;

create policy "reactions write"  on public.board_reactions for insert
  with check (auth.uid() = user_id and (kind = 'want' or public.has_been(post_id)));
create policy "reactions remove" on public.board_reactions for delete using (auth.uid() = user_id);

-- 글 올리기. 문턱: 인증 기록 5건 · 하루 3개(한국 날짜) · 링크/연락처 없음 · 기록은 내 것이고 인증된 것.
create or replace function public.create_board_post(
  p_type text, p_record_id bigint default null, p_theme_id bigint default null,
  p_ask_area text default null, p_ask_tags text[] default '{}', p_area text default null, p_note text default null
) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id bigint;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_type not in ('record_share', 'theme_answer', 'ask') then raise exception 'bad_type'; end if;
  if public.my_verified_count() < 5 then raise exception 'need_5_verified'; end if;
  if (select count(*) from public.board_posts
      where author_id = uid
        and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) >= 3 then
    raise exception 'daily_limit';
  end if;
  if public.has_contact(note) or public.has_contact(p_ask_area) then raise exception 'no_contact'; end if;

  if p_type = 'ask' then
    if p_ask_area is null or length(trim(p_ask_area)) = 0 then raise exception 'need_area'; end if;
    if coalesce(length(note), 0) > 60 then raise exception 'note_too_long'; end if;
    if coalesce(array_length(p_ask_tags, 1), 0) > 3 then raise exception 'too_many_tags'; end if;
  else
    if coalesce(length(note), 0) > 120 then raise exception 'note_too_long'; end if;
    if not exists (select 1 from public.restaurants
                   where id = p_record_id and user_id = uid and verified and coalesce(pending, false) = false) then
      raise exception 'record_not_verified';
    end if;
    if p_type = 'theme_answer' and not exists (
      select 1 from public.board_themes
      where id = p_theme_id and (now() at time zone 'Asia/Seoul')::date between starts_on and ends_on) then
      raise exception 'theme_closed';
    end if;
  end if;

  insert into public.board_posts (author_id, type, record_id, theme_id, ask_area, ask_tags, area, note)
  values (uid, p_type,
          case when p_type = 'ask' then null else p_record_id end,
          case when p_type = 'theme_answer' then p_theme_id else null end,
          case when p_type = 'ask' then trim(p_ask_area) else null end,
          case when p_type = 'ask' then coalesce(p_ask_tags, '{}') else '{}' end,
          p_area, note)
  returning id into new_id;
  return new_id;
end $$;

-- 어디 가요? 에 답하기 — 내가 인증한 가게로만.
create or replace function public.answer_board_post(p_post_id bigint, p_record_id bigint, p_reason text default null)
returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id bigint;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.board_posts where id = p_post_id and type = 'ask') then raise exception 'not_ask'; end if;
  if not exists (select 1 from public.restaurants
                 where id = p_record_id and user_id = uid and verified and coalesce(pending, false) = false) then
    raise exception 'record_not_verified';
  end if;
  if public.has_contact(reason) then raise exception 'no_contact'; end if;
  if coalesce(length(reason), 0) > 60 then raise exception 'note_too_long'; end if;

  insert into public.board_answers (post_id, author_id, record_id, reason)
  values (p_post_id, uid, p_record_id, reason)
  on conflict (post_id, author_id, record_id) do update set reason = coalesce(excluded.reason, board_answers.reason)
  returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.create_board_post(text, bigint, bigint, text, text[], text, text) from public, anon;
revoke execute on function public.answer_board_post(bigint, bigint, text) from public, anon;
grant execute on function public.create_board_post(text, bigint, bigint, text, text[], text, text) to authenticated;
grant execute on function public.answer_board_post(bigint, bigint, text) to authenticated;

-- 게시판 목록 — 글 + 글쓴이 + (기록 글이면) 가게 · 대표 사진 · 별점 · 인증 시각 + 반응 수.
create or replace view public.board_feed as
  select p.id, p.type, p.author_id, p.note, p.created_at, p.theme_id, p.ask_area, p.ask_tags, p.area,
         a.nickname, a.avatar_url, a.character_id, a.title_label_id,
         r.name as place_name, r.kind, r.category, r.address, r.rating, r.photo_urls, r.cover_index, r.photo_url,
         r.verified_at, r.lat, r.lng,
         case when r.id is null then null else public.place_of(r.place_key, r.name, r.address) end as place,
         (select count(*) from public.board_reactions x where x.post_id = p.id and x.kind = 'want')::int as want_count,
         (select count(*) from public.board_reactions x where x.post_id = p.id and x.kind = 'been')::int as been_count,
         exists (select 1 from public.board_reactions x where x.post_id = p.id and x.kind = 'want' and x.user_id = auth.uid()) as my_want,
         exists (select 1 from public.board_reactions x where x.post_id = p.id and x.kind = 'been' and x.user_id = auth.uid()) as my_been,
         (select count(*) from public.board_answers ba where ba.post_id = p.id and not public.is_blocked(ba.author_id))::int as answer_count,
         (select min(r2.name)
            from public.board_answers ba join public.restaurants r2 on r2.id = ba.record_id
            where ba.post_id = p.id and not public.is_blocked(ba.author_id)
            group by public.place_of(r2.place_key, r2.name, r2.address)
            order by count(*) desc, min(ba.created_at)
            limit 1) as top_answer
  from public.board_posts p
  join public.profiles a on a.id = p.author_id
  left join public.restaurants r on r.id = p.record_id
  where not public.is_blocked(p.author_id);
revoke all on public.board_feed from anon;
grant select on public.board_feed to authenticated;

-- 어디 가요? 답 — 한 줄에 답 하나. 같은 가게(place)끼리 앱이 묶어 「N명이 고름」으로 보여 줍니다.
create or replace view public.board_answer_rows as
  select ba.id, ba.post_id, ba.author_id, ba.reason, ba.created_at,
         a.nickname, a.avatar_url, a.character_id, a.title_label_id,
         r.name as place_name, r.kind, r.category, r.address, r.lat, r.lng, r.verified_at,
         public.place_of(r.place_key, r.name, r.address) as place
  from public.board_answers ba
  join public.profiles a on a.id = ba.author_id
  join public.restaurants r on r.id = ba.record_id
  where not public.is_blocked(ba.author_id);
revoke all on public.board_answer_rows from anon;
grant select on public.board_answer_rows to authenticated;
