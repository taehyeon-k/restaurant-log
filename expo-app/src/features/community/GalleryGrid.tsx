import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, Text, useWindowDimensions, View } from "react-native";
import { SignedImage } from "@/lib/signedPhoto";
import { C, F } from "@/theme";
import type { GalleryPhoto } from "./api";

const GAP = 3;

/**
 * 갤러리 3칸 격자(HANDOFF-gallery 01) — 사진만, 칸 사이 3px, 정사각. 인증 기록 사진은 오른쪽 위 ✓.
 * 처음 누르면 그 칸에 정보(가게 · 메뉴 · ♥ · 댓글 · 보기 ›), 같은 칸을 한 번 더 누르면 사진 보기.
 * 다른 칸을 누르면 정보가 그 칸으로 옮겨 가고(한 번에 한 칸), 스크롤하면 닫힙니다.
 */
export function GalleryGrid({
  photos, header, footer, empty, refreshing, onRefresh,
}: {
  photos: GalleryPhoto[];
  header?: React.ReactElement;
  footer?: React.ReactElement;
  empty?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - GAP * 2) / 3);
  const [picked, setPicked] = useState<number | null>(null);
  const open = (id: number) => router.push({ pathname: "/community/gallery/[id]", params: { id: String(id) } });

  return (
    <FlatList
      data={photos}
      keyExtractor={(p) => String(p.id)}
      numColumns={3}
      columnWrapperStyle={{ gap: GAP }}
      contentContainerStyle={{ gap: GAP, paddingBottom: 96 }}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      onScrollBeginDrag={() => setPicked(null)}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={<Text style={{ paddingVertical: 44, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>{empty ?? "아직 올라온 사진이 없습니다."}</Text>}
      renderItem={({ item: p }) => {
        const on = picked === p.id;
        return (
          <Pressable
            onPress={() => {
              if (on) { open(p.id); return; }
              Haptics.selectionAsync();
              setPicked(p.id);
            }}
            accessibilityLabel={`${p.place_name}${p.menu ? ` · ${p.menu}` : ""}`}
            accessibilityHint={on ? "한 번 더 누르면 사진을 엽니다" : "누르면 가게 · 메뉴가 보입니다"}
            style={{ width: size, height: size, backgroundColor: "#ece7dc" }}
          >
            <SignedImage uri={p.photo_ref} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            {p.verified && !on && (
              <View style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sansBd, fontSize: 10, color: C.brick, marginTop: -1 }}>✓</Text>
              </View>
            )}
            {on && (
              <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(28,26,23,.62)", justifyContent: "flex-end", padding: 8, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 13, color: C.card }}>{p.place_name}</Text>
                {!!p.menu && <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 10.5, color: "#e8e2d6" }}>{p.menu}</Text>}
                <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 9, color: "#d8d2c6" }}>♥ {p.like_count} · 댓글 {p.comment_count}</Text>
                  <Pressable onPress={() => open(p.id)} hitSlop={8}>
                    <Text style={{ fontFamily: F.sansMd, fontSize: 10, color: C.card }}>보기 ›</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Pressable>
        );
      }}
    />
  );
}
