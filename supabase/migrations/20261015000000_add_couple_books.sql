-- 연인 기록(HANDOFF-couple.md §1) — 개인 기록과 완전히 나뉜 두 번째 기록장.
--
-- 기록장(books)은 personal(나 혼자) / couple(둘이 함께) 두 종류입니다. 기록(restaurants)·위시(wishes)는
-- 모두 기록장 하나에 속하고(book_id), 화면은 지금 고른 기록장(activeBookId)의 것만 읽습니다.
--  · 개인 기록장은 사용자마다 하나 — 기존 행은 여기서 백필하고, book_id 없이 들어오는 insert(웹·예전 앱)는
--    트리거가 개인 기록장으로 채웁니다. 그래서 개인 기록은 상대에게 절대 보이지 않습니다.
--  · 연인 기록장은 최대 2명, 한 사용자는 열린 연인 기록장 1개만. 만들기·참여·끊기는 아래 함수로만 합니다.
--  · 연결을 끊으면(closed_at) 두 사람 모두 읽기만 됩니다.
--
-- 순서: 이 파일을 통째로 한 번 실행하세요. 백필(3)이 RLS 교체(6)보다 앞에 있어야 기존 기록이 사라지지 않습니다.

/* ── 1) 기록장 ─────────────────────────────── */

create table if not exists public.books (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('personal', 'couple')),
  started_on  date,                                   -- 사귄 날(couple 만). 이 날을 1일로 셉니다.
  created_by  uuid not null references auth.users(id) on delete cascade,
  closed_at   timestamptz,                            -- 연결 끊으면 채움 → 읽기 전용
  created_at  timestamptz not null default now()
);

-- 개인 기록장은 사람마다 하나.
create unique index if not exists books_one_personal_idx on public.books (created_by) where kind = 'personal';

create table if not exists public.book_members (
  book_id    uuid not null references public.books(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (book_id, user_id)
);
create index if not exists book_members_user_idx on public.book_members (user_id);

create table if not exists public.book_invites (
  code        text primary key,                       -- 6자리 영숫자(헷갈리는 0·O·1·I 빼고). 화면 표기 4K7Q·2M
  book_id     uuid not null references public.books(id) on delete cascade,
  created_by  uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,                   -- 만든 때 + 24시간
  used_by     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists book_invites_book_idx on public.book_invites (book_id);

/* ── 2) 기록·위시에 기록장 칸 ─────────────── */

alter table public.restaurants add column if not exists book_id uuid references public.books(id) on delete cascade;
alter table public.wishes      add column if not exists book_id uuid references public.books(id) on delete cascade;
create index if not exists restaurants_book_idx on public.restaurants (book_id);
create index if not exists wishes_book_idx      on public.wishes (book_id);

/* ── 3) 개인 기록장 + 백필 ─────────────────── */

-- 그 사람의 개인 기록장 id. 없으면 만듭니다(가입 트리거·book_id 채우기 트리거가 씁니다).
create or replace function public.personal_book_id(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b uuid;
begin
  select id into b from public.books where created_by = p_user and kind = 'personal';
  if b is null then
    insert into public.books (kind, created_by) values ('personal', p_user)
    on conflict (created_by) where kind = 'personal' do nothing
    returning id into b;
    if b is null then
      select id into b from public.books where created_by = p_user and kind = 'personal';
    end if;
    insert into public.book_members (book_id, user_id) values (b, p_user) on conflict do nothing;
  end if;
  return b;
end $$;
revoke execute on function public.personal_book_id(uuid) from public, anon, authenticated;

-- 기존 사용자(프로필·기록·위시가 있는 사람) 모두에게 개인 기록장.
select public.personal_book_id(u.id)
from (
  select id from public.profiles
  union select user_id from public.restaurants
  union select user_id from public.wishes
) u;

update public.restaurants r set book_id = public.personal_book_id(r.user_id) where r.book_id is null;
update public.wishes      w set book_id = public.personal_book_id(w.user_id) where w.book_id is null;

alter table public.restaurants alter column book_id set not null;
alter table public.wishes      alter column book_id set not null;

-- book_id 없이 들어오는 insert(웹·예전 앱)는 개인 기록장으로.
create or replace function public.fill_book_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.book_id is null then
    new.book_id := public.personal_book_id(new.user_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_restaurants_book_id on public.restaurants;
create trigger trg_restaurants_book_id before insert on public.restaurants
  for each row execute function public.fill_book_id();
drop trigger if exists trg_wishes_book_id on public.wishes;
create trigger trg_wishes_book_id before insert on public.wishes
  for each row execute function public.fill_book_id();

-- 가입 트리거 — 20261014000000 과 같고 개인 기록장 한 줄만 더합니다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (new.id, null, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.user_characters (user_id, character_id)
  values (new.id, 'plate')
  on conflict do nothing;
  perform public.personal_book_id(new.id);
  return new;
end $$;

/* ── 4) 사람별 한 줄 · 기념일 식사 ─────────── */

-- 연인 기록에서 사람마다 하나씩 남기는 별점·한 줄. 기록(인증)은 찍은 사람이 한 번만 합니다.
create table if not exists public.record_notes (
  record_id   bigint not null references public.restaurants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rating      numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (record_id, user_id)
);

-- 기념일 식사 지정. 기본은 그날 기록이고, 직접 고르거나 비워 두면 여기에 남깁니다.
create table if not exists public.anniversary_picks (
  book_id     uuid not null references public.books(id) on delete cascade,
  milestone   text not null,                          -- '100d','200d',…,'1y','2y'
  record_id   bigint references public.restaurants(id) on delete set null,
  cleared     boolean not null default false,         -- 「비워두기」
  updated_at  timestamptz not null default now(),
  primary key (book_id, milestone)
);

/* ── 5) RLS 도우미 ─────────────────────────── */
-- book_members 를 정책 안에서 그대로 읽으면 그 표의 정책이 다시 돌아 재귀가 됩니다 — security definer 로 감쌉니다.

create or replace function public.is_book_member(p_book uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.book_members where book_id = p_book and user_id = auth.uid());
$$;

-- 쓸 수 있는 기록장 = 내가 들어 있고 끊기지 않은 것.
create or replace function public.book_writable(p_book uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.books b join public.book_members m on m.book_id = b.id
    where b.id = p_book and m.user_id = auth.uid() and b.closed_at is null
  );
$$;

-- 그 사람과 같은 기록장에 있는지 — 상대의 닉네임·사진을 읽을 때.
create or replace function public.shares_book(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.book_members a join public.book_members b on a.book_id = b.book_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

create or replace function public.record_book(p_record bigint) returns uuid
language sql stable security definer set search_path = public as $$
  select book_id from public.restaurants where id = p_record;
$$;

revoke execute on function public.is_book_member(uuid) from public, anon;
revoke execute on function public.book_writable(uuid) from public, anon;
revoke execute on function public.shares_book(uuid) from public, anon;
revoke execute on function public.record_book(bigint) from public, anon;
grant execute on function public.is_book_member(uuid) to authenticated;
grant execute on function public.book_writable(uuid) to authenticated;
grant execute on function public.shares_book(uuid) to authenticated;
grant execute on function public.record_book(bigint) to authenticated;

/* ── 6) RLS ────────────────────────────────── */

alter table public.books             enable row level security;
alter table public.book_members      enable row level security;
alter table public.book_invites      enable row level security;
alter table public.record_notes      enable row level security;
alter table public.anniversary_picks enable row level security;

-- 기록장: 들어 있는 사람만 읽고, 사귄 날만 고칠 수 있습니다(만들기·끊기는 함수로).
drop policy if exists "books read" on public.books;
create policy "books read" on public.books for select using (public.is_book_member(id));
drop policy if exists "books edit" on public.books;
create policy "books edit" on public.books for update
  using (public.book_writable(id)) with check (public.book_writable(id));

drop policy if exists "book_members read" on public.book_members;
create policy "book_members read" on public.book_members for select using (public.is_book_member(book_id));

-- 초대 코드: 만든 사람만 읽습니다. 받은 쪽은 peek_book_invite / join_book 함수로만.
drop policy if exists "book_invites read" on public.book_invites;
create policy "book_invites read" on public.book_invites for select using (created_by = auth.uid());

-- 기록: 같은 기록장 사람은 읽고, 쓰기·고치기·지우기는 찍은 사람이 열린 기록장에서만.
drop policy if exists "own restaurants" on public.restaurants;
drop policy if exists "restaurants read" on public.restaurants;
drop policy if exists "restaurants insert" on public.restaurants;
drop policy if exists "restaurants update" on public.restaurants;
drop policy if exists "restaurants delete" on public.restaurants;
create policy "restaurants read" on public.restaurants for select using (public.is_book_member(book_id));
create policy "restaurants insert" on public.restaurants for insert
  with check (auth.uid() = user_id and public.book_writable(book_id));
create policy "restaurants update" on public.restaurants for update
  using (auth.uid() = user_id and public.book_writable(book_id))
  with check (auth.uid() = user_id and public.book_writable(book_id));
create policy "restaurants delete" on public.restaurants for delete
  using (auth.uid() = user_id and public.book_writable(book_id));

-- 위시: 연인 기록장의 위시리스트는 둘이 함께 고칩니다. 담은 사람(user_id)은 그대로 남깁니다.
drop policy if exists "own wishes" on public.wishes;
drop policy if exists "wishes read" on public.wishes;
drop policy if exists "wishes insert" on public.wishes;
drop policy if exists "wishes update" on public.wishes;
drop policy if exists "wishes delete" on public.wishes;
create policy "wishes read" on public.wishes for select using (public.is_book_member(book_id));
create policy "wishes insert" on public.wishes for insert
  with check (auth.uid() = user_id and public.book_writable(book_id));
create policy "wishes update" on public.wishes for update
  using (public.book_writable(book_id)) with check (public.book_writable(book_id));
create policy "wishes delete" on public.wishes for delete using (public.book_writable(book_id));

-- 사람별 한 줄: 같은 기록장 사람은 읽고, 내 줄만 씁니다.
drop policy if exists "record_notes read" on public.record_notes;
drop policy if exists "record_notes write" on public.record_notes;
create policy "record_notes read" on public.record_notes for select using (public.is_book_member(public.record_book(record_id)));
create policy "record_notes write" on public.record_notes for all
  using (auth.uid() = user_id and public.book_writable(public.record_book(record_id)))
  with check (auth.uid() = user_id and public.book_writable(public.record_book(record_id)));

drop policy if exists "anniversary_picks read" on public.anniversary_picks;
drop policy if exists "anniversary_picks write" on public.anniversary_picks;
create policy "anniversary_picks read" on public.anniversary_picks for select using (public.is_book_member(book_id));
create policy "anniversary_picks write" on public.anniversary_picks for all
  using (public.book_writable(book_id))
  with check (
    public.book_writable(book_id)
    and (record_id is null or public.record_book(record_id) = book_id)
  );

-- 프로필: 내 것 + 같은 기록장 상대의 것(닉네임·사진·캐릭터)을 읽을 수 있게.
drop policy if exists "shared profile read" on public.profiles;
create policy "shared profile read" on public.profiles for select using (public.shares_book(id));

/* ── 7) 만들기 · 초대 · 참여 · 끊기 ──────────── */

-- 헷갈리는 글자(0 O 1 I L)를 뺀 6자리.
create or replace function public.new_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.book_invites where code = c);
  end loop;
  return c;
end $$;
revoke execute on function public.new_invite_code() from public, anon, authenticated;

-- 1c·1d — 연인 기록장을 만들고(나만 들어 있음) 24시간짜리 초대 코드를 돌려줍니다.
create or replace function public.create_couple_book(p_started_on date) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  b uuid;
  c text;
  exp timestamptz := now() + interval '24 hours';
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_started_on is null or p_started_on > current_date then raise exception 'bad_date'; end if;
  if exists (
    select 1 from public.books bk join public.book_members m on m.book_id = bk.id
    where m.user_id = uid and bk.kind = 'couple' and bk.closed_at is null
  ) then raise exception 'already_in_couple'; end if;

  insert into public.books (kind, started_on, created_by) values ('couple', p_started_on, uid) returning id into b;
  insert into public.book_members (book_id, user_id) values (b, uid);
  c := public.new_invite_code();
  insert into public.book_invites (code, book_id, created_by, expires_at) values (c, b, uid, exp);
  return json_build_object('book_id', b, 'code', c, 'expires_at', exp);
end $$;

-- 코드가 만료됐거나 다시 보낼 때 — 아직 혼자인 기록장에 새 코드를 만듭니다(이전 코드는 그대로 만료).
create or replace function public.renew_book_invite(p_book uuid) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text;
  exp timestamptz := now() + interval '24 hours';
begin
  if not public.book_writable(p_book) then raise exception 'not_member'; end if;
  if (select count(*) from public.book_members where book_id = p_book) >= 2 then raise exception 'book_full'; end if;
  update public.book_invites set expires_at = least(expires_at, now()) where book_id = p_book and used_by is null;
  c := public.new_invite_code();
  insert into public.book_invites (code, book_id, created_by, expires_at) values (c, p_book, uid, exp);
  return json_build_object('book_id', p_book, 'code', c, 'expires_at', exp);
end $$;

-- 코드 확인 — 오류는 예외 문구로(앱이 한국어로 바꿔 보여줍니다).
create or replace function public.check_book_invite(p_code text, p_uid uuid) returns public.book_invites
language plpgsql stable security definer set search_path = public as $$
declare
  inv public.book_invites;
begin
  select * into inv from public.book_invites where code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  if inv.code is null then raise exception 'invite_not_found'; end if;
  if inv.used_by is not null then raise exception 'invite_used'; end if;
  if inv.expires_at < now() then raise exception 'invite_expired'; end if;
  if inv.created_by = p_uid then raise exception 'invite_own'; end if;
  if exists (select 1 from public.books where id = inv.book_id and closed_at is not null) then raise exception 'invite_expired'; end if;
  if (select count(*) from public.book_members where book_id = inv.book_id) >= 2 then raise exception 'book_full'; end if;
  if exists (
    select 1 from public.books bk join public.book_members m on m.book_id = bk.id
    where m.user_id = p_uid and bk.kind = 'couple' and bk.closed_at is null
  ) then raise exception 'already_in_couple'; end if;
  return inv;
end $$;
revoke execute on function public.check_book_invite(text, uuid) from public, anon, authenticated;

-- 1e — 받은 쪽이 코드를 넣으면 누가 언제부터인지 미리 보여줍니다.
create or replace function public.peek_book_invite(p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  inv public.book_invites;
  p public.profiles;
  bk public.books;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  inv := public.check_book_invite(p_code, auth.uid());
  select * into bk from public.books where id = inv.book_id;
  select * into p from public.profiles where id = inv.created_by;
  return json_build_object(
    'code', inv.code,
    'book_id', inv.book_id,
    'started_on', bk.started_on,
    'inviter', json_build_object('id', inv.created_by, 'nickname', p.nickname, 'avatar_url', p.avatar_url)
  );
end $$;

-- 「함께 쓰기 시작」
create or replace function public.join_book(p_code text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv public.book_invites;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  -- 같은 코드를 두 사람이 동시에 넣지 않게 기록장 줄을 잠급니다.
  perform 1 from public.books where id = (
    select book_id from public.book_invites where code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'))
  ) for update;
  inv := public.check_book_invite(p_code, uid);
  insert into public.book_members (book_id, user_id) values (inv.book_id, uid);
  update public.book_invites set used_by = uid where code = inv.code;
  -- 다른 남은 코드는 닫습니다.
  update public.book_invites set expires_at = least(expires_at, now()) where book_id = inv.book_id and used_by is null;
  return inv.book_id;
end $$;

-- 4 — 연결 끊기. 두 사람 모두 읽기만 됩니다.
create or replace function public.close_book(p_book uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.books b join public.book_members m on m.book_id = b.id
    where b.id = p_book and m.user_id = auth.uid() and b.kind = 'couple'
  ) then raise exception 'not_member'; end if;
  update public.books set closed_at = coalesce(closed_at, now()) where id = p_book;
  update public.book_invites set expires_at = least(expires_at, now()) where book_id = p_book and used_by is null;
end $$;

revoke execute on function public.create_couple_book(date) from public, anon;
revoke execute on function public.renew_book_invite(uuid) from public, anon;
revoke execute on function public.peek_book_invite(text) from public, anon;
revoke execute on function public.join_book(text) from public, anon;
revoke execute on function public.close_book(uuid) from public, anon;
grant execute on function public.create_couple_book(date) to authenticated;
grant execute on function public.renew_book_invite(uuid) to authenticated;
grant execute on function public.peek_book_invite(text) to authenticated;
grant execute on function public.join_book(text) to authenticated;
grant execute on function public.close_book(uuid) to authenticated;

/* ── 8) 뽑기권은 개인 기록으로만 ───────────── */
-- 연인 기록도 restaurants 에 들어가므로, 20261014000000 의 계산이 그것까지 세지 않게 개인 기록장으로 좁힙니다.
create or replace function public.available_tickets(p_label_count int) returns int
language sql stable security definer set search_path = public as $$
  select
    1
    + (select count(*)::int / 5 from public.restaurants r
        join public.books b on b.id = r.book_id and b.kind = 'personal'
        where r.user_id = auth.uid() and r.verified is true and coalesce(r.pending, false) = false)
    + greatest(coalesce(p_label_count, 0), 0)
    + coalesce((select ticket_bonus from public.profiles where id = auth.uid()), 0)
    - (select count(*)::int from public.character_draws where user_id = auth.uid());
$$;
