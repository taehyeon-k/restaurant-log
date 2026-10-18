import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useGalleryFeed } from "@/features/community/api";
import { GalleryGrid } from "@/features/community/GalleryGrid";
import { CommunityHeader, TitleBlock } from "@/features/community/ui";
import { C } from "@/theme";

/** 좁힌 격자 — 가게 사진 모아보기(02 가게 카드 · 04 가게) · 동네(04) · 메뉴(04 「사진 N · 가게 N ›」). */
export default function GalleryList() {
  const router = useRouter();
  const p = useLocalSearchParams<{ place?: string; area?: string; menu?: string; title?: string }>();
  const { data: photos = [], refetch, isRefetching } = useGalleryFeed({ sort: "latest", place: p.place ?? null, area: p.area ?? null, menu: p.menu ?? null });
  const eyebrow = p.place ? "GALLERY · PLACE" : p.area ? "GALLERY · AREA" : "GALLERY · MENU";
  const title = p.title ?? p.menu ?? p.area ?? "갤러리";
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <CommunityHeader back={{ label: "갤러리", onPress: () => (router.canGoBack() ? router.back() : router.replace("/community/gallery")) }} />
      <GalleryGrid
        photos={photos}
        refreshing={isRefetching}
        onRefresh={refetch}
        header={
          <View style={{ paddingBottom: 14 }}>
            <TitleBlock eyebrow={eyebrow} title={title} aside={<Text style={{ fontSize: 11, color: C.faint }}>사진 {photos.length}</Text>} />
          </View>
        }
      />
    </View>
  );
}
