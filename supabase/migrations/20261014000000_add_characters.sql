-- 캐릭터 모으기 — 뽑기권으로 밥솥을 열어 캐릭터를 뽑고, 하나를 닉네임 옆 대표로 겁니다(HANDOFF-characters.md §2).
-- 쓰기는 모두 아래 security definer 함수로만 합니다. 대표 캐릭터만 앱이 profiles 를 직접 고칩니다.

-- 대표 캐릭터 + 덤 뽑기권(중복 3개 전환분)
alter table public.profiles add column if not exists character_id text not null default 'plate';
alter table public.profiles add column if not exists ticket_bonus int not null default 0;

-- 가진 캐릭터
create table if not exists public.user_characters (
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id text not null,
  count        int  not null default 1,
  first_at     timestamptz not null default now(),
  primary key (user_id, character_id)
);

-- 뽑은 기록(쓴 뽑기권 수 = 이 표의 행 수)
create table if not exists public.character_draws (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id text not null,
  drawn_at     timestamptz not null default now()
);
create index if not exists character_draws_user_idx on public.character_draws (user_id);

alter table public.user_characters enable row level security;
alter table public.character_draws enable row level security;
drop policy if exists "own characters read" on public.user_characters;
drop policy if exists "own draws read" on public.character_draws;
create policy "own characters read" on public.user_characters for select using (auth.uid() = user_id);
create policy "own draws read"      on public.character_draws for select using (auth.uid() = user_id);
-- 쓰기 정책은 두지 않습니다 — 쓰기는 아래 security definer 함수로만.

-- 기존 계정에 빈 접시 지급
insert into public.user_characters (user_id, character_id)
select id, 'plate' from public.profiles on conflict do nothing;

-- 가입 트리거 — 20261004000000 과 같고(닉네임은 비워 둠) 빈 접시 지급 한 줄만 더합니다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (new.id, null, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.user_characters (user_id, character_id)
  values (new.id, 'plate')
  on conflict do nothing;
  return new;
end $$;

-- profiles 는 "own profile" 정책으로 앱이 직접 고칠 수 있으니 두 가지를 막습니다:
--  · character_id 는 가진 캐릭터로만
--  · ticket_bonus 는 draw_character 안에서만(그 함수가 dinary.ticket_bonus 를 켭니다)
create or replace function public.guard_profile_characters() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.character_id is distinct from old.character_id
     and not exists (select 1 from public.user_characters where user_id = new.id and character_id = new.character_id) then
    raise exception 'character_not_owned';
  end if;
  if new.ticket_bonus is distinct from old.ticket_bonus
     and coalesce(current_setting('dinary.ticket_bonus', true), '') <> 'on' then
    raise exception 'ticket_bonus_locked';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_characters on public.profiles;
create trigger trg_guard_profile_characters
before update on public.profiles
for each row execute function public.guard_profile_characters();

-- 쓸 수 있는 뽑기권 수.
-- TODO(랭킹 전): 라벨 수를 앱이 넘기면 조작할 수 있습니다. 커뮤니티 랭킹을 열기 전에 라벨 계산을 DB 쪽으로 옮기세요.
create or replace function public.available_tickets(p_label_count int) returns int
language sql stable security definer set search_path = public as $$
  select
    1
    + (select count(*)::int / 5 from public.restaurants
        where user_id = auth.uid() and verified is true and coalesce(pending, false) = false)
    + greatest(coalesce(p_label_count, 0), 0)
    + coalesce((select ticket_bonus from public.profiles where id = auth.uid()), 0)
    - (select count(*)::int from public.character_draws where user_id = auth.uid());
$$;

-- 뽑기 한 번. 등급을 먼저 확률로 정하고(보통 65 · 레어 30 · 전설 5) 그 등급 안에서 균등하게 고릅니다.
create or replace function public.draw_character(p_label_count int) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  roll      double precision := random() * 100;
  pool      text[];
  picked    text;
  n         int;
  was_new   boolean;
  converted boolean := false;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  -- 같은 계정의 동시 뽑기를 한 줄로 세웁니다.
  perform 1 from public.profiles where id = uid for update;
  if public.available_tickets(p_label_count) < 1 then raise exception 'no_ticket'; end if;

  pool := case
    when roll < 65 then array['plate', 'onigiri', 'tteok', 'ramen']
    when roll < 95 then array['pizza', 'burger', 'sushi']
    else array['fish']
  end;
  picked := pool[1 + floor(random() * array_length(pool, 1))::int];

  insert into public.character_draws (user_id, character_id) values (uid, picked);

  select count into n from public.user_characters where user_id = uid and character_id = picked;
  was_new := n is null;
  n := coalesce(n, 0) + 1;
  insert into public.user_characters (user_id, character_id, count) values (uid, picked, n)
  on conflict (user_id, character_id) do update set count = excluded.count;

  -- 중복 전환: 3개가 되면 1개만 남기고 2개를 뽑기권 1장으로.
  if n >= 3 then
    update public.user_characters set count = 1 where user_id = uid and character_id = picked;
    perform set_config('dinary.ticket_bonus', 'on', true);
    update public.profiles set ticket_bonus = ticket_bonus + 1 where id = uid;
    perform set_config('dinary.ticket_bonus', 'off', true);
    n := 1;
    converted := true;
  end if;

  return json_build_object(
    'character_id', picked,
    'count', n,
    'is_new', was_new,
    'converted', converted,
    'tickets_left', public.available_tickets(p_label_count)
  );
end $$;

revoke execute on function public.available_tickets(int) from public, anon;
revoke execute on function public.draw_character(int) from public, anon;
grant execute on function public.available_tickets(int) to authenticated;
grant execute on function public.draw_character(int) to authenticated;
