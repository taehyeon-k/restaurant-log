import { Text, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { BookmarkIcon } from "@/components/icons";
import { BottomSheetModal, Button, Chip, Eyebrow, PhotoBox } from "@/components/ui";
import { dottedDate, type Restaurant } from "@/lib/types";
import type { Place } from "@/lib/places";
import { Pressable } from "react-native";
import { C, F, SHADOW } from "@/theme";

/** 「필터」 시트. */
export function FilterSheet(p: {
  visible: boolean; categories: string[]; keywords: string[];
  selectedCategories: string[]; selectedKeywords: string[]; revisitOnly: boolean; verifiedOnly: boolean; boundsOnly: boolean; count: number;
  onToggleCategory: (c: string) => void; onToggleKeyword: (k: string) => void; onToggleRevisit: () => void;
  onToggleVerified: () => void; onToggleBounds: () => void; onReset: () => void; onClose: () => void;
}) {
  return (
    <BottomSheetModal visible={p.visible} onClose={p.onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.ink }}>필터</Text>
        <Pressable onPress={p.onReset} style={{ paddingVertical: 6 }}><Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>모두 지우기</Text></Pressable>
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
      <View style={{ marginTop: 18, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        <Chip label="재방문한 곳만" active={p.revisitOnly} onPress={p.onToggleRevisit} />
        <Chip label="인증된 기록만" active={p.verifiedOnly} onPress={p.onToggleVerified} />
        <Chip label="현 지도에 있는 기록만" active={p.boundsOnly} onPress={p.onToggleBounds} />
      </View>
      <Button label={`${p.count}곳 보기`} onPress={p.onClose} style={{ marginTop: 22, minHeight: 54, borderRadius: 20 }} />
    </BottomSheetModal>
  );
}

/** 지도 검색에서 이미 있는 가게를 찾았을 때, 또는 기록 핀을 눌렀을 때의 작은 시트. */
export function FoundSheet(p: {
  hit: { restaurant: Restaurant; place: Place; fromPin?: boolean } | null; onClose: () => void; onRevisit: () => void; onWish: () => void; onOpen: () => void;
}) {
  const r = p.hit?.restaurant;
  const body = r && p.hit && (
        <>
          {!p.hit.fromPin && <Eyebrow wide>찾았습니다</Eyebrow>}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ marginTop: p.hit.fromPin ? 0 : 6, fontFamily: F.serif, fontSize: 22, color: C.ink }}>{r.name}</Text>
              <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{[r.category, r.region].filter(Boolean).join(" · ")}</Text>
              <Text style={{ marginTop: 6, fontFamily: F.mono, fontSize: 10.5, color: "#a29a8c" }}>
                {[`★ ${p.hit.place.rating == null ? "—" : p.hit.place.rating.toFixed(1)}`, `기록 ${p.hit.place.visits.length}건`,
                  p.hit.place.latest.visited_at && `${dottedDate(p.hit.place.latest.visited_at)} 방문`].filter(Boolean).join(" · ")}
              </Text>
            </View>
            {/* 대표 사진 — 사진을 붙인 가장 최근 기록의 커버. 없으면 비워 둡니다. */}
            {p.hit.place.photo && <PhotoBox src={p.hit.place.photo} category={r.category} size={64} radius={14} />}
          </View>
          <View style={{ marginTop: 14, flexDirection: "row", gap: 8 }}>
            <Button label="기록 추가" onPress={p.onRevisit} style={{ flex: 1, minHeight: 48, borderRadius: 16 }} />
            <Pressable onPress={p.onWish} accessibilityLabel="위시리스트에 담기" style={{ width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: "#e4dfd3", alignItems: "center", justifyContent: "center" }}>
              <BookmarkIcon size={16} stroke={C.muted} />
            </Pressable>
            <Button kind="line" label="기록 보기" onPress={p.onOpen} style={{ minHeight: 48, borderRadius: 16, borderColor: "#e4dfd3" }} />
          </View>
        </>
  );
  // 핀에서 연 요약은 모달이 아닌 카드 — 화면을 덮지 않고 제 높이만큼만 올라오며, 지도는 그대로 만질 수 있습니다.
  // 지도를 밀거나 누르면 바로 내려갑니다(index 의 onCameraChanged · onTapMap).
  if (p.hit?.fromPin) {
    return (
      <Animated.View
        entering={SlideInDown.duration(200)}
        exiting={SlideOutDown.duration(140)}
        style={[{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 }, SHADOW.sheet]}
      >
        {body}
      </Animated.View>
    );
  }
  return (
    <BottomSheetModal visible={!!p.hit} onClose={p.onClose}>
      {body}
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
