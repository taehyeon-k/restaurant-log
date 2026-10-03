import { Image, Modal, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VerifiedMark } from "./icons";
import { feltLevel, type PriceRow } from "@/lib/price";
import { pinColor } from "@/lib/types";
import { C, F, SHADOW } from "@/theme";

export { VerifiedMark };

export const Eyebrow = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: wide ? 2.2 : 1.6 }}>{children}</Text>
);

export const BackButton = ({ onPress, label = "←" }: { onPress?: () => void; label?: string }) => {
  const router = useRouter();
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      accessibilityLabel="뒤로"
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: 17, color: C.ink }}>{label}</Text>
    </Pressable>
  );
};

/** 화면 머리 — 뒤로가기 + eyebrow + 큰 제목(+ 부제). 보관함·라벨첩·상세가 같은 골격을 씁니다. */
export function ScreenHead({
  eyebrow, title, sub, onBack, right,
}: { eyebrow?: string; title: string; sub?: string; onBack?: () => void; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 14, paddingBottom: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <BackButton onPress={onBack} />
        {right}
      </View>
      <View style={{ paddingHorizontal: 8, marginTop: 6 }}>
        {eyebrow && <Eyebrow wide>{eyebrow}</Eyebrow>}
        <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 26, color: C.ink }}>{title}</Text>
        {sub && <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12, color: C.faint }}>{sub}</Text>}
      </View>
    </View>
  );
}

export const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={{
      minHeight: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, justifyContent: "center",
      borderColor: active ? C.brick : "#cdc6b8", backgroundColor: active ? C.brick : "transparent",
    }}
  >
    <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: active ? "#fdf9f3" : "#4a453d" }}>{label}</Text>
  </Pressable>
);

export const fieldStyle = {
  marginTop: 8, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: "#ded8cb", backgroundColor: C.card,
  paddingHorizontal: 15, fontFamily: F.sans, fontSize: 13.5, color: C.ink,
} as const;

export const Button = ({
  label, onPress, kind = "dark", disabled, style,
}: { label: string; onPress: () => void; kind?: "dark" | "brick" | "line"; disabled?: boolean; style?: ViewStyle }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[
      {
        minHeight: 50, borderRadius: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 16,
        backgroundColor: kind === "dark" ? C.ink : kind === "brick" ? C.brick : "transparent",
        borderWidth: kind === "line" ? 1 : 0, borderColor: "#ded8cb", opacity: disabled ? 0.5 : 1,
      },
      style,
    ]}
  >
    <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: kind === "line" ? C.ink : C.card }}>{label}</Text>
  </Pressable>
);

/** 부분 채움 별점. */
export function MobileStars({ rating, size = 12.5 }: { rating: number | null; size?: number }) {
  const value = Math.max(0, Math.min(5, rating ?? 0));
  const row = { fontSize: size, letterSpacing: 1, lineHeight: size + 2 } as const;
  return (
    <View>
      <Text style={[row, { color: "#ded8cb" }]}>★★★★★</Text>
      <View style={{ position: "absolute", top: 0, left: 0, width: `${(value / 5) * 100}%`, overflow: "hidden" }}>
        <Text numberOfLines={1} style={[row, { color: C.brick, width: 200 }]}>★★★★★</Text>
      </View>
    </View>
  );
}

/** 체감 가격 돼지 다섯 마리. */
export function Pigs({ row, w = 15, h = 14 }: { row: PriceRow; w?: number; h?: number }) {
  const level = feltLevel(row);
  return (
    <View style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Image
          key={n}
          source={require("../../assets/piggy.png")}
          style={{ width: w, height: h, opacity: n <= level ? 1 : 0.3 }}
          resizeMode="contain"
        />
      ))}
    </View>
  );
}

/** 사진이 있으면 덮어 채우고, 없으면 종류 색의 연한 면. */
export function PhotoBox({
  src, category, size, radius = 15, style, children,
}: { src?: string | null; category?: string | null; size?: number; radius?: number; style?: ViewStyle; children?: React.ReactNode }) {
  const box: ViewStyle = {
    width: size, height: size, borderRadius: radius, overflow: "hidden", backgroundColor: pinColor(category ?? null) + "26",
    alignItems: "center", justifyContent: "center",
  };
  return (
    <View style={[box, style]}>
      {src ? <Image source={{ uri: src }} style={StyleSheet.absoluteFill} /> : null}
      {children}
    </View>
  );
}

/** 아래에서 올라오는 시트 — FilterSheet·SearchMissSheet·WishSheet 가 함께 씁니다. */
export function BottomSheetModal({
  visible, onClose, children,
}: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(28,26,23,.34)" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="닫기" />
        <View
          style={[
            { backgroundColor: C.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 18, paddingBottom: insets.bottom + 20 },
            SHADOW.sheet,
          ]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

export const Row = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>{children}</View>
);
