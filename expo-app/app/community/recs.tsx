import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon, SearchLineIcon } from "@/components/icons";
import { useRows, useWishes } from "@/data/queries";
import { setState } from "@/data/store";
import { useFriends, useSharedRecords } from "@/features/community/api";
import { useAddWish } from "@/features/community/useAddWish";
import { buildRecs, km, useDislikes, weekIndex, type Rec } from "@/features/community/recs";
import { CommunityHeader, FilterChips, K, metaLine, PhotoOrStripes, RoundButton, shortAddr, TitleBlock } from "@/features/community/ui";
import { C, F, TAB_BAR_H } from "@/theme";

type Filter = "all" | "friends" | "near" | "taste";
const NEAR_M = 3000;
const HERO_N = 3;

/** 탐색(하단 「추천」 탭과 겹치지 않게 이름만 바꿈, HANDOFF-recommend §1-3) — 내 기록과 친구 기록으로 고른 「다음에 갈 곳」(핸드오프 §6 · 2b). */
export default function RecsScreen() {
  const router = useRouter();
  // 위시에 담기 — 연인 기록장이 있으면 내 위시 / 우리 위시를 한 번 묻습니다.
  const { add: addWish, sheet: wishSheet } = useAddWish();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: mine = [] } = useRows();
  const { data: wishes = [] } = useWishes();
  const { data: shared = [] } = useSharedRecords();
  const { data: fr } = useFriends();
  const { dislikes, dislike } = useDislikes();
  const [filter, setFilter] = useState<Filter>("all");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<Record<string, "added" | "exists">>({});

  const friends = useMemo(() => new Map((fr?.friends ?? []).map((f) => [f.id, f])), [fr]);
  const myCount = mine.filter((r) => !r.pending).length;

  // 위치 권한이 이미 있으면 거리를 붙입니다. 「근처」를 누를 때만 권한을 묻습니다.
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(async (p) => {
      if (!p.granted) return;
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }).catch(() => {});
  }, []);

  async function pickFilter(f: Filter) {
    setFilter(f);
    if (f === "near" && !me) {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }
  }

  const all = useMemo(
    () => buildRecs({ shared, mine: mine.filter((r) => !r.pending), wishes, friends, dislikes, me }),
    [shared, mine, wishes, friends, dislikes, me],
  );

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => filter !== "friends" || r.friendIds.length > 0)
      .filter((r) => filter !== "near" || (r.distanceM != null && r.distanceM <= NEAR_M))
      .filter((r) => filter !== "taste" || r.sameCategory >= 3)
      .filter((r) => !needle || [r.name, r.category, r.address].some((v) => (v ?? "").toLowerCase().includes(needle)))
      .filter((r) => !saved[r.place]);
  }, [all, filter, q, saved]);

  // 이번 주 하나 — 위 몇 곳을 주마다 돌려 첫 장을 바꾸고, 넘기면 다음 후보.
  const heroes = useMemo(() => {
    const top = list.slice(0, HERO_N);
    if (!top.length) return top;
    const shift = weekIndex() % top.length;
    return [...top.slice(shift), ...top.slice(0, shift)];
  }, [list]);
  const rest = list.slice(HERO_N);

  async function wish(r: Rec) {
    const who = r.friendIds[0] ? friends.get(r.friendIds[0])?.nickname : null;
    try {
      const res = await addWish({ name: r.name, where_text: r.address ?? r.region, category: r.category, lat: r.lat, lng: r.lng, source: who ? `${who}의 기록` : "탐색" });
      if (res) setSaved((s) => ({ ...s, [r.place]: res }));
    } catch {}
  }

  function showOnMap(r: Rec) {
    if (r.lat == null || r.lng == null) return;
    setState({ mapSegment: "records", ghost: { name: r.name, address: r.address ?? "", lat: r.lat, lng: r.lng } });
    router.dismissTo("/");
  }

  const meta = (r: Rec) => metaLine(r.category, shortAddr(r.address, r.region), km(r.distanceM));

  const heroW = width - 32;
  const header = (
    <View>
      <TitleBlock eyebrow="COMMUNITY · FOR YOU" title="탐색" sub={`내 기록 ${myCount}건과 친구 기록으로 고릅니다`} />
      {searching && (
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="가게 · 종류 · 동네"
          placeholderTextColor={K.inactive}
          style={{ marginTop: 12, marginHorizontal: 20, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 15, fontFamily: F.sans, fontSize: 13, color: C.ink }}
        />
      )}
      <FilterChips<Filter>
        value={filter}
        onChange={pickFilter}
        options={[{ id: "all", label: "전체" }, { id: "friends", label: "친구가 간 곳" }, { id: "near", label: "근처" }, { id: "taste", label: "입맛 비슷한" }]}
      />
      {heroes.length > 0 && (
        <ScrollView horizontal pagingEnabled={false} snapToInterval={heroW + 8} decelerationRate="fast" showsHorizontalScrollIndicator={false}
          style={{ marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {heroes.map((r) => (
            <View key={r.place} style={{ width: heroW, borderRadius: 22, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, overflow: "hidden" }}>
              <PhotoOrStripes uri={r.photo} height={160} radius={0} label="가게 사진 · 친구 인증 사진" />
              <View style={{ padding: 14 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.brick }}>이번 주 하나</Text>
                <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: F.serif, fontSize: 19, color: C.ink }}>{r.name}</Text>
                <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{meta(r)}</Text>
                <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {r.reasons.slice(0, 2).map((t, i) => (
                    <Text key={t} style={{ borderRadius: 10, backgroundColor: i === 0 ? C.brickSoft : K.segMap, paddingHorizontal: 9, paddingVertical: 3, fontFamily: F.sans, fontSize: 11, color: i === 0 ? K.brickInk : K.text2, overflow: "hidden" }}>{t}</Text>
                  ))}
                </View>
                <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={() => showOnMap(r)} disabled={r.lat == null} style={{ flex: 1, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", opacity: r.lat == null ? 0.4 : 1 }}>
                    <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: K.text2 }}>지도에서 보기</Text>
                  </Pressable>
                  <Pressable onPress={() => wish(r)} style={{ flex: 1, minHeight: 40, borderRadius: 20, backgroundColor: C.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}>
                    <BookmarkIcon size={13} stroke={C.card} strokeWidth={1.8} />
                    <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>위시에 담기</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      {rest.length > 0 && <Text style={{ marginTop: 18, paddingHorizontal: 20, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>이런 곳도</Text>}
      <View style={{ height: 6 }} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <CommunityHeader right={<RoundButton label="찾기" onPress={() => { setSearching((v) => !v); setQ(""); }}><SearchLineIcon /></RoundButton>} />
      <FlatList
        data={rest}
        keyExtractor={(r) => r.place}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: TAB_BAR_H + insets.bottom + 24 }}
        ListEmptyComponent={heroes.length ? null : (
          <Text style={{ paddingVertical: 44, paddingHorizontal: 28, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, lineHeight: 21, color: C.faint }}>
            {filter === "near" && !me ? "위치를 허용하면 근처 가게를 고릅니다." : "아직 고를 곳이 없습니다.\n친구가 기록을 공유하면 여기에 모입니다."}
          </Text>
        )}
        renderItem={({ item: r }) => (
          <ReanimatedSwipeable
            friction={2}
            rightThreshold={60}
            overshootRight={false}
            onSwipeableOpen={() => { Haptics.selectionAsync(); dislike(r); }}
            renderRightActions={() => (
              <View style={{ width: 96, backgroundColor: K.segMap, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>관심 없음</Text>
              </View>
            )}
          >
            <View style={{ marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.lineSoft, backgroundColor: C.paper }}>
              <PhotoOrStripes uri={r.photo} width={48} height={48} radius={12} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{r.name}</Text>
                <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{meta(r)}</Text>
                <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.brick }}>{r.reasons[0]}</Text>
              </View>
              <Pressable onPress={() => wish(r)} accessibilityLabel="위시에 담기" style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: K.brickLine, alignItems: "center", justifyContent: "center" }}>
                <BookmarkIcon size={15} stroke={C.brick} strokeWidth={1.8} />
              </Pressable>
            </View>
          </ReanimatedSwipeable>
        )}
      />
      {wishSheet}
    </View>
  );
}
