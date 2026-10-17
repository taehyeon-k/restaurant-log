# 위시 담기: 유튜브·인스타 공유 버튼으로 바로 담기 (새 빌드 필요)

대상: Expo 앱 (EAS 빌드 → TestFlight). **네이티브가 바뀌므로 OTA로는 반영되지 않는다. `eas build -p ios`로 새로 빌드해야 한다.**
이 작업 전에 `위시 링크 붙여넣기.md`가 먼저 적용되어 있어야 한다 (`parseSourceLink`, 「어느 가게인가요」 화면을 다시 쓴다).

## 목표
유튜브나 인스타에서 공유 버튼을 누르고 DINARY를 고르면, 앱이 열리면서 링크가 채워진 「어느 가게인가요」 화면이 바로 뜬다.

## 흐름
1. 유튜브나 인스타에서 공유 → 공유 목록에서 DINARY를 고른다.
2. 공유 확장이 링크(또는 링크가 섞인 글)를 받아서 앱을 연다.
3. 앱은 받은 내용을 `parseSourceLink()`로 처리한다.
   - 올바른 링크: 위시 담기 폼을 열고, 그 위에 「어느 가게인가요」 화면을 바로 띄운다.
   - 지원하지 않는 링크: 위시 담기 폼을 열고 링크 입력창에 받은 값을 넣은 뒤, `유튜브나 인스타그램 링크를 넣어주세요` 오류를 보여준다.
4. 그다음 과정(가게 고르기 → 저장 → `source_url`, `source_kind` 저장)은 붙여넣기 흐름과 같다.
5. 로그인이 안 된 상태라면, 받은 링크를 기억해 두고 로그인이 끝난 뒤 3번을 이어서 한다.

## 설치
```bash
npx expo install expo-share-intent expo-linking expo-constants
# expo-clipboard가 아직 없다면 같이 넣는다 (붙여넣기 버튼용)
npx expo install expo-clipboard
```
Expo Go에서는 동작하지 않는다. 개발 빌드(`eas build --profile development`)로 테스트한다.

## app.json / app.config
```jsonc
{
  "expo": {
    "scheme": "dinary",
    "plugins": [
      ["expo-share-intent", {
        "iosActivationRules": {
          "NSExtensionActivationSupportsWebURLWithMaxCount": 1,
          "NSExtensionActivationSupportsText": true
        },
        "androidIntentFilters": ["text/*"]
      }]
    ]
  }
}
```
- 라이브러리 버전마다 옵션 이름이 조금씩 다를 수 있다. 설치한 버전의 README와 대조해서 확인한다.
- 이미 `scheme`이 있다면 그 값을 그대로 쓴다.

## 앱 코드
```tsx
// app/_layout.tsx (expo-router 기준)
import { ShareIntentProvider } from 'expo-share-intent';

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      {/* 기존 Provider / Stack */}
    </ShareIntentProvider>
  );
}
```
```tsx
// 공유 수신 처리: 로그인 이후에 마운트되는 곳 (예: 메인 레이아웃)
import { useShareIntentContext } from 'expo-share-intent';

const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

useEffect(() => {
  if (!hasShareIntent) return;
  const raw = shareIntent.webUrl ?? shareIntent.text ?? '';
  const parsed = parseSourceLink(raw);
  openWishForm();                       // 위시 담기 폼 열기
  if (parsed && !('error' in parsed)) {
    openStorePicker(parsed);            // 「어느 가게인가요」, 검색칸은 비워서 시작
  } else {
    showPasteInput(raw, { error: true });
  }
  resetShareIntent();                   // 같은 공유를 두 번 처리하지 않게
}, [hasShareIntent]);
```
- 유튜브는 `text`에 영상 제목과 링크를 같이 넘겨줄 때가 있다. 이번 단계에서는 링크만 쓰고, 제목은 쓰지 않는다.
- expo-router를 쓰면 공유로 앱이 열릴 때 처음 경로가 바뀔 수 있다. 공유로 열렸을 때 이상한 화면으로 가지 않는지 확인한다 (필요하면 `+native-intent.tsx`로 처리).

## Apple 개발자 설정
- 첫 빌드 때 공유 확장용 번들 ID(`<기존 번들ID>.share-extension` 형태)와 App Group이 새로 생긴다.
- EAS가 자격 증명을 자동으로 만들게 하거나, Apple Developer에서 직접 등록한다.
- 확장도 프로비저닝 프로파일을 따로 받는다. 빌드할 때 `eas credentials`로 확인한다.

## 확인할 것
- [ ] 유튜브 쇼츠 공유 → DINARY → 「어느 가게인가요」에 `YOUTUBE 쇼츠`가 표시된다
- [ ] 일반 유튜브 영상 → `YOUTUBE`, 인스타 릴스 → `INSTAGRAM 릴스`로 표시된다
- [ ] 앱이 꺼진 상태에서 공유해도 똑같이 동작한다 (cold start)
- [ ] 앱이 켜져 있는 상태에서 공유해도 동작한다 (warm)
- [ ] 로그아웃 상태에서 공유 → 로그인 → 이어서 열린다
- [ ] 다른 앱의 링크를 공유하면 오류 문구가 뜬다
- [ ] 같은 공유가 두 번 처리되지 않는다

## 배포
1. `eas build -p ios --profile production`
2. `eas submit -p ios` → TestFlight
3. `runtimeVersion` 정책을 쓰고 있다면 버전을 올린다. 그래야 예전 빌드에 이 JS가 OTA로 내려가지 않는다.

## 다음 단계 (이번에 하지 않음)
- 공유된 글에서 영상 제목을 뽑아 가게 검색어로 미리 채우기
- 영상 썸네일을 가져와 위시 카드에 보여주기
