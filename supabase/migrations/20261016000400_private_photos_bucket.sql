-- 사진 비공개화 2단계: 버킷을 닫습니다. 이 순간부터 /object/public/… 주소는 누구에게도 열리지 않고
-- 사진은 서명 주소(앱의 SignedImage)로만 보입니다. 되돌리려면 public = true.
--
-- 먼저 확인: 새 앱 빌드가 퍼진 뒤에 실행하세요. 예전 빌드는 공개 주소를 그대로 써서 사진이 안 보이게 됩니다.
update storage.buckets set public = false where id = 'restaurant-photos';
