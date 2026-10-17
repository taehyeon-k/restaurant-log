# HANDOFF — 링크로 위시 담기 (릴스·쇼츠) + 메뉴 👍👎

시안: `DINARY 링크로 위시 담기.dc.html` (1a·1b·1c·2a·3a), `DINARY 기록 쓰기 실제 화면.dc.html` (메뉴 줄)
대상: `expo-app/` (main@478bd2a 기준으로 읽고 씀)

작업 순서: **A(붙여넣기) → B(공유 버튼) → C(메뉴 👍👎)**. A가 끝나면 B는 같은 화면으로 링크만 넘기면 됩니다.

---

## 0. 데이터 — 마이그레이션

`supabase/migrations/20261017010000_wish_source.sql`

```sql
alter table wishes
  add column source_url  text,
  add column source_kind text check (source_kind in ('shorts','youtube','reels','instagram','tiktok','link'));
```

- `lib/types.ts` `Wish` 에 `source_url?: string | null; source_kind?: SourceKind | null;` 추가
- 기존 위시는 메모에 붙은 URL을 그대로 둡니다(옮기지 않음). 읽을 때 `source_url ?? firstUrl(note)` 로 함께 처리
- `restaurants.from_wish` jsonb 에 `source_kind` 를 더함: `{ saved_at, days, planned, source_kind }` (`wishMetInfo` 수정)

---

## A. 링크 붙여넣기

### A-1 링크 판별 — 신규 `src/lib/sourceLink.ts`

```ts
export type SourceKind = "shorts" | "youtube" | "reels" | "instagram" | "tiktok" | "link";

/** 텍스트에서 첫 URL 을 찾아 종류를 붙입니다. URL 이 없으면 null. */
export function parseSourceLink(text: string): { url: string; kind: SourceKind } | null
//  youtube.com/shorts/…              → shorts
//  youtube.com/watch · youtu.be/…    → youtube
//  instagram.com/reel(s)/…           → reels
//  instagram.com/p/…                 → instagram
//  tiktok.com/… · vt.tiktok.com/…    → tiktok
//  그 밖의 http(s)                    → link
//  추적용 쿼리(?si=, ?igsh=, utm_*)는 지우고 저장

export const SOURCE_LABEL: Record<SourceKind, string> = {
  shorts: "쇼츠", youtube: "유튜브", reels: "릴스", instagram: "인스타", tiktok: "틱톡", link: "링크",
};

/** 유튜브만 — oEmbed 로 제목·채널을 받습니다. 키 없음. 실패하면 null. */
export async function fetchYoutubeTitle(url: string, signal?: AbortSignal): Promise<{ title: string; author: string } | null>
//  GET https://www.youtube.com/oembed?url={encodeURIComponent(url)}&format=json
//  → { title, author_name }

/** 제목에서 검색어를 뽑습니다 — 지명(…동·…구·…역)과 음식 단어를 우선, 없으면 제목 앞 20자. */
export function queryFromTitle(title: string): string
```

- 인스타·틱톡은 제목을 가져오지 **않습니다**(공식 경로 없음, 웹 긁기 금지)

### A-2 위시 폼 — `app/wish/new.tsx` (시안 1a·1c)

새 위시(`isNew`)일 때만, 제목 줄 아래·「가게」 위에:

**링크 없을 때 — 「링크 붙여넣기」 버튼 (1a)**
- 높이 56, radius 16, 테두리 1.5 **점선** `#c9a593`, 배경 `C.card`, 가로 패딩 16
- 왼쪽 링크 아이콘 20px 벽돌색(stroke 1.8) · 가운데 「링크 붙여넣기」 13.5 `F.sansMd` · 오른쪽 「릴스 · 쇼츠」 Mono 10.5 `C.faint`
- 누르면 `Clipboard.getStringAsync()` (`expo-clipboard`, 이미 설치됨) → `parseSourceLink`
  - 링크면 → `router.push("/wish/link", { url, kind })` (A-3)
  - 아니면 → 버튼 가볍게 흔들기(Haptics.notificationAsync Warning) + 아무 문구 없음
- **앱이 켜질 때 클립보드를 자동으로 읽지 않습니다**(iOS 붙여넣기 알림 방지)

**링크 붙었을 때 — 출처 띠 (1c)**
- radius 14, 테두리 1 `#e0c3b1`, 배경 `#f9efe8`, 패딩 10/14, 가로 정렬 gap 10
- 왼쪽 26px 검정 사각(radius 8) 안에 흰 ▶(유튜브 계열) — 인스타·틱톡·링크는 같은 자리에 각 출처 글자 첫 자
- 가운데 `「{SOURCE_LABEL}에서 담음 · {짧은 주소}」` 12 `#8f4323` 한 줄 말줄임 (짧은 주소 = 호스트 + 첫 경로 + `…`)
- 오른쪽 ✕ 11 `#a29a8c` → 띠 제거(source_url·kind 비움)
- 저장 시 `payload` 에 `source_url`, `source_kind` 포함

**메모 칸**
- 제목 「가고 싶은 이유, 어디서 봤는지」 → **「어떤 장소인가요?」**
- placeholder 「마음껏 적어두세요. 링크를 붙여두면 카드에서 바로 열립니다.」 → **「마음껏 적어두세요.」**

**그 밖**
- 「근처를 지나면 알려주기」 아래 보조문 「이 가게에만 걸리는 알림입니다.」 삭제
- 기존 중복 위시 처리(`matchWish` → 그 위시로 이동)는 그대로. 기존 위시에 `source_url` 이 비어 있으면 이번 링크로 채움

### A-3 가게 찾기 — 신규 `app/wish/link.tsx` (시안 1b)

모달(`presentation: "modal"`), 배경 `C.paper`, 가로 패딩 20.

- 머리: 「어느 가게인가요」 `F.serif` 18 + 오른쪽 「취소」 13 `C.faint`
- **링크 카드**: radius 16, 테두리 1 `C.lineSoft`, 배경 `C.card`, 패딩 12/14
  - 왼쪽 36px 검정 사각(radius 10) + 흰 ▶
  - 위 Mono 10 letterSpacing 1 `C.faint`: `YOUTUBE 쇼츠` / `INSTAGRAM 릴스` / …
  - 아래 13 한 줄 말줄임: 유튜브는 oEmbed 제목, 그 밖은 짧은 주소
- **가게 검색칸**: 「가게」 Eyebrow + `fieldStyle`(radius 14, minHeight 46), 들어오자마자 포커스(autoFocus)
  - 포커스 테두리 1.5 `C.brick`, 왼쪽 돋보기
  - 유튜브: `queryFromTitle(title)` 을 미리 넣고 바로 검색
  - 그 밖: 빈 칸
- **결과 목록**: `searchFoodPlaces` (위시 폼과 같은 카카오 음식점·카페 검색, 250ms 디바운스, 6개)
  - 위시 폼 제안 목록과 같은 모양: radius 14, 테두리 `C.line`, `SHADOW.card`, 줄 패딩 11/14, 이름 13.5 `F.sansMd` + 「한식 · 주소」 11.5 `C.muted`
- 결과를 누르면 → `router.replace("/wish/new", { name, where_text, category, lat, lng, source_url, source_kind })`
  - `wish/new.tsx` params 에 `source_url`, `source_kind` 추가해 출처 띠로 받음
- 안내 문구는 넣지 않습니다(시안에서 뺌)

---

## B. 공유 버튼으로 담기 (시안 2a)

### B-1 설치
- `npx expo install expo-share-intent` (Expo 57 호환 버전), `app.json` plugins 에 추가
  - iOS: `iosActivationRules: { NSExtensionActivationSupportsWebURLWithMaxCount: 1, NSExtensionActivationSupportsText: true }`
  - Android: `androidIntentFilters: ["text/*"]`
  - App Group `group.app.dinary` (애플 개발자 콘솔에서 생성 필요)
- 개발 빌드 다시 만들기 (`expo run:ios`, `expo run:android`, EAS)

### B-2 받기 — `app/_layout.tsx`
- `useShareIntent()` 로 들어온 텍스트·URL → `parseSourceLink`
  - 링크면 `router.push("/wish/link", { url, kind })` — **A-3 과 같은 화면**
  - 링크가 아니면 무시
- 로그인 전이면 링크를 `store.pendingShare` 에 두었다가 로그인 끝나면 이어서 이동
- 처리 뒤 `resetShareIntent()`

### B-3 표시
- 공유 시트 이름 「DINARY」, 아이콘은 앱 아이콘 그대로
- 앱 안에 작은 시트로 바로 담기(Extension UI)는 **이번 범위 아님**. 고르면 앱이 열립니다

---

## A·B 공통 — 위시 시트 `app/wish/[id].tsx` (시안 3a)

- `url = wish.source_url ?? firstUrl(wish.note)`
- 보조줄(종류 · 자리) 아래, 출처가 있으면 태그:
  - `「{SOURCE_LABEL}에서 담음 · {MM.DD}」` Mono 10.5 `#4d4842`, 배경 `#efebe2`, radius 9, 패딩 4/10
  - 날짜는 `saved_at`. 출처 종류를 모르는 옛 위시(메모 URL)는 태그 없음
- 버튼 줄
  - 「여기 왔어요 · 사진 찍기」 → **카메라 아이콘(18, `CameraIcon` stroke `C.card`) + 「여기 왔어요」**, gap 7
  - 알림 종 단추 그대로
  - 기존 「↗」 44px 원형 단추 → **알약 단추 「{SOURCE_LABEL}에서 보기 ↗」**: 높이 44, radius 22, 테두리 `C.line`, 배경 `C.card`, 패딩 0/13, 12 `#4d4842`, 오른쪽 바깥 화살표 아이콘 13
    - 출처 종류 없으면 「원본 보기 ↗」
    - `Linking.openURL(url)` — 설치된 앱이면 그 앱에서 재생
- 메모 본문은 `noteWithoutUrl` 그대로

### 인증 시 — `from_wish.source_kind`
- `wishMetInfo(wish, visitedAt)` 에서 `source_kind: wish.source_kind ?? null` 추가
- 기록 상세의 위시 자취 문구에 출처가 있으면 「{SOURCE_LABEL}에서 본 지 {days}일 만에」 (없으면 지금 문구 그대로)

---

## C. 기록 쓰기 — 메뉴 가격 → 👍👎 (`app/record/edit.tsx`)

### C-1 데이터
- `MenuItem` 타입: `{ name: string; price: number | null }` → **`{ name: string; vote: 1 | -1 | null; price?: number | null }`**
  - `price` 는 옛 기록 읽기용으로만 남김(쓰지 않음)
- 저장 `menus: menus.filter(m => m.name.trim()).map(m => ({ name: m.name.trim(), vote: m.vote ?? null }))`
- `price_range: menuTotal || null` → **저장하지 않음**(기존 값 유지). `menuTotal`·`menuTotalLabel`·`menuDigits` 삭제
- 메뉴 제목 줄 오른쪽 합계(「2개 · 24,000원」) 삭제

### C-2 메뉴 한 줄
- `[먹은 것 입력칸 flex:1] [👍] [👎] [✕(2줄 이상일 때)]`, gap 6
- 👍 / 👎 단추: 46×46, radius 14, 테두리 1 `#ded8cb`, 배경 `C.card`, 아이콘 19 stroke 1.7 `#a29a8c`
  - 👍 켜짐: 배경·테두리 `C.brick`, 아이콘 `C.card`
  - 👎 켜짐: 배경·테두리 `C.ink`, 아이콘 `C.card` (👍 아이콘을 180° 돌린 것)
  - 같은 단추 다시 누르면 꺼짐(null). 한쪽을 켜면 다른 쪽은 꺼짐
  - `accessibilityLabel`: 「좋았어요」 / 「별로였어요」
- 아이콘은 `components/icons.tsx` 에 `ThumbIcon` 추가 (24 좌표, 시안 path 사용)

### C-3 영향 받는 곳
- 체감 가격 계산 `feltLevel` 은 `price_range` 를 보던 옛 기록 호환이 있으니 그대로 둠
- 기록 상세·목록에서 메뉴 가격을 보여주던 곳 → 👍 메뉴는 이름 앞에 작은 벽돌색 👍, 👎 메뉴는 `C.faint` 👎. 가격 표시 제거
- 추천(`lib/rec/*`)에서 메뉴 가격을 쓰는 곳이 있으면 확인(없으면 무시)

---

## 확인할 것

- [ ] iOS App Group·Share Extension 서명 (EAS credentials)
- [ ] 인스타 앱 공유 시트에서 DINARY 가 보이는지 실기기 확인 (iOS·Android)
- [ ] 유튜브 oEmbed 실패(비공개·삭제 영상) 시 짧은 주소로 대체되는지
- [ ] 같은 링크로 두 번 담을 때 중복 위시 처리
- [ ] 옛 기록의 `menus[].price` 가 있어도 화면이 깨지지 않는지
