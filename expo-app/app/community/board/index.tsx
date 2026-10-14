import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SearchLineIcon } from "@/components/icons";
import { useRows } from "@/data/queries";
import { useBoardFeed, useCurrentTheme, type PostType } from "@/features/community/api";
import { guLabel, guOf, PostBody } from "@/features/community/BoardPost";
import { CommunityHeader, FilterChips, K, RoundButton, TitleBlock } from "@/features/community/ui";
import { C, F } from "@/theme";

type Filter = "all" | PostType;
const MIN_VERIFIED = 5;

/** 게시판 — DINARY 사용자 모두가 보고, 인증 기록으로만 씁니다(핸드오프 §8 · 3d). 빈 글쓰기 칸은 없습니다. */
export default function BoardHome() {
  const router = useRouter();
  const { data: rows = [] } = useRows();
  const [filter, setFilter] = useState<Filter>("all");
  const [nearOnly, setNearOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");

  const verified = useMemo(() => rows.filter((r) => r.verified && !r.pending), [rows]);
  // 내 동네 — 가장 최근 인증 기록의 구.
  const myGu = useMemo(() => {
    const latest = [...verified].filter((r) => r.verified_at && guOf(r.address)).sort((a, b) => (a.verified_at! < b.verified_at! ? 1 : -1))[0];
    return latest ? guOf(latest.address) : null;
  }, [verified]);

  const { data: theme } = useCurrentTheme();
  const { data: posts = [], refetch, isRefetching } = useBoardFeed(filter === "all" ? null : filter, nearOnly ? myGu : null);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? posts.filter((p) => [p.place_name, p.ask_area, p.note, ...p.ask_tags].some((v) => (v ?? "").toLowerCase().includes(needle)))
    : posts;
  const canPost = verified.length >= MIN_VERIFIED;

  const header = (
    <View>
      <TitleBlock eyebrow="COMMUNITY · BOARD" title="게시판" sub="DINARY 사용자 모두가 봅니다 · 인증 기록으로만 씁니다" />
      {searching && (
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="가게 · 동네 · 한 줄"
          placeholderTextColor={K.inactive}
          style={{ marginTop: 12, marginHorizontal: 20, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 15, fontFamily: F.sans, fontSize: 13, color: C.ink }}
        />
      )}
      <FilterChips<Filter>
        value={filter}
        onChange={setFilter}
        options={[{ id: "all", label: "전체" }, { id: "theme_answer", label: "주제" }, { id: "ask", label: "어디 가요?" }, { id: "record_share", label: "기록 나눔" }]}
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
      {theme && (filter === "all" || filter === "theme_answer") && (
        <View style={{ marginTop: 14, marginHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: K.brickLine, backgroundColor: C.card, paddingVertical: 14, paddingHorizontal: 16, gap: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.brick }}>이번 주 주제 · {theme.starts_on.slice(5).replace("-", ".")} – {theme.ends_on.slice(5).replace("-", ".")}</Text>
          <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.ink }}>{theme.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>기록 {theme.count}개 · {theme.daysLeft === 0 ? "오늘까지" : `${theme.daysLeft}일 남음`}</Text>
            <Pressable
              onPress={() => router.push({ pathname: "/community/board/new", params: { type: "theme_answer" } })}
              disabled={!canPost}
              style={{ minHeight: 30, borderRadius: 15, backgroundColor: C.ink, paddingHorizontal: 12, justifyContent: "center", opacity: canPost ? 1 : 0.4 }}
            >
              <Text style={{ fontFamily: F.sansMd, fontSize: 11.5, color: C.card }}>내 기록으로 답하기</Text>
            </Pressable>
          </View>
        </View>
      )}
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
        renderItem={({ item }) => (
          <View style={{ marginHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}>
            <PostBody post={item} rows={rows} themeTitle={item.theme_id === theme?.id ? theme?.title : null} onOpen={() => router.push({ pathname: "/community/board/[id]", params: { id: String(item.id) } })} />
          </View>
        )}
      />

      {/* 올리기 — 인증 기록 5건부터. 그 전에는 버튼 대신 안내가 보입니다. */}
      {canPost ? (
        <Pressable
          onPress={() => router.push("/community/board/new")}
          style={{ position: "absolute", right: 18, bottom: 22, height: 46, borderRadius: 23, backgroundColor: C.ink, paddingHorizontal: 18, justifyContent: "center", shadowColor: C.ink, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.card }}>+ 올리기</Text>
        </Pressable>
      ) : (
        <View style={{ position: "absolute", left: 18, right: 18, bottom: 22, minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>인증 기록 {MIN_VERIFIED}건부터 올릴 수 있습니다 · 지금 {verified.length}건</Text>
        </View>
      )}
    </View>
  );
}
