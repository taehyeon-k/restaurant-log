# DINARY — Expo 앱

`Restaurant app mobile design.zip` 핸드오프(1a 내비게이션 + 1d 비주얼)를 옮기는 중인 네이티브 앱입니다.
웹(Next.js)과 같은 Supabase 백엔드를 씁니다. 스키마 변경 없음.

## 시작

```bash
cd expo-app
cp .env.example .env      # Supabase 키, API 주소 채우기
npm install
npx expo install expo-dev-client
eas build --profile development --platform all   # 네이버 지도·백그라운드 위치는 Expo Go 불가
npm start
```

## 진행 상황 (핸드오프 §10)

| 단계 | 상태 |
|---|---|
| ① 프로젝트·Supabase 인증(카카오 딥링크)·폰트 | 완료 |
| ② `lib/` 복사 + 디자인 토큰 | 완료 — `types/price/places/record.ts` 는 웹에서 그대로 복사, `regions/labels.ts` 도 복사 |
| ③ 탭 뼈대(1a) + 화면들 | 완료 — 캘린더·지도·위시·내계정, 가게/기록/기록 편집/하루/보관함/라벨첩/위시 폼·시트/자리 고르기/환영 |
| ④ 촬영 흐름 | 완료 — 권한 → 촬영 → 후보 → 가게 찾기 → 인증 완료 |
| ⑤ 네이버 지도 + 마커 | 완료 — `@mj-studio/react-native-naver-map`, SVG 마커, gorhom 시트(12/46/88%) |
| ⑥ 오프라인 큐 | 완료 — expo-sqlite + 문서 폴더 사진, 지수 백오프, 3회 실패 시 보관함 「올리지 못함」 |
| ⑦ 알림·지오펜스 | 완료 — 위시 50m Region Monitoring(가까운 20곳), 알림 탭 → `/capture?verifyWishId` |
| ⑧ 스토어 제출 | 미착수 (개인정보·약관은 웹 링크를 `expo-web-browser` 로 엽니다) |

## 웹에 함께 바뀐 것

앱에는 서버가 없어서 `/api/*` 를 배포된 Next.js 로 부릅니다. 쿠키가 없으니 `Authorization: Bearer` 를 받도록
`src/proxy.ts` 와 `src/app/api/account/delete/route.ts` 를 고쳤습니다(`/api/` 경로에서만 토큰을 검증).

## 시작 전에 채울 것

- `.env` — Supabase URL/키, `EXPO_PUBLIC_API_BASE_URL`, `NAVER_MAP_CLIENT_ID`(NCP Maps 의 Client ID)
- Supabase 콘솔 Redirect URL 에 `dinary://auth` 추가
- (권장) NCP 콘솔에 종이톤 커스텀 스타일을 등록하고 `EXPO_PUBLIC_NAVER_MAP_STYLE_ID` 지정 — 없으면 임시 종이색 오버레이(마커도 흐려집니다)
- Android 백그라운드 위치는 Play 콘솔에 사용 목적 영상 제출이 필요합니다. 심사 부담이 크면 `app.json` 의 `ACCESS_BACKGROUND_LOCATION` 과
  `isAndroidBackgroundLocationEnabled` 를 빼고 1차 출시에서는 앱 실행 중에만 쓰세요.

## 알려진 차이·TODO

- NativeWind v4 는 설치하지 않았습니다. 화면은 `src/theme` 토큰 + StyleSheet 로 썼습니다.
- `.5×` 배율은 iOS 초광각 렌즈가 있을 때만 보입니다.
- `lib/types.ts` 의 `seoulParts` 는 `Intl.DateTimeFormat({ timeZone: "Asia/Seoul" })` 을 씁니다 — 실기기(Hermes)에서 인증 시각이 맞는지 확인하세요.
- 지도 마커는 줌 15 미만에서 이름표를 숨깁니다. 목록이 아주 많으면(수백 곳) 클러스터링을 검토하세요.
- 실기기·시뮬레이터에서 돌려 보지는 못했습니다 — `expo export` 번들과 `tsc`, `expo-doctor` 만 통과를 확인했습니다.
