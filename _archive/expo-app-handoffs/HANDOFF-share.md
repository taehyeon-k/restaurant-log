# Handoff: 기록 공유 (기본 공유창 버전)

대상 저장소: `taehyeon-k/restaurant-log` (main) — **`expo-app/` 만** 고칩니다. 웹(`src/`)은 이번 범위가 아닙니다.
시제품: `DINARY 기록 공유.dc.html`
범위: 카카오 SDK **없이** React Native 기본 `Share.share()` 로 보냅니다. 새 네이티브 패키지를 넣지 않으므로 다시 빌드할 필요가 없어야 합니다.

---

## 0. Claude Code 에게

아래 명세대로 구현해 주세요. 끝나면 `npx tsc --noEmit` 과 `npx expo export --platform ios` 가 통과하는지 확인하고, 바꾼 파일 목록을 알려 주세요.
- 새 npm 패키지는 설치하지 마세요. `expo-clipboard` 가 `package.json` 에 **이미 있을 때만** 「글 복사」를 넣고, 없으면 그 단추는 빼 주세요(공유창에 복사가 있으므로).
- 색·글꼴은 `src/theme` 의 `C`, `F` 를 쓰고 새 색을 만들지 마세요. 아래에 적힌 hex 는 시제품 값 그대로입니다.

---

## 1. 공유 단추 — 기록마다 작게

기록 **한 건** 단위로 공유합니다(가게 단위가 아님). 단추는 세 곳에 둡니다.

| 위치 | 파일 | 모양 |
|---|---|---|
| 기록 상세, 오른쪽 위 | `app/record/[id].tsx` | 44×44 원, 배경 `rgba(251,250,246,.92)`, 그림자 `0 2px 8px rgba(28,26,23,.14)` — 왼쪽 ← 단추와 같은 높이(`insets.top + 8`), `right: 16` |
| 가게 화면의 기록 줄 | `app/place/[key].tsx` (`place.visits.map`) | 30×30 원, 테두리 1px `#e4dfd3`, 배경 없음, 아이콘 14px `C.muted` — 줄 맨 아래(사진 장수 줄) 오른쪽 끝 |
| 그날 화면의 기록 줄 | `app/day/[date].tsx` | 위와 같은 30×30 |

- 작은 단추는 줄 전체 `Pressable` 안에 있지만 **누르면 기록 상세로 넘어가지 않고 시트만 열려야** 합니다.
- 터치 영역은 `hitSlop={8}` 로 44px 가깝게 넓혀 주세요.
- `pending`(보관함) 기록에는 단추를 두지 않습니다.

공유 아이콘(`src/components/icons.tsx` 에 `ShareIcon` 으로 추가, viewBox 24, stroke 1.7, round cap/join, fill none):
```
M12 3.5v11
M8 7.5l4-4 4 4
M6 11.5H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20.5h14a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5h-1
```

---

## 2. 공유 시트 — `src/components/ShareSheet.tsx` (신규)

`ui.tsx` 의 `BottomSheetModal` 안에 그립니다. props: `{ record: Restaurant; visible: boolean; onClose: () => void }`.

위에서부터:
1. `Eyebrow wide` — `기록 공유`
2. 가게 이름 — `F.serif` 22, `marginTop: 6`
3. 안내 — 11.5 `C.faint`, `marginTop: 4`: `어디까지 보낼지 고르세요. 아래로 갈수록 더 많이 보입니다.`
4. **범위 목록** — `marginTop: 14`, 테두리 1px `#ded8cb`, radius 18, 배경 `C.card`, 줄 사이 구분선 1px `#ece7dc`. 각 줄 `paddingVertical: 13, paddingHorizontal: 15`, 제목 13.5 `F.sansMd`, 부제 11 `C.faint`.

   | 줄 | 제목 | 부제 | 오른쪽 |
   |---|---|---|---|
   | ① | 가게 · 위치 · 메뉴 | 항상 함께 갑니다 | 24×24 원 `C.brickSoft` 안에 12px 체크(`C.brick`, stroke 2.4) — 끌 수 없음 |
   | ② | 별점 · 체감 가격 | `★ 4.5 · 돼지 2마리` (그 기록 값) | 스위치 |
   | ③ | 내가 쓴 기록 | ②가 켜져 있으면 `메모 전체를 함께 보냅니다`, 꺼져 있으면 `별점·체감 가격을 켜야 고를 수 있어요` | 스위치 |

   - ③은 **②가 켜져 있을 때만** 켤 수 있습니다. ②가 꺼지면 줄 전체 `opacity: 0.45`, 스위치 비활성.
   - ②를 끄면 ③도 함께 꺼집니다.
   - 기록에 별점·체감 가격이 둘 다 없으면 ②를, 메모가 비어 있으면 ③을 비활성으로 두고 부제를 `이 기록에는 없습니다` 로 바꿉니다.
   - 시트를 열 때마다 ②③ 은 **꺼진 상태**에서 시작합니다.

   스위치: 50×28, radius 14, 켜짐 `C.brick` / 꺼짐 `#d8d3c8`, 손잡이 24×24 `C.card` (꺼짐 `left: 2`, 켜짐 `left: 24`). `record/edit.tsx` 의 재방문 스위치와 같은 모양이니, 이미 컴포넌트가 있으면 그것을 `ui.tsx` 로 옮겨 함께 쓰세요.

5. `Eyebrow` — `미리보기`, `marginTop: 16`
6. **미리보기 상자** — `marginTop: 7`, radius 16, 테두리 1px `#e4dfd3`, 배경 `#ffffff`, `padding: 13/15`, 12.5 `F.sans`, 줄간격 1.65, 색 `#2e2a25`. **높이 제한 없이** 보낼 글 전체를 그대로 보여줍니다(시트가 길어지면 시트 안을 `ScrollView` 로).
7. 단추 줄 — `marginTop: 14`, `gap: 8`
   - `보내기` — `Button kind="dark"`, `flex: 1`. `Share.share({ message })` → 공유가 끝나면(`action === Share.sharedAction`) 시트를 닫습니다. 취소하면 시트를 그대로 둡니다.
   - `글 복사` — `Button kind="line"`, `paddingHorizontal: 18` (§0 조건부). 복사 후 단추 글자를 1.5초간 `복사했어요` 로.

---

## 3. 보낼 글 — `src/lib/share.ts` (신규)

```ts
export function buildShareText(r: Restaurant, opt: { rate: boolean; memo: boolean }): string
```

줄 순서(빈 줄로 덩어리를 나눕니다):

```
{이름} · {종류}                      ← 종류 없으면 이름만
{주소 ?? 지역}                        ← 둘 다 없으면 줄 생략

먹은 것
{메뉴 이름} {가격}원                  ← menus 의 이름 있는 항목마다, 가격은 toLocaleString("ko-KR"), 없으면 이름만
                                      ← menus 가 비면 r.menu 한 줄, 그것도 없으면 이 덩어리 생략

별점 {4.5} / 5 · 체감 가격 돼지 {2}/5 ({가볍게 한 끼})     ← opt.rate 일 때만. 값 없는 쪽은 빼고 · 도 정리

{메모 전문}                           ← opt.rate && opt.memo 이고 review 가 있을 때만

지도 https://map.naver.com/p/search/{encodeURIComponent(이름 + " " + 주소)}
DINARY에서 보냄
```

- 체감 가격은 `src/lib/price.ts` 의 `feltLevel`, `feltLabel` 을 씁니다.
- **방문 날짜·인증 시각은 넣지 않습니다.**
- 시트 미리보기와 실제로 보내는 글은 반드시 이 함수 하나에서 나와야 합니다.

예 — ②③ 모두 켬:
```
부촌육개장 · 한식
서울 중구 수표로 12

먹은 것
육개장 11,000원
수육(소) 28,000원

별점 4.5 / 5 · 체감 가격 돼지 2/5 (가볍게 한 끼)

국물이 진하고 고기가 많다. 깍두기도 맛있음. 점심엔 줄이 길어서 11시 반 전에 가는 게 좋다.

지도 https://map.naver.com/p/search/%EB%B6%80%EC%B4%8C...
DINARY에서 보냄
```

---

## 4. 이번에 하지 않는 것

- 카카오톡 카드 메시지(카카오 SDK) — 나중에 `ShareSheet` 의 「보내기」만 갈아 끼우면 되도록, 글 만들기(`share.ts`)와 보내기를 분리해 두세요.
- 사진 첨부, 공개 링크 페이지, 웹(`src/`) 쪽 공유.

## 5. 접점

- `src/components/icons.tsx` — `ShareIcon`
- `src/components/ui.tsx` — 스위치 공용화(필요하면)
- `src/components/ShareSheet.tsx` — 신규
- `src/lib/share.ts` — 신규
- `app/record/[id].tsx`, `app/place/[key].tsx`, `app/day/[date].tsx` — 단추 + 시트 연결
