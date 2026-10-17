-- 위시에 붙이는 캡처 한 장(앨범에서 고름). 담은 사람만 봅니다.
-- 파일은 restaurant-photos 버킷에 올라가고, 읽기 정책(owner_id = auth.uid() 또는 can_see_photo)상
-- 기록 · 프로필에 붙지 않은 파일이라 올린 사람 말고는 서명 주소를 만들 수 없습니다.
-- 연인 기록장에서 위시 줄이 상대에게 보여도 캡처는 열리지 않고, 앱도 담은 사람에게만 그립니다.
alter table wishes add column if not exists capture_path text;
