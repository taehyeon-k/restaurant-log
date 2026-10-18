-- 게시판 개편(expo-app/HANDOFF-board-v2.md) — 자유 · 주제 · 맛집 · 카페 · 코스 다섯 칸, 제목 · 본문 자유 입력,
-- 태그 · 투표 · 댓글(답글 한 단계) · 관리자(공지 · 숨김 · 신고함 · 정지 · 주제).
--
-- 그대로인 것: 올리기 문턱(인증 기록 5건) · 하루 3개 · 랭킹(인증된 방문만) · 친구 소식 댓글(record_comments).
-- 바뀌는 것: 내 기록이면 붙일 수 있음(인증 안 된 것도, 인증이면 「✓ 인증」 표시만) · 「가봤어요」는 누구나.
-- board_answers(어디 가요? 답)는 새 답을 받지 않고, 기존 답은 board_comments 로 옮깁니다. ask_area · ask_tags · note 칸은 남겨 둡니다.

/* ───────────── 1) 관리자 역할 ───────────── */

alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin'));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 앱(로그인한 요청)에서는 role 을 바꿀 수 없습니다 — 관리자 지정은 SQL Editor(auth.uid() 가 없음)에서만.
create or replace function public.guard_profile_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.role := 'user';
  elsif new.role is distinct from old.role then
    raise exception 'role_locked';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
before insert or update on public.profiles
for each row execute function public.guard_profile_role();

-- 남에게 보여도 되는 프로필 칸 + role(「DINARY 운영」 표시). 칸은 뒤에만 붙입니다.
create or replace view public.public_profiles as
  select id, nickname, avatar_url, character_id, title_label_id, leaderboard_opt_in, role
  from public.profiles
  where nickname is not null;

/* ───────────── 2) 정지 ───────────── */

create table if not exists public.user_sanctions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  until      timestamptz,          -- null = 영구
  reason     text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.user_sanctions enable row level security;
drop policy if exists "sanctions admin read" on public.user_sanctions;
create policy "sanctions admin read" on public.user_sanctions for select to authenticated using (public.is_admin());

-- 정지는 기록장에 영향을 주지 않고, 게시판 글 · 댓글 쓰기만 막습니다.
create or replace function public.is_sanctioned(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_sanctions where user_id = p_user and (until is null or until > now()));
$$;

create table if not exists public.moderation_log (
  id          bigserial primary key,
  admin_id    uuid not null references auth.users(id),
  action      text not null,       -- hide_post · unhide_post · hide_comment · unhide_comment · sanction · unsanction · pin · unpin · notice · theme · resolve_report
  target_type text,
  target_id   text,
  note        text,
  created_at  timestamptz not null default now()
);
alter table public.moderation_log enable row level security;
drop policy if exists "modlog admin read" on public.moderation_log;
create policy "modlog admin read" on public.moderation_log for select to authenticated using (public.is_admin());

/* ───────────── 3) 글(board_posts) ───────────── */

alter table public.board_posts drop constraint if exists board_posts_type_check;
alter table public.board_posts drop constraint if exists board_posts_check;
alter table public.board_posts drop constraint if exists board_posts_check1;

alter table public.board_posts add column if not exists title     varchar(60);
alter table public.board_posts add column if not exists body      varchar(2000);
alter table public.board_posts add column if not exists tags      text[] not null default '{}';
alter table public.board_posts add column if not exists pinned    boolean not null default false;   -- 공지
alter table public.board_posts add column if not exists hidden_at timestamptz;                      -- 관리자 숨김
alter table public.board_posts add column if not exists hidden_by uuid references auth.users(id);
alter table public.board_posts add column if not exists edited_at timestamptz;

-- 기존 글 옮기기 — 기록 나눔은 기록 종류(kind)로 맛집 / 카페.
update public.board_posts set type = 'theme' where type = 'theme_answer';
update public.board_posts set type = 'free', tags = ask_tags, title = ask_area where type = 'ask';
update public.board_posts p set type = case when r.kind = 'cafe' then 'cafe' else 'food' end
  from public.restaurants r where p.type = 'record_share' and r.id = p.record_id;
update public.board_posts set body = note where body is null and note is not null;

alter table public.board_posts drop constraint if exists board_posts_tags_max;
alter table public.board_posts add constraint board_posts_type_check check (type in ('free', 'theme', 'food', 'cafe', 'course'));
alter table public.board_posts add constraint board_posts_tags_max check (coalesce(array_length(tags, 1), 0) <= 5);
create index if not exists board_posts_tags_idx on public.board_posts using gin (tags);
create index if not exists board_posts_type_idx on public.board_posts (type, created_at desc);

-- 숨긴 글은 글쓴이 · 관리자만 표에서 읽습니다(목록 · 상세는 board_feed 뷰).
drop policy if exists "posts read" on public.board_posts;
create policy "posts read" on public.board_posts for select to authenticated
  using (not public.is_blocked(author_id) and (hidden_at is null or author_id = auth.uid() or public.is_admin()));

-- 이번 주 주제 — 설명 칸 + 관리자가 앱에서 엽니다.
alter table public.board_themes add column if not exists description varchar(200);

/* ───────────── 4) 코스 ───────────── */

create table if not exists public.board_post_records (
  post_id   bigint not null references public.board_posts(id) on delete cascade,
  position  int    not null check (position between 1 and 5),
  record_id bigint not null references public.restaurants(id) on delete cascade,
  memo      varchar(60),
  primary key (post_id, position)
);
alter table public.board_post_records enable row level security;
drop policy if exists "post records read" on public.board_post_records;
create policy "post records read" on public.board_post_records for select to authenticated using (true);

/* ───────────── 5) 투표(자유 게시판만) ───────────── */

create table if not exists public.board_polls (
  post_id   bigint primary key references public.board_posts(id) on delete cascade,
  closes_at timestamptz not null
);
create table if not exists public.board_poll_options (
  id       bigserial primary key,
  post_id  bigint not null references public.board_polls(post_id) on delete cascade,
  position int not null check (position between 1 and 5),
  label    varchar(40) not null,
  unique (post_id, position)
);
create table if not exists public.board_poll_votes (
  post_id    bigint not null references public.board_polls(post_id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  option_id  bigint not null references public.board_poll_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)          -- 한 사람 한 표
);
alter table public.board_polls enable row level security;
alter table public.board_poll_options enable row level security;
alter table public.board_poll_votes enable row level security;
drop policy if exists "polls read" on public.board_polls;
drop policy if exists "poll options read" on public.board_poll_options;
drop policy if exists "poll votes own" on public.board_poll_votes;
create policy "polls read"        on public.board_polls        for select to authenticated using (true);
create policy "poll options read" on public.board_poll_options for select to authenticated using (true);
create policy "poll votes own"    on public.board_poll_votes   for select to authenticated using (auth.uid() = user_id);

-- 투표 · 바꾸기 — 마감 전, 그 글의 선택지만.
create or replace function public.vote_poll(p_post_id bigint, p_option_id bigint) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.board_polls where post_id = p_post_id and closes_at > now()) then raise exception 'poll_closed'; end if;
  if not exists (select 1 from public.board_poll_options where id = p_option_id and post_id = p_post_id) then raise exception 'bad_option'; end if;
  insert into public.board_poll_votes (post_id, user_id, option_id) values (p_post_id, uid, p_option_id)
  on conflict (post_id, user_id) do update set option_id = excluded.option_id, created_at = now();
end $$;

-- 결과는 투표한 사람 · 마감 뒤에만. 그 전에는 count 가 null.
create or replace function public.poll_results(p_post_id bigint)
returns table (option_id bigint, label text, count int, mine boolean)
language sql stable security definer set search_path = public as $$
  with st as (
    select exists (select 1 from public.board_poll_votes where post_id = p_post_id and user_id = auth.uid())
        or coalesce((select closes_at <= now() from public.board_polls where post_id = p_post_id), false) as open_results
  )
  select o.id, o.label::text,
         case when st.open_results then (select count(*) from public.board_poll_votes v where v.option_id = o.id)::int end,
         exists (select 1 from public.board_poll_votes v where v.option_id = o.id and v.user_id = auth.uid())
  from public.board_poll_options o, st
  where o.post_id = p_post_id
  order by o.position;
$$;

/* ───────────── 6) 댓글 ───────────── */

create table if not exists public.board_comments (
  id         bigserial primary key,
  post_id    bigint not null references public.board_posts(id) on delete cascade,
  parent_id  bigint references public.board_comments(id) on delete cascade,  -- 답글 한 단계
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       varchar(500) not null check (length(trim(body)) > 0),
  record_id  bigint references public.restaurants(id) on delete set null,     -- 붙인 내 기록(선택)
  hidden_at  timestamptz,
  hidden_by  uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists board_comments_post_idx on public.board_comments (post_id, created_at);

alter table public.board_comments enable row level security;
drop policy if exists "board comments read" on public.board_comments;
drop policy if exists "board comments remove" on public.board_comments;
create policy "board comments read"   on public.board_comments for select to authenticated
  using (not public.is_blocked(author_id) and (hidden_at is null or author_id = auth.uid() or public.is_admin()));
create policy "board comments remove" on public.board_comments for delete to authenticated using (auth.uid() = author_id);

-- 댓글 쓰기 — 문턱(5건)은 없고, 정지 · 링크 · 답글의 답글만 막습니다.
create or replace function public.add_board_comment(p_post_id bigint, p_body text, p_parent_id bigint default null, p_record_id bigint default null)
returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  new_id bigint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if public.is_sanctioned(uid) then raise exception 'sanctioned'; end if;
  if length(v_body) = 0 then raise exception 'empty'; end if;
  if length(v_body) > 500 then raise exception 'too_long'; end if;
  if public.has_contact(v_body) then raise exception 'no_contact'; end if;
  if not exists (select 1 from public.board_posts where id = p_post_id and hidden_at is null and not public.is_blocked(author_id)) then
    raise exception 'no_post';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.board_comments where id = p_parent_id and post_id = p_post_id and parent_id is null) then
    raise exception 'one_level';
  end if;
  if p_record_id is not null and not exists (
    select 1 from public.restaurants where id = p_record_id and user_id = uid and coalesce(pending, false) = false) then
    raise exception 'not_my_record';
  end if;
  insert into public.board_comments (post_id, parent_id, author_id, body, record_id)
  values (p_post_id, p_parent_id, uid, v_body, p_record_id)
  returning id into new_id;
  return new_id;
end $$;

-- 기존 「어디 가요?」 답 → 댓글(한 번만).
insert into public.board_comments (post_id, author_id, body, record_id, created_at)
select ba.post_id, ba.author_id, left(coalesce(nullif(trim(ba.reason), ''), r.name), 500), ba.record_id, ba.created_at
from public.board_answers ba
join public.restaurants r on r.id = ba.record_id
where not exists (
  select 1 from public.board_comments c
  where c.post_id = ba.post_id and c.author_id = ba.author_id and c.record_id = ba.record_id and c.created_at = ba.created_at
);

drop function if exists public.answer_board_post(bigint, bigint, text);

/* ───────────── 7) 반응 ───────────── */

-- 맛집 · 카페: want · been / 코스: want / 주제: cheer / 자유: 없음. 「가봤어요」는 이제 누구나.
alter table public.board_reactions drop constraint if exists board_reactions_kind_check;
alter table public.board_reactions add constraint board_reactions_kind_check check (kind in ('want', 'been', 'cheer'));
drop policy if exists "reactions write" on public.board_reactions;
create policy "reactions write" on public.board_reactions for insert to authenticated with check (auth.uid() = user_id);

/* ───────────── 8) 신고 · 공지 ───────────── */

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'answer', 'comment', 'board_comment', 'user', 'tour'));
alter table public.reports add column if not exists resolved_at timestamptz;
alter table public.reports add column if not exists resolved_by uuid references auth.users(id);
drop policy if exists "reports admin read" on public.reports;
drop policy if exists "reports admin update" on public.reports;
create policy "reports admin read"   on public.reports for select to authenticated using (public.is_admin());
create policy "reports admin update" on public.reports for update to authenticated using (public.is_admin());

create table if not exists public.app_notices (       -- 앱 전체 공지(상단 배너). 푸시 발송은 TODO.
  id         bigserial primary key,
  title      varchar(60) not null,
  body       varchar(500),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.app_notices enable row level security;
drop policy if exists "notices read" on public.app_notices;
drop policy if exists "notices admin write" on public.app_notices;
create policy "notices read"        on public.app_notices for select to authenticated using (true);
create policy "notices admin write" on public.app_notices for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "themes admin insert" on public.board_themes;
drop policy if exists "themes admin update" on public.board_themes;
create policy "themes admin insert" on public.board_themes for insert to authenticated with check (public.is_admin());
create policy "themes admin update" on public.board_themes for update to authenticated using (public.is_admin()) with check (public.is_admin());

/* ───────────── 9) 관리자 동작 — 모두 is_admin() 확인 후 moderation_log 에 한 줄 ───────────── */

create or replace function public.admin_log(p_action text, p_type text, p_id text, p_note text default null) returns void
language sql volatile security definer set search_path = public as $$
  insert into public.moderation_log (admin_id, action, target_type, target_id, note) values (auth.uid(), p_action, p_type, p_id, p_note);
$$;
revoke execute on function public.admin_log(text, text, text, text) from public, anon, authenticated;

create or replace function public.admin_hide_post(p_id bigint, p_hide boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.board_posts
     set hidden_at = case when p_hide then now() end, hidden_by = case when p_hide then auth.uid() end
   where id = p_id;
  perform public.admin_log(case when p_hide then 'hide_post' else 'unhide_post' end, 'post', p_id::text);
end $$;

create or replace function public.admin_hide_comment(p_id bigint, p_hide boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.board_comments
     set hidden_at = case when p_hide then now() end, hidden_by = case when p_hide then auth.uid() end
   where id = p_id;
  perform public.admin_log(case when p_hide then 'hide_comment' else 'unhide_comment' end, 'board_comment', p_id::text);
end $$;

create or replace function public.admin_pin_post(p_id bigint, p_pin boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.board_posts set pinned = p_pin where id = p_id;
  perform public.admin_log(case when p_pin then 'pin' else 'unpin' end, 'post', p_id::text);
end $$;

create or replace function public.admin_sanction(p_user uuid, p_until timestamptz, p_reason text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  insert into public.user_sanctions (user_id, until, reason, created_by) values (p_user, p_until, p_reason, auth.uid())
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, created_by = excluded.created_by, created_at = now();
  perform public.admin_log('sanction', 'user', p_user::text, coalesce(p_until::text, 'forever') || coalesce(' · ' || p_reason, ''));
end $$;

create or replace function public.admin_unsanction(p_user uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  delete from public.user_sanctions where user_id = p_user;
  perform public.admin_log('unsanction', 'user', p_user::text);
end $$;

create or replace function public.admin_resolve_report(p_id bigint, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.reports set resolved_at = now(), resolved_by = auth.uid() where id = p_id;
  perform public.admin_log('resolve_report', 'report', p_id::text, p_note);
end $$;

create or replace function public.admin_create_notice(p_title text, p_body text default null, p_ends_at timestamptz default null) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare new_id bigint;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'need_title'; end if;
  insert into public.app_notices (title, body, ends_at, created_by)
  values (trim(p_title), nullif(trim(coalesce(p_body, '')), ''), p_ends_at, auth.uid())
  returning id into new_id;
  perform public.admin_log('notice', 'app_notice', new_id::text, trim(p_title));
  return new_id;
end $$;

-- 이번 주 주제 열기 · 고치기(p_id 가 있으면 고치기).
create or replace function public.admin_save_theme(p_title text, p_starts_on date, p_ends_on date, p_description text default null, p_id bigint default null) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare the_id bigint;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'need_title'; end if;
  if p_ends_on < p_starts_on then raise exception 'bad_dates'; end if;
  if p_id is null then
    insert into public.board_themes (title, description, starts_on, ends_on)
    values (trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_starts_on, p_ends_on)
    returning id into the_id;
  else
    update public.board_themes
       set title = trim(p_title), description = nullif(trim(coalesce(p_description, '')), ''), starts_on = p_starts_on, ends_on = p_ends_on
     where id = p_id
    returning id into the_id;
  end if;
  perform public.admin_log('theme', 'board_theme', the_id::text, trim(p_title));
  return the_id;
end $$;

/* ───────────── 10) 글 올리기 · 고치기 ───────────── */

-- 태그 다듬기 — # · 공백 빼고 소문자, 1~20자, 겹치면 하나만, 5개까지.
create or replace function public.norm_tags(p_tags text[]) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(t order by first_pos), '{}')
  from (
    select t, min(pos) as first_pos
    from (
      select lower(regexp_replace(raw, '[#\s]', '', 'g')) as t, pos
      from unnest(coalesce(p_tags, '{}')) with ordinality as u(raw, pos)
    ) x
    where length(t) between 1 and 20
    group by t
  ) y;
$$;

drop function if exists public.create_board_post(text, bigint, bigint, text, text[], text, text);

create or replace function public.create_board_post(
  p_type text, p_title text, p_body text default null, p_tags text[] default '{}',
  p_record_id bigint default null,          -- food · cafe 필수, free · theme 선택
  p_course jsonb default null,              -- course: [{record_id, memo}] 2~5개
  p_theme_id bigint default null,           -- theme 필수(열린 주제)
  p_poll jsonb default null,                -- free 만: {options: [..2~5], days: 1~7}
  p_area text default null,
  p_pinned boolean default false            -- 관리자만
) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  admin  boolean := public.is_admin();
  v_title text := trim(coalesce(p_title, ''));
  v_body  text := nullif(trim(coalesce(p_body, '')), '');
  v_tags  text[] := public.norm_tags(p_tags);
  new_id bigint;
  item   jsonb;
  pos    int := 0;
  rid    bigint;
  v_memo text;
  opts   jsonb;
  v_days int;
  lbl    text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_type not in ('free', 'theme', 'food', 'cafe', 'course') then raise exception 'bad_type'; end if;
  if public.is_sanctioned(uid) then raise exception 'sanctioned'; end if;
  if not admin and public.my_verified_count() < 5 then raise exception 'need_5_verified'; end if;
  if not admin and (select count(*) from public.board_posts
      where author_id = uid
        and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) >= 3 then
    raise exception 'daily_limit';
  end if;
  if length(v_title) = 0 then raise exception 'need_title'; end if;
  if length(v_title) > 60 or coalesce(length(v_body), 0) > 2000 then raise exception 'too_long'; end if;
  if coalesce(array_length(v_tags, 1), 0) > 5 then raise exception 'too_many_tags'; end if;
  if public.has_contact(v_title) or public.has_contact(v_body) then raise exception 'no_contact'; end if;

  if p_type in ('food', 'cafe') then
    if not exists (select 1 from public.restaurants
                   where id = p_record_id and user_id = uid and coalesce(pending, false) = false
                     and (p_type = 'cafe') = (kind = 'cafe')) then
      raise exception 'not_my_record';
    end if;
  elsif p_type in ('free', 'theme') and p_record_id is not null then
    if not exists (select 1 from public.restaurants where id = p_record_id and user_id = uid and coalesce(pending, false) = false) then
      raise exception 'not_my_record';
    end if;
  end if;

  if p_type = 'theme' and not exists (
    select 1 from public.board_themes
    where id = p_theme_id and (now() at time zone 'Asia/Seoul')::date between starts_on and ends_on) then
    raise exception 'theme_closed';
  end if;

  if p_type = 'course' then
    if jsonb_typeof(p_course) is distinct from 'array' or jsonb_array_length(p_course) not between 2 and 5 then
      raise exception 'course_size';
    end if;
    if (select count(distinct (e->>'record_id')) from jsonb_array_elements(p_course) e) <> jsonb_array_length(p_course) then
      raise exception 'course_duplicate';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_course) e
      where not exists (select 1 from public.restaurants r
                        where r.id = (e->>'record_id')::bigint and r.user_id = uid and coalesce(r.pending, false) = false)) then
      raise exception 'not_my_record';
    end if;
    if exists (select 1 from jsonb_array_elements(p_course) e where length(coalesce(e->>'memo', '')) > 60 or public.has_contact(e->>'memo')) then
      raise exception 'no_contact';
    end if;
  end if;

  if p_poll is not null then
    if p_type <> 'free' then raise exception 'poll_free_only'; end if;
    opts := p_poll->'options';
    v_days := coalesce((p_poll->>'days')::int, 3);
    if jsonb_typeof(opts) is distinct from 'array' or jsonb_array_length(opts) not between 2 and 5 then raise exception 'poll_options'; end if;
    if v_days not between 1 and 7 then raise exception 'poll_days'; end if;
    if exists (select 1 from jsonb_array_elements_text(opts) o where length(trim(o)) not between 1 and 40 or public.has_contact(o)) then
      raise exception 'poll_options';
    end if;
  end if;

  insert into public.board_posts (author_id, type, record_id, theme_id, area, title, body, tags, pinned)
  values (uid, p_type,
          case when p_type = 'course' then null else p_record_id end,
          case when p_type = 'theme' then p_theme_id end,
          nullif(trim(coalesce(p_area, '')), ''),
          v_title, v_body, v_tags, admin and coalesce(p_pinned, false))
  returning id into new_id;

  if p_type = 'course' then
    for item in select value from jsonb_array_elements(p_course) loop
      pos := pos + 1;
      rid := (item->>'record_id')::bigint;
      v_memo := nullif(trim(coalesce(item->>'memo', '')), '');
      insert into public.board_post_records (post_id, position, record_id, memo) values (new_id, pos, rid, v_memo);
    end loop;
  end if;

  if p_poll is not null then
    insert into public.board_polls (post_id, closes_at) values (new_id, now() + make_interval(days => v_days));
    pos := 0;
    for lbl in select value from jsonb_array_elements_text(opts) loop
      pos := pos + 1;
      insert into public.board_poll_options (post_id, position, label) values (new_id, pos, trim(lbl));
    end loop;
  end if;

  return new_id;
end $$;

-- 내 글 고치기 — 제목 · 본문 · 태그만. 게시판 · 기록 · 코스 · 투표는 그대로.
create or replace function public.update_board_post(p_id bigint, p_title text, p_body text default null, p_tags text[] default '{}')
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_body  text := nullif(trim(coalesce(p_body, '')), '');
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if public.is_sanctioned(uid) then raise exception 'sanctioned'; end if;
  if not exists (select 1 from public.board_posts where id = p_id and author_id = uid) then raise exception 'not_mine'; end if;
  if length(v_title) = 0 then raise exception 'need_title'; end if;
  if length(v_title) > 60 or coalesce(length(v_body), 0) > 2000 then raise exception 'too_long'; end if;
  if public.has_contact(v_title) or public.has_contact(v_body) then raise exception 'no_contact'; end if;
  update public.board_posts set title = v_title, body = v_body, tags = public.norm_tags(p_tags), edited_at = now() where id = p_id;
end $$;

-- 요즘 많이 쓰인 태그 — 목록 점선 칩 · 글쓰기 자동완성.
create or replace function public.board_popular_tags(p_days int default 7, p_limit int default 10)
returns table (tag text, n int)
language sql stable security definer set search_path = public as $$
  select t, count(*)::int
  from public.board_posts p, unnest(p.tags) t
  where p.hidden_at is null and p.created_at > now() - make_interval(days => greatest(p_days, 1))
  group by t
  order by 2 desc, 1
  limit greatest(p_limit, 1);
$$;

/* ───────────── 11) 목록 · 상세 뷰 ───────────── */

-- 숨긴 글도 줄은 남기고(상세가 「운영 정책에 따라 삭제된 글입니다」로 그림) 내용은 관리자에게만. 목록은 앱이 hidden_at is null 로 거릅니다.
drop view if exists public.board_feed;
create view public.board_feed as
  with base as (
    select p.*, (p.hidden_at is null or public.is_admin()) as shown
    from public.board_posts p
    where not public.is_blocked(p.author_id)
  )
  select p.id, p.type, p.author_id, p.created_at, p.edited_at, p.theme_id, p.area, p.pinned, p.hidden_at,
         case when p.shown then p.title end as title,
         case when p.shown then coalesce(p.body, p.note) end as body,
         case when p.shown then p.tags else '{}'::text[] end as tags,
         p.record_id,
         a.nickname, a.avatar_url, a.character_id, a.title_label_id, a.role as author_role,
         r.name as place_name, r.kind, r.category, r.address, r.rating, r.photo_urls, r.cover_index, r.photo_url,
         r.verified, r.verified_at, r.lat, r.lng,
         case when r.id is null then null else public.place_of(r.place_key, r.name, r.address) end as place,
         (select count(*) from public.board_reactions x where x.post_id = p.id and x.kind = 'want')::int as want_count,
         (select count(*) from public.board_reactions x where x.post_id = p.id and x.kind = 'been')::int as been_count,
         (select count(*) from public.board_reactions x where x.post_id = p.id and x.kind = 'cheer')::int as cheer_count,
         exists (select 1 from public.board_reactions x where x.post_id = p.id and x.kind = 'want' and x.user_id = auth.uid()) as my_want,
         exists (select 1 from public.board_reactions x where x.post_id = p.id and x.kind = 'been' and x.user_id = auth.uid()) as my_been,
         exists (select 1 from public.board_reactions x where x.post_id = p.id and x.kind = 'cheer' and x.user_id = auth.uid()) as my_cheer,
         (select count(*) from public.board_comments c
           where c.post_id = p.id and c.hidden_at is null and not public.is_blocked(c.author_id))::int as comment_count,
         (select count(*) from public.board_post_records pr where pr.post_id = p.id)::int as course_count,
         (select count(*) from public.board_post_records pr join public.restaurants cr on cr.id = pr.record_id
           where pr.post_id = p.id and cr.verified)::int as course_verified,
         (select array_agg(cr.name order by pr.position) from public.board_post_records pr join public.restaurants cr on cr.id = pr.record_id
           where pr.post_id = p.id and p.shown) as course_names,
         (select count(*) from public.board_poll_votes v where v.post_id = p.id)::int as poll_total,
         (select bp.closes_at from public.board_polls bp where bp.post_id = p.id) as poll_closes_at,
         (select v.option_id from public.board_poll_votes v where v.post_id = p.id and v.user_id = auth.uid()) as my_vote
  from base p
  join public.profiles a on a.id = p.author_id
  left join public.restaurants r on r.id = p.record_id and p.shown;
revoke all on public.board_feed from anon;
grant select on public.board_feed to authenticated;

-- 코스 가게 — 순서대로. 남의 기록은 restaurants 를 직접 못 읽어서 보여도 되는 칸만 뷰로.
create or replace view public.board_course_rows as
  select pr.post_id, pr.position, pr.memo, pr.record_id,
         r.name, r.kind, r.category, r.address, r.lat, r.lng, r.rating, r.verified, r.verified_at,
         r.photo_urls, r.cover_index, r.photo_url,
         public.place_of(r.place_key, r.name, r.address) as place
  from public.board_post_records pr
  join public.board_posts p on p.id = pr.post_id
  join public.restaurants r on r.id = pr.record_id
  where not public.is_blocked(p.author_id) and (p.hidden_at is null or public.is_admin());
revoke all on public.board_course_rows from anon;
grant select on public.board_course_rows to authenticated;

-- 댓글 + 단 사람 + 붙인 기록. 숨긴 댓글은 줄을 남기고 본문 · 기록을 비웁니다(관리자는 그대로).
create or replace view public.board_comment_rows as
  select c.id, c.post_id, c.parent_id, c.author_id, c.created_at, c.hidden_at,
         case when c.hidden_at is null or public.is_admin() then c.body end as body,
         a.nickname, a.avatar_url, a.character_id, a.title_label_id, a.role as author_role,
         r.id as record_id, r.name as place_name, r.category, r.address, r.verified, r.verified_at,
         r.photo_urls, r.cover_index, r.photo_url, r.lat, r.lng
  from public.board_comments c
  join public.profiles a on a.id = c.author_id
  left join public.restaurants r on r.id = c.record_id and (c.hidden_at is null or public.is_admin())
  where not public.is_blocked(c.author_id);
revoke all on public.board_comment_rows from anon;
grant select on public.board_comment_rows to authenticated;

/* ───────────── 12) 프로필 창 ───────────── */

-- 기록 · 인증 수는 보관함 · 연인 복사본 제외(20261016000100 과 같은 기준). 차단한 사람이면 null.
-- TODO(칭호 목록): 칭호는 앱이 기록으로 계산합니다 — 남의 「가진 칭호」는 서버가 알 수 없어 대표 칭호 하나만 돌려줍니다.
create or replace function public.public_profile_card(p_user uuid) returns json
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or public.is_blocked(p_user) then null else (
    select json_build_object(
      'id', p.id, 'nickname', p.nickname, 'avatar_url', p.avatar_url, 'character_id', p.character_id,
      'title_label_id', p.title_label_id, 'role', p.role,
      'record_count', (select count(*) from public.restaurants r
                        where r.user_id = p.id and coalesce(r.pending, false) = false and r.source_record_id is null and r.copied_at is null),
      'verified_count', (select count(*) from public.restaurants r
                        where r.user_id = p.id and r.verified and coalesce(r.pending, false) = false and r.source_record_id is null and r.copied_at is null),
      'post_count', (select count(*) from public.board_posts bp where bp.author_id = p.id and bp.hidden_at is null),
      'friend_state', case
        when p.id = auth.uid() then 'self'
        when public.is_friend(auth.uid(), p.id) then 'friend'
        when exists (select 1 from public.friendships f where f.user_id = auth.uid() and f.friend_id = p.id) then 'sent'
        when exists (select 1 from public.friendships f where f.user_id = p.id and f.friend_id = auth.uid()) then 'received'
        else 'none' end,
      'sanctioned_until', case when public.is_admin() then (
        select coalesce(s.until::text, 'forever') from public.user_sanctions s where s.user_id = p.id and (s.until is null or s.until > now())) end
    )
    from public.profiles p where p.id = p_user and p.nickname is not null
  ) end;
$$;

/* ───────────── 13) 사진 — 코스 · 댓글에 붙은 기록도 게시판 글처럼 로그인한 누구나 ───────────── */

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

/* ───────────── 14) 권한 — 로그인한 사용자만 ───────────── */

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_sanctioned(uuid) from public, anon;
revoke execute on function public.vote_poll(bigint, bigint) from public, anon;
revoke execute on function public.poll_results(bigint) from public, anon;
revoke execute on function public.add_board_comment(bigint, text, bigint, bigint) from public, anon;
revoke execute on function public.admin_hide_post(bigint, boolean) from public, anon;
revoke execute on function public.admin_hide_comment(bigint, boolean) from public, anon;
revoke execute on function public.admin_pin_post(bigint, boolean) from public, anon;
revoke execute on function public.admin_sanction(uuid, timestamptz, text) from public, anon;
revoke execute on function public.admin_unsanction(uuid) from public, anon;
revoke execute on function public.admin_resolve_report(bigint, text) from public, anon;
revoke execute on function public.admin_create_notice(text, text, timestamptz) from public, anon;
revoke execute on function public.admin_save_theme(text, date, date, text, bigint) from public, anon;
revoke execute on function public.create_board_post(text, text, text, text[], bigint, jsonb, bigint, jsonb, text, boolean) from public, anon;
revoke execute on function public.update_board_post(bigint, text, text, text[]) from public, anon;
revoke execute on function public.board_popular_tags(int, int) from public, anon;
revoke execute on function public.public_profile_card(uuid) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_sanctioned(uuid) to authenticated;
grant execute on function public.vote_poll(bigint, bigint) to authenticated;
grant execute on function public.poll_results(bigint) to authenticated;
grant execute on function public.add_board_comment(bigint, text, bigint, bigint) to authenticated;
grant execute on function public.admin_hide_post(bigint, boolean) to authenticated;
grant execute on function public.admin_hide_comment(bigint, boolean) to authenticated;
grant execute on function public.admin_pin_post(bigint, boolean) to authenticated;
grant execute on function public.admin_sanction(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_unsanction(uuid) to authenticated;
grant execute on function public.admin_resolve_report(bigint, text) to authenticated;
grant execute on function public.admin_create_notice(text, text, timestamptz) to authenticated;
grant execute on function public.admin_save_theme(text, date, date, text, bigint) to authenticated;
grant execute on function public.create_board_post(text, text, text, text[], bigint, jsonb, bigint, jsonb, text, boolean) to authenticated;
grant execute on function public.update_board_post(bigint, text, text, text[]) to authenticated;
grant execute on function public.board_popular_tags(int, int) to authenticated;
grant execute on function public.public_profile_card(uuid) to authenticated;
