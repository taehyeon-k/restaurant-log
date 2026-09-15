-- 카카오·구글 로그인 도입. 기존 restaurants·wishes 는 user_id 도 RLS 도 없는
-- 1인용 테이블이었습니다(§20260908000000 참고) — 이 마이그레이션으로 소유자를
-- 붙이고 잠급니다.
--
-- 순서가 생명입니다: 3)의 귀속(backfill)을 건너뛰고 4)의 RLS를 먼저 켜면
-- 기존 기록이 전부 안 보이게 됩니다(그 시점엔 어떤 user_id 도 auth.uid() 와
-- 맞지 않으므로). 반드시 카카오로 한 번 로그인해서 uuid를 확인한 뒤,
-- 아래 <MY_UUID> 를 실제 값으로 바꾸고 그대로 실행하세요.

-- 1) 프로필
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- 2) 소유자 칸
alter table public.restaurants add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.wishes      add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 3) 기존 기록 귀속 — <MY_UUID> 는 카카오로 한 번 로그인한 뒤
--    Authentication → Users 에서 복사한 내 uuid로 바꿔서 실행하세요.
update public.restaurants set user_id = '<MY_UUID>' where user_id is null;
update public.wishes      set user_id = '<MY_UUID>' where user_id is null;

alter table public.restaurants alter column user_id set not null;
alter table public.wishes      alter column user_id set not null;

create index if not exists restaurants_user_idx on public.restaurants(user_id);
create index if not exists wishes_user_idx      on public.wishes(user_id);

-- 4) RLS — 본인 것만 읽고 쓰기
alter table public.restaurants enable row level security;
alter table public.wishes      enable row level security;
alter table public.profiles    enable row level security;

create policy "own restaurants" on public.restaurants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own wishes" on public.wishes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 5) 가입하면 프로필 한 줄
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (new.id,
          new.raw_user_meta_data->>'name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
