# DINARY — Expo 네이티브 앱

Next.js 웹앱(`../src`)을 **Expo(React Native) 네이티브 앱**으로 옮긴 것입니다.
웹뷰 래퍼가 아니라 진짜 네이티브 앱입니다 — `.dc.html` 디자인은 RN 컴포넌트로 다시 그렸습니다.

- 내비게이션 **1a** — 하단 탭 4개 + 가운데 솟은 카메라 버튼(전체화면 모달)
- 비주얼 **1d** — 「종이 위의 네이티브」. 종이 팔레트와 세리프를 유지하되 시트·제스처·햅틱은 네이티브 규범
- 백엔드는 **Supabase 그대로** — 스키마 변경 없음

## 첫날에 할 일

네이버 지도 SDK와 백그라운드 위치는 **Expo Go 에서 돌지 않습니다.** 개발 빌드부터 세우세요.

```bash
cd mobile
npm install
cp .env.example .env          # 값 채우기 (아래 참조)
npx expo prebuild             # app.json 의 config plugin 적용
eas build --profile development --platform all
npm start                     # --dev-client
```

### 환경 변수

| 이름 | 쓰임 |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | 웹과 같은 프로젝트 |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | anon key |
| `EXPO_PUBLIC_KAKAO_REST_API_KEY` | 장소 검색·역지오코딩. 앱 번들에 들어가므로 카카오 콘솔에서 패키지명·번들 id 로 플랫폼을 묶어 두세요 |
| `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID` | `app.json` 의 `@mj-studio/react-native-naver-map` plugin `client_id` 와 같은 값 |

`app.json` 의 `client_id` 는 `SET_NAVER_MAP_CLIENT_ID` 자리표시자입니다 — prebuild 전에 실제 값으로 바꾸세요.

### Supabase 쪽 설정 두 가지

1. **Redirect URL** 목록에 `dinary://auth` 를 추가합니다(OAuth 가 앱으로 돌아올 자리).
2. **회원 탈퇴 엣지 함수**를 배포합니다 — 서비스 롤 키가 필요한 일이라 앱에서 직접 할 수 없습니다.
   ```bash
   supabase functions deploy delete-account   # ../supabase/functions/delete-account
   ```

## 구조

```
app/
  _layout.tsx              Stack (root) · 폰트 · 로그인 문지기 · 큐/지오펜스 구독
  (tabs)/_layout.tsx       탭 4개 + 절대 위치 카메라 버튼
  (tabs)/calendar.tsx      캘린더
  (tabs)/index.tsx         지도            ← 기본 탭
  (tabs)/wish.tsx          위시리스트
  (tabs)/account.tsx       내계정
  capture.tsx              촬영 흐름       presentation: 'fullScreenModal'
  place/[key].tsx          장소 상세
  record/new.tsx           기록 추가
  record/[id]/index.tsx    기록 상세
  record/[id]/edit.tsx     기록 편집
  wish/new.tsx             위시 담기·고치기 (?id= 로 고치기)  presentation: 'modal'
  drafts.tsx               보관함 (+ 오프라인 큐 상태)
  day/[date].tsx           하루 상세
  labels.tsx               라벨첩
  login.tsx · welcome.tsx
src/lib/                   순수 로직 · supabase · 큐 · 알림 · 토큰
src/components/            지도 · 시트 · 폼 · UI 조각
```

### 그대로 복사한 파일

DOM 을 모르는 순수 로직입니다. 웹과 한 글자도 다르지 않습니다 — 고칠 일이 생기면 **양쪽을 함께** 고치세요.

```
src/lib/types.ts    src/lib/price.ts    src/lib/places.ts
src/lib/labels.ts   src/lib/regions.ts  src/lib/record.ts
```

## 웹과 달라진 것

| 자리 | 웹 | 앱 |
|---|---|---|
| 촬영 | `getUserMedia` + canvas + CSS 줌 | `expo-camera` 전체화면 + `expo-image-manipulator`(900px/0.72) + 실제 렌즈 배율 |
| 권한 | 브라우저가 알아서 | 단계 01 「권한 준비」 화면이 먼저 설명 |
| 장소 검색 | `/api/geocode` 서버 라우트 | `src/lib/geocode.ts` 가 카카오 로컬 API 직접 호출(응답 모양 동일) |
| 사진 업로드 | `dataUrlToBlob` | `fetch(uri).arrayBuffer()` |
| 로그인 | `/auth/callback` 라우트 | `expo-web-browser` + `dinary://auth` + PKCE |
| 회원 탈퇴 | `/api/account/delete` | supabase 엣지 함수 `delete-account` |
| 저장 | 네트워크를 기다림 | SQLite 큐 — 화면은 즉시 넘어가고, 연결되면 올라감 |
| 날짜 입력 | `<input type="date">` | `@react-native-community/datetimepicker` |
| 지도 톤 | CSS 필터 | 아래 참조 |
| clip-path 도형 | CSS polygon / 비대칭 radius | `react-native-svg` Polygon · Path |

### 아직 남은 것 (의도된 임시 조치)

- **지도 톤** — 네이티브 지도에는 필터를 걸 수 없습니다. 지금은 `rgba(246,243,236,0.18)`
  오버레이를 덮는 임시 해법이라 마커까지 살짝 흐려집니다. 정식 해법은 NCP 콘솔에 종이톤
  커스텀 스타일을 등록하고 style id 로 불러오는 것입니다 — 그때 `src/components/NaverMap.tsx`
  맨 아래 오버레이 `View` 를 지우세요.
- **앱 아이콘 · 스플래시** — `assets/*.png` 는 종이색 단색 자리표시자입니다. 1024×1024 실물이 필요합니다.
- **`piggy.png`** — `public/` 에서 그대로 옮겼습니다(1.2MB). `@2x`/`@3x` 로 잘라 두면 좋습니다.
- **EAS projectId** — `app.json` 의 `extra.eas.projectId` 가 0 으로 채워져 있습니다. `eas init` 이 채웁니다.
- **Android 백그라운드 위치** — Play 콘솔에 사용 목적 영상 제출이 필요합니다. 부담이 크면
  1차 출시에서는 앱 실행 중에만 확인하고(`app.json` 의 `ACCESS_BACKGROUND_LOCATION` 제거),
  지오펜스는 2차로 미루는 것도 합리적입니다.

### 명세에 없지만 넣은 것

- 지도 시트 헤더 아래 **「내 기록에서 찾기」 + 필터 버튼** — §4.1 헤더 명세에는 최근순 ▾ 뿐이지만,
  없애면 낱말·카테고리·인증 필터로 들어갈 길이 사라져 웹에 있던 기능이 통째로 빠집니다.
- 지도 오른쪽 아래 **+ 단추 · 보관함 단추** — 웹에 있던 진입점입니다. 시트를 따라 함께 움직입니다.

## 확인

```bash
npm run typecheck                                 # tsc --noEmit
npx expo export --platform ios --platform android # 번들이 실제로 만들어지는지
```
