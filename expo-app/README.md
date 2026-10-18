# DINARY — Expo 앱

`Restaurant app mobile design.zip` 핸드오프(1a 내비게이션 + 1d 비주얼)를 옮기는 중인 네이티브 앱입니다.
웹(Next.js)과 같은 Supabase 백엔드를 씁니다. 스키마 변경 없음.

## 시작

```bash
cd expo-app
cp .env.example .env      # Supabase 키, API 주소, NAVER_MAP_CLIENT_ID 채우기
npm install
npx expo install expo-dev-client
# 먼저 아래 NAVER Map / EAS 설정을 완료하세요.
npx eas-cli@latest build --profile development --platform all   # Expo Go 불가
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

## 지도 길게 누르기 — 그 건물 식당 (places-at)

지도 빈 곳을 길게 누르면 Supabase Edge Function `places-at`(서울 리전으로 호출)이 그 자리의 건물을 찾아
건물 안 식당·카페를 층별로 돌려줍니다. 건물을 못 찾으면 반경 50m 목록입니다.

- DB: `supabase/migrations/20261013000000_places_at.sql`, `…000100_places_at_only_near.sql`
  (`public_stores` · `buildings` · `place_links`, RPC `stores_in_building` · `stores_near` · `places_at_lookup`)
- 함수: `supabase/functions/places-at/index.ts` — 카카오 coord2address → juso 건물관리번호 → DB 한 번 → VWorld 건물 경계
- 함수 비밀값(Supabase 대시보드 → Edge Functions → Secrets): `KAKAO_REST_API_KEY`, `JUSO_API_KEY`, `VWORLD_API_KEY`.
  앱 번들에는 외부 API 키를 넣지 않습니다. VWorld 는 국외 IP 를 막으므로 앱은 `x-region: ap-northeast-2` 로 부릅니다.

### 상가 데이터 적재 — 분기마다

소상공인시장진흥공단 「상가(상권)정보」는 분기마다 갱신됩니다(공공데이터포털 15083033). 새 파일이 나오면:

1. https://www.data.go.kr/data/15083033/fileData.do 에서 전체 zip 을 내려받아 **저장소 밖** 폴더에 풉니다(시도별 CSV, 약 1.5GB).
2. `expo-app/.env` 에 `SUPABASE_SERVICE_ROLE_KEY` 가 있는지 확인합니다(커밋하지 마세요).
3. 먼저 미리 보기, 그다음 적재:
   ```bash
   cd expo-app
   node --experimental-strip-types --env-file=.env scripts/import-stores.ts "<폴더>/소상공인시장진흥공단_상가(상권)정보_서울_YYYYMM.csv" --sido 11 --dry-run
   node --experimental-strip-types --env-file=.env scripts/import-stores.ts "<폴더>/소상공인시장진흥공단_상가(상권)정보_서울_YYYYMM.csv" --sido 11 --full
   ```
   - 음식 업종만, `--sido` 의 시도코드(서울 11 · 경기 41 · 부산 26 …)만 넣습니다. 폴더를 주면 그 안 CSV 를 모두 읽고 시도코드로 거릅니다.
   - `store_id`(상가업소번호) 기준 upsert. 기본은 부분 적재이며 폐업 표시는 하지 않습니다. 완전한 시도 스냅숏에만 `--full` 을 붙이세요. 입력이 기존 영업점 수의 90% 미만이면 폐업 표시를 중단합니다(`--force` 로만 재정의). `--full --dry-run` 은 읽기만 하고 폐업 예정 수를 보여줍니다.
   - 유흥 주점·구내식당은 뺍니다. 층정보는 `B1`·`1F` 꼴로 고쳐 넣습니다(모르면 빈 값 → 앱에서 「기타」).
4. 서울 한 번에 약 14만 곳, 2~3분 걸립니다.

## 알려진 차이·TODO

- NativeWind v4 는 설치하지 않았습니다. 화면은 `src/theme` 토큰 + StyleSheet 로 썼습니다.
- `.5×` 배율은 iOS 초광각 렌즈가 있을 때만 보입니다.
- `lib/types.ts` 의 `seoulParts` 는 `Intl.DateTimeFormat({ timeZone: "Asia/Seoul" })` 을 씁니다 — 실기기(Hermes)에서 인증 시각이 맞는지 확인하세요.
- 지도 마커는 줌 15 미만에서 이름표를 숨깁니다. 목록이 아주 많으면(수백 곳) 클러스터링을 검토하세요.
- 실기기·시뮬레이터에서 돌려 보지는 못했습니다 — `expo export` 번들과 `tsc`, `expo-doctor` 만 통과를 확인했습니다.

## Android NAVER Map authentication and rebuild

The NAVER logo confirms the native view exists, not that tile authentication succeeded.
`app.json` declares Android package `app.dinary` and the NAVER Maven repository.
`app.config.js` passes `NAVER_MAP_CLIENT_ID` to the installed
`@mj-studio/react-native-naver-map` 2.9.0 plugin's `client_id` option. The plugin
writes `com.naver.maps.map.NCP_KEY_ID` (current Maps) and
`com.naver.maps.map.CLIENT_ID` (legacy) into AndroidManifest.xml.
Missing, empty, or whitespace-only IDs stop Expo config evaluation with an error.
The ID is a native build credential; Metro reloads and EAS Update cannot replace it.

### Manual NAVER Cloud Platform setup

1. Open **Services > Application Services > Maps > Application** in NAVER Cloud
   Platform. Create or edit the application whose Client ID you will use.
2. Enable **Dynamic Map** for that application (older consoles call the mobile
   SDK service **Mobile Dynamic Map**). Web Dynamic Map alone is insufficient.
3. Register **Android app package name: `app.dinary`**, exactly, and save.
   For iOS builds, also register **iOS Bundle ID: `app.dinary`**.
4. Copy that application's **Client ID / NCP_KEY_ID**, not its Client Secret.
   Do not put a Client Secret in the app. Check that the application/service is
   active and its usage limits allow requests.
5. Leave `EXPO_PUBLIC_NAVER_MAP_STYLE_ID` unset for the first tile check. If using
   a custom style later, ensure it is valid and available to this Maps application.

### EAS setup (run from `expo-app`)

Each build profile explicitly selects its matching EAS environment. EAS can infer
these defaults, but explicit selection avoids accidentally building with another
profile's credentials. Set the ID in every environment you build from. Use
**sensitive** visibility: EAS CLI needs to read it when resolving dynamic config;
**secret** visibility is unavailable to local config resolution. The ID is embedded
in the native binary regardless of EAS visibility.

```bash
cd expo-app
npx eas-cli@latest login
# Read the actual Client ID without putting it in shell history.
read -r -s -p "NAVER Maps Client ID: " NAVER_MAP_CLIENT_ID
printf '\n'
export NAVER_MAP_CLIENT_ID
# The local export also lets EAS resolve the fail-fast config during initial setup.
for environment in development preview production; do
  npx eas-cli@latest env:set --environment "$environment" \
    --name NAVER_MAP_CLIENT_ID --value "$NAVER_MAP_CLIENT_ID" \
    --visibility sensitive --scope project
done

# Standalone, installable Android APK, without Metro:
npx eas-cli@latest build --platform android --profile preview --clear-cache
# Install that profile's latest completed build on an emulator/connected device:
npx eas-cli@latest build:run --platform android --profile preview --latest
```

On a physical phone you can also open the build's EAS download link and install
its APK, or download it and run `adb install -r /path/to/dinary.apk`.
The production profile produces an AAB for Play distribution, not an installable APK.

For a development client instead:

```bash
npx eas-cli@latest build --platform android --profile development --clear-cache
npx eas-cli@latest build:run --platform android --profile development --latest
npx expo start --dev-client
```

For future local commands, keep the ID in a git-ignored `expo-app/.env.local`, or
pull the selected EAS environment with
`npx eas-cli@latest env:pull --environment development --path .env.local`.
Config evaluation requires the ID even for `expo config` and Metro startup.
Never commit environment files or generated manifests containing credentials.
Native `android/` and `ios/` directories are currently untracked, so EAS generates
native configuration using prebuild. If maintaining native directories later,
regenerate them with `npx expo prebuild --platform android` before building.

After installation, verify actual roads/tiles appear. If only the logo remains,
inspect native authentication errors with `adb logcat | rg -i 'naver|ncp|auth'`;
recheck the Client ID's application, Dynamic Map access, exact package registration,
custom style, and device network access. Camera-idle callbacks do not prove tile loading.

References: [NAVER Map Expo plugin setup](https://rnnavermap.mjstudio.net/docs/installation/expo),
[NAVER Maps Android service](https://guide.ncloud-docs.com/docs/en/maps-android-sdk),
[NAVER application registration](https://guide.ncloud-docs.com/docs/en/maps-app/),
[EAS environment visibility](https://docs.expo.dev/eas/environment-variables/manage/),
[EAS CLI commands](https://docs.expo.dev/eas/cli/).

## Technical remediation

Implementation status, migration order, regression checks, and device acceptance checklist: [technical remediation implementation](docs/technical-remediation-implementation.md). Do not publish the client before applying and verifying the three nullable-column migrations listed there.
