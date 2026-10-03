import { Text, View } from "react-native";
import { BookmarkIcon } from "@/components/icons";
import { BottomSheetModal, Button, Chip, Eyebrow } from "@/components/ui";
import { dottedDate, type Kind, type Restaurant } from "@/lib/types";
import type { Place } from "@/lib/places";
import { Pressable } from "react-native";
import { C, F } from "@/theme";

/** 「골라 보기」 시트. */
export function FilterSheet(p: {
  visible: boolean; kind: Kind; onKindChange: (k: Kind) => void; categories: string[]; keywords: string[];
  selectedCategories: string[]; selectedKeywords: string[]; revisitOnly: boolean; verifiedOnly: boolean; count: number;
  onToggleCategory: (c: string) => void; onToggleKeyword: (k: string) => void; onToggleRevisit: () => void;
  onToggleVerified: () => void; onReset: () => void; onClose: () => void;
}) {
  return (
    <BottomSheetModal visible={p.visible} onClose={p.onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.ink }}>골라 보기</Text>
        <Pressable onPress={p.onReset} style={{ paddingVertical: 6 }}><Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>모두 지우기</Text></Pressable>
      </View>

      <View style={{ marginTop: 16 }}><Eyebrow>맛집 · 카페</Eyebrow></View>
      <View style={{ marginTop: 9, flexDirection: "row", gap: 7 }}>
        {(["restaurant", "cafe"] as Kind[]).map((k) => <Chip key={k} label={k === "restaurant" ? "맛집" : "카페"} active={p.kind === k} onPress={() => p.onKindChange(k)} />)}
      </View>

      {p.categories.length > 0 && (
        <>
          <View style={{ marginTop: 16 }}><Eyebrow>종류</Eyebrow></View>
          <View style={{ marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {p.categories.map((c) => <Chip key={c} label={c} active={p.selectedCategories.includes(c)} onPress={() => p.onToggleCategory(c)} />)}
          </View>
        </>
      )}
      {p.keywords.length > 0 && (
        <>
          <View style={{ marginTop: 18 }}><Eyebrow>낱말</Eyebrow></View>
          <View style={{ marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {p.keywords.map((k) => <Chip key={k} label={k} active={p.selectedKeywords.includes(k)} onPress={() => p.onToggleKeyword(k)} />)}
          </View>
        </>
      )}
      <View style={{ marginTop: 18, flexDirection: "row", gap: 7 }}>
        <Chip label="재방문한 곳만" active={p.revisitOnly} onPress={p.onToggleRevisit} />
        <Chip label="인증된 기록만" active={p.verifiedOnly} onPress={p.onToggleVerified} />
      </View>
      <Button label={`${p.count}곳 보기`} onPress={p.onClose} style={{ marginTop: 22, minHeight: 54, borderRadius: 20 }} />
    </BottomSheetModal>
  );
}

/** 지도 검색에서 이미 있는 가게를 찾았을 때의 작은 시트. */
export function FoundSheet(p: {
  hit: { restaurant: Restaurant; place: Place } | null; onClose: () => void; onRevisit: () => void; onWish: () => void; onOpen: () => void;
}) {
  const r = p.hit?.restaurant;
  return (
    <BottomSheetModal visible={!!p.hit} onClose={p.onClose}>
      {r && p.hit && (
        <>
          <Eyebrow wide>찾았습니다</Eyebrow>
          <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 22, color: C.ink }}>{r.name}</Text>
          <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{[r.category, r.region].filter(Boolean).join(" · ")}</Text>
          <Text style={{ marginTop: 6, fontFamily: F.mono, fontSize: 10.5, color: "#a29a8c" }}>
            기록 {p.hit.place.visits.length}건 · 마지막 {dottedDate(p.hit.place.latest.visited_at)}
          </Text>
          <View style={{ marginTop: 14, flexDirection: "row", gap: 8 }}>
            <Button label="여기 또 왔어요 · 기록 추가" onPress={p.onRevisit} style={{ flex: 1, minHeight: 48, borderRadius: 16 }} />
            <Pressable onPress={p.onWish} accessibilityLabel="위시리스트에 담기" style={{ width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: "#e4dfd3", alignItems: "center", justifyContent: "center" }}>
              <BookmarkIcon size={16} stroke={C.muted} />
            </Pressable>
            <Button kind="line" label="지난 기록 보기" onPress={p.onOpen} style={{ minHeight: 48, borderRadius: 16, borderColor: "#e4dfd3" }} />
          </View>
        </>
      )}
    </BottomSheetModal>
  );
}

/** 「아직 없는 곳」 — 기록에도 위시에도 없는 이름을 검색했을 때. */
export function SearchMissSheet(p: { name: string | null; onAddRecord: () => void; onAddWish: () => void; onClose: () => void }) {
  return (
    <BottomSheetModal visible={!!p.name} onClose={p.onClose}>
      <Eyebrow wide>아직 없는 곳</Eyebrow>
      <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 22, color: C.ink }}>{p.name}</Text>
      <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>기록에도 위시리스트에도 없는 이름입니다. 어느 쪽으로 둘까요?</Text>
      <View style={{ marginTop: 14, gap: 8 }}>
        <Button label="다녀왔어요 · 기록 추가" onPress={p.onAddRecord} style={{ borderRadius: 18 }} />
        <Pressable onPress={p.onAddWish} style={{ minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: "#ded8cb", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <BookmarkIcon size={14} stroke={C.ink} />
          <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>가고 싶어요 · 예정 추가</Text>
        </Pressable>
      </View>
    </BottomSheetModal>
  );
}
