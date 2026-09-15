-- 닉네임 중복 방지. 그냥 유니크 제약만 걸면, 가입 트리거가 OAuth 이름을 그대로
-- 넣다가 이름이 겹치는 두 번째 사람이 오는 순간 가입 자체가(트리거 안에서) 깨집니다.
-- 그래서 대소문자 구분 없는 유니크 인덱스를 걸되, 트리거는 겹치면 닉네임을 비워 둬서
-- (→ /welcome 에서 직접 고르게) 가입은 항상 성공하게 고칩니다.

create unique index if not exists profiles_nickname_unique_idx
  on public.profiles (lower(nickname))
  where nickname is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  candidate text := nullif(trim(new.raw_user_meta_data->>'name'), '');
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    case
      when candidate is not null
        and not exists (select 1 from public.profiles where lower(nickname) = lower(candidate))
      then candidate
      else null
    end,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;
