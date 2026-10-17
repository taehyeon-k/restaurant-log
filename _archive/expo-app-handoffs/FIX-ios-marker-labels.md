# FIX: iOS 지도에서 확대해도 식당 이름표 글자가 안 뜸

대상 저장소: `taehyeon-k/restaurant-log` · 앱: `expo-app/`

## 증상
- iOS에서 지도를 확대하면 이름표 상자(흰 말풍선)는 나타나지만 안의 글자(가게 이름, ★ 평점, 배지)가 비어 있음.
- 계속 확대해도 그대로. Android는 정상.

## 원인
`@mj-studio/react-native-naver-map`의 `NaverMapMarkerOverlay`는 children View를 **비트맵으로 한 번 찍어서** 마커 이미지로 씁니다. 다시 찍게 하려면 최상위 View의 `key`를 바꿔야 합니다(`Markers.tsx`의 `markerKey` 주석 참고).

`showLabel`이 true가 되면 key가 바뀌어 새 View가 마운트되고, 마운트 직후 바로 스냅샷이 찍힙니다. iOS에서는 `View`의 배경과 테두리는 즉시 그려지지만 `Text`는 다음 프레임에 그려집니다. 그래서 글자가 빠진 빈 상자가 찍히고, 그 뒤로는 key가 다시 바뀌지 않으니 계속 빈 상자로 남습니다.

## 수정 방침
iOS에서만, 생김새 시그니처(`sig`)가 바뀐 직후 짧은 지연 뒤 key에 카운터를 더해 **한 번 더 찍게** 합니다.

## 변경 1 — `expo-app/src/features/map/Markers.tsx`

### 1-1. import 수정
```tsx
import { memo, useEffect, useState, type ReactNode } from "react";
import { Platform, Text, View } from "react-native";
```

### 1-2. `markerKey` 아래에 훅 추가 (export)
```tsx
/**
 * iOS는 Text를 마운트 다음 프레임에 그려서, 마커 첫 스냅샷에 글자가 빠집니다.
 * 생김새(sig)가 바뀐 뒤 잠깐 기다렸다가 key를 한 번 더 바꿔 다시 찍게 합니다.
 */
export function useResnap(sig: string, delay = 80) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const t = setTimeout(() => setN((v) => v + 1), delay);
    return () => clearTimeout(t);
  }, [sig, delay]);
  return `${sig}/${n}`;
}
```

### 1-3. 각 마커의 최상위 View key 교체
패턴은 모두 같습니다. 기존 `key={markerKey(...)}`의 인자를 그대로 `sig`로 빼고, `key={useResnap(sig)}` 값을 씁니다. 훅은 컴포넌트 최상단, return 전에 호출해야 합니다.

**RecordMarker**
```tsx
const sig = markerKey(w, h, size, fill, stroke, p.planned, p.showLabel && p.name, p.showLabel && p.rating, p.showLabel && p.badge);
const snapKey = useResnap(sig);
// ...
<View key={snapKey} collapsable={false} style={{ width: w, height: h }}>
```

**WishMarker**
```tsx
const snapKey = useResnap(markerKey(w, h, p.category, p.showLabel && p.name));
```

**NumberPin**
```tsx
const snapKey = useResnap(markerKey(p.n, p.filled));
```

**BuildingTagMarker**
```tsx
const snapKey = useResnap(markerKey(w, h, p.name));
```

**GhostMarker**
```tsx
const snapKey = useResnap(markerKey(w, h, p.name));
```

**FriendMarker**
```tsx
const snapKey = useResnap(markerKey(w, h, size, p.letter, p.count, p.stale, p.inWish, p.showLabel && p.label, p.showLabel && p.time));
```

`TapPointMarker`는 글자가 없으므로 그대로 둡니다.

## 변경 2 — `expo-app/src/features/recommend/ui.tsx`
`Text`가 들어간 `NaverMapMarkerOverlay`(NumberMarker, RingLabelMarker/RouteLabelMarker 등)에도 같은 방식을 적용합니다.
- `import { useResnap } from "@/features/map/Markers";`
- 각 마커 최상위 View의 `key`를 `useResnap(<기존 key 문자열>)`로 바꿉니다. key가 없던 곳은 생김새를 결정하는 값(n, name, active, label, text 등)으로 sig를 만듭니다.
- `HereMarker`는 글자가 없으면 그대로 둡니다.

## 확인 방법 (iOS 실기기, 개발 빌드)
1. 지도 탭에서 줌 12 → 16으로 천천히 확대해 기록 핀과 위시 핀의 이름표에 가게 이름과 ★ 평점이 보이는지 확인.
2. 핀을 탭해 active 상태를 바꾼 뒤에도 이름표 글자가 유지되는지 확인.
3. 친구 지도(`app/community/friends.tsx`)에서 핀 안 글자, 숫자 배지, 이름표 확인.
4. 추천 코스와 투어 화면의 번호 핀, 이름, 거리 라벨 확인.
5. Android에서 동작이 바뀌지 않았는지 확인(훅은 iOS에서만 동작).

## 그래도 글자가 빠질 때
- `useResnap(sig, 150)`처럼 지연을 늘립니다.
- 폰트 로드 전에 지도가 먼저 그려지는 경우를 막으려면, `app/_layout.tsx`의 `useFonts`가 끝난 뒤에 지도가 마운트되는지 확인합니다.
- 최후 수단: 이름을 `NaverMapMarkerOverlay`의 `caption` prop으로 넘겨 SDK가 직접 그리게 합니다. 이 경우 말풍선 디자인은 포기해야 합니다.

## 건드리지 말 것
- `labelZoom.ts`(이름표 노출 줌 계산), 마커 크기와 앵커 계산, `collapsable={false}`는 그대로 둡니다.
