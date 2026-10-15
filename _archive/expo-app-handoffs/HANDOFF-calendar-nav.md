# Handoff: 캘린더 달 이동 — 스와이프 + 연·월 다이얼

대상 저장소: `taehyeon-k/restaurant-log` (main)
고칠 파일: `expo-app/app/(tabs)/calendar.tsx` (하나뿐)
참고 시안: `DINARY 연인 모드.dc.html` 2f

개인 캘린더와 연인 캘린더는 같은 `CalendarTab` 이 `isCouple` 로 갈리므로, 이 파일 하나를 고치면 **두 기록장 모두에** 적용됩니다. 분기 처리는 필요 없습니다.

## 요약
1. ‹ / 오늘 / › 단추 세 개를 **지웁니다**.
2. 달력 격자를 **좌우로 밀면** 달이 바뀝니다 (왼쪽 → 다음 달, 오른쪽 → 이전 달).
3. 제목 `{year}년 {month}월` 을 **「N년」과 「N월」 두 덩어리**로 나누고, 각각 누르면 그 글자 바로 아래에 **작은 다이얼**이 펼쳐집니다.
4. 다이얼은 굴리는 동안 달력을 바꾸지 않습니다. **항목을 눌러야** 적용되고 닫힙니다.

---

## 1. 머리 (titleRow)

- `s.round`, `s.today`, `s.arrow` 스타일과 해당 `Pressable` 3개 삭제. `shift()` 는 스와이프에서 계속 씁니다.
- 제목은 한 줄 안에 두 개의 `Pressable`:
  ```tsx
  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
    <Pressable onPress={() => openPicker("year")} hitSlop={8}><Text style={s.title}>{cursor.year}년</Text></Pressable>
    <Pressable onPress={() => openPicker("month")} hitSlop={8}><Text style={s.title}>{cursor.month + 1}월</Text></Pressable>
  </View>
  ```
- ▾ 같은 화살표 표시는 **붙이지 않습니다**.
- 글꼴·크기는 기존 `s.title` 그대로 (Gowun Batang 22).

### ⚠ 리캡 목록 진입점
지금은 제목을 누르면 `setRecapList(true)` 로 리캡 목록이 열립니다. 제목은 이제 다이얼 용도이므로 이 동작을 **제거**합니다.
개인 기록의 리캡 목록은 `RecapCard` 의 `onList` 로 그대로 열 수 있습니다. 연인 기록에는 원래 리캡이 없으므로 영향 없습니다.

## 2. 스와이프

격자 `View`(주 행들을 담은 `flex:1` 컨테이너)에만 붙입니다. 머리·띠·리캡 카드에는 붙이지 않습니다.

- 판정: 가로 이동 `|dx| > 40` 이고 `|dx| > |dy|` 일 때만. `dx < 0` → `shift(1)`, `dx > 0` → `shift(-1)`.
- 칸 `Pressable`(날짜 열기)과 충돌하지 않도록, 스와이프로 판정된 경우 그 터치의 `onPress` 는 발생하지 않아야 합니다.
- 구현 방법은 자유입니다. 의존성을 늘리지 않으려면 `PanResponder`:
  ```tsx
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 40 && Math.abs(g.dx) > Math.abs(g.dy)) shift(g.dx < 0 ? 1 : -1);
    },
  }), [cursor]);
  // <View {...pan.panHandlers} style={{ flex: 1, ... }}>
  ```
  (`react-native-gesture-handler` 가 이미 있으면 `Gesture.Pan()` 도 괜찮습니다.)
- 전환 애니메이션은 **넣지 않습니다**. 바로 다음 달 격자로 바뀝니다. (화면이 움직이면 어지럽다는 피드백)

## 3. 연·월 다이얼

### 상태
```ts
const [picker, setPicker] = useState<null | "year" | "month">(null);
const YEARS = Array.from({ length: 16 }, (_, i) => 2020 + i); // 2020–2035
```

### 위치·모양
- 화면 전체를 덮는 **투명** `Pressable` 배경 (어둡게 하지 않음). 누르면 아무것도 바꾸지 않고 닫힙니다.
- 그 위에 팝오버 카드를 **누른 글자 바로 아래**에 띄웁니다. 시안 기준 위치: 제목 아래 2px 정도, 연도는 왼쪽 끝(`left: 16`), 월은 연도 글자 오른쪽(`left: 86`). 실제로는 `onLayout` 으로 각 글자의 x 를 재서 맞추는 편이 정확합니다.
- 카드: 폭 연도 104 / 월 84, `borderRadius:16`, 배경 `C.card`(#fbfaf6), 테두리 `1px C.line`(#d8d3c8), 그림자 `0 12 32 rgba(28,26,23,.16)` (Android `elevation: 8`), `overflow:hidden`.
- `Modal`(transparent) 로 띄우거나 화면 최상단 절대배치 — 탭바 위에 오기만 하면 됩니다.

### 다이얼
- 높이 200, 항목 높이 **40** (5줄 보임), 위아래 여백 80 (첫·끝 항목도 가운데 올 수 있게).
- `ScrollView` + `snapToInterval={40}` + `decelerationRate="fast"` + `showsVerticalScrollIndicator={false}`.
- 가운데 띠: `top:80, height:40, left/right:6`, `borderRadius:10`, 배경 `C.brickSoft`(#f7ece5), 터치 통과(`pointerEvents="none"`).
- 위아래 흐림: 위·아래 30% 를 `C.card` 로 페이드 (`expo-linear-gradient` 가 있으면 사용, 없으면 생략 가능).
- 항목 글자: Gowun Batang. 가운데 항목 18 / 700 / `C.brick`(#b4552d), 나머지 15 / 400 / `C.faint`(#8a8377).
- 라벨: 연도 `2026년`, 월 `10월`.

### 동작
- 열 때 현재 값이 가운데 오도록 스크롤: `contentOffset={{ x: 0, y: index * 40 }}` 를 처음부터 주면 레이아웃 뒤 보정이 필요 없습니다.
- 스크롤 중에는 **가운데 강조만** 바뀝니다 (`onScroll` → `Math.round(y / 40)` → 지역 state). **`cursorState` 는 바꾸지 않습니다.**
- **항목을 누르면** 그 값으로 적용하고 닫습니다:
  - 연도: `setCursorState({ year: YEARS[i], month: cursor.month })`
  - 월: `setCursorState({ year: cursor.year, month: i })`
- 바깥을 누르면 변경 없이 닫힙니다. 확인 단추는 없습니다.

## 4. 그대로 두는 것
- 「CALENDAR」/「CALENDAR · 우리」 eyebrow, D+N, 「이 달 기록 N건」, 예정 보임 토글
- 연인 기념일 띠·칸 강조(`milestoneOn`), 리캡 카드
- 첫 화면 달 규칙 (`cursorState ?? 최근 기록 달`)
- 칸 스타일·칩 규칙 전부

## 확인 목록
- [ ] 개인 기록장·연인 기록장 둘 다 ‹ / 오늘 / › 가 없다
- [ ] 격자를 좌우로 밀면 달이 한 칸씩 바뀌고, 위아래 스크롤·칸 누르기는 그대로 된다
- [ ] 「2026년」을 누르면 연도 다이얼이 그 아래에 열리고 2026이 가운데 있다
- [ ] 다이얼을 굴려도 달력은 그대로이고, 항목을 눌러야 바뀐다
- [ ] 바깥을 누르면 변경 없이 닫힌다
- [ ] 개인 기록에서 리캡 목록은 리캡 카드로 여전히 열린다
