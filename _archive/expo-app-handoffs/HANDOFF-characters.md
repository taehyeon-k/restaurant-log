# Handoff: 캐릭터 모으기 (뽑기 · 도감 · 닉네임 옆 캐릭터)

대상 저장소: `taehyeon-k/restaurant-log` (main)
시제품: `DINARY 캐릭터.dc.html` — **이 파일을 `handoff/characters/` 에 함께 넣어 주세요.** 캐릭터 그림(SVG)의 원본입니다.
범위: `expo-app/` 전체 + DB 마이그레이션 + 웹(`src/`)은 닉네임 옆 캐릭터 표시만.

---

## 0. Claude Code 에게

아래 명세대로 구현해 주세요.
- 순서: ① 마이그레이션 → ② SVG 컴포넌트 → ③ 내계정 → ④ 도감 → ⑤ 뽑기 → ⑥ 웹 표시.
- 끝나면 `expo-app` 에서 `npx tsc --noEmit`, `npx expo export --platform ios` 를, 루트에서 `npm run build` 를 돌려 통과를 확인하고 바꾼 파일 목록을 알려 주세요.
- 새 네이티브 패키지는 넣지 마세요. 그림은 이미 있는 `react-native-svg`, 움직임은 React Native `Animated` 로 합니다.
- 색·글꼴은 `src/theme` 의 `C`, `F` 를 씁니다. 아래 hex 는 시제품 값 그대로입니다.
- 마이그레이션은 파일만 만들고 **실행하지 마세요.** 제가 Supabase SQL Editor 에서 돌립니다.

---

## 1. 캐릭터 목록 — `expo-app/src/lib/characters.ts` (신규, 웹 `src/lib/characters.ts` 에도 같은 파일)

| id | 이름 | 등급 |
|---|---|---|
| `plate` | 빈 접시 | 보통 (가입 시 기본 지급) |
| `onigiri` | 주먹밥 | 보통 |
| `tteok` | 떡볶이 떡 | 보통 |
| `ramen` | 라면 | 보통 |
| `pizza` | 피자 조각 | 레어 |
| `burger` | 햄버거 | 레어 |
| `sushi` | 연어 초밥 | 레어 |
| `fish` | 생선구이 탈 | 전설 |

등급 표기·색 (`RARITY`):

| 등급 | 확률 | 글자색 | 바탕 |
|---|---|---|---|
| 보통 | 65% | `#8a8377` | `#f1ede4` |
| 레어 | 30% | `#5f7a8a` | `#e9eff2` |
| 전설 | 5% | `#b58a2b` | `#fbf4e2` |

뽑기는 **등급을 먼저 확률로 정하고, 그 등급 안에서 균등하게** 하나를 고릅니다(서버 함수 §2에서).

---

## 2. DB — `supabase/migrations/20261014000000_add_characters.sql`

```sql
-- 대표 캐릭터 + 덤 뽑기권(중복 3개 전환분)
alter table public.profiles add column if not exists character_id text not null default 'plate';
alter table public.profiles add column if not exists ticket_bonus int not null default 0;

-- 가진 캐릭터
create table if not exists public.user_characters (
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id text not null,
  count        int  not null default 1,
  first_at     timestamptz not null default now(),
  primary key (user_id, character_id)
);

-- 뽑은 기록(쓴 뽑기권 수 = 이 표의 행 수)
create table if not exists public.character_draws (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id text not null,
  drawn_at     timestamptz not null default now()
);

alter table public.user_characters enable row level security;
alter table public.character_draws enable row level security;
create policy "own characters read" on public.user_characters for select using (auth.uid() = user_id);
create policy "own draws read"      on public.character_draws for select using (auth.uid() = user_id);
-- 쓰기 정책은 두지 않습니다 — 쓰기는 아래 security definer 함수로만.

-- 기존 계정에 빈 접시 지급
insert into public.user_characters (user_id, character_id)
select id, 'plate' from public.profiles on conflict do nothing;
```

`handle_new_user()` 트리거(최신본은 `20261004000000_signup_leaves_nickname_empty.sql`)에 **빈 접시 지급 한 줄**을 더해 다시 정의합니다. 닉네임을 비워 두는 지금 동작은 그대로 둡니다.

### 뽑기권 계산 (함수 `available_tickets(p_label_count int)`)
```
가입 선물 1
+ floor(인증 기록 수 / 5)        -- restaurants: user_id = auth.uid(), verified = true, pending = false
+ p_label_count                  -- 받은 라벨 수(동네 칭호 포함). 지금은 라벨을 앱 코드(labels.ts)가 계산하므로 인자로 받습니다.
+ profiles.ticket_bonus          -- 중복 전환으로 얻은 것
- character_draws 행 수          -- 이미 쓴 것
```
> TODO(랭킹 전): 라벨 수를 앱이 넘기면 조작할 수 있습니다. 커뮤니티 랭킹을 열기 전에 라벨 계산을 DB 쪽으로 옮기세요.

### 뽑기 (함수 `draw_character(p_label_count int) returns json`, security definer)
1. `available_tickets` 가 1 미만이면 예외 `no_ticket`.
2. 0–100 난수로 등급: `< 65` 보통, `< 95` 레어, 나머지 전설. 그 등급 id 중 하나를 균등 선택.
3. `character_draws` 에 한 줄, `user_characters` 에 upsert(`count + 1`).
4. **중복 전환:** 그 결과 `count` 가 3이 되면 `count = 1` 로 되돌리고 `profiles.ticket_bonus + 1`. (1개는 남기고 2개가 뽑기권 1장으로 바뀜)
5. 돌려줄 값: `{ character_id, count, is_new, converted, tickets_left }`

### 대표 캐릭터 바꾸기
`profiles.character_id` 는 기존 `own profile` 정책으로 앱이 직접 `update` 합니다. 단, **가진 캐릭터만** 고를 수 있게 앱에서 막고, DB 에도 `user_characters` 에 있는지 확인하는 트리거나 체크를 두세요.

---

## 3. 캐릭터 그림 — `expo-app/src/components/Character.tsx` (신규)

- `handoff/characters/DINARY 캐릭터.dc.html` 안의 `<symbol id="ch-…">` 8개(`ch-pig` 는 쓰지 않음)와 `ut-fork`, `ut-spoon` 을 `react-native-svg` 컴포넌트로 옮깁니다.
- 모든 캐릭터 viewBox 는 `0 0 200 212`. 포크·숟가락은 `<use>` 대신 `G` + `translate/scale` 로 펼쳐 넣으세요(react-native-svg 의 `Use` 는 `Defs` 와 함께 쓰면 됩니다 — 편한 쪽으로).
- props: `{ id: CharacterId; size: number; locked?: boolean }` — 높이는 `size * 212 / 200`. `locked` 이면 모든 채움·선을 `#1c1a17` 로 칠하고 `opacity: 0.12` (도감의 실루엣).
- 웹(`src/`)에도 같은 SVG 로 `Character.tsx` 를 하나 둡니다(일반 `<svg>`).

---

## 4. 내계정 — `expo-app/app/(tabs)/account.tsx`

### 4.1 닉네임 줄
프로필 사진은 **그대로** 둡니다. 닉네임과 대표 라벨 칩 **사이**에 대표 캐릭터를 작게:
`닉네임(serif 21) · Character size=26 · 대표 라벨 칩`, 가로 `gap: 6`, 세로 가운데 정렬.

### 4.2 「내 캐릭터」 칸 — 통계(기록·인증·식당) 바로 아래, 「모은 라벨」 위
- 머리: 왼쪽 `내 캐릭터`(serif 15), 오른쪽 `{가진 수} / 8 ›`(mono 10.5 `C.faint`) → 누르면 도감(§5)
- 안내 10.5 `C.faint`: `탭하면 닉네임 옆과 랭킹에 이 캐릭터가 나옵니다`
- 가진 캐릭터 62×62 칸을 가로로 최대 3개(대표가 맨 앞), 넷째 칸은 점선 테두리 `+{나머지}` → 도감
  - 칸: radius 16, 테두리 1px `#e2ddd2`, 배경 `C.card`, 안에 `Character size=48`
  - 대표: 테두리 1.5px `C.brick`, 배경 `C.brickSoft`
  - 탭하면 대표로 바꿉니다.
- 뽑기권 카드 `marginTop: 12`: radius 18, 테두리 1px `#e0c3b1`, 배경 `#f9f0e9`, 안쪽 `12/14`
  - 왼쪽: `뽑기권 {n}장`(serif 15) / `다음 장까지 인증 기록 {5 - 인증수 % 5}건`(mono 10 `C.faint`)
  - 오른쪽: 짙은 단추 `밥솥 열러 가기` (min-height 40, radius 14) → 뽑기(§6). 0장이면 비활성.

---

## 5. 도감 — `expo-app/app/characters.tsx` (신규 라우트)

- `ScreenHead` 골격: eyebrow `CHARACTERS`, 제목 `캐릭터 도감`, 오른쪽에 `{가진 수} / 8`(mono 11)
- 그 아래 띠(radius 16, `#e0c3b1` / `#f9f0e9`): `뽑기권 {n}장 · 인증 기록 {인증수 % 5} / 5` + 짙은 작은 단추 `뽑기`
- 등급별 묶음을 **전설 → 레어 → 보통** 순서로. 머리는 등급 이름(mono 10, 등급 글자색, `letterSpacing 1.8`) + 오른쪽으로 1px `#e2ddd2` 선.
- 3열 격자 `gap: 8`. 칸: radius 16, 안쪽 `8/4/9`, `Character size=64` + 이름 11.5 + 개수 줄(mono 9.5)
  - 가진 것: 배경 `C.card`, 테두리 `#e2ddd2`. 개수 `×{count}`, 빈 접시는 `×1 · 기본`, `count === 2` 면 `×2 · 1개 더 → 뽑기권`(글자 `C.brick`)
  - 대표: 테두리 1.5px `C.brick` + 왼쪽 위 작은 띠 `대표`(9px, 배경 `C.brick`)
  - 없는 것: 배경 `#f1ede4`, `locked` 실루엣, 이름 자리에 `???`(`#a29a8c`), 개수 줄 없음
- 가진 칸을 탭하면 대표로 바꿉니다.

---

## 6. 뽑기 — `expo-app/app/draw.tsx` (신규 라우트)

화면(배경 `C.paper`):
- 왼쪽 위 ←, 오른쪽 위 작은 띠 `뽑기권 {n}장`(`#e0c3b1` / `#f9f0e9`, 글자 `C.brick`)
- eyebrow `RICE COOKER`, 제목 `오늘의 밥솥`(serif 26), 안내 12 `C.faint`:
  닫힘 `밥솥을 눌러 뚜껑을 여세요` / 열림 `뚜껑이 열렸습니다` / 0장 `뽑기권이 없습니다 — 인증 기록 5건마다 1장`
- 가운데 **밥솥**(260×220) — 시제품 2c 의 SVG 를 그대로 옮깁니다. 층 순서(아래→위):
  1. 솥 안쪽(타원 `#e4dfd3` + 밥 `#fbfaf6`)
  2. 캐릭터(116×123)
  3. 솥 몸통(앞면이 캐릭터 아랫부분을 가림) + 조작판(`#2f3a30`, 램프 닫힘 `#e8735e` / 열림 `#8fb35a`)
  4. 뚜껑(돔 `#f1ede4`, 손잡이 `C.brick`)
  5. 김 세 줄(`#cfc8ba`)
- 확률 줄(화면 맨 아래, mono 10 `#a29a8c`): `보통 65 · 레어 30 · 전설 5` — 열리면 숨김

움직임(밥솥을 탭하면 `draw_character` 를 부르고, **응답이 온 뒤에** 시작):
| 대상 | 닫힘 → 열림 | 시간 |
|---|---|---|
| 뚜껑 | 왼쪽 경첩(뚜껑 기준 `30, 86`) 기준 `rotate(-38deg)` + `translate(-4, -6)` | 600ms, 살짝 튕김 |
| 캐릭터 | `translateY(70) scale(.8)` → `translateY(-40) scale(1.08)` | 700ms, 250ms 늦게, 튕김 |
| 김 | opacity 0 → 1 | 500ms, 200ms 늦게 |
| 결과 | opacity 0 → 1 | 400ms, 700ms 늦게 |

결과(밥솥 아래, 가운데 정렬):
- 등급 띠(등급 글자색·바탕·1px 테두리, mono 10) + 옆에 `NEW`(처음) 또는 `×{count}`(짙은 벽돌 띠)
- 이름 serif 24
- 한 줄 12 `C.faint`:
  - 처음: `도감에 새로 들어갔습니다`
  - 전환됨(`converted`): `같은 캐릭터 3개 — 1개만 남기고 뽑기권 1장으로 바뀌었어요`
  - 그 밖: `이미 있는 캐릭터 · {3 - count}개 더 모으면 뽑기권`
- 단추: `대표 캐릭터로 쓰기`(짙은) / `한 번 더 · 뽑기권 {n}장`(테두리). 「한 번 더」는 뚜껑을 닫고(역재생) 650ms 뒤 다시 뽑습니다. 0장이면 비활성 + `뽑기권이 없습니다`.

`no_ticket` 오류는 안내 줄에 그대로 보여 주고 뚜껑을 열지 않습니다.

---

## 7. 웹 — 표시만

`src/app/_components/mobile/AccountScreen.tsx` 닉네임 줄에 §4.1 과 같은 순서로 `Character size=26` 을 넣습니다. `src/app/page.tsx` 의 profiles select 에 `character_id` 를 더하고 `AccountInfo` 에 `characterId` 를 추가합니다. 뽑기·도감은 웹에 만들지 않습니다.

---

## 8. 이번에 하지 않는 것

- 커뮤니티 랭킹 화면(나중에 `캐릭터 · 닉네임 · 대표 라벨` 순서로 한 줄에 나오게 됩니다 — 이번에 만드는 `Character` 컴포넌트를 그대로 씁니다)
- 랭킹 기준, 캐릭터 추가·이벤트 확률

## 9. 접점

- `supabase/migrations/20261014000000_add_characters.sql` — 신규
- `expo-app/src/lib/characters.ts`, `src/lib/characters.ts` — 신규
- `expo-app/src/components/Character.tsx`, `src/app/_components/Character.tsx` — 신규
- `expo-app/app/(tabs)/account.tsx` — §4
- `expo-app/app/characters.tsx`, `expo-app/app/draw.tsx` — 신규
- `expo-app/src/data/profile.ts` — `character_id`, 뽑기권·가진 캐릭터 불러오기
- `src/app/_components/mobile/AccountScreen.tsx`, `src/app/page.tsx` — §7
