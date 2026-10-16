import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetModal } from "@/components/ui";
import { REC_CATEGORIES, type RecCategory, type RecFilter } from "@/lib/recommend";
import { C, F } from "@/theme";
import { REC } from "./ui";

/**
 * 필터 시트(§5-2) — 먹고 싶은 것 · 빼고 싶은 것. 한 종류는 둘 중 한쪽에만. 거리는 고르지 않고 가까운 곳 위주로 고릅니다.
 * 「초기화」는 기본값(최근 3일 먹은 종류 빼기)으로 되돌립니다.
 */
export function FilterSheet({
  visible, value, defaults, onClose, onApply,
}: { visible: boolean; value: RecFilter; defaults: RecFilter; onClose: () => void; onApply: (f: RecFilter) => void }) {
  const [draft, setDraft] = useState<RecFilter>(value);
  useEffect(() => { if (visible) setDraft(value); }, [visible, value]);

  const toggle = (side: "inc" | "exc", c: RecCategory) => {
    Haptics.selectionAsync();
    const other = side === "inc" ? "exc" : "inc";
    setDraft((d) => ({
      ...d,
      [side]: d[side].includes(c) ? d[side].filter((x) => x !== c) : [...d[side], c],
      [other]: d[other].filter((x) => x !== c),
    }));
  };

  const section = (side: "inc" | "exc", title: string, hint: string) => (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ fontFamily: F.sansBd, fontSize: 14, color: C.ink }}>{title}</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{hint}</Text>
      </View>
      <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {REC_CATEGORIES.map((c) => {
          const on = draft[side].includes(c);
          const bg = on ? (side === "inc" ? REC.ink : REC.excBg) : C.card;
          const ink = on ? (side === "inc" ? REC.paper : REC.excInk) : C.ink;
          return (
            <Pressable
              key={c}
              onPress={() => toggle(side, c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: on ? bg : C.lineSoft, backgroundColor: bg, paddingHorizontal: 13, justifyContent: "center" }}
            >
              <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: ink }}>{side === "exc" && on ? `${c} 빼기` : c}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <BottomSheetModal visible={visible} onClose={onClose} dim={0.38}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink }}>필터</Text>
        <Pressable onPress={() => setDraft(defaults)} hitSlop={10} accessibilityRole="button">
          <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>초기화</Text>
        </Pressable>
      </View>

      {section("inc", "먹고 싶은 것", "고르면 이 종류만 찾아요")}
      {section("exc", "빼고 싶은 것", "최근 3일 먹은 종류는 미리 들어가요")}

      <Pressable
        onPress={() => onApply(draft)}
        style={{ marginTop: 22, height: 52, borderRadius: 18, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>이 조건으로 다시 고르기</Text>
      </Pressable>
    </BottomSheetModal>
  );
}
