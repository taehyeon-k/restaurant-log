# HANDOFF — 연인 기록 (couple mode)

시안: `DINARY 연인 모드.dc.html` (1a–1e 처음 만들 때, 2a–2f 연인 기록 화면)
대상 저장소: `taehyeon-k/restaurant-log` (Next.js + Supabase, 웹 모바일 `src/app/_components/mobile/*`, 네이티브 `expo-app/`)

작업 전 반드시 먼저 읽을 것: `MobileShell.tsx`, `TabBar.tsx`, `CalendarScreen.tsx`, `DayScreen.tsx`, `RecordScreen.tsx`, `CaptureFlow.tsx`, `src/lib/types.ts`, `src/lib/places.ts`, `supabase/migrations/*`. 아래 테이블·컬럼 이름은 제안이며, 기존 기록 테이블(`restaurants` 등) 이름과 구조에 맞춰 조정할 것.

---

## 0. 원칙

- 연인 기록은 **개인 기록과 완전히 분리된 두 번째 기록장**이다. 개인 기록은 상대에게 절대 보이지 않는다.
- 무료. 결제·잠금 UI 없음.
- 인증 규칙은 그대로: 촬영 → 근처 가게 선택 → 인증마크. 연인 기록에서도 인증은 **기록당 한 번**(찍은 사람이 인증), 한 줄 평·별점은 **사람마다 하나씩**.
- 색: 나 = 벽돌색 `#b4552d`, 상대 = 청회색 `#4f6b7a`. 아바타는 이름 첫 글자 원.

## 1. 데이터 (마이그레이션 1개)

```sql
-- 기록장
create table books (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('personal','couple')),
  started_on date,                -- 사귄 날 (couple만). 이 날을 1일로 셈
  created_by uuid not null references auth.users(id),
  closed_at timestamptz,          -- 연결 끊으면 채움 → 읽기 전용
  created_at timestamptz default now()
);

create table book_members (
  book_id uuid references books(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (book_id, user_id)
);
-- couple 은 최대 2명. 한 사용자는 열린 couple 기록장 1개만.

create table book_invites (
  code text primary key,          -- 6자리 영숫자, 화면 표기 4K7Q·2M
  book_id uuid references books(id) on delete cascade,
  expires_at timestamptz not null, -- 생성 + 24시간
  used_by uuid references auth.users(id)
);

-- 기존 기록 테이블에 추가
alter table <records> add column book_id uuid references books(id);
-- 기존 행: 사용자별 personal 기록장을 만들어 채움 (백필)

-- 사람별 한 줄 (couple 기록에서만 사용)
create table record_notes (
  record_id uuid references <records>(id) on delete cascade,
  user_id uuid references auth.users(id),
  rating numeric(2,1),
  note text,
  updated_at timestamptz default now(),
  primary key (record_id, user_id)
);

-- 기념일 식사 지정 (기본은 당일 기록, 직접 고르면 여기에 저장)
create table anniversary_picks (
  book_id uuid references books(id) on delete cascade,
  milestone text not null,        -- '100d','200d',…,'1y','2y'
  record_id uuid references <records>(id) on delete set null,
  cleared boolean default false,  -- 「비워두기」
  primary key (book_id, milestone)
);
```

RLS: 모든 테이블에서 `exists (select 1 from book_members m where m.book_id = … and m.user_id = auth.uid())`. `books.closed_at is not null` 이면 insert/update 금지(select만). 위시리스트(`wishes`)에도 `book_id` 추가.

## 2. 기념일 계산 (`src/lib/anniversary.ts` 신규)

- D+N = `오늘 - started_on + 1` (첫날 = 1일).
- 100일 단위: `started_on + (100k - 1)일` → 100일 2025.12.06, 200일 2026.03.16 … (시안 예시 2025.08.29 기준)
- 주년: 같은 월·일, 매년. 2월 29일 시작이면 평년엔 2월 28일.
- 정렬은 날짜 내림차순, 지난 것 + 다음 1개.
- 식사 결정 순서: `anniversary_picks.cleared` → 비움 / `record_id` 있음 → 그 기록 / 없음 → 그날(`visited_on = 기념일`) 기록 중 가장 이른 것 / 없으면 빈칸.

## 3. 화면

### 3-1. 지도 머리 — 기록장 메뉴 (1a, 2a)
- 검색창 **왼쪽**에 46px 원형 버튼. 개인 기록일 때 ≡(세 줄) 아이콘, 연인 기록일 때 두 아바타(30px, -9px 겹침) + 작은 ≡.
- 현재 기록장은 `localStorage`(웹)/AsyncStorage(expo)에 `activeBookId`로 기억.
- 지도·시트·캘린더·기념일·촬영 저장 위치 모두 `activeBookId` 기준으로 조회.

### 3-2. 기록장 메뉴 (1b, 2b) — `BookDrawer.tsx` 신규
- 왼쪽에서 열리는 308px 서랍, 뒤는 `rgba(28,26,23,.38)`.
- 카드 2개: 「개인 기록」(가게 n · 기록 n) / 「연인 기록」. 선택된 카드는 `1.5px solid #1c1a17` + 체크.
- 연인 기록장이 없으면 점선 카드 + 「만들기」 → 3-3. 그 아래 「초대 코드를 받았어요」 → 코드 입력.
- 연인 기록장이 있으면 카드 아래 「사귄 날 2025.08.29」(수정), 「연결 끊기」.
- 하단 안내: 「두 기록장은 따로 저장됩니다. 개인 기록은 상대에게 보이지 않습니다.」

### 3-3. 만들기 2단계 (1c, 1d)
- 1/2 사귄 날: 연·월·일 휠. 아래에 「오늘은 412일째예요」와 100일·200일·1주년·다음 기념일 미리보기.
- 2/2 초대 코드: 코드 크게(JetBrains Mono 34px), 「메시지로 보내기」(Web Share / expo Share), 「복사」, 「상대의 수락을 기다리는 중」. 24시간 만료.
- 이 시점에 `books`(couple) + `book_members`(나) 생성.

### 3-4. 받은 쪽 (1e)
- 코드 입력 → 두 아바타, 「태현님이 함께 쓰자고 했어요」, 「2025.08.29부터 · D+412」.
- 「함께 쓰기 시작」 → `book_members` 추가, `used_by` 기록. 「거절하기」.
- 서버 함수(`/api/books/join` 또는 RPC)로 처리: 만료·사용됨·이미 2명·이미 다른 couple 기록장 → 오류 문구.

### 3-5. 우리 지도 (2a)
- 시트 제목 「우리 기록」, 오른쪽 `D+412`(mono, 벽돌색).
- 가게 카드에 두 아바타(20px) + 상태: 「둘 다 썼어요」 / 「지은의 한 줄을 기다리는 중」(안 쓴 쪽 아바타는 `#cfc8ba`).
- 기념일 식사로 지정된 가게는 카드 이름 옆, 지도 말풍선 옆에 「1주년」 같은 mono 라벨.

### 3-6. 함께 쓴 기록 (2c) — `RecordScreen.tsx` 확장
- 인증 줄: 「2026.08.29 (토) 19:12 · 태현이 인증」.
- 기념일이면 사진 우상단 벽돌색 라벨.
- 사람별 카드 2개(아바타·이름·★별점·한 줄). 내 카드만 수정 가능. 상대가 아직 안 썼으면 빈 카드.
- 촬영 흐름(`CaptureFlow`)은 그대로, 저장 시 `book_id = activeBookId`, 내 한 줄은 `record_notes`에 저장.

### 3-7. 탭바 (couple일 때)
- `TabBar.tsx`에 `couple` 분기: 위시리스트 칸 → 「기념일」(겹친 원 두 개 아이콘). 나머지 칸 동일.
- 연인 기록의 위시리스트는 지도 「둘 다 · 기록만 · 위시리스트만」 필터로 접근.

### 3-8. 기념일 탭 (2d) — `AnniversaryScreen.tsx` 신규
- 머리: ANNIVERSARY / 「우리의 기념일」 / D+412 / 「2025.08.29부터」.
- 검은 카드: 「다음 · 88일 남음」 「500일 · 2027.01.10 (일)」 + 「갈 곳 담기」(위시리스트 담기, 날짜 = 기념일).
- 목록: 왼쪽 54px(라벨·날짜) + 오른쪽 기록 카드. 카드 아래 mono 9.5px: 당일이면 「당일 기록」(회색), 직접 골랐으면 「03.14 기록 · 직접 고름」(벽돌색). 오른쪽 「바꾸기」.
- 빈칸: 점선 박스 「그날 기록이 없어요」 + 「다른 기록 고르기」.

### 3-9. 기념일 식사 고르기 (2e) — 바텀시트
- 제목 「300일 · 2026.06.24 (수)」 / 「기념일 식사 고르기」 / 「날짜가 가까운 순서입니다.」
- 같은 기록장의 기록을 기념일과의 날짜 차이 절댓값 순으로. 각 줄에 「3일 전」 「6일 뒤」. 라디오 선택.
- 하단 「다른 날짜에서 찾기」(캘린더 열기), 버튼 「비워두기」 / 「300일 식사로 정하기」 → `anniversary_picks` upsert.

### 3-10. 캘린더 (2f) — `CalendarScreen.tsx`
- couple일 때 머리 라벨 「CALENDAR · 우리」 + 오른쪽 D+N.
- 그달에 기념일이 있으면 제목 아래 띠(`#f2e0d5` 바탕, `#a34d27` 글자): 「400일 · 10월 2일 · 스시 하루」 + 오른쪽 「다음 500일 · 88일 뒤」.
- 기념일 칸: 배경 `#b4552d`, 날짜 흰색 굵게, 날짜 옆 흰색 mono 8px 「400일」, 식사 칩은 흰 바탕 `#fbfaf6` + `#a34d27`.
- 미정: 직접 고른 기록이 다른 날일 때 그 날 칸도 표시할지 — 1차 구현에선 기념일 당일 칸만 강조.

## 4. 연결 끊기
- 확인 시트 후 `books.closed_at = now()`. 두 사람 모두 읽기만 가능, 메뉴 카드에 「끊긴 기록장」 표시. 새 연인 기록장 만들기 가능.

## 5. 범위 밖
- 결제, 푸시 알림(「한 줄을 기다리는 중」 알림은 추후), 생일 등 사용자 지정 기념일.

## 6. 확인 순서
1. 마이그레이션 + 백필 후 기존 개인 기록이 그대로 보이는지
2. 두 계정으로 만들기 → 코드 → 수락
3. 한쪽이 촬영 → 상대 지도에 즉시 보이는지, 상대 개인 기록엔 안 보이는지
4. 기념일 탭 날짜 계산(시작일 2025.08.29 → 400일 2026.10.02, 500일 2027.01.10)
5. 바꾸기 / 비워두기 / 캘린더 강조
