import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchIcon } from "@/components/icons";
import { Eyebrow, fieldStyle } from "@/components/ui";
import { setState } from "@/data/store";
import { searchFoodPlaces, type FoodPlace } from "@/lib/geocode";
import { isSourceKind, SOURCE_HEAD, sourceGlyph } from "@/lib/sourceLink";
import { C, F, SHADOW } from "@/theme";

/**
 * 링크로 위시 담기 — 「어느 가게인가요」(HANDOFF-wish-link §A-3).
 * 위시 폼의 「링크 붙여넣기」(from=form)와 공유 시트(_layout)가 같은 화면으로 옵니다.
 * 폼에서 왔으면 고른 가게를 store.linkPick 으로 돌려주고 닫고, 공유 시트에서 왔으면 위시 폼으로 바꿉니다.
 * 검색칸은 비워서 시작합니다 — 영상 제목은 가져오지 않습니다(위시 링크 붙여넣기 지시서).
 */
export default function WishLinkRoute() {
  const p = useLocalSearchParams<{ url: string; kind?: string; from?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const url = p.url ?? "";
  const kind = isSourceKind(p.kind) ? p.kind : "link";

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(true);
  const [hits, setHits] = useState<FoodPlace[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => { try { setHits((await searchFoodPlaces(query, ctrl.signal)).slice(0, 3)); } catch { /* 취소·오프라인 */ } }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  function pick(r: FoodPlace) {
    const category = r.category ?? null;
    if (p.from === "form") {
      setState({ linkPick: { name: r.name, address: r.address, category, lat: r.lat, lng: r.lng, url, kind } });
      return router.back();
    }
    router.replace({
      pathname: "/wish/new",
      params: {
        name: r.name, where_text: r.address, ...(category ? { category } : {}),
        lat: String(r.lat), lng: String(r.lng), source_url: url, source_kind: kind,
      },
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: insets.bottom + 30 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.ink }}>어느 가게인가요</Text>
          <Pressable onPress={() => router.back()} style={{ padding: 8 }}><Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>취소</Text></Pressable>
        </View>

        <View style={{ marginTop: 11, borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: "#fff" }}>{sourceGlyph(kind)}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.faint }}>{SOURCE_HEAD[kind]}</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 13, color: C.ink }}>{url.replace(/^https?:\/\/(www\.|m\.)?/i, "")}</Text>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <Eyebrow>가게</Eyebrow>
          <View style={{ justifyContent: "center" }}>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
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
              {hits.map((r, i) => (
                <Pressable key={`${r.lat}-${r.lng}-${i}`} onPress={() => pick(r)}
                  style={{ paddingHorizontal: 14, paddingVertical: 11, gap: 2, borderBottomWidth: i === hits.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
                  <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>{r.name}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>
                    {[r.category ?? (r.kind === "cafe" ? "카페" : "맛집"), r.address].filter(Boolean).join(" · ")}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
