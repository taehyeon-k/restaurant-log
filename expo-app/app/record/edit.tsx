import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VerifiedMark } from "@/components/icons";
import { Chip, Eyebrow, fieldStyle } from "@/components/ui";
import { useActiveBook, useSaveNote } from "@/data/books";
import { refreshAll } from "@/data/invalidate";
import { useRows, useWishes } from "@/data/queries";
import { samePlace } from "@/lib/geo";
import { forwardGeocode, searchFoodPlaces, type FoodPlace } from "@/lib/geocode";
import { MAX_PHOTOS, pickAlbumUris, removePhotoObjects, uploadAlbumPhoto } from "@/lib/photos";
import { FELT_PRICE } from "@/lib/price";
import { photosOf, verifiedShotOf } from "@/lib/record";
import { regionFromAddress } from "@/lib/regions";
import { SignedImage } from "@/lib/signedPhoto";
import { supabase } from "@/lib/supabase";
import {
  CATEGORIES, findMatchingWish, KEYWORDS, verifiedDateTime, wishMetInfo, WISH_AUTO_M, type Kind, type MenuItem,
} from "@/lib/types";
import { C, F, SHADOW } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
/** 폼에 올라온 사진 한 장 — 이미 올린 것(ref, 버킷 경로)이거나 앨범에서 막 고른 것(uri). */
type Pic = { ref: string; local: boolean };

/** 촬영 화면이 넘긴 앨범 uri 들(JSON). 깨진 값은 빈 목록. */
function parsePhotos(raw?: string): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

const menuDigits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 9);

/**
 * 기록 작성 폼 — 새 기록·기록 고치기가 같은 화면입니다.
 * params.id 가 있으면 고치기, 없으면 새 기록(kind·name·address·lat·lng·category·revisit·visitedAt 로 미리 채움).
 */
export default function EditRoute() {
  const p = useLocalSearchParams<{
    id?: string; kind?: Kind; name?: string; address?: string; lat?: string; lng?: string;
    category?: string; revisit?: string; visitedAt?: string; photos?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: rows = [] } = useRows();
  const { data: wishes = [] } = useWishes();
  const { id: bookId, isCouple } = useActiveBook();
  const saveNote = useSaveNote();

  const record = p.id ? rows.find((r) => r.id === Number(p.id)) ?? null : null;
  const isNew = !p.id;
  // 인증된 기록은 촬영 시각이 방문일이라 고칠 수 없습니다(시각이 없는 옛 기록은 날짜칸을 씁니다).
  const isVerified = !!record && record.verified && !!record.verified_at;

  const [newKind, setNewKind] = useState<Kind>(p.kind === "cafe" ? "cafe" : "restaurant");
  const kind: Kind = record?.kind ?? newKind;
  const categories = CATEGORIES[kind];

  const [name, setName] = useState(record?.name ?? p.name ?? "");
  const [address, setAddress] = useState(record?.address ?? p.address ?? "");
  const [visitedAt, setVisitedAt] = useState(record?.visited_at ?? p.visitedAt ?? today());
  const [pickDate, setPickDate] = useState(false);
  const [category, setCategory] = useState(record?.category ?? p.category ?? "");
  const [rating, setRating] = useState(record?.rating ?? 0);
  const [priceLevel, setPriceLevel] = useState(record?.price_level ?? 0);
  const [revisit, setRevisit] = useState(record?.revisit ?? p.revisit === "1");
  const [menus, setMenus] = useState<MenuItem[]>(() => {
    if (record?.menus?.length) return record.menus;
    const names = (record?.menu ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return names.length ? names.map((n) => ({ name: n, price: null })) : [{ name: "", price: null }];
  });
  const [review, setReview] = useState(record?.review ?? "");
  const [keywords, setKeywords] = useState<string[]>(record?.keywords ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 사진 — 고치기면 지금 사진들, 새 기록이면 촬영 화면에서 고른 앨범 사진들. 대표는 순서가 아니라 cover 로 가리킵니다.
  const [pics, setPics] = useState<Pic[]>(() =>
    [
      ...(record ? photosOf(record).map((ref) => ({ ref, local: false })) : []),
      ...parsePhotos(p.photos).map((ref) => ({ ref, local: true })),
    ].slice(0, MAX_PHOTOS)
  );
  const [cover, setCover] = useState(() => (record ? Math.min(record.cover_index ?? 0, Math.max(0, photosOf(record).length - 1)) : 0));
  // 인증 사진은 방문의 근거라 지울 수 없습니다.
  const lockedRef = record ? verifiedShotOf(record) : null;

  async function addPhotos() {
    const uris = await pickAlbumUris(MAX_PHOTOS - pics.length);
    if (uris.length) setPics((l) => [...l, ...uris.map((ref) => ({ ref, local: true }))].slice(0, MAX_PHOTOS));
  }

  function removePic(i: number) {
    setPics((l) => l.filter((_, n) => n !== i));
    setCover((c) => (i < c ? c - 1 : i === c ? 0 : c));
  }

  function photoMenu(i: number) {
    const pic = pics[i];
    if (pic.ref === lockedRef) {
      Alert.alert("인증 사진", i === cover ? "지금 대표 사진이에요. 인증 사진은 방문의 근거라 지울 수 없어요." : "인증 사진은 방문의 근거라 지울 수 없어요.", [
        ...(i === cover ? [] : [{ text: "대표 사진으로", onPress: () => setCover(i) }]),
        { text: "확인", style: "cancel" as const },
      ]);
      return;
    }
    Alert.alert(`사진 ${i + 1}`, undefined, [
      ...(i === cover ? [] : [{ text: "대표 사진으로", onPress: () => setCover(i) }]),
      { text: "사진 지우기", style: "destructive" as const, onPress: () => removePic(i) },
      { text: "취소", style: "cancel" as const },
    ]);
  }

  const setMenuAt = (i: number, patch: Partial<MenuItem>) => setMenus((l) => l.map((m, n) => (n === i ? { ...m, ...patch } : m)));
  const menuTotal = menus.reduce((sum, m) => sum + (m.price ?? 0), 0);
  const namedMenus = menus.filter((m) => m.name.trim() || m.price);
  const menuTotalLabel = namedMenus.length ? `${namedMenus.length}개 · ${menuTotal.toLocaleString("ko-KR")}원` : "";

  const missing = !name.trim() ? "가게 이름을 적어주세요" : !rating ? "별점을 매겨주세요" : "";
  const canSave = !missing;
  const title = isNew ? (visitedAt && visitedAt !== today() ? "이날 뭐 먹었나요" : "오늘 뭐 먹었나요") : "기록 고치기";
  const preLat = p.lat ? Number(p.lat) : null;
  const preLng = p.lng ? Number(p.lng) : null;
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(
    preLat != null && preLng != null ? { lat: preLat, lng: preLng } : null
  );

  const twin = useMemo(() => {
    if (!isNew || !name.trim()) return null;
    // 이름만 보면 같은 이름의 다른 지점이 재방문으로 잡히니 자리(주소·좌표)도 함께 봅니다.
    const here = { name: name.trim(), address: address.trim() || null, lat: spot?.lat, lng: spot?.lng };
    return rows.find((r) => r.kind === kind && samePlace(r, here)) ?? null;
  }, [isNew, name, address, spot, kind, rows]);

  // 새 기록은 「가게」 칸에 적는 대로 음식점·카페를 찾아 고르면 자리까지 채웁니다.
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
    setAddress(r.address);
    setSpot({ lat: r.lat, lng: r.lng });
    setHits([]);
    setSuggestOpen(false);
    // 다시 가기(revisit)로 들어온 새 기록은 맛집·카페가 정해져 있어 바꾸지 않습니다.
    const nextKind = p.revisit !== "1" ? r.kind : kind;
    if (nextKind !== kind) { setNewKind(nextKind); setCategory(""); }
  }

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    const uploaded: string[] = [];
    try {
      const cleanName = name.trim();
      const cleanAddress = address.trim();
      const shared = {
        name: cleanName,
        category: category || null,
        address: cleanAddress || null,
        rating: rating || null,
        menu: menus.map((m) => m.name.trim()).filter(Boolean).join(", ") || null,
        menus: menus.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), price: m.price })),
        price_level: priceLevel || null,
        price_range: menuTotal || null,
        review: review.trim() || null,
        revisit,
        ...(isVerified ? {} : { visited_at: visitedAt || null }),
        keywords,
        updated_at: new Date().toISOString(),
        // TODO(커뮤니티 §5): 공개 범위(restaurants.visibility: private · friends · public) 선택 UI 는 아직 설계 중입니다.
        // 정해지면 여기서 함께 저장하세요. 그 전까지는 기본값 private 이고, 시험할 때는 DB 에서 직접 바꿉니다.
      };

      // 앨범에서 고른 사진을 먼저 올립니다. 인증 여부(verified · verified_at)는 건드리지 않습니다.
      const refs: string[] = [];
      for (const pic of pics) {
        if (!pic.local) { refs.push(pic.ref); continue; }
        const path = await uploadAlbumPhoto(pic.ref);
        uploaded.push(path);
        refs.push(path);
      }
      const coverAt = Math.min(cover, Math.max(0, refs.length - 1));
      const photoFields = { photo_urls: refs, cover_index: coverAt, photo_url: refs[coverAt] ?? null };

      if (record) {
        const region = regionFromAddress(cleanAddress) || record.region;
        const { error } = await supabase.from("restaurants").update({ ...shared, ...photoFields, region, pending: false }).eq("id", record.id);
        if (error) throw new Error(error.message);
        await removePhotoObjects(photosOf(record).filter((u) => !refs.includes(u)));
        // 연인 기록이면 별점·메모가 곧 찍은 사람의 한 줄입니다(HANDOFF-couple §3-6).
        if (isCouple) await saveNote(record.user_id, record.id, shared.rating, shared.review, false);
        await refreshAll(qc);
        router.back();
        return;
      }

      let lat = spot?.lat ?? twin?.lat ?? preLat;
      let lng = spot?.lng ?? twin?.lng ?? preLng;
      if (lat == null || lng == null) {
        const hit =
          (cleanAddress ? (await forwardGeocode(cleanAddress).catch(() => []))[0] : null) ??
          (await forwardGeocode(cleanName).catch(() => []))[0] ?? null;
        if (hit) { lat = hit.lat; lng = hit.lng; }
      }
      const finalAddress = cleanAddress || twin?.address || null;
      const finalRegion = twin?.region || regionFromAddress(finalAddress ?? "") || null;

      const matchedWish = findMatchingWish(wishes, { name: cleanName, lat, lng }, WISH_AUTO_M);
      const fromWish = matchedWish ? wishMetInfo(matchedWish, visitedAt || today()) : null;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다");

      const { data: inserted, error } = await supabase.from("restaurants").insert({
        user_id: user.id, ...(bookId ? { book_id: bookId } : {}), kind, region: finalRegion,
        place_key: `${cleanName}|${finalAddress ?? ""}`.toLowerCase(),
        lat, lng, verified: false, acc: null,
        ...shared, ...photoFields, address: finalAddress,
        revisit: revisit || Boolean(twin),
        from_wish: fromWish,
      }).select("id").single();
      if (error) throw new Error(error.message);
      if (isCouple && (shared.rating != null || shared.review)) await saveNote(user.id, inserted.id as number, shared.rating, shared.review, false);
      if (matchedWish) await supabase.from("wishes").delete().eq("id", matchedWish.id);

      await refreshAll(qc);
      router.dismissAll();
    } catch (err) {
      await removePhotoObjects(uploaded); // 기록이 저장되지 않았으니 올린 사진도 거둡니다
      setError(err instanceof Error ? err.message : "저장에 실패했습니다");
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} style={s.barBtn}><Text style={[s.barText, { color: C.faint }]}>취소</Text></Pressable>
        <Text style={s.barTitle}>{isNew ? "NEW RECORD" : "EDIT RECORD"}</Text>
        <Pressable onPress={save} disabled={!canSave || saving} style={s.barBtn}>
          <Text style={[s.barText, { color: canSave ? C.brick : "#c4bcae", fontFamily: F.sansMd }]}>저장</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: insets.bottom + 40 }}>
        <Text style={{ fontFamily: F.serif, fontSize: 25, color: C.ink }}>{title}</Text>

        {isNew && p.revisit !== "1" && (
          <View style={{ marginTop: 18, gap: 9 }}>
            <Eyebrow>맛집 · 카페</Eyebrow>
            <View style={{ flexDirection: "row", gap: 7 }}>
              {(["restaurant", "cafe"] as Kind[]).map((k) => (
                <Chip key={k} label={k === "restaurant" ? "맛집" : "카페"} active={kind === k} onPress={() => { if (k !== kind) { setNewKind(k); setCategory(""); } }} />
              ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 18, gap: 9 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Eyebrow>사진</Eyebrow>
            {pics.length > 0 && <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint }}>{pics.length}장 · 앨범</Text>}
          </View>
          {pics.length === 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Pressable onPress={addPhotos} accessibilityLabel="앨범에서 사진 고르기" style={s.addTile}>
                <Text style={s.addTileText}>+ 앨범</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>앨범에서 고르기</Text>
                <Text style={{ marginTop: 3, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>
                  최대 10장. 지금 없으면 나중에 기록 상세에서 더할 수 있어요.
                </Text>
              </View>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {pics.map((pic, i) => (
                <Pressable key={pic.ref} onPress={() => photoMenu(i)} accessibilityLabel={`사진 ${i + 1}`}
                  style={[s.thumb, i === cover && { borderWidth: 1.5, borderColor: C.brick }]}>
                  {pic.local
                    ? <Image source={{ uri: pic.ref }} style={{ width: "100%", height: "100%" }} />
                    : <SignedImage uri={pic.ref} style={{ width: "100%", height: "100%" }} />}
                  {i === cover && <Text style={s.coverTag}>대표</Text>}
                  {pic.ref === lockedRef && <View style={{ position: "absolute", right: 4, bottom: 4 }}><VerifiedMark size={18} /></View>}
                </Pressable>
              ))}
              {pics.length < MAX_PHOTOS && (
                <Pressable onPress={addPhotos} accessibilityLabel="앨범에서 사진 더하기" style={s.addTile}>
                  <Text style={s.addTileText}>+ 앨범</Text>
                </Pressable>
              )}
            </ScrollView>
          )}
        </View>

        <View style={{ marginTop: 18 }}>
          <Eyebrow>가게</Eyebrow>
          <TextInput
            value={name}
            onChangeText={(t) => { setName(t); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            placeholder="가게 이름" placeholderTextColor="#b3ada1" style={fieldStyle}
          />
          {suggestOpen && hits.length > 0 && (
            <View style={[s.suggest, SHADOW.card]}>
              {hits.map((r, i) => (
                <Pressable key={`${r.lat}-${r.lng}-${i}`} onPress={() => pickPlace(r)} style={[s.suggestRow, i === hits.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>{r.name}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>
                    {[r.category ?? (r.kind === "cafe" ? "카페" : "맛집"), r.address].filter(Boolean).join(" · ")}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <View style={{ marginTop: 14 }}>
          <Eyebrow>자리</Eyebrow>
          <TextInput
            value={address}
            onChangeText={(t) => { setAddress(t); if (spot) setSpot(null); }}
            placeholder="주소나 동네" placeholderTextColor="#b3ada1" style={fieldStyle}
          />
        </View>

        <View style={{ marginTop: 14 }}>
          <Eyebrow>방문</Eyebrow>
          {isVerified ? (
            <>
              <View style={[s.verifiedBox]}>
                <VerifiedMark size={20} />
                <Text style={{ fontFamily: F.mono, fontSize: 13.5, color: C.ink }}>{verifiedDateTime(record!.verified_at!)}</Text>
              </View>
              <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>사진을 찍은 시각이 그대로 찍혀 고칠 수 없습니다.</Text>
            </>
          ) : (
            <>
              <Pressable onPress={() => setPickDate(true)} style={[fieldStyle, { justifyContent: "center" }]}>
                <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ink }}>{visitedAt || "날짜 고르기"}</Text>
              </Pressable>
              {pickDate && (
                <DateTimePicker
                  value={visitedAt ? new Date(visitedAt + "T00:00:00") : new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={(e, d) => {
                    if (Platform.OS !== "ios") setPickDate(false);
                    if (e.type !== "dismissed" && d) setVisitedAt(isoOf(d));
                  }}
                />
              )}
              {pickDate && Platform.OS === "ios" && (
                <Pressable onPress={() => setPickDate(false)} style={{ alignSelf: "flex-end", padding: 8 }}>
                  <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.brick }}>완료</Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        <View style={{ marginTop: 18, gap: 9 }}>
          <Eyebrow>종류</Eyebrow>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {categories.map((c) => <Chip key={c} label={c} active={category === c} onPress={() => setCategory((v) => (v === c ? "" : c))} />)}
          </View>
        </View>

        <View style={{ marginTop: 20, gap: 9 }}>
          <Eyebrow>별점</Eyebrow>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flexDirection: "row" }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const pct = rating >= n ? 1 : rating >= n - 0.5 ? 0.5 : 0;
                const pick = (v: number) => () => setRating(v === rating ? 0 : v);
                return (
                  <View key={n} style={{ width: 34, height: 34 }}>
                    <Text style={s.starBase}>★</Text>
                    <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 34 * pct, overflow: "hidden" }}>
                      <Text style={[s.starBase, { color: C.brick, width: 34 }]}>★</Text>
                    </View>
                    <Pressable onPress={pick(n - 0.5)} accessibilityLabel="반 별" style={{ position: "absolute", left: 0, top: 0, width: 17, height: 34 }} />
                    <Pressable onPress={pick(n)} accessibilityLabel="한 별" style={{ position: "absolute", right: 0, top: 0, width: 17, height: 34 }} />
                  </View>
                );
              })}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>{rating ? rating.toFixed(1) : "고르지 않음"}</Text>
          </View>
        </View>

        <View style={{ marginTop: 20, gap: 9 }}>
          <Eyebrow>체감 가격</Eyebrow>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setPriceLevel((v) => (v === n ? 0 : n))} style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}>
                  <Image source={require("../../assets/piggy.png")} style={{ width: 22, height: 21, opacity: n <= priceLevel ? 1 : 0.3 }} resizeMode="contain" />
                </Pressable>
              ))}
            </View>
            <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>{priceLevel ? FELT_PRICE[priceLevel - 1] : "고르지 않음"}</Text>
          </View>
        </View>

        <View style={s.revisitBox}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>재방문 의사</Text>
            <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.muted }}>
              {revisit ? "다시 갈 곳으로 표시됩니다 — 지도 핀도 색이 찹니다." : "켜면 목록 필터와 지도 핀에 함께 반영됩니다."}
            </Text>
          </View>
          <Switch value={revisit} onValueChange={setRevisit} trackColor={{ true: C.brick, false: "#d8d3c8" }} thumbColor={C.card} />
        </View>

        <View style={{ marginTop: 18, gap: 7 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Eyebrow>메뉴</Eyebrow>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint }}>{menuTotalLabel}</Text>
          </View>
          {menus.map((m, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "stretch", gap: 6 }}>
              <TextInput value={m.name} onChangeText={(t) => setMenuAt(i, { name: t })} placeholder="먹은 것" placeholderTextColor="#b3ada1" style={[fieldStyle, s.menuField, { flex: 1 }]} />
              <View style={{ width: 96, justifyContent: "center" }}>
                <TextInput
                  value={m.price == null ? "" : m.price.toLocaleString("ko-KR")}
                  onChangeText={(t) => { const raw = menuDigits(t); setMenuAt(i, { price: raw ? Number(raw) : null }); }}
                  keyboardType="number-pad" placeholder="0" placeholderTextColor="#b3ada1"
                  style={[fieldStyle, s.menuField, { flex: 1, paddingVertical: 0, paddingLeft: 11, paddingRight: 26, textAlign: "right", fontFamily: F.mono, fontSize: 13 }]}
                />
                <Text pointerEvents="none" style={{ position: "absolute", right: 11, fontFamily: F.sans, fontSize: 12, color: "#a29a8c" }}>원</Text>
              </View>
              {menus.length > 1 && (
                <Pressable onPress={() => setMenus((l) => l.filter((_, n) => n !== i))} accessibilityLabel="이 메뉴 지우기" style={{ width: 34, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 15, color: "#a29a8c" }}>✕</Text>
                </Pressable>
              )}
            </View>
          ))}
          <Pressable onPress={() => setMenus((l) => [...l, { name: "", price: null }])} style={{ minHeight: 44, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#cdc6b8", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>+ 메뉴 추가</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 14 }}>
          <Eyebrow>메모</Eyebrow>
          <TextInput
            value={review} onChangeText={setReview} multiline numberOfLines={5} textAlignVertical="top"
            placeholder="그날 자리, 맛, 다시 올 이유" placeholderTextColor="#b3ada1"
            style={[fieldStyle, { minHeight: 130, paddingTop: 12, borderRadius: 14, fontFamily: F.serif, fontSize: 14.5, lineHeight: 26 }]}
          />
        </View>

        <View style={{ marginTop: 18, gap: 9 }}>
          <Eyebrow>키워드</Eyebrow>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {KEYWORDS.map((k) => (
              <Chip key={k} label={k} active={keywords.includes(k)} onPress={() => setKeywords((l) => (l.includes(k) ? l.filter((v) => v !== k) : [...l, k]))} />
            ))}
          </View>
        </View>

        {!!error && <Text style={{ marginTop: 14, fontFamily: F.sans, fontSize: 12.5, color: "#a8412a" }}>{error}</Text>}

        <Pressable
          onPress={save} disabled={!canSave || saving}
          style={{ marginTop: 22, borderRadius: 20, padding: 16, alignItems: "center", backgroundColor: canSave ? C.ink : "#e4dfd3", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <ActivityIndicator color={C.card} /> : (
            <Text style={{ fontFamily: F.sansMd, fontSize: 14.5, color: canSave ? C.card : C.faint }}>{canSave ? "기록 저장" : missing}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#e6e0d3" },
  barBtn: { minHeight: 44, paddingHorizontal: 8, justifyContent: "center" },
  barText: { fontFamily: F.sans, fontSize: 13 },
  barTitle: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.6, color: C.faint },
  verifiedBox: {
    marginTop: 7, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1,
    borderColor: "#e0c3b1", backgroundColor: "#f9efe8", paddingHorizontal: 15,
  },
  suggest: { marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, overflow: "hidden" },
  suggestRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 2, borderBottomWidth: 1, borderBottomColor: C.line },
  // 메뉴 이름·가격 칸은 글꼴이 달라 제 키가 어긋납니다 — 줄을 stretch 로 두어 가격 칸을 이름 칸 키에 맞춥니다.
  menuField: { marginTop: 0, minHeight: 46, borderRadius: 14, textAlignVertical: "center" },
  starBase: { fontSize: 27, lineHeight: 34, width: 34, textAlign: "center", color: "#dcd6ca" },
  revisitBox: {
    marginTop: 20, flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, borderWidth: 1,
    borderColor: "#e2c9bb", backgroundColor: "#f9f0e9", paddingHorizontal: 16, paddingVertical: 14,
  },
  addTile: {
    width: 76, height: 76, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#cdc6b8",
    alignItems: "center", justifyContent: "center",
  },
  addTileText: { fontFamily: F.sansMd, fontSize: 12, color: C.muted },
  thumb: { width: 76, height: 76, borderRadius: 16, overflow: "hidden", backgroundColor: "#eae5da" },
  coverTag: {
    position: "absolute", left: 5, top: 5, borderRadius: 7, backgroundColor: C.brick, paddingHorizontal: 5, paddingVertical: 2,
    fontFamily: F.mono, fontSize: 9, color: C.card, overflow: "hidden",
  },
});
