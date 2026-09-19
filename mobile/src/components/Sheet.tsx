import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { C, SHADOW } from "@/lib/theme";

/**
 * 아래에서 올라오는 시트의 공통 껍데기 — 빈 곳을 누르면 닫힙니다.
 * `@gorhom/bottom-sheet` 는 목록을 담은 지도 시트에만 씁니다. 짧은 단발 시트는
 * 제스처가 필요 없고, 탭바 위에서 멈춰야 해서 이 단순한 판을 씁니다.
 */
export default function Sheet({
  onClose,
  bottomInset = 0,
  dim = false,
  style,
  children,
}: {
  onClose: () => void;
  /** 탭바에 가리지 않게 띄울 높이. */
  bottomInset?: number;
  /** 필터처럼 화면을 덮어야 하는 시트는 뒤를 어둡게 합니다. */
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: bottomInset,
        justifyContent: "flex-end",
        backgroundColor: dim ? "rgba(28,26,23,.34)" : "transparent",
      }}
    >
      <Pressable accessibilityLabel="닫기" onPress={onClose} style={{ flex: 1 }} />

      <View
        style={[
          {
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            backgroundColor: C.paper,
            paddingHorizontal: 20,
            paddingTop: 18,
            paddingBottom: 26,
          },
          SHADOW.sheet,
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
