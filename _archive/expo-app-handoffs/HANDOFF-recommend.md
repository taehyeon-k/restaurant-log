# HANDOFF — 추천 탭 · 하단탭 재구성 · 기념일 배너 · 계정 사진 이동

시안: `DINARY 추천 탭.dc.html` (01–04), 탭바 조각 `앱조각 탭바.dc.html` (`v2` prop)
대상: `expo-app/` (기준 커밋 303816983ef5)

---

## 0. 요약

| 기록장 | 지금 | 바뀐 뒤 |
|---|---|---|
| 개인 | 캘린더 · 지도 · [카메라] · 커뮤니티 · 내계정 | 캘린더 · 지도 · [카메라] · **추천** · 커뮤니티 |
| 연인 | 캘린더 · 지도 · [카메라] · 기념일 · 연인계정 | 캘린더 · 지도 · [카메라] · **추천** · **연인** |

- 개인 「내계정」 탭 제거 → 지도 ≡ 기록장 메뉴(BookDrawer) **오른쪽 위 계정 사진**으로 들어감
- 연인 「기념일」 탭 제거 → 캘린더 위 **검정 배너**로 들어감
- 연인 「연인계정」 → 「연인」, 아이콘 `RingsIcon` (지금 기념일 탭 아이콘)
- 새 탭 「추천」: 개인·연인 둘 다

---

## 1. 하단탭 — `src/components/TabBar.tsx`, `app/(tabs)/_layout.tsx`

### 1-1 라우트

```tsx
// app/(tabs)/_layout.tsx
<Tabs.Screen name="calendar" />
<Tabs.Screen name="index" />
<Tabs.Screen name="recommend" />          // 신규
<Tabs.Screen name="account" />            // 연인 기록에서만 탭으로 보임
// anniversary 는 탭에서 빼고 스택 라우트로 옮김 (§3)
```

### 1-2 TabBar 순서

```tsx
{item("calendar")}
{item("index")}
<View style={s.gap} />
{item("recommend")}
{isCouple ? item("account") : <CommunityButton />}   // 지금의 커뮤니티 Pressable 그대로
```

- `LABEL`: `recommend: "추천"` 추가, `anniversary` 제거. `account` 라벨은 연인일 때 `"연인"` (지금 `"연인계정"`)
- `ICON`: `recommend: (c) => <CompassIcon stroke={c} />` (지금 커뮤니티 recs 탭이 쓰던 아이콘을 가져옴), `account` 는 연인일 때 `RingsIcon`
  ```tsx
  account: (c) => isCouple ? <RingsIcon stroke={c} /> : <PersonIcon stroke={c} />
  ```
- `SparkIcon` 신규 (`src/components/icons.tsx`) — 커뮤니티 「탐색」 탭용 (§1-3). 24 viewBox, stroke 1.6, strokeLinejoin round, fill none
  `<Path d="M12 3.2l1.9 5.4 5.4 1.9-5.4 1.9L12 17.8l-1.9-5.4-5.4-1.9 5.4-1.9z"/>` + `<Path d="M18.4 15.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>`
- 개인 기록에서 `account` 라우트는 탭바에 안 그림. 라우트 자체는 남겨 BookDrawer 에서 `router.navigate("/(tabs)/account")` 로 엶
- 커뮤니티 버튼·빨간 점·전환 애니메이션은 그대로

### 1-3 커뮤니티 「추천」 → 「탐색」

하단 추천 탭과 이름이 겹치지 않게 커뮤니티 안 탭 이름만 바꿈. 라우트·파일·내용은 그대로.

- `src/components/CommunityTabBar.tsx`: `{ name: "recs", label: "탐색", icon: (c) => <SparkIcon stroke={c} /> }` (나침반은 하단 추천 탭으로)
- `app/community/recs.tsx`: 화면 제목 「추천」 → 「탐색」 (라벨 `COMMUNITY · FOR YOU` 는 유지)
- 접근성 라벨·빈 화면 문구 등 「추천」이 들어간 UI 텍스트도 「탐색」으로. 변수·라우트명 `recs` 는 유지
- 시안: `DINARY 커뮤니티 현재 화면.dc.html` 02

### 1-4 위시리스트

탭이 없으므로 지금처럼 지도의 「위시리스트만」 보기 + 추천 탭 「위시리스트에서」 섹션으로 봄. 변경 없음.

---

## 2. 계정 사진 — `src/features/couple/BookDrawer.tsx` (시안 2a·2b)

- 서랍 머리(「BOOKS / 기록장」) 오른쪽 위에 계정 사진
  - 위치: 서랍 기준 `right: 16, top: 64` (기록장 제목 줄 높이), 터치 영역 44×44
  - 사진 40×40 원, 테두리 2 `C.card` + 바깥 링 1.5 `C.brick`. 사진 없으면 닉네임 첫 글자, 배경 `C.brick`, 글자 16/700 `C.card`
  - `profiles.character_id` 가 있으면 캐릭터 얼굴을 씀 (`Character.tsx`)
- 누르면 서랍 닫고 내계정 열기. 내계정 화면 왼쪽 위에 「‹」 뒤로가기 추가(탭이 아니라 밀려 들어온 화면이므로)
- 연인 기록일 때도 같은 자리에 **내** 계정 사진 (연인 화면은 하단 「연인」 탭)
- 지도 시트(맛집 기록) 머리는 **바꾸지 않음**

---

## 3. 기념일 → 캘린더 배너 — `app/(tabs)/calendar.tsx` (시안 4a·4b)

### 3-1 라우트 이동

`app/(tabs)/anniversary.tsx` → `app/anniversary.tsx` (스택). 내용 그대로, 맨 위 `ANNIVERSARY` 라벨 자리를 뒤로가기 버튼으로 바꿈:

- 「‹ 캘린더」 알약 버튼: 높이 40, radius 20, border 1 `#d8d3c8`, 배경 `C.card`, 패딩 좌10/우14, 글자 13/500 `C.ink`, 화살표 16px stroke 2
- `router.back()`
- 탭바는 그대로 보이고 캘린더가 선택된 상태

### 3-2 배너 (연인 기록일 때 RecapCard 자리)

개인 기록은 지금처럼 `RecapCard`. 연인 기록이면 그 자리에 `AnniversaryBanner` (신규 `src/features/couple/AnniversaryBanner.tsx`):

```
[겹친 두 원]  다음 500일  D-88                    기념일 ›
             지난 400일 · 10월 2일 · 스시 하루
```

- 컨테이너: margin 10/22/0, minHeight 52, radius 16, 배경 `#1c1a17`, padding 10/12/10/14, gap 12, 가로 정렬 가운데
- 왼쪽 `RingsIcon` 26×24, stroke `#e08a63` 1.6
- 1줄: 「다음 {N}일」 Gowun Batang 14.5/700 `#fbfaf6` + `D-{남은 날}` JetBrains Mono 11 `#e08a63`
- 2줄: 「지난 {N}일 · {M}월 {D}일 · {그날 기록 가게명}」 10.5 `#c9c2b4`, 한 줄 말줄임. 그날 기록이 없으면 가게명 생략
- 오른쪽: 「기념일」 11 `#c9c2b4` + 「›」 16 `#fbfaf6`
- 누르면 `router.push("/anniversary")`
- 숫자 계산은 `src/lib/anniversary.ts` 그대로 (100일 단위 + 주년)
- 기존 캘린더 띠(연한 벽돌색)는 이 배너로 대체

---

## 4. 추천 탭 — 신규 `app/(tabs)/recommend.tsx` (시안 3a·3b·3c·4c)

### 4-1 원칙

- 셈에는 **인증된 기록만** (`verified_at is not null`) 씀. 인증 없는 기록·보관함(`pending`)은 제외
- 다른 사람의 신원·기록은 보이지 않음. 숫자(몇 명, 평균 별점)만 보임
- 지금 기록장(개인/연인)에 따라 내용이 바뀜 (`useActiveBook`)

### 4-2 화면 구성 (위→아래)

1. 라벨 `RECOMMEND` (연인: `RECOMMEND · 우리`) — Mono 10, letterSpacing .22em, `#8a8377`
2. 동네 선택 + 끼니
   - 동네 이름 Gowun Batang 24/700 + 아래 화살표(벽돌색). 누르면 동네 시트(4-3)
   - 오른쪽 세그먼트 「점심 / 저녁」 (선택 = 배경 `C.ink`, 글자 `C.card`), 기본값은 지금 시각(15시 전 점심)
3. 최근 식사 카드 (`최근 3일 · 인증 기록`, 연인: `우리의 최근 식사`)
   - 3칸 그리드: 날짜(Mono 9.5) / 종류(13/700) / 가게명(10, 말줄임). 빠진 종류의 칸은 배경 `#f2e0d5`, 글자 `#a34d27`
   - 문장: 「어제 중식을 드셔서 오늘은 뺐어요」 / 「최근 한식·일식을 드셔서 뺐어요」
   - 빠진 종류마다 칩 「중식 ✕」 — 누르면 다시 포함
4. **위시리스트에서** (개인만 섹션 제목 있음, 연인은 제목 없이 카드만) — `{동네} · {전체} 중 {보이는 수}`
   - 고른 동네 안 위시, 빠진 종류 제외, 담은 지 오래된 순
   - 카드 보조줄: 「담은 지 32일 · 아직 안 감」. 연인이면 담은 사람 아바타(태/지, 둘 다면 겹침) + 「둘 다 담음」/「지은이 담음 · 21일 전」
5. **나와 입맛이 비슷한 사람들이 좋게 본 곳** — 보조 「내가 4점 이상 준 식당을 똑같이 좋게 본 {N}명 기준」
   - 카드 보조줄: 「{N}명 중 {k}명이 인증 · {r}명 재방문」, Mono 줄 「★4.6 · 비슷한 사람 평균」(벽돌색)
   - 테두리 `#e0c3b1` 로 위시 카드와 구분
6. (연인만) **{다음 기념일}에 가기 좋은 곳** — `{N}일 뒤`, 보조 「입맛이 비슷한 커플들이 기념일에 인증한 곳」

카드 공통: 썸네일 58×58 radius 14, 이름 Gowun Batang 15/700, 종류 11 `#8a8377`, Mono 줄 10 `#8a8377` (「인증 214 · 비슷한 사람 ★4.5」), 카드 radius 20, padding 12, gap 12.

### 4-3 동네 시트 (3b)

- 제목 「어디서 드세요?」 20/700
- 검색 입력 「동네나 역 이름」
- 「지금 있는 곳」 행 (위치 권한, 행정동 이름) — 기본 선택
- `자주 기록한 동네` 칩: 내 인증 기록 수 많은 순 4개, 칩 안에 수
- `위시리스트가 모인 동네` 칩: 녹색 톤(`#eef1e8` / `#cfd8c4` / `#4f6038`), 「위시 5」
- 아래 버튼 「{동네}에서 추천 받기」 벽돌색 52px

### 4-4 추천 카드 상세 (3c)

카드를 누르면 가게 화면(`app/place/[key].tsx` 형식) 위에 「추천한 까닭」 블록:

1. 입맛이 비슷한 23명 중 **9명**이 여기서 인증했고, 그중 7명이 다시 갔어요.
2. 이 9명은 내가 4.5를 준 **부촌육개장**·**스시 하루**에도 4점 이상을 줬어요. (내 기록 중 겹치는 상위 2곳)
3. 어제 중식을 드셔서 양식으로 골랐어요. (종류 제외가 있었을 때만)

- 숫자 카드: 「비슷한 사람 평균 ★4.6」 / 「전체 인증 132」
- 안내: 「인증마크가 있는 기록만 셉니다. 누가 남겼는지는 보이지 않아요.」
- 하단 버튼: 「위시리스트」(담기) / 「지도에서 보기」(벽돌색)

### 4-5 데이터 · 계산

**최근 종류 제외**
- 지금 기록장의 인증 기록 중 최근 3일(연인: 최근 14일 안의 마지막 3끼)
- 어제 먹은 종류는 빼고, 3일 안에 2번 이상 먹은 종류도 뺌. 카페·디저트는 빼지 않음
- 사용자가 칩으로 되돌린 값은 그 날만 기억 (`store` 에 `recExcludeOverride: {date, categories}`)

**비슷한 사람** (서버 함수 — 기록이 비공개라 앱에서 계산 불가)

> 이 절(비슷한 사람·기념일 추천)의 계산 방식은 **아직 확정 아님** — 디테일을 다시 잡은 뒤 수정 예정. 이번에는 화면(§4-2~4-4)과 위시리스트·최근 종류 제외까지만 구현하고, 비슷한 사람 섹션은 빈 상태로 숨겨 두세요.

```sql
-- supabase/migrations/2026101600000_recommend.sql (제안)
create or replace function recommend_similar(
  p_region text, p_exclude text[], p_meal text
) returns table (
  place_key text, name text, category text, region text,
  similar_users int, similar_verified int, similar_revisit int,
  similar_avg numeric, total_verified int, shared_top text[]
) language sql security definer set search_path = public as $$ ... $$;
```

- 비슷한 사람 = 내가 4.0 이상 준 인증 가게 중 **3곳 이상**에 똑같이 4.0 이상을 준 사용자
- 그 사람들이 인증했고 내가 아직 기록하지 않은 가게를 `similar_verified` 많은 순 → `similar_avg` 순으로 정렬
- 개인정보: `similar_verified` 가 **3 미만인 가게는 내보내지 않음**, 사용자 id 는 반환하지 않음
- `shared_top`: 이 사람들과 겹치는 내 가게 중 내 별점 높은 순 2곳 (까닭 2번 문장)
- 연인 기록이면 같은 계산을 「연인 기록장」 단위로(두 사람의 별점 평균) 하고, 비교 대상도 다른 연인 기록장으로

**기념일 추천** (연인만): 다른 연인 기록장에서 기념일(`anniversary.ts` 규칙) 당일에 인증된 가게, 위와 같은 비슷한 기록장 기준.

---

## 5. 확인할 것

- [ ] 개인 기록에서 `account` 탭을 숨긴 뒤 딥링크·알림이 `/(tabs)/account` 로 가는 곳이 있으면 BookDrawer 경로와 똑같이 동작하는지
- [ ] 비슷한 사람이 23명처럼 충분하지 않은 초기 사용자: 섹션을 숨기고 위시리스트 + 「이 동네에서 인증 많은 곳」으로 대체
- [ ] 위치 권한 거부 시 동네 시트에서 「지금 있는 곳」 행 숨김, 기본값은 가장 자주 기록한 동네
