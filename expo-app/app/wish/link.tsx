import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchIcon } from "@/components/icons";
import { SourceIcon } from "@/components/SourceIcon";
import { Eyebrow, fieldStyle } from "@/components/ui";
import { useWishes } from "@/data/queries";
import { setState } from "@/data/store";
import { searchFoodPlaces, type FoodPlace } from "@/lib/geocode";
import { fetchLinkMeta, headOf, isSourceKind, queryFromTitle, shortUrl, type LinkMeta } from "@/lib/sourceLink";
import { matchWish } from "@/lib/types";
import { C, F, SHADOW } from "@/theme";

/** 한 번에 담을 수 있는 가게 수. */
const MAX = 10;

const placeKey = (r: FoodPlace) => `${r.name}|${r.lat.toFixed(5)}|${r.lng.toFixed(5)}`;

/**
 * 링크로 위시 담기 — 「어느 가게인가요」(HANDOFF-wish-group §5-1). 게시물에 나온 가게를 여러 곳 고릅니다.
 * 위시 폼의 「링크 붙여넣기」(from=form)와 공유 시트가 같은 화면으로 옵니다.
 * 1곳이면 지금처럼 위시 폼으로(폼에서 왔으면 store.linkPick 으로 돌려주고 닫기), 2곳 넘으면 그룹 이름 화면(wish/group)으로.
 * 유튜브 · 블로그는 원 게시물 제목에서 검색어를 미리 채웁니다. 인스타 · 링크는 비워서 시작합니다.
 */
export default function WishLinkRoute() {
  const p = useLocalSearchParams<{ url: string; kind?: string; from?: string; note?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: wishes = [] } = useWishes();
  const url = p.url ?? "";
  const kind = isSourceKind(p.kind) ? p.kind : "link";

  const [meta, setMeta] = useState<LinkMeta | null>(null);
  const [query, setQuery] = useState("");
  const typed = useRef(false);
  const [focused, setFocused] = useState(true);
  const [hits, setHits] = useState<FoodPlace[]>([]);
  const [picked, setPicked] = useState<FoodPlace[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchLinkMeta(url, kind, ctrl.signal).then((m) => {
      if (ctrl.signal.aborted || !m) return;
      setMeta(m);
      // 유튜브 · 블로그만 제목으로 검색어를 채웁니다 — 사용자가 이미 적기 시작했으면 두고.
      if (!typed.current && (kind === "shorts" || kind === "youtube" || kind === "blog")) setQuery(queryFromTitle(m.title));
    });
    return () => ctrl.abort();
  }, [url, kind]);

  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => { try { setHits((await searchFoodPlaces(query, ctrl.signal)).slice(0, 5)); } catch { /* 취소·오프라인 */ } }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const isPicked = (r: FoodPlace) => picked.some((x) => placeKey(x) === placeKey(r));
  function toggle(r: FoodPlace) {
    if (isPicked(r)) { Haptics.selectionAsync(); return setPicked((cur) => cur.filter((x) => placeKey(x) !== placeKey(r))); }
    if (picked.length >= MAX) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return setToast(`한 번에 ${MAX}곳까지 담을 수 있어요`);
    }
    Haptics.selectionAsync();
    setPicked((cur) => [...cur, r]);
  }

  const title = meta?.title ?? null;
  const author = meta?.author || null;

  function pickOne(r: FoodPlace) {
    const category = r.category ?? null;
    if (p.from === "form") {
      setState({ linkPick: { name: r.name, address: r.address, category, lat: r.lat, lng: r.lng, url, kind, title, author } });
      return router.back();
    }
    router.replace({
      pathname: "/wish/new",
      params: {
        name: r.name, where_text: r.address, ...(category ? { category } : {}),
        lat: String(r.lat), lng: String(r.lng), source_url: url, source_kind: kind,
        ...(title ? { source_title: title } : {}), ...(author ? { source_author: author } : {}),
      },
    });
  }

  function toGroup() {
    setState({
      groupDraft: {
        places: picked.map((r) => ({ name: r.name, address: r.address, category: r.category ?? null, lat: r.lat, lng: r.lng })),
        url, kind, title, author,
      },
    });
    // 이 화면 위에 엽니다 — 「‹ 가게 고르기」로 돌아오면 고른 것이 그대로. 담으면 폼까지 같이 닫힙니다(적던 내용은 버림).
    router.push("/wish/group");
  }

  function done() {
    if (!picked.length) return;
    if (picked.length === 1) return pickOne(picked[0]);
    if (p.from === "form" && p.note === "1") {
      return Alert.alert("적던 내용은 담기지 않아요", "여러 곳은 그룹으로 담습니다. 위시 폼에 적던 메모는 버려집니다.", [
        { text: "취소", style: "cancel" },
        { text: "계속", onPress: toGroup },
      ]);
    }
    toGroup();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 30 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.ink }}>어느 가게인가요</Text>
          <Pressable onPress={() => router.back()} style={{ padding: 8 }}><Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>취소</Text></Pressable>
        </View>

        <View style={{ marginTop: 11, borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <SourceIcon kind={kind} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.faint }}>{headOf(url, kind)}</Text>
            {title ? (
              <>
                <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>{title}</Text>
                <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{[author, shortUrl(url)].filter(Boolean).join(" · ")}</Text>
              </>
            ) : (
              <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>{shortUrl(url)}</Text>
            )}
          </View>
        </View>
        <Text style={{ marginTop: 8, textAlign: "right", fontFamily: F.mono, fontSize: 10, color: C.faint }}>{picked.length} / {MAX}</Text>

        <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {picked.length ? picked.map((r) => (
            <Pressable key={placeKey(r)} onPress={() => toggle(r)} accessibilityLabel={`${r.name} 빼기`} style={s.chip}>
              <Text numberOfLines={1} style={{ maxWidth: 180, fontFamily: F.sansMd, fontSize: 12.5, color: C.brick }}>{r.name}</Text>
              <Text style={{ fontSize: 10.5, color: C.brick }}>✕</Text>
            </Pressable>
          )) : (
            <Text style={{ paddingVertical: 8, fontFamily: F.sans, fontSize: 12, color: C.faint }}>게시물에 나온 가게를 모두 골라 주세요</Text>
          )}
        </View>

        <View style={{ marginTop: 14 }}>
          <Eyebrow>가게 찾기</Eyebrow>
          <View style={{ justifyContent: "center" }}>
            <TextInput
              autoFocus
              value={query}
              onChangeText={(t) => { typed.current = true; setQuery(t); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="가게 이름" placeholderTextColor="#b3ada1" returnKeyType="search"
              style={[fieldStyle, { borderRadius: 14, minHeight: 46, paddingLeft: 38 }, focused && { borderWidth: 1.5, borderColor: C.brick }]}
            />
            <View pointerEvents="none" style={{ position: "absolute", left: 14, top: 8, bottom: 0, justifyContent: "center" }}>
              <SearchIcon size={15} stroke={focused ? C.brick : C.faint} />
            </View>
          </View>
          {hits.length > 0 && (
            <View style={[{ marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, overflow: "hidden" }, SHADOW.card]}>
              {hits.map((r, i) => {
                const already = !!matchWish(wishes, r.name);
                const on = isPicked(r);
                return (
                  <Pressable
                    key={`${placeKey(r)}-${i}`}
                    disabled={already}
                    onPress={() => toggle(r)}
                    accessibilityState={{ selected: on, disabled: already }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 10,
                      backgroundColor: already ? "#f3f0e9" : on ? "#fbf3ee" : C.card,
                      borderBottomWidth: i === hits.length - 1 ? 0 : 1, borderBottomColor: C.line,
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: already ? "#a29a8c" : C.ink }}>{r.name}</Text>
                      <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11.5, color: already ? "#a29a8c" : C.muted }}>
                        {[r.category ?? (r.kind === "cafe" ? "카페" : "맛집"), r.address, already ? "이미 담음" : null].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    {!already && (
                      <View style={[s.check, on ? { backgroundColor: C.brick } : { borderWidth: 1.5, borderColor: "#cdc6b8" }]}>
                        {on && <Text style={{ fontSize: 12, color: "#fff" }}>✓</Text>}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 14, backgroundColor: C.paper }}>
        <Pressable
          onPress={done}
          disabled={!picked.length}
          accessibilityRole="button"
          style={{ height: 54, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: picked.length ? C.ink : "#bdb6a9" }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 15, color: C.card }}>{picked.length ? `${picked.length}곳 · 선택 완료` : "가게를 골라 주세요"}</Text>
        </Pressable>
      </View>

      {toast && (
        <View pointerEvents="none" style={[s.toast, { bottom: insets.bottom + 84 }]}>
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.card }}>{toast}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  chip: { height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.brick, backgroundColor: "rgba(180,85,45,0.1)", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", alignSelf: "center", borderRadius: 16, backgroundColor: "rgba(23,22,20,.85)", paddingVertical: 10, paddingHorizontal: 16 },
});
