import DateTimePicker from "@react-native-community/datetimepicker";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { logRec } from "@/features/recommend/log";
import { useEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinkIcon } from "@/components/icons";
import { Button, Chip, Eyebrow, fieldStyle } from "@/components/ui";
import { refreshAll } from "@/data/invalidate";
import { useActiveBook } from "@/data/books";
import { useWishes } from "@/data/queries";
import { setState, useAppState } from "@/data/store";
import { askWishPermissions } from "@/features/notify/geofence";
import { forwardGeocode, searchFoodPlaces, type FoodPlace, type Place } from "@/lib/geocode";
import { isSourceKind, parseSourceLink, shortUrl, SOURCE_LABEL, sourceGlyph, type SourceKind } from "@/lib/sourceLink";
import { supabase } from "@/lib/supabase";
import { ALL_CATEGORIES, matchWish } from "@/lib/types";
import { C, F, SHADOW } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 가고 싶은 곳 담기/고치기. params.id 가 있으면 고치기 — name·where_text·category·lat·lng·plan_date 로 미리 채웁니다. */
export default function WishForm() {
  const p = useLocalSearchParams<{
    id?: string; name?: string; where_text?: string; category?: string; lat?: string; lng?: string; plan_date?: string;
    /** 추천 카드의 「+ 위시에 담기」에서 왔으면 — 저장이 끝난 순간에만 wish_saved 로그(폼을 연 것은 wish_start). */
    rec_session?: string; rec_key?: string; rec_pos?: string;
    /** 링크로 담기(wish/link)에서 고른 가게면 — 출처 띠로 받습니다. */
    source_url?: string; source_kind?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: wishes = [] } = useWishes();
  const { id: bookId } = useActiveBook();
  const { spotPick, linkPick } = useAppState();

  const wish = p.id ? wishes.find((w) => w.id === p.id) ?? null : null;
  const isNew = !p.id;

  const [name, setName] = useState(wish?.name ?? p.name ?? "");
  const [whereText, setWhereText] = useState(wish?.where_text ?? p.where_text ?? "");
  const [category, setCategory] = useState(wish?.category ?? p.category ?? "");
  const [note, setNote] = useState(wish?.note ?? "");
  const [planDate, setPlanDate] = useState(wish?.plan_date ?? p.plan_date ?? "");
  const [pickDate, setPickDate] = useState(false);
  const [notify, setNotify] = useState(wish?.notify ?? false);
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(
    wish?.lat != null && wish?.lng != null ? { lat: wish.lat, lng: wish.lng } : p.lat && p.lng ? { lat: Number(p.lat), lng: Number(p.lng) } : null
  );
  const [source, setSource] = useState<{ url: string; kind: SourceKind } | null>(
    isNew && p.source_url ? { url: p.source_url, kind: isSourceKind(p.source_kind) ? p.source_kind : "link" } : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 수정 모드는 위시 목록이 늦게 와도 채워지게 한 번만 맞춥니다.
  const filled = useRef(!!wish || isNew);
  useEffect(() => {
    if (filled.current || !wish) return;
    filled.current = true;
    setName(wish.name); setWhereText(wish.where_text ?? ""); setCategory(wish.category ?? ""); setNote(wish.note ?? "");
    setPlanDate(wish.plan_date ?? ""); setNotify(wish.notify);
    if (wish.lat != null && wish.lng != null) setSpot({ lat: wish.lat, lng: wish.lng });
  }, [wish]);

  // 새 위시는 「가게」 칸에 적는 대로 음식점·카페를 찾아 고르면 자리·종류까지 채웁니다.
  const [hits, setHits] = useState<FoodPlace[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const skipSearch = useRef(false);
  useEffect(() => {
    if (skipSearch.current) { skipSearch.current = false; return; }
    if (!isNew || !suggestOpen || name.trim().length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => { try { setHits((await searchFoodPlaces(name, ctrl.signal)).slice(0, 6)); } catch { /* 취소·오프라인 */ } }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [name, suggestOpen, isNew]);

  function pickPlace(r: FoodPlace) {
    skipSearch.current = true;
    setName(r.name);
    setWhereText(r.address);
    setSpot({ lat: r.lat, lng: r.lng });
    setHits([]);
    setSuggestOpen(false);
    if (r.category && ALL_CATEGORIES.includes(r.category)) setCategory(r.category);
  }

  // 「자리」 칸에서 바로 가게를 찾아 위치를 잡습니다.
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const skip = useRef(false);
  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (!open || whereText.trim().length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => { try { setResults(await forwardGeocode(whereText, ctrl.signal)); } catch { /* 취소·오프라인 */ } }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [whereText, open]);

  // 지도에서 고르기(wish/spot)가 돌려준 자리.
  useEffect(() => {
    if (!spotPick) return;
    setSpot({ lat: spotPick.lat, lng: spotPick.lng });
    if (!whereText.trim()) setWhereText(spotPick.found ? spotPick.found.name || spotPick.found.address : "지도에서 고른 자리");
    if (spotPick.found?.name && !name.trim()) setName(spotPick.found.name);
    setState({ spotPick: null });
  }, [spotPick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 「링크 붙여넣기」 — 누를 때만 클립보드를 읽습니다(앱이 켜질 때 자동으로 읽지 않음: iOS 붙여넣기 알림).
  const shake = useRef(new Animated.Value(0)).current;
  async function pasteLink() {
    const link = parseSourceLink(await Clipboard.getStringAsync().catch(() => ""));
    if (link) return router.push({ pathname: "/wish/link", params: { url: link.url, kind: link.kind, from: "form" } });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Animated.sequence(
      [6, -6, 4, -4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))
    ).start();
  }

  // 폼에서 연 「어느 가게인가요」(wish/link)가 돌려준 가게와 출처.
  useEffect(() => {
    if (!linkPick) return;
    skipSearch.current = true;
    setName(linkPick.name);
    setWhereText(linkPick.address);
    setSpot({ lat: linkPick.lat, lng: linkPick.lng });
    if (linkPick.category && ALL_CATEGORIES.includes(linkPick.category)) setCategory(linkPick.category);
    setSource({ url: linkPick.url, kind: linkPick.kind });
    setState({ linkPick: null });
  }, [linkPick]);

  const missing = !name.trim() ? "가게 이름을 적어주세요" : "";

  async function save() {
    if (missing || saving) return;
    setSaving(true);
    setError("");
    const cleanName = name.trim();

    // 같은 이름의 위시가 이미 있으면 중복으로 만들지 않고 그 위시로 돌려보냅니다.
    if (isNew) {
      const dup = matchWish(wishes, cleanName);
      if (dup) {
        // 그 위시에 출처가 비어 있으면 이번 링크로 채웁니다.
        if (source && !dup.source_url) {
          await supabase.from("wishes").update({ source_url: source.url, source_kind: source.kind }).eq("id", dup.id);
          await refreshAll(qc);
        }
        setSaving(false);
        return router.replace({ pathname: "/wish/[id]", params: { id: dup.id } });
      }
    }

    const payload = {
      name: cleanName, where_text: whereText.trim() || null, category: category || null, note: note.trim() || null,
      plan_date: planDate || null, notify, lat: spot?.lat ?? null, lng: spot?.lng ?? null,
      ...(isNew ? { source_url: source?.url ?? null, source_kind: source?.kind ?? null } : {}),
    };
    let err;
    if (isNew) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return setError("로그인이 필요합니다"); }
      const { data: saved, error: insertErr } = await supabase
        .from("wishes").insert({ ...payload, user_id: user.id, ...(bookId ? { book_id: bookId } : {}) }).select("id").single();
      err = insertErr;
      if (!insertErr && p.rec_session) {
        void logRec({ id: p.rec_session }, "wish_saved", { key: p.rec_key, position: p.rec_pos ? Number(p.rec_pos) : undefined, wishId: saved?.id as string | undefined });
      }
    } else {
      ({ error: err } = await supabase.from("wishes").update(payload).eq("id", wish!.id));
    }
    setSaving(false);
    if (err) return setError(err.message);
    await refreshAll(qc);
    router.back();
    // 첫 위시를 저장하는 순간 알림·위치 권한을 여쭙니다(핸드오프 §7).
    if (isNew) askWishPermissions();
  }

  async function remove() {
    if (!wish) return;
    const { error: err } = await supabase.from("wishes").delete().eq("id", wish.id);
    if (err) return setError(err.message);
    await refreshAll(qc);
    router.back();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: insets.bottom + 30 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.ink }}>{isNew ? "가고 싶은 곳" : "가고 싶은 곳 고치기"}</Text>
          <Pressable onPress={() => router.back()} style={{ padding: 8 }}><Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>취소</Text></Pressable>
        </View>

        <View style={{ marginTop: 11, gap: 11 }}>
          {isNew && !source && (
            <Animated.View style={{ transform: [{ translateX: shake }] }}>
              <Pressable
                onPress={pasteLink}
                accessibilityLabel="링크 붙여넣기"
                style={{ height: 56, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#c9a593", backgroundColor: C.card, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <LinkIcon size={20} stroke={C.brick} strokeWidth={1.8} />
                <Text style={{ flex: 1, fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>링크 붙여넣기</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>릴스 · 쇼츠</Text>
              </Pressable>
            </Animated.View>
          )}
          {isNew && source && (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9efe8", paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: sourceGlyph(source.kind) === "▶" ? 10 : 11, color: "#fff" }}>{sourceGlyph(source.kind)}</Text>
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 12, color: "#8f4323" }}>
                {SOURCE_LABEL[source.kind]}에서 담음 · {shortUrl(source.url)}
              </Text>
              <Pressable onPress={() => setSource(null)} accessibilityLabel="출처 지우기" hitSlop={10}>
                <Text style={{ fontSize: 11, color: "#a29a8c" }}>✕</Text>
              </Pressable>
            </View>
          )}
          <View>
            <Eyebrow>가게</Eyebrow>
            <TextInput
              value={name}
              onChangeText={(t) => { setName(t); setSuggestOpen(true); }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              placeholder="가게 이름" placeholderTextColor="#b3ada1" style={[fieldStyle, { borderRadius: 14, minHeight: 46 }]}
            />
            {suggestOpen && hits.length > 0 && (
              <View style={[{ marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, overflow: "hidden" }, SHADOW.card]}>
                {hits.map((r, i) => (
                  <Pressable key={`${r.lat}-${r.lng}-${i}`} onPress={() => pickPlace(r)}
                    style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 2, borderBottomWidth: i === hits.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
                    <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>{r.name}</Text>
                    <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>
                      {[r.category ?? (r.kind === "cafe" ? "카페" : "맛집"), r.address].filter(Boolean).join(" · ")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={{ zIndex: 5 }}>
            <Eyebrow>자리</Eyebrow>
            <View style={{ marginTop: 7, flexDirection: "row", alignItems: "center", gap: 7 }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={whereText}
                  onChangeText={(t) => { setWhereText(t); setOpen(true); if (spot) setSpot(null); }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 150)}
                  placeholder="가게 이름으로 찾기, 또는 동네나 주소"
                  placeholderTextColor="#b3ada1"
                  style={[fieldStyle, { marginTop: 0, borderRadius: 14, minHeight: 46 }]}
                />
                {open && results.length > 0 && (
                  <View style={[{ position: "absolute", left: 0, right: 0, top: 50, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, overflow: "hidden", zIndex: 10 }, SHADOW.card]}>
                    {results.map((r, i) => (
                      <Pressable key={`${r.lat}-${r.lng}-${i}`} onPress={() => { skip.current = true; setWhereText(r.name || r.address); setSpot({ lat: r.lat, lng: r.lng }); setOpen(false); setResults([]); if (!name.trim()) setName(r.name); }}
                        style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 2, borderBottomWidth: i === results.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
                        <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{r.name || r.address}</Text>
                        <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>{r.address}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
              <Pressable
                onPress={() => router.push({ pathname: "/wish/spot", params: spot ? { lat: String(spot.lat), lng: String(spot.lng) } : {} })}
                style={{ minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: spot ? C.brick : "#ded8cb", paddingHorizontal: 12, justifyContent: "center" }}
              >
                <Text style={{ fontFamily: F.sans, fontSize: 12, color: spot ? C.brick : C.muted }}>{spot ? "자리 정해짐 · 다시 고르기" : "지도에서 고르기"}</Text>
              </Pressable>
            </View>
            {spot && <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 11, color: C.brick }}>검색으로 찾은 자리가 정확히 잡혔습니다.</Text>}
          </View>

          <View>
            <Eyebrow>종류</Eyebrow>
            <View style={{ marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {ALL_CATEGORIES.map((c) => <Chip key={c} label={c} active={category === c} onPress={() => setCategory((v) => (v === c ? "" : c))} />)}
            </View>
          </View>

          <View>
            <Eyebrow>어떤 장소인가요?</Eyebrow>
            <TextInput
              value={note} onChangeText={setNote} multiline numberOfLines={6} textAlignVertical="top"
              placeholder="마음껏 적어두세요." placeholderTextColor="#b3ada1"
              style={[fieldStyle, { borderRadius: 14, minHeight: 150, paddingTop: 12, fontFamily: F.serif, fontSize: 14, lineHeight: 25 }]}
            />
          </View>

          <View>
            <Eyebrow>언제 갈지 (비워도 됩니다)</Eyebrow>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable onPress={() => setPickDate(true)} style={[fieldStyle, { flex: 1, justifyContent: "center", borderRadius: 14, minHeight: 46 }]}>
                <Text style={{ fontFamily: F.mono, fontSize: 13, color: planDate ? C.ink : "#b3ada1" }}>{planDate || "날짜 고르기"}</Text>
              </Pressable>
              {!!planDate && <Pressable onPress={() => setPlanDate("")} style={{ marginTop: 8, padding: 10 }}><Text style={{ color: C.faint }}>✕</Text></Pressable>}
            </View>
            {pickDate && (
              <DateTimePicker
                value={planDate ? new Date(planDate + "T00:00:00") : new Date()}
                minimumDate={new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                onChange={(e, d) => {
                  if (Platform.OS !== "ios") setPickDate(false);
                  if (e.type !== "dismissed" && d) setPlanDate(isoOf(d));
                }}
              />
            )}
            {pickDate && Platform.OS === "ios" && (
              <Pressable onPress={() => setPickDate(false)} style={{ alignSelf: "flex-end", padding: 8 }}><Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.brick }}>완료</Text></Pressable>
            )}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, borderWidth: 1, borderColor: "#e2c9bb", backgroundColor: "#f9f0e9", paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ flex: 1, fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>근처를 지나면 알려주기</Text>
            <Switch value={notify} onValueChange={setNotify} trackColor={{ true: C.brick, false: "#d8d3c8" }} thumbColor={C.card} />
          </View>
        </View>

        {!!error && <Text style={{ marginTop: 14, fontFamily: F.sans, fontSize: 12.5, color: "#a8412a" }}>{error}</Text>}

        {missing ? (
          <View style={{ marginTop: 18, borderRadius: 20, backgroundColor: "#e4dfd3", padding: 16, alignItems: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 14.5, color: C.faint }}>{missing}</Text>
          </View>
        ) : (
          <Button label={saving ? "담는 중…" : isNew ? "담기" : "고치기"} onPress={save} disabled={saving} style={{ marginTop: 18, minHeight: 54, borderRadius: 20 }} />
        )}

        {!isNew && (confirmingDelete ? (
          <View style={{ marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: "#e2c9bb", backgroundColor: "#f9f0e9", padding: 16, alignItems: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>정말 삭제하시겠습니까?</Text>
            <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
              <Button kind="line" label="취소" onPress={() => setConfirmingDelete(false)} style={{ flex: 1, minHeight: 44, borderRadius: 16 }} />
              <Pressable onPress={remove} style={{ flex: 1, minHeight: 44, borderRadius: 16, backgroundColor: "#9a4a52", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.card }}>삭제</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setConfirmingDelete(true)} style={{ marginTop: 12, borderRadius: 20, borderWidth: 1, borderColor: "#e4dfd3", padding: 14, alignItems: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>계획 삭제</Text>
          </Pressable>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
