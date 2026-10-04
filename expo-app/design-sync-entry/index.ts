// Claude Design 에 올릴 표현용 컴포넌트 모음 — TabBar(expo-router)·PaperMap(네이티브 지도)는 브라우저에서 못 그려서 뺍니다.
export * from "../src/components/icons";
export { BackButton, Button, Chip, Eyebrow, PhotoBox, Pigs, Row, ScreenHead, MobileStars, BottomSheetModal } from "../src/components/ui";
export { LabelBadge, DistrictBadge } from "../src/components/Badges";
export { default as Placeholder } from "../src/components/Placeholder";
export { DraftsBoxIcon } from "../src/components/DraftsBoxIcon";
// 앱 루트가 감싸는 공급자 — 화면 머리·시트·플레이스홀더가 안전 영역 값을 읽습니다(컴포넌트 카드는 만들지 않음).
export { SafeAreaProvider } from "react-native-safe-area-context";
// 실제 화면 코드 + 샘플 데이터 — 화면 틀(AppScreen)과 16개 화면.
export * from "./screens";
