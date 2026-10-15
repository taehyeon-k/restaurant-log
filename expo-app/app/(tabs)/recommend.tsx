import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { LocateIcon, SearchIcon } from "@/components/icons";
import { BottomSheetModal, PhotoBox } from "@/components/ui";
import { ME_COLOR, PARTNER_COLOR, useActiveBook } from "@/data/books";
import { useRows, useWishes } from "@/data/queries";
import { setState, useAppState } from "@/data/store";
import { Avatar } from "@/features/couple/Avatars";
import { daysBetween, todayIso } from "@/lib/anniversary";
import { norm } from "@/lib/geo";
import { forwardGeocode, reverseGeocode } from "@/lib/geocode";
import { iGa } from "@/lib/josa";
import {
  areaOf, defaultMeal, frequentAreas, mealDay, recentMeals, wishAreas, wishInArea, type Area, type Meal,
} from "@/lib/recommend";
import type { Wish } from "@/lib/types";
import { C, F, TAB_BAR_H } from "@/theme";

const GREEN = { bg: "#eef1e8", line: "#cfd8c4", ink: "#4f6038" };

/**
 * 추천 탭(HANDOFF-recommend §4, 시안 3a·4c) — 지금 기록장(개인/연인) 기준.
 * 동네 · 끼니 → 최근 식사(빠진 종류) → 위시리스트에서.
 * 「입맛이 비슷한 사람들이 좋게 본 곳」 · 「기념일에 가기 좋은 곳」은 서버 계산이 확정되면 붙입니다(§4-5) — 지금은 숨김.
 */
export default function RecommendTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isCouple, me, partner } = useActiveBook();
  const { data: rows = [] } = useRows();
  const { data: wishes = [] } = useWishes();
  const { recExcludeOverride } = useAppState();
  const today = todayIso();

  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [here, setHere] = useState<Area | null>(null);
  const [picked, setPicked] = useState<Area | null>(null);
  const [sheet, setSheet] = useState(false);

  const frequent = useMemo(() => frequentAreas(rows), [rows]);
  const wishSpots = useMemo(() => wishAreas(wishes), [wishes]);

  // 「지금 있는 곳」 — 위치 권한을 거부하면 이 행은 없고, 기본값은 가장 자주 기록한 동네(§5).
  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (!perm?.granted) return;
      const pos = (await Location.getLastKnownPositionAsync().catch(() => null))
        ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
      if (!pos) return;
      const { latitude: lat, longitude: lng } = pos.coords;
      const place = await reverseGeocode(lat, lng);
      const name = place ? areaOf(place.address, place.region) : null;
      if (alive && name) setHere({ name, lat, lng, here: true });
    })();
    return () => { alive = false; };
  }, []);

  const fallbackName = frequent[0]?.name ?? wishSpots[0]?.name ?? null;
  const area = useMemo<Area | null>(() => picked ?? here ?? (fallbackName ? { name: fallbackName } : null), [picked, here, fallbackName]);

  const recent = useMemo(() => recentMeals(rows, isCouple, today), [rows, isCouple, today]);
  const restored = useMemo(() => (recExcludeOverride?.date === today ? recExcludeOverride.categories : []), [recExcludeOverride, today]);
  const excluded = useMemo(() => recent.excluded.filter((c) => !restored.includes(c)), [recent, restored]);
  const toggleExclude = (cat: string) => {
    Haptics.selectionAsync();
    const next = restored.includes(cat) ? restored.filter((c) => c !== cat) : [...restored, cat];
    setState({ recExcludeOverride: { date: today, categories: next } });
  };

  // 위시리스트에서 — 고른 동네 안, 빠진 종류 제외, 담은 지 오래된 순. 연인 기록은 같은 가게를 둘이 담았으면 한 장으로.
  const areaWishes = useMemo(() => (area ? wishes.filter((w) => wishInArea(w, area)) : []), [wishes, area]);
  const cards = useMemo(() => {
    const groups = new Map<string, Wish[]>();
    for (const w of areaWishes) {
      if (w.category && excluded.includes(w.category)) continue;
      const k = isCouple ? norm(w.name) : w.id;
      groups.set(k, [...(groups.get(k) ?? []), w]);
    }
    return [...groups.values()]
      .map((list) => [...list].sort((a, b) => (a.saved_at < b.saved_at ? -1 : 1)))
      .sort((a, b) => (a[0].saved_at < b[0].saved_at ? -1 : 1));
  }, [areaWishes, excluded, isCouple]);

  const memberOf = (userId: string | undefined) => (userId && partner?.userId === userId ? { m: partner, color: PARTNER_COLOR } : { m: me, color: ME_COLOR });

  const wishCard = (list: Wish[]) => {
    const w = list[0];
    const days = Math.max(0, daysBetween(w.saved_at.slice(0, 10), today));
    const savers = [...new Set(list.map((x) => x.user_id ?? me?.userId))];
    const both = isCouple && savers.length > 1;
    const who = memberOf(w.user_id);
    return (
      <Pressable
        key={w.id}
        onPress={() => router.push({ pathname: "/wish/[id]", params: { id: w.id } })}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 12 }}
      >
        <PhotoBox category={w.category} size={58} radius={14} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{w.name}</Text>
          {!!w.category && <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{w.category}</Text>}
          {isCouple ? (
            <View style={{ marginTop: 5, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ flexDirection: "row" }}>
                {both ? (
                  <>
                    <Avatar name={me?.nickname ?? "나"} color={ME_COLOR} size={18} />
                    <Avatar name={partner?.nickname ?? "?"} color={PARTNER_COLOR} size={18} style={{ marginLeft: -6 }} />
                  </>
                ) : (
                  <Avatar name={who.m?.nickname ?? "?"} color={who.color} size={18} />
                )}
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 11, color: C.muted }}>
                {both ? "둘 다 담음" : `${iGa(who.m?.nickname ?? "누군가")} 담음 · ${days}일 전`}
              </Text>
            </View>
          ) : (
            <Text style={{ marginTop: 5, fontFamily: F.sans, fontSize: 11, color: C.muted }}>담은 지 {days}일 · 아직 안 감</Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 22, paddingBottom: TAB_BAR_H + insets.bottom + 28 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.2, color: "#8a8377" }}>{isCouple ? "RECOMMEND · 우리" : "RECOMMEND"}</Text>

        {/* 동네 + 끼니 */}
        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityHint="동네를 고르는 시트가 열립니다" style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.serif, fontSize: 24, color: C.ink }}>{area?.name ?? "동네 고르기"}</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.brick} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 9l6 6 6-6" />
            </Svg>
          </Pressable>
          <View style={{ flexDirection: "row", borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 3 }}>
            {(["lunch", "dinner"] as const).map((m) => {
              const on = meal === m;
              return (
                <Pressable key={m} onPress={() => setMeal(m)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ minHeight: 30, borderRadius: 15, paddingHorizontal: 13, justifyContent: "center", backgroundColor: on ? C.ink : "transparent" }}>
                  <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: on ? C.card : C.muted }}>{m === "lunch" ? "점심" : "저녁"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 최근 식사 */}
        {recent.meals.length > 0 && (
          <View style={{ marginTop: 16, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, color: C.faint }}>{isCouple ? "우리의 최근 식사" : "최근 3일 · 인증 기록"}</Text>
            <View style={{ marginTop: 10, flexDirection: "row", gap: 6 }}>
              {recent.meals.map((r) => {
                const out = !!r.category && excluded.includes(r.category);
                return (
                  <View key={r.id} style={{ flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: out ? "#f2e0d5" : C.paper, paddingVertical: 8, paddingHorizontal: 9 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: out ? "#a34d27" : C.faint }}>{mealDay(r.visited_at!, today)}</Text>
                    <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: F.sansBd, fontSize: 13, color: out ? "#a34d27" : C.ink }}>{r.category ?? "기타"}</Text>
                    <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: F.sans, fontSize: 10, color: out ? "#a34d27" : C.faint }}>{r.name}</Text>
                  </View>
                );
              })}
            </View>
            {recent.excluded.length > 0 && (
              <>
                <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 12, color: C.muted }}>
                  {excluded.length ? recent.sentence : "최근 먹은 종류도 함께 보고 있어요"}
                </Text>
                <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {recent.excluded.map((cat) => {
                    const out = excluded.includes(cat);
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => toggleExclude(cat)}
                        accessibilityLabel={out ? `${cat} 다시 포함` : `${cat} 다시 빼기`}
                        style={{ minHeight: 30, borderRadius: 15, borderWidth: 1, borderColor: out ? "#e0c3b1" : C.lineSoft, backgroundColor: out ? C.brickSoft : C.card, paddingHorizontal: 11, justifyContent: "center" }}
                      >
                        <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: out ? C.brick : C.faint }}>{out ? `${cat} ✕` : `+ ${cat}`}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}

        {/* 위시리스트에서 — 연인은 제목 없이 카드만 */}
        {!isCouple && (
          <View style={{ marginTop: 22, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.ink }}>위시리스트에서</Text>
            {area && <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: 10, color: C.faint }}>{area.name} · {areaWishes.length} 중 {cards.length}</Text>}
          </View>
        )}
        <View style={{ marginTop: isCouple ? 18 : 10, gap: 8 }}>
          {cards.map(wishCard)}
          {cards.length === 0 && (
            <View style={{ borderRadius: 20, borderWidth: 1, borderStyle: "dashed", borderColor: "#cdc6b8", padding: 18 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 20, color: C.faint }}>
                {!area
                  ? "동네를 고르면 그 동네에 담아 둔 위시를 보여드려요."
                  : areaWishes.length
                    ? `${area.name}에 담아 둔 곳은 최근 먹은 종류뿐이에요.`
                    : `${area.name}에 담아 둔 위시가 아직 없어요.`}
              </Text>
              <Pressable onPress={() => setSheet(true)} style={{ marginTop: 8, alignSelf: "flex-start" }}>
                <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>다른 동네 고르기</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      <AreaSheet
        visible={sheet}
        current={area}
        here={here}
        frequent={frequent.slice(0, 4)}
        wishSpots={wishSpots.slice(0, 4)}
        onClose={() => setSheet(false)}
        onPick={(a) => { setPicked(a.here ? null : a); setSheet(false); }}
      />
    </View>
  );
}

/** 동네 시트(§4-3, 시안 3b) — 검색 · 지금 있는 곳 · 자주 기록한 동네 · 위시리스트가 모인 동네. */
function AreaSheet({
  visible, current, here, frequent, wishSpots, onClose, onPick,
}: {
  visible: boolean; current: Area | null; here: Area | null;
  frequent: { name: string; count: number }[]; wishSpots: { name: string; count: number }[];
  onClose: () => void; onPick: (a: Area) => void;
}) {
  const [draft, setDraft] = useState<Area | null>(current);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  useEffect(() => { if (visible) { setDraft(current); setQ(""); } }, [visible, current]);

  const known = useMemo(() => [...new Set([...frequent, ...wishSpots].map((a) => a.name))], [frequent, wishSpots]);
  const query = q.trim();
  const matches = query ? known.filter((n) => n.includes(query) || query.includes(n)) : [];

  async function search() {
    if (query.length < 2) return;
    setSearching(true);
    const found = await forwardGeocode(query).catch(() => []);
    setSearching(false);
    const p = found[0];
    setDraft(p ? { name: query, lat: p.lat, lng: p.lng } : { name: query });
    setQ("");
  }

  const chip = (name: string, count: string, green: boolean) => {
    const on = draft?.name === name && !draft.here;
    return (
      <Pressable
        key={name}
        onPress={() => setDraft({ name })}
        accessibilityState={{ selected: on }}
        style={{
          minHeight: 34, borderRadius: 17, borderWidth: on ? 1.5 : 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6,
          borderColor: on ? (green ? GREEN.ink : C.brick) : green ? GREEN.line : C.lineSoft,
          backgroundColor: green ? GREEN.bg : on ? C.brickSoft : C.card,
        }}
      >
        <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: green ? GREEN.ink : on ? C.brick : C.ink }}>{name}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: green ? GREEN.ink : C.faint }}>{count}</Text>
      </Pressable>
    );
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink }}>어디서 드세요?</Text>

      <View style={{ marginTop: 14, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <SearchIcon />
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder="동네나 역 이름"
          placeholderTextColor={C.faint}
          style={{ flex: 1, fontFamily: F.sans, fontSize: 13, color: C.ink, paddingVertical: 8 }}
        />
        {searching && <ActivityIndicator size="small" color={C.faint} />}
      </View>
      {query.length > 0 && (
        <View style={{ marginTop: 6 }}>
          {matches.slice(0, 4).map((n) => (
            <Pressable key={n} onPress={() => { setDraft({ name: n }); setQ(""); }} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>{n}</Text>
            </Pressable>
          ))}
          {query.length >= 2 && !matches.includes(query) && (
            <Pressable onPress={search} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.brick }}>「{query}」 찾기</Text>
            </Pressable>
          )}
        </View>
      )}

      {here && (
        <Pressable
          onPress={() => setDraft(here)}
          accessibilityState={{ selected: !!draft?.here }}
          style={{ marginTop: 12, minHeight: 52, borderRadius: 16, borderWidth: draft?.here ? 1.5 : 1, borderColor: draft?.here ? C.brick : C.lineSoft, backgroundColor: draft?.here ? C.brickSoft : C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <LocateIcon size={18} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>지금 있는 곳</Text>
            <Text style={{ marginTop: 1, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{here.name}</Text>
          </View>
        </Pressable>
      )}

      {frequent.length > 0 && (
        <>
          <Text style={{ marginTop: 16, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, color: C.faint }}>자주 기록한 동네</Text>
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{frequent.map((a) => chip(a.name, String(a.count), false))}</View>
        </>
      )}
      {wishSpots.length > 0 && (
        <>
          <Text style={{ marginTop: 14, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, color: C.faint }}>위시리스트가 모인 동네</Text>
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{wishSpots.map((a) => chip(a.name, `위시 ${a.count}`, true))}</View>
        </>
      )}

      <Pressable
        onPress={() => draft && onPick(draft)}
        disabled={!draft}
        style={{ marginTop: 20, height: 52, borderRadius: 18, backgroundColor: C.brick, alignItems: "center", justifyContent: "center", opacity: draft ? 1 : 0.4 }}
      >
        <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>{draft ? `${draft.here ? "지금 있는 곳" : draft.name}에서 추천 받기` : "동네를 골라 주세요"}</Text>
      </Pressable>
    </BottomSheetModal>
  );
}
