# DINARY — 반영 요청서 #2 (인증 마크 + 기록 작성 폼)

대상 저장소 `taehyeon-k/restaurant-log` (branch `main`).
1차 요청서(HANDOFF.md, 8개 항목)와 별개의 추가 건입니다. 항목은 9·10 두 개.

## 참고 디자인 파일

| 파일 | 무엇 |
| --- | --- |
| `DINARY Mobile.dc.html` | 모바일 앱 화면 전체. 기록 작성 폼과 새 인증 마크가 실제로 들어가 있음 |
| `DINARY Mobile Design.dc.html` | 모바일 화면을 나란히 놓은 보드 |
| `mark-a.dc.html` | 새 인증 마크만 네 가지 크기로 뽑아 둔 판 |
| `support.js`, `public/piggy-sm.png` | 위 파일들을 브라우저에서 그냥 열려면 같은 폴더에 있어야 함 |

## 공통 토큰

```
종이 배경 #f6f3ec   카드 #fbfaf6   선 #d8d3c8 / #ded8cb / #e6e0d3
먹색 #1c1a17   보조 #4a453d / #6b665e / #8a8377 / #a29a8c
벽돌색(주) #b4552d   연한 벽돌 #f9f0e9   벽돌 테두리 #e2c9bb   인증 카드 테두리 #e0c3b1
제목 Gowun Batang 700 · 본문 Noto Sans KR · 숫자/라벨 JetBrains Mono
```

터치 대상 최소 44px, 본문 11.5px 이상.

---

## 9. 인증 마크를 밀랍 인장으로

**지금** 24각 톱니 별(`clip-path: polygon(...)`) 안에 꺾인 체크가 들어 있습니다.
톱니가 잘게 튀어 작은 크기에서 지저분하고, 다른 서비스의 파란 체크와 형태가 겹칩니다.

**해야 할 일** — clip-path 를 버리고 **인라인 SVG 한 덩이**로 바꿉니다.
밀랍을 눌러 찍은 자국(가장자리 물결 12개) + 붓끝처럼 끝이 도는 체크입니다.

`src/app/_components/VerifiedMark.tsx` 를 새로 만들어 한 곳에서 관리하는 것을 권합니다.

```tsx
export function VerifiedMark({ size = 26, ring = size >= 40 }: { size?: number; ring?: boolean }) {
  const w = size >= 40 ? 1.9 : size >= 22 ? 2.4 : 2.8;   // 작을수록 체크를 굵게
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="인증" role="img">
      <path d="M12.00 0.80A3.1 3.1 0 0 1 17.60 2.30A3.1 3.1 0 0 1 21.70 6.40A3.1 3.1 0 0 1 23.20 12.00A3.1 3.1 0 0 1 21.70 17.60A3.1 3.1 0 0 1 17.60 21.70A3.1 3.1 0 0 1 12.00 23.20A3.1 3.1 0 0 1 6.40 21.70A3.1 3.1 0 0 1 2.30 17.60A3.1 3.1 0 0 1 0.80 12.00A3.1 3.1 0 0 1 2.30 6.40A3.1 3.1 0 0 1 6.40 2.30A3.1 3.1 0 0 1 12.00 0.80Z" fill="#b4552d" />
      {ring && (
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(251,250,246,.42)"
                strokeWidth="0.6" strokeDasharray="1.4 1.9" strokeLinecap="round" />
      )}
      <path d="M7.3 12.5C8.6 13.2 9.7 14.2 10.6 15.9C12.2 12.3 14.3 9.5 17.1 7.5"
            fill="none" stroke="#fbfaf6" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

규칙

- 색은 벽돌색 `#b4552d` 하나, 체크는 종이색 `#fbfaf6`. 마크 안에 다른 색을 넣지 않습니다.
- **점선 고리는 40px 이상에서만** 켭니다. 작은 크기에서는 점선이 뭉개집니다.
- 그림자는 `filter` 로 겁니다 (`box-shadow` 는 사각형이라 물결 밖으로 삐져나옵니다).
  - 작은 마크 `drop-shadow(0 2px 5px rgba(28,26,23,.22))`
  - 큰 마크 `drop-shadow(0 4px 12px rgba(28,26,23,.3))`
- 마크를 기울이거나 회전시키지 않습니다. 애니메이션 없음.

**붙는 자리**

| 자리 | 파일 | 크기 · 위치 |
| --- | --- | --- |
| 목록 카드 썸네일 모서리 (주) | `mobile/PlaceCard` 계열 | 26px, `position:absolute; right:-4px; bottom:-4px`, 고리 없음 |
| 기록 상세 사진 위 | `mobile/RecordScreen` | 52px, `right:16px; bottom:16px`, 고리 있음 |

**확인** 74px 썸네일 모서리에서 물결이 또렷하게 보이고, 카드 모서리를 넘어가 잘리지 않으며,
사진 위 52px 마크 안쪽에 점선 고리가 한 겹 보입니다.

---

## 10. 기록 작성 폼을 디자인대로

**지금** 실제 사이트의 기록 추가 화면이 디자인 파일과 다릅니다.
아래는 `DINARY Mobile.dc.html` 의 `formOpen` 화면을 위에서 아래로 그대로 옮긴 명세입니다.
해당 파일을 브라우저에서 열고 지도 오른쪽 아래 버튼으로 폼을 띄우면 실물을 볼 수 있습니다.

### 껍데기

- 화면 전체를 덮는 판. `position:absolute; inset:0; z-index:1300`, 배경 `#f6f3ec`, 세로 flex.
- **머리줄** `padding: 46px 14px 12px`, 아래 `1px solid #e6e0d3`.
  왼쪽 `취소` (13px `#8a8377`) · 가운데 `NEW RECORD` (Mono 10.5px, letter-spacing .16em, `#8a8377`) ·
  오른쪽 `저장` (13px 500, `#b4552d`, 저장 불가면 `#c4bcae` 회색 글자로 눌리지 않음).
  세 버튼 모두 최소 높이 44px.
- **본문** `flex:1; overflow-y:auto; padding: 20px 22px 40px`, 스크롤바 숨김.
- 제목 `h1` Gowun Batang 700 25px — 새로 쓰면 `오늘 뭐 먹었나요`, 고치면 `기록 고치기`.

### 칸 공통

라벨은 Mono 10px, letter-spacing .16em, `#8a8377`, 칸과 7px 띄웁니다.
입력은 높이 46px, radius 14, 테두리 `1px solid #ded8cb`, 배경 `#fbfaf6`, 글자 14px, `outline:none`.

### 순서

1. **가게** — 입력 한 칸, placeholder `가게 이름`.
2. **자리** — 입력 한 칸, placeholder `주소나 동네`. (지도에서 들어왔으면 이름·주소·좌표가 미리 채워짐)
3. **방문** — `type="date"`, 글꼴 Mono 13px. 기본값 오늘.
4. **종류** — 칩 줄바꿈. 높이 36px, radius 18, 12.5px.
   고름 = 배경·테두리 `#b4552d` + 글자 `#fdf9f3`, 안 고름 = 투명 배경 + 테두리 `#cdc6b8` + 글자 `#4a453d`. 하나만 선택.
5. **별점** — 별 다섯, 한 별 34×34, 글리프 27px. 빈 별 `#dcd6ca` / 찬 별 `#b4552d`.
   각 별 위에 **투명 버튼 두 개**(왼쪽 절반 = 0.5, 오른쪽 절반 = 1.0)를 겹쳐 반 별을 찍습니다.
   반 별은 찬 별 레이어의 `width: 50%` 로 표현. 오른쪽에 Mono 12px 로 `4.5`.
6. **체감 가격** — 돼지 다섯 마리(`/piggy-sm.png`, 22×21), 버튼 34×34.
   고른 개수까지 `opacity:1`, 나머지는 흐리게(`opacity:.35` + grayscale). 오른쪽에 12px 설명 글.
7. **재방문 의사** — 연한 벽돌 상자: 테두리 `#e2c9bb`, 배경 `#f9f0e9`, radius 18, padding 14/16.
   왼쪽 제목 13.5px 500 + 설명 11.5px `#6b665e` (꺼짐 `켜면 목록 필터와 지도 핀에 함께 반영됩니다` /
   켜짐 `다시 갈 곳으로 표시됩니다 — 지도 핀도 색이 찹니다`).
   오른쪽 스위치 트랙 50×28 radius 14 (켜짐 `#b4552d` / 꺼짐 `#d8d3c8`), 손잡이 24×24 흰 원,
   `left` 2px ↔ 24px, transition 160ms.
8. **메뉴** — 라벨 오른쪽 끝에 합계 Mono 11px `#8a8377` (`2개 · 20,000원`, 없으면 빈 문자열).
   줄마다: 이름 입력 `flex:1` (placeholder `먹은 것`) + 가격 입력 96px 고정
   (`inputMode="numeric"`, 오른쪽 정렬, Mono 13px, `padding-right:26px`, 오른쪽 안쪽에 `원` 12px `#a29a8c`)
   + 줄이 둘 이상일 때만 `✕` 버튼(34×46, `#a29a8c`, hover `#9a4a52`). 줄 간격 7px.
   아래에 점선 버튼 `+ 메뉴 추가` (높이 44, `1px dashed #cdc6b8`, hover 시 테두리·글자 `#b4552d`).
   숫자 처리: `replace(/[^0-9]/g,'').slice(0,9)` 로 저장하고 화면에는 `toLocaleString('ko-KR')`.
   저장할 때 `menu` = 이름을 `", "` 로 이은 문자열, `price_range` = 가격 합계(0이면 null).
9. **메모** — textarea 5줄, radius 14, padding 12/14, **Gowun Batang 14.5px line-height 1.8**,
   `resize:none`, placeholder `그날 자리, 맛, 다시 올 이유`.
10. **키워드** — 종류와 똑같은 칩, 여러 개 선택 가능.
11. **사진 안내** — 점선 상자(`1px dashed #d8d3c8`, radius 18, padding 14/16):
    카메라 선 아이콘 20px + `사진은 그 자리에서 찍으면 인증 도장이 함께 붙습니다.` (11.5px `#8a8377`).
12. **저장 버튼** — 폭 100%, radius 20, padding 16, 배경 `#1c1a17`, 글자 `#fbfaf6` 14.5px 500.
    채울 것이 남았으면 버튼 대신 같은 자리에 안내 글을 보여주고, 무엇이 비었는지 적습니다.

### 규칙

- 저장 가능 조건: 가게 이름과 별점. 둘 중 하나라도 비면 머리줄 `저장`과 아래 버튼이 함께 잠깁니다.
- 기존 기록을 고칠 때는 모든 값(재방문·메뉴 줄 포함)이 저장된 그대로 올라와야 합니다.
- 폼을 닫아도 지도 위치와 시트 높이는 그대로 둡니다.

**확인** 폼을 끝까지 내리면 위 12개가 이 순서로 있고, 메뉴 두 줄에 9,000 / 11,000 을 넣으면
라벨 오른쪽에 `2개 · 20,000원` 이 뜨고, 별 왼쪽 절반을 누르면 반 별이 찍힙니다.

## 마무리 확인

- [ ] 톱니 별 clip-path 가 코드에서 사라지고 인증 마크가 한 컴포넌트로 모였다
- [ ] 26px 마크에는 점선 고리가 없고 52px 마크에는 있다
- [ ] 기록 작성 폼 12개 칸이 명세 순서대로 있다
- [ ] 반 별, 돼지, 재방문 스위치, 메뉴 줄 추가/삭제가 모두 눌린다
- [ ] 기존 기록 수정에서 값이 그대로 올라온다
