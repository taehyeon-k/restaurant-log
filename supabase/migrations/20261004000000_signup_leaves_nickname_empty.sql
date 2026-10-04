-- 첫 로그인 닉네임 화면이 잠깐 떴다가 넘어가 버리던 문제.
-- 앱·웹 모두 "닉네임이 비어 있음 = 첫 로그인" 으로 /welcome 을 띄우는데, 가입 트리거가
-- OAuth 이름을 닉네임에 미리 넣어 두는 바람에 새 계정도 이미 끝난 계정처럼 보였습니다.
-- 이제 트리거는 닉네임을 비워 두고(사진만 채움), OAuth 이름은 /welcome 이 입력칸에 미리 채웁니다.
-- 이미 닉네임이 있는 기존 계정은 건드리지 않습니다.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (new.id, null, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
