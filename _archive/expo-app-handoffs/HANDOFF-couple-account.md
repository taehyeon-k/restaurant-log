# HANDOFF — 연인계정 탭 (연인 기록장일 때의 내계정)

시안: `DINARY 연인 모드.dc.html` 04 섹션 (4a 첫 화면 · 4b 아래로 내린 화면)
대상: `expo-app/`

## 0. 언제 바뀌나
- `useActiveBook().isCouple` 이 true 면 탭바 「내계정」 칸이 **「연인계정」** 으로, 화면이 연인 계정 화면으로 바뀝니다.
- 개인 기록장이면 지금 `app/(tabs)/account.tsx` 그대로.
- 숫자는 모두 연인 기록장 기록(`useRows()` 결과, `pending` 제외)으로 셉니다.

## 1. 탭바 — `src/components/TabBar.tsx`
- `LABEL.account` 를 `isCouple ? "연인계정" : "내계정"` 으로. 아이콘은 그대로.

## 2. 화면 — `app/(tabs)/account.tsx`
`isCouple` 이면 새 컴포넌트 `src/features/couple/CoupleAccount.tsx` 를 렌더(기존 개인 화면 코드는 건드리지 않음). 위에서부터:

1. Eyebrow `COUPLE`
2. 머리: `Pair`(Avatars.tsx) size 56 overlap 14 ring `C.paper` + 「태현 · 지은」(F.serif 21) + 칩 「연인 기록 함께 쓰는 중」(brickSoft, 벽돌 점) + `SINCE YYYY.MM`(started_on 기준)
3. **만난 지 카드** (card, radius 22, border lineSoft)
   - 왼쪽: 「만난 지」 mono 10.5 / `dayCount(startedOn)` + 「일」 (serif 36/20) / `dottedWithDay(startedOn)` + 「부터」 / 칩 「다음 {nextMilestone.label} · {남은 날}일 ›」 → 기념일 탭으로 이동
   - 오른쪽: 두 사람 캐릭터 `Character size={70}` 나란히, 사이에 벽돌색 하트(16px). **이름은 넣지 않음**. 나 왼쪽, 상대 오른쪽
4. 통계 3칸 (개인 화면 `Stat` 재사용): 함께 간 식당(placeKey 고유 수) / 기록 / 인증(벽돌색)
5. **우리의 인증**: 오른쪽에 「인증 N」. 가로 막대 10px, 나(ME_COLOR) : 상대(PARTNER_COLOR) 비율, 사이 3px. 아래 범례 「● 태현 30」 「지은 24 ●」.
   - 셈: `verified` 인 기록을 `restaurants.user_id`(찍은 사람)별로.
   - 그 아래 한 줄: 「함께 남긴 기록 N」 = 두 사람의 `record_notes` 가 모두 있는 기록 수 (`useRecordNotes()`)
6. **기념일 식사**: 오른쪽 「채운 수 / 지난 기념일 수 ›」 → 기념일 탭. `milestonesUntil(startedOn, today)` 를 날짜 오름차순으로 5열 그리드(넘치면 최근 5개).
   - 식사 있음(`mealFor` picked/day): 실선 카드, 라벨 + 가게 이름 한 줄(말줄임)
   - 가장 최근 주년: 벽돌 테두리 1.5 + brickSoft 배경
   - 식사 없음/비워둠: **점선 카드, 라벨만 세로 가운데. 「비워둠」 글자 없음**
7. **자주 간 식당**: placeKey 별 방문 수 상위 3, 행 46px 「순위(벽돌 mono) · 이름 · n번」
8. **함께 모은 라벨** — 연인 전용 라벨만(개인 라벨 안 나옴). 「받은 수 / 6 ›」, 설명 「연인 기록에서만 받는 라벨입니다」. 받은 것은 개인 화면 칩 모양(brickSoft), 진행 중 하나는 점선 칩 「이름 · 현재/목표」. 대표 라벨 지정 없음
9. 메뉴 카드 (개인 화면 `Row` 재사용)
   - 사귄 날 `YYYY.MM.DD` — 「수정」 (BookDrawer 의 DateTimePicker·`updateStartedOn` 그대로)
   - 기념일 알림 (토글) — 알림 기능이 없으면 이 줄은 빼고 진행
   - 연인 기록 내려받기 › (개인 `exportRecords` 와 같은 방식, 연인 기록장 rows·wishes)
   - 내 계정 · 개인 기록·캐릭터·로그아웃 › → `setActiveBook(personal.id)` 후 내계정 탭
   - 연결 끊기 (#a8412a) — BookDrawer 의 `disconnect` 와 같은 동작
10. 끝 문구: 「두 기록장은 따로 저장됩니다. 개인 기록은 상대에게 보이지 않습니다.」

## 3. 데이터
- **상대 캐릭터**: `useBooks` 의 profiles 조회에 `character_id` 추가 → `BookMember.characterId` (없거나 잘못된 값이면 `DEFAULT_CHARACTER`). 캐릭터 바꾸기는 개인 내계정에서만.
- **연인 라벨** `src/lib/coupleLabels.ts` (labels.ts 와 같은 모양: id·name·color·desc·need·count)
  | id | 이름 | 조건 |
  |---|---|---|
  | first_meal | 첫 식사 | 사귄 날(visited_at = started_on) 기록 1개 |
  | anniv_table | 기념일 식탁 | 기념일 식사가 채워진 기념일 3번 |
  | shared_note | 함께 남긴 한 줄 | 함께 남긴 기록 20개 |
  | regular | 우리 단골 | 같은 가게 5번 |
  | take_turns | 번갈아 찍기 | 두 사람 각각 인증 10번 (count = 둘 중 적은 쪽) |
  | hundred_days | 100일의 기록 | 사귄 날부터 100일 동안 매 30일 구간에 기록 1개 이상 |
- 저장은 하지 않고 매번 계산(개인 `earnedLabels` 와 같음).

## 4. 하지 말 것
- 개인 내계정 화면·라벨·캐릭터·뽑기권 로직 변경 금지(뽑기권·라벨은 계속 개인 기록으로만).
- 읽기 전용(끊긴 기록장, `readOnly`)이면 사귄 날 수정·연결 끊기 줄을 숨기고 나머지는 그대로 보여 줍니다.
