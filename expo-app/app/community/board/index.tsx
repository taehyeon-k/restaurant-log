import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SearchLineIcon } from "@/components/icons";
import { usePersonalRows } from "@/data/queries";
import { setState, useAppState, type BoardTab } from "@/data/store";
import {
  useBoardFeed, useCourseStops, useCurrentTheme, useIsAdmin, useLastTheme, usePopularTags, type PostType,
} from "@/features/community/api";
import { guLabel, guOf, NoticeRow, PostCard } from "@/features/community/BoardPost";
import { CommunityHeader, FilterChips, K, RoundButton, TitleBlock } from "@/features/community/ui";
import { C, F } from "@/theme";

const MIN_VERIFIED = 5;
const NEAR_TABS: BoardTab[] = ["food", "cafe", "course"];

/**
 * 게시판(HANDOFF-board-v2 01~05) — DINARY 사용자 모두가 봅니다. 자유 · 주제 · 맛집 · 카페 · 코스 다섯 칸,
 * 제목 · 본문은 자유롭게 쓰고 내 기록(인증 안 된 것도)을 붙일 수 있습니다. 올리기는 인증 기록 5건부터, 댓글은 누구나.
 */
export default function BoardHome() {
  const router = useRouter();
  const { author } = useLocalSearchParams<{ author?: string }>();
  const { data: rows = [] } = usePersonalRows();
  const { data: isAdmin } = useIsAdmin();
  const { boardTab: tab } = useAppState();
  const [nearOnly, setNearOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [pastTheme, setPastTheme] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");

  // my_verified_count 와 같은 기준 — 보관함 · 연인 복사본 제외.
  const verified = useMemo(() => rows.filter((r) => r.verified && !r.pending && r.source_record_id == null && r.copied_at == null), [rows]);
  // 내 동네 — 가장 최근 인증 기록의 구.
  const myGu = useMemo(() => {
    const latest = [...verified].filter((r) => r.verified_at && guOf(r.address)).sort((a, b) => (a.verified_at! < b.verified_at! ? 1 : -1))[0];
    return latest ? guOf(latest.address) : null;
  }, [verified]);

  const { data: theme } = useCurrentTheme();
  const { data: lastTheme } = useLastTheme();
  const { data: hotTags = [] } = usePopularTags(3);
  const type: PostType | null = tab === "all" ? null : tab;
  const { data: posts = [], refetch, isRefetching } = useBoardFeed({
    type,
    area: nearOnly && NEAR_TABS.includes(tab) ? myGu : null,
    verifiedOnly: verifiedOnly && (tab === "food" || tab === "cafe"),
    tag,
    themeId: tab === "theme" && pastTheme && lastTheme ? lastTheme.id : null,
    authorId: author ?? null,
  });
  const { data: stops } = useCourseStops(posts.filter((p) => p.type === "course").map((p) => p.id));

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? posts.filter((p) => [p.title, p.body, p.place_name, ...p.tags, ...(p.course_names ?? [])].some((v) => (v ?? "").toLowerCase().includes(needle)))
    : posts;
  const canPost = verified.length >= MIN_VERIFIED || !!isAdmin;

  function pickTab(t: BoardTab) {
    setState({ boardTab: t });
    setTag(null);
    setPastTheme(false);
  }
  const open = (id: number) => router.push({ pathname: "/community/board/[id]", params: { id: String(id) } });
  const edit = (id: number) => router.push({ pathname: "/community/board/new", params: { edit: String(id) } });

  const toggleChip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityState={{ selected: on }}
      style={{ height: 32, borderRadius: 16, paddingHorizontal: 13, justifyContent: "center", borderWidth: 1, borderStyle: on ? "solid" : "dashed", borderColor: on ? C.brick : K.dashed, backgroundColor: on ? C.brickSoft : "transparent" }}
    >
      <Text style={{ fontFamily: F.sans, fontSize: 12, color: on ? C.brick : C.muted }}>{on ? `${label} ✕` : label}</Text>
    </Pressable>
  );

  const header = (
    <View>
      <TitleBlock eyebrow="COMMUNITY · BOARD" title="게시판" sub="DINARY 사용자 모두가 봅니다" />
      {searching && (
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="제목 · 본문 · 가게 · #태그"
          placeholderTextColor={K.inactive}
          style={{ marginTop: 12, marginHorizontal: 20, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 15, fontFamily: F.sans, fontSize: 13, color: C.ink }}
        />
      )}
      {!!author && (
        <Pressable onPress={() => router.setParams({ author: undefined })} style={{ marginTop: 12, marginHorizontal: 20, alignSelf: "flex-start" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>한 사람의 글만 보는 중 ✕</Text>
        </Pressable>
      )}
      <FilterChips<BoardTab>
        value={tab}
        onChange={pickTab}
        options={[
          { id: "all", label: "전체" }, { id: "free", label: "자유" }, { id: "theme", label: "주제" },
          { id: "food", label: "맛집" }, { id: "cafe", label: "카페" }, { id: "course", label: "코스" },
        ]}
        trailing={
          <>
            {myGu && NEAR_TABS.includes(tab) && toggleChip(`${guLabel(myGu)}만`, nearOnly, () => setNearOnly((v) => !v))}
            {(tab === "food" || tab === "cafe") && toggleChip("✓ 인증만", verifiedOnly, () => setVerifiedOnly((v) => !v))}
          </>
        }
      />
      {tab === "free" && (hotTags.length > 0 || tag) && (
        <View style={{ marginTop: 10, paddingHorizontal: 20, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(tag && !hotTags.includes(tag) ? [tag, ...hotTags] : hotTags).map((t) => toggleChip(`#${t}`, tag === t, () => setTag(tag === t ? null : t)))}
        </View>
      )}
      {tab !== "free" && tag && <View style={{ marginTop: 10, paddingHorizontal: 20, flexDirection: "row" }}>{toggleChip(`#${tag}`, true, () => setTag(null))}</View>}

      {tab === "theme" && (
        <View style={{ marginTop: 14, marginHorizontal: 16, gap: 8 }}>
          {theme ? (
            <View style={{ borderRadius: 20, backgroundColor: C.ink, paddingVertical: 18, paddingHorizontal: 18, gap: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: K.brickLine }}>
                이번 주 주제 · {theme.starts_on.slice(5).replace("-", ".")} – {theme.ends_on.slice(5).replace("-", ".")}
              </Text>
              <Text style={{ fontFamily: F.serif, fontSize: 22, lineHeight: 30, color: C.card }}>{theme.title}</Text>
              {!!theme.description && <Text style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 19, color: "#d8d2c6" }}>{theme.description}</Text>}
              <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: "#a8a196" }}>답 {theme.count} · {theme.daysLeft === 0 ? "오늘까지" : `${theme.daysLeft}일 남음`}</Text>
                <Pressable
                  onPress={() => router.push({ pathname: "/community/board/new", params: { type: "theme" } })}
                  disabled={!canPost}
                  style={{ minHeight: 34, borderRadius: 17, backgroundColor: C.brick, paddingHorizontal: 16, justifyContent: "center", opacity: canPost ? 1 : 0.4 }}
                >
                  <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>답하기</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Text style={{ paddingVertical: 8, fontFamily: F.sans, fontSize: 12, color: C.faint }}>이번 주 주제가 아직 없습니다.</Text>
          )}
          {lastTheme && (
            <Pressable onPress={() => setPastTheme((v) => !v)} style={{ minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: pastTheme ? C.brick : C.lineSoft, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" }}>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 12, color: pastTheme ? C.brick : C.muted }}>
                지난 주제 · {lastTheme.title} · 답 {lastTheme.count}
              </Text>
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: pastTheme ? C.brick : K.inactive }}>{pastTheme ? "✕" : "›"}</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={{ height: 6 }} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <CommunityHeader right={<RoundButton label="찾기" onPress={() => { setSearching((v) => !v); setQ(""); }}><SearchLineIcon /></RoundButton>} />
      <FlatList
        data={shown}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={header}
        onRefresh={refetch}
        refreshing={isRefetching}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={<Text style={{ paddingVertical: 44, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>아직 올라온 글이 없습니다.</Text>}
        renderItem={({ item }) =>
          item.pinned ? (
            <NoticeRow post={item} onOpen={() => open(item.id)} />
          ) : (
            <View style={{ marginHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}>
              <PostCard
                post={item}
                stops={stops?.get(item.id)}
                showBoard={tab === "all"}
                onOpen={() => open(item.id)}
                onTag={(t) => setTag(t)}
                onEdit={() => edit(item.id)}
              />
            </View>
          )
        }
      />

      {/* 글쓰기 — 모든 칸에서. 인증 기록 5건 전에는 버튼 대신 안내 띠(댓글은 누구나 쓸 수 있습니다). */}
      {canPost ? (
        <Pressable
          onPress={() => router.push({ pathname: "/community/board/new", params: { type: tab === "all" ? "free" : tab } })}
          style={{ position: "absolute", right: 18, bottom: 22, height: 46, borderRadius: 23, backgroundColor: C.ink, paddingHorizontal: 18, justifyContent: "center", shadowColor: C.ink, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.card }}>+ 글쓰기</Text>
        </Pressable>
      ) : (
        <View style={{ position: "absolute", left: 18, right: 18, bottom: 22, minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>인증 기록 {MIN_VERIFIED}건부터 글을 쓸 수 있습니다 · 지금 {verified.length}건</Text>
        </View>
      )}
    </View>
  );
}
