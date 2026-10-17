-- 링크로 위시 담기(릴스 · 쇼츠) — 위시가 어디서 왔는지(원본 주소 · 종류)를 따로 둡니다.
-- 옛 위시는 메모에 붙은 URL 을 그대로 두고, 앱이 source_url ?? 메모의 첫 URL 로 함께 읽습니다.
alter table public.wishes
  add column if not exists source_url  text,
  add column if not exists source_kind text check (source_kind in ('shorts','youtube','reels','instagram','tiktok','link'));
