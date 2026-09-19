import { ScrollView, Pressable, Text, View } from "react-native";
import Sheet from "@/components/Sheet";
import { Chip, Eyebrow } from "@/components/ui";
import type { Kind } from "@/lib/types";
import { C, FONT } from "@/lib/theme";

/** 아래에서 올라오는 "골라 보기" 시트 — 웹 `FilterSheet.tsx` 와 같은 값. */
export default function FilterSheet({
  kind,
  onKindChange,
  categories,
  keywords,
  selectedCategories,
  selectedKeywords,
  revisitOnly,
  verifiedOnly,
  count,
  onToggleCategory,
  onToggleKeyword,
  onToggleRevisit,
  onToggleVerified,
  onReset,
  onClose,
}: {
  kind: Kind;
  onKindChange: (kind: Kind) => void;
  categories: string[];
  keywords: string[];
  selectedCategories: string[];
  selectedKeywords: string[];
  revisitOnly: boolean;
  verifiedOnly: boolean;
  count: number;
  onToggleCategory: (c: string) => void;
  onToggleKeyword: (k: string) => void;
  onToggleRevisit: () => void;
  onToggleVerified: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} dim style={{ maxHeight: "86%" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: FONT.serifBold, fontSize: 18, color: C.ink }}>골라 보기</Text>
        <Pressable onPress={onReset} hitSlop={8}>
          <Text style={{ fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>모두 지우기</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ marginTop: 16 }}>
          <Eyebrow>맛집 · 카페</Eyebrow>
        </View>
        <View style={{ marginTop: 9, flexDirection: "row", gap: 7 }}>
          {(["restaurant", "cafe"] as Kind[]).map((k) => (
            <Chip key={k} label={k === "restaurant" ? "맛집" : "카페"} active={kind === k} onPress={() => onKindChange(k)} />
          ))}
        </View>

        {categories.length > 0 && (
          <>
            <View style={{ marginTop: 16 }}>
              <Eyebrow>종류</Eyebrow>
            </View>
            <View style={{ marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {categories.map((c) => (
                <Chip key={c} label={c} active={selectedCategories.includes(c)} onPress={() => onToggleCategory(c)} />
              ))}
            </View>
          </>
        )}

        {keywords.length > 0 && (
          <>
            <View style={{ marginTop: 18 }}>
              <Eyebrow>낱말</Eyebrow>
            </View>
            <View style={{ marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {keywords.map((k) => (
                <Chip key={k} label={k} active={selectedKeywords.includes(k)} onPress={() => onToggleKeyword(k)} />
              ))}
            </View>
          </>
        )}

        <View style={{ marginTop: 18, flexDirection: "row", gap: 7 }}>
          <Chip label="재방문한 곳만" active={revisitOnly} onPress={onToggleRevisit} />
          <Chip label="인증된 기록만" active={verifiedOnly} onPress={onToggleVerified} />
        </View>
      </ScrollView>

      <Pressable
        onPress={onClose}
        style={{
          marginTop: 22,
          borderRadius: 20,
          backgroundColor: C.ink,
          padding: 16,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 14.5, color: C.card, fontFamily: FONT.sansMedium }}>{count}곳 보기</Text>
      </Pressable>
    </Sheet>
  );
}
