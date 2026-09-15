-- 대표 라벨. 라벨첩(src/lib/labels.ts LABELS)에서 모은 라벨 하나를 골라
-- 닉네임 옆에 내걸 수 있게 합니다. 라벨은 DB 테이블이 아니라 코드 상수라
-- FK를 걸 수 없으니 그냥 id 문자열만 저장하고, "실제로 그 라벨을 모았는지"는
-- 화면에서 rows 를 다시 세어 확인합니다(AccountScreen).

alter table public.profiles add column if not exists title_label_id text;
