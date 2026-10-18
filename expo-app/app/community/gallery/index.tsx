import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SearchLineIcon } from "@/components/icons";
import { usePersonalRows } from "@/data/queries";
import { useGalleryFeed, useGalleryToday, useIsAdmin, type GallerySort } from "@/features/community/api";
import { guLabel, guOf } from "@/features/community/BoardPost";
import { GalleryGrid } from "@/features/community/GalleryGrid";
import { CommunityHeader, FilterChips, K, RoundButton, TitleBlock } from "@/features/community/ui";
import { C, F } from "@/theme";

const MIN_VERIFIED = 5;

/**
 * 공유 갤러리(HANDOFF-gallery 01) — 각자 찍은 음식 사진을 한 장씩. 사진에는 가게 · 메뉴가 붙고 반응은 좋아요 · 댓글.
 * 올릴 수 있는 사진은 내 기록의 사진뿐이고(인증이면 ✓), 그 기록의 공개 범위는 바뀌지 않습니다.
 */
export default function GalleryHome() {
  const router = useRouter();
  const { data: rows = [] } = usePersonalRows();
  const { data: isAdmin } = useIsAdmin();
  const { data: today = 0 } = useGalleryToday();
  const [sort, setSort] = useState<GallerySort>("latest");
  const [nearOnly, setNearOnly] = useState(false);

  // my_verified_count 와 같은 기준 · 내 동네는 가장 최근 인증 기록의 구(게시판과 같게).
  const verified = useMemo(() => rows.filter((r) => r.verified && !r.pending && r.source_record_id == null && r.copied_at == null), [rows]);
  const myGu = useMemo(() => {
    const latest = [...verified].filter((r) => r.verified_at && guOf(r.address)).sort((a, b) => (a.verified_at! < b.verified_at! ? 1 : -1))[0];
    return latest ? guOf(latest.address) : null;
  }, [verified]);
  const canPost = verified.length >= MIN_VERIFIED || !!isAdmin;

  const { data: photos = [], refetch, isRefetching } = useGalleryFeed({ sort, gu: nearOnly ? myGu : null });

  const header = (
    <View style={{ paddingBottom: 14 }}>
      <TitleBlock
        eyebrow="COMMUNITY · GALLERY"
        title="갤러리"
        aside={<Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>오늘 올라온 사진 <Text style={{ color: C.brick }}>{today}</Text></Text>}
      />
      <FilterChips<GallerySort>
        value={sort}
        onChange={setSort}
        options={[{ id: "latest", label: "최신" }, { id: "popular", label: "이번 주 인기" }, { id: "friends", label: "친구" }]}
        trailing={myGu ? (
          <Pressable
            onPress={() => setNearOnly((v) => !v)}
            accessibilityState={{ selected: nearOnly }}
            style={{ height: 32, borderRadius: 16, paddingHorizontal: 13, justifyContent: "center", borderWidth: 1, borderStyle: nearOnly ? "solid" : "dashed", borderColor: nearOnly ? C.brick : K.dashed, backgroundColor: nearOnly ? C.brickSoft : "transparent" }}
          >
            <Text style={{ fontFamily: F.sans, fontSize: 12, color: nearOnly ? C.brick : C.muted }}>{nearOnly ? `${guLabel(myGu)}만 ✕` : `${guLabel(myGu)}만`}</Text>
          </Pressable>
        ) : undefined}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <CommunityHeader right={<RoundButton label="갤러리 찾기" onPress={() => router.push("/community/gallery/search")}><SearchLineIcon /></RoundButton>} />
      <GalleryGrid
        photos={photos}
        header={header}
        refreshing={isRefetching}
        onRefresh={refetch}
        empty={sort === "friends" ? "친구가 올린 사진이 아직 없습니다." : undefined}
      />

      {/* 사진 올리기 — 게시판 「+ 글쓰기」와 같은 자리 · 모양. 인증 기록 5건 전에는 안내 띠. */}
      {canPost ? (
        <Pressable
          onPress={() => router.push("/community/gallery/new")}
          style={{ position: "absolute", right: 18, bottom: 22, height: 46, borderRadius: 23, backgroundColor: C.ink, paddingHorizontal: 18, justifyContent: "center", shadowColor: C.ink, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.card }}>+ 사진 올리기</Text>
        </Pressable>
      ) : (
        <View style={{ position: "absolute", left: 18, right: 18, bottom: 22, minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>인증 기록 {MIN_VERIFIED}건부터 사진을 올릴 수 있습니다 · 지금 {verified.length}건</Text>
        </View>
      )}
    </View>
  );
}
