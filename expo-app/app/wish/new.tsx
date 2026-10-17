import DateTimePicker from "@react-native-community/datetimepicker";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { logRec } from "@/features/recommend/log";
import { useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinkIcon, PhotoIcon } from "@/components/icons";
import { Button, Chip, Eyebrow, fieldStyle } from "@/components/ui";
import { refreshAll } from "@/data/invalidate";
import { useActiveBook } from "@/data/books";
import { useWishes } from "@/data/queries";
import { setState, useAppState } from "@/data/store";
import { askWishPermissions } from "@/features/notify/geofence";
import { forwardGeocode, searchFoodPlaces, type FoodPlace } from "@/lib/geocode";
import { pickAlbumUris, removePhotoObjects, uploadAlbumPhoto } from "@/lib/photos";
import { SignedImage } from "@/lib/signedPhoto";
import { isSourceKind, isVideoKind, parseSourceLink, shortUrl, SOURCE_LABEL, sourceGlyph, type SourceKind } from "@/lib/sourceLink";
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
    /** 공유 시트로 받은 글(_layout) — 폼이 열리자마자 링크 붙여넣기처럼 처리합니다. */
    share?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: wishes = [] } = useWishes();
  const { id: bookId, isCouple, me } = useActiveBook();
  const { linkPick } = useAppState();

  const wish = p.id ? wishes.find((w) => w.id === p.id) ?? null : null;
  const isNew = !p.id;
  // 캡처는 담은 사람에게만 — 연인 기록장에서 상대의 위시를 고칠 때는 사진 칸을 그리지 않습니다.
  const isOwner = isNew || !isCouple || (!!me && wish?.user_id === me.userId);

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
  // 캡처 한 장 — 담은 사람만 봅니다. 고른 직후엔 로컬 주소(local), 저장된 것은 버킷 경로(path).
  const [capture, setCapture] = useState<{ path?: string; local?: string } | null>(wish?.capture_path ? { path: wish.capture_path } : null);
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
    if (wish.capture_path) setCapture({ path: wish.capture_path });
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

  async function pickCapture() {
    const [uri] = await pickAlbumUris(1);
    if (uri) setCapture({ local: uri });
  }

  // 「링크」 — 그 자리에 입력창을 열어 복사해 온 링크를 붙여넣습니다. 올바른 링크가 들어오는 순간 「어느 가게인가요」로 넘어갑니다.
  // 클립보드는 「붙여넣기」를 누를 때만 읽습니다(앱이 켜질 때 자동으로 읽지 않음: iOS 붙여넣기 알림).
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  function takeLink(text: string) {
    setLinkText(text);
    if (!text.trim()) return setLinkError(false);
    const link = parseSourceLink(text);
    if (!link || !isVideoKind(link.kind)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return setLinkError(true);
    }
    setLinkError(false);
    setLinkOpen(false);
    setLinkText("");
    router.push({ pathname: "/wish/link", params: { url: link.url, kind: link.kind, from: "form" } });
  }

  async function pasteLink() {
    const text = await Clipboard.getStringAsync().catch(() => "");
    if (!text.trim()) return setToast("복사한 링크가 없어요");
    takeLink(text);
  }

  // 공유 시트로 열렸으면 받은 글을 입력창에 넣은 것처럼 처리합니다 — 올바른 링크면 「어느 가게인가요」가 폼 위에 뜨고, 아니면 입력창에 오류와 함께 남습니다.
  const shared = useRef(false);
  useEffect(() => {
    if (shared.current || !isNew || !p.share) return;
    shared.current = true;
    setLinkOpen(true);
    takeLink(p.share);
  }, [p.share]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeLink() {
    setLinkOpen(false);
    setLinkText("");
    setLinkError(false);
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

    // 가게 검색으로 고르지 않고 위치를 손으로 적었으면 그 주소(없으면 가게 이름)로 자리를 찾아 둡니다 — 기록 쓰기와 같음.
    const cleanWhere = whereText.trim();
    const at = spot ?? (
      (cleanWhere ? (await forwardGeocode(cleanWhere).catch(() => []))[0] : null) ??
      (await forwardGeocode(cleanName).catch(() => []))[0] ?? null
    );
    let capturePath = capture?.path ?? null;
    if (capture?.local) {
      try { capturePath = await uploadAlbumPhoto(capture.local); }
      catch (e) { setSaving(false); return setError(e instanceof Error ? e.message : "캡처를 올리지 못했습니다"); }
    }
    const payload = {
      name: cleanName, where_text: cleanWhere || null, category: category || null, note: note.trim() || null,
      plan_date: planDate || null, notify, lat: at?.lat ?? null, lng: at?.lng ?? null, capture_path: capturePath,
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
    // 바꾸거나 지운 옛 캡처 파일은 버킷에서도 지웁니다.
    if (wish?.capture_path && wish.capture_path !== capturePath) void removePhotoObjects([wish.capture_path]);
    await refreshAll(qc);
    router.back();
    // 첫 위시를 저장하는 순간 알림·위치 권한을 여쭙니다(핸드오프 §7).
    if (isNew) askWishPermissions();
  }

  async function remove() {
    if (!wish) return;
    const { error: err } = await supabase.from("wishes").delete().eq("id", wish.id);
    if (err) return setError(err.message);
    if (wish.capture_path) void removePhotoObjects([wish.capture_path]);
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
          {isNew && !source && !linkOpen && (
            <Pressable onPress={() => setLinkOpen(true)} accessibilityLabel="링크" style={s.dashed}>
              <LinkIcon size={20} stroke={C.brick} strokeWidth={1.8} />
              <Text style={{ flex: 1, fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>링크</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>릴스 · 쇼츠</Text>
            </Pressable>
          )}
          {isNew && !source && linkOpen && (
            <View>
              <View style={s.linkBox}>
                <TextInput
                  autoFocus
                  value={linkText}
                  onChangeText={takeLink}
                  placeholder="복사한 링크를 붙여넣으세요" placeholderTextColor="#b3ada1"
                  autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="done"
                  style={{ flex: 1, height: "100%", fontFamily: F.sans, fontSize: 13.5, color: C.ink }}
                />
                <Pressable onPress={pasteLink} accessibilityLabel="붙여넣기" hitSlop={2} style={s.pasteBtn}>
                  <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.card }}>붙여넣기</Text>
                </Pressable>
                <Pressable onPress={closeLink} accessibilityLabel="링크 닫기" style={{ width: 44, height: 44, marginRight: -8, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 13, color: "#a29a8c" }}>✕</Text>
                </Pressable>
              </View>
              {linkError && (
                <Text style={{ marginTop: 6, marginLeft: 4, fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>유튜브나 인스타그램 링크를 넣어주세요</Text>
              )}
            </View>
          )}
          {isNew && source && (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9efe8", paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: sourceGlyph(source.kind) === "▶" ? 10 : 11, color: "#fff" }}>{sourceGlyph(source.kind)}</Text>
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 12, color: "#8f4323" }}>
                {SOURCE_LABEL[source.kind]}에서 담음 · {shortUrl(source.url)}
              </Text>
              <Pressable onPress={() => setSource(null)} accessibilityLabel="출처 지우기" hitSlop={14}>
                <Text style={{ fontSize: 11, color: "#a29a8c" }}>✕</Text>
              </Pressable>
            </View>
          )}
          {isOwner && (capture ? (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9efe8", paddingVertical: 8, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
              {capture.local
                ? <Image source={{ uri: capture.local }} style={s.thumb} />
                : <View style={[s.thumb, { backgroundColor: "#eadfd3" }]}><SignedImage uri={capture.path} style={s.thumb} /></View>}
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 12, color: "#8f4323" }}>캡처 1장 · 나만 보여요</Text>
              <Pressable onPress={() => setCapture(null)} accessibilityLabel="캡처 지우기" hitSlop={10}>
                <Text style={{ fontSize: 11, color: "#a29a8c" }}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={pickCapture} accessibilityLabel="사진" style={s.dashed}>
              <PhotoIcon size={20} stroke={C.brick} strokeWidth={1.8} />
              <Text style={{ flex: 1, fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>사진</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>앨범</Text>
            </Pressable>
          ))}
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

          <View>
            <Eyebrow>위치</Eyebrow>
            <TextInput
              value={whereText}
              onChangeText={(t) => { setWhereText(t); if (spot) setSpot(null); }}
              placeholder="주소나 동네" placeholderTextColor="#b3ada1"
              style={[fieldStyle, { borderRadius: 14, minHeight: 46 }]}
            />
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
              placeholder="어디서 봤는지, 왜 가보고 싶은지 적어 두면 좋아요" placeholderTextColor="#b3ada1"
              style={[fieldStyle, { borderRadius: 14, minHeight: 150, paddingTop: 12, fontFamily: F.serif, fontSize: 14, lineHeight: 25 }]}
            />
          </View>

          <View>
            <Eyebrow>언제 갈 건가요?</Eyebrow>
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
      {toast && (
        <View pointerEvents="none" style={[s.toast, { bottom: insets.bottom + 40 }]}>
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.card }}>{toast}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  dashed: { height: 56, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#c9a593", backgroundColor: C.card, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  thumb: { width: 44, height: 58, borderRadius: 8, overflow: "hidden" },
  linkBox: { height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: C.brick, backgroundColor: C.card, paddingLeft: 16, paddingRight: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  pasteBtn: { height: 40, minWidth: 44, borderRadius: 12, backgroundColor: C.ink, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", alignSelf: "center", borderRadius: 16, backgroundColor: "rgba(23,22,20,.85)", paddingVertical: 10, paddingHorizontal: 16 },
});
