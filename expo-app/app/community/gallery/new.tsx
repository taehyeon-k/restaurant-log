import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePersonalRows } from "@/data/queries";
import { postGalleryPhoto, useIsAdmin, useMyGalleryRefs } from "@/features/community/api";
import { K, monthDay } from "@/features/community/ui";
import { photosOf } from "@/lib/record";
import { regionFromSearch } from "@/lib/regions";
import { SignedImage } from "@/lib/signedPhoto";
import type { Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

const MIN_VERIFIED = 5;
const DAILY = 10;
const MENU_MAX = 40;
const CAPTION_MAX = 120;
const PAGE = 60;
const GAP = 4;

type Pick = { r: Restaurant; ref: string };
/** 메뉴 고르기 — 기록의 메뉴 하나 · 직접 쓰기 · 메뉴 없이. */
type MenuChoice = { kind: "record"; name: string } | { kind: "custom" } | { kind: "none" };

const normMenu = (s: string) => s.replace(/\s+/g, "").toLowerCase();
/** 그 기록의 메뉴 이름 — menus[].name, 없으면 옛 menu 칸. */
const recordMenus = (r: Restaurant) => {
  const names = (r.menus ?? []).map((m) => m.name?.trim()).filter((n): n is string => !!n);
  const list = names.length ? names : r.menu?.trim() ? [r.menu.trim()] : [];
  return [...new Map(list.map((n) => [normMenu(n), n])).values()];
};

/**
 * 사진 올리기(HANDOFF-gallery 03) — 내 기록의 사진 한 장 + 메뉴 + 한 줄. 인증 기록이 아니어도 되고(인증이면 ✓),
 * 기록의 공개 범위는 그대로 — 그 사진 한 장만 갤러리에 나갑니다.
 */
export default function GalleryCompose() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: rows = [] } = usePersonalRows();
  const { data: mine } = useMyGalleryRefs();
  const { data: isAdmin } = useIsAdmin();

  const [pick, setPick] = useState<Pick | null>(null);
  const [menu, setMenu] = useState<MenuChoice>({ kind: "none" });
  const [custom, setCustom] = useState("");
  const [caption, setCaption] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 내 기록의 사진 — 최근 기록순, 한 기록의 사진은 모두.
  const tiles = useMemo(() => {
    const at = (r: Restaurant) => r.visited_at ?? r.verified_at ?? r.created_at ?? "";
    return rows
      .filter((r) => !r.pending && photosOf(r).length > 0)
      .sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : b.id - a.id))
      .flatMap((r) => photosOf(r).map((ref) => ({ r, ref })));
  }, [rows]);
  const posted = (t: Pick) => mine?.refs.has(`${t.r.id}|${t.ref}`) ?? false;

  const verifiedN = useMemo(() => rows.filter((r) => r.verified && !r.pending && r.source_record_id == null && r.copied_at == null).length, [rows]);
  const blocked = isAdmin
    ? null
    : verifiedN < MIN_VERIFIED ? `인증 기록 ${MIN_VERIFIED}건부터 사진을 올릴 수 있습니다 · 지금 ${verifiedN}건`
    : (mine?.today ?? 0) >= DAILY ? `오늘은 ${DAILY}장을 다 올렸습니다` : null;

  const menus = pick ? recordMenus(pick.r) : [];
  // 사진을 고르면 그 기록의 첫 메뉴가 골라진 상태로.
  useEffect(() => {
    setMenu(menus.length ? { kind: "record", name: menus[0] } : { kind: "none" });
    setCustom("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.r.id]);

  const menuValue = menu.kind === "record" ? menu.name : menu.kind === "custom" ? custom.trim() : null;
  const ready = !!pick && (menu.kind !== "custom" || !!custom.trim());

  async function send(addMenuToRecord: boolean) {
    if (!pick) return;
    setBusy(true);
    setError("");
    try {
      const id = await postGalleryPhoto(qc, {
        recordId: pick.r.id, photoRef: pick.ref, menu: menuValue, caption, addMenuToRecord,
        area: regionFromSearch(pick.r.address)?.label ?? null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      router.push({ pathname: "/community/gallery/[id]", params: { id: String(id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했습니다");
    }
    setBusy(false);
  }

  function submit() {
    if (!ready || blocked || busy) return;
    // 직접 쓴 메뉴가 그 기록에 없으면 기록에도 남길지 묻습니다.
    if (menu.kind === "custom" && !menus.some((m) => normMenu(m) === normMenu(custom))) {
      Alert.alert("이 메뉴를 기록에도 남길까요?", `「${custom.trim()}」을 ${pick!.r.name} 기록의 메뉴에 더합니다.`, [
        { text: "아니요", onPress: () => send(false) },
        { text: "남기기", onPress: () => send(true) },
      ]);
      return;
    }
    void send(false);
  }

  const tile = Math.floor((width - 40 - GAP * 3) / 4);
  const chip = (label: string, on: boolean, onPress: () => void, dashed = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityState={{ selected: on }}
      style={{ height: 32, borderRadius: 16, paddingHorizontal: 13, justifyContent: "center", borderWidth: 1, borderStyle: dashed && !on ? "dashed" : "solid", borderColor: on ? C.brick : dashed ? K.dashed : C.line, backgroundColor: on ? "rgba(180,85,45,.1)" : "transparent" }}
    >
      <Text style={{ fontFamily: on ? F.sansMd : F.sans, fontSize: 12, color: on ? C.brick : dashed ? C.muted : K.text2 }}>{label}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: Platform.OS === "ios" ? 10 : insets.top + 8, paddingHorizontal: 20 }}>
        {Platform.OS === "ios" && <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: C.line }} />}
        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>취소</Text></Pressable>
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>사진 올리기</Text>
          <Pressable onPress={submit} disabled={!ready || !!blocked || busy} hitSlop={10}>
            <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.brick, opacity: !ready || blocked || busy ? 0.35 : 1 }}>{busy ? "올리는 중…" : "올리기"}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 30, gap: 14 }} keyboardShouldPersistTaps="handled">
        {!!blocked && (
          <Text style={{ borderRadius: 12, backgroundColor: K.segMap, paddingHorizontal: 12, paddingVertical: 9, fontFamily: F.sans, fontSize: 12, color: C.muted, overflow: "hidden" }}>{blocked}</Text>
        )}

        {/* 미리보기 — 고른 사진 120 + 가게 */}
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <View style={{ width: 120, height: 120, borderRadius: 14, overflow: "hidden", backgroundColor: K.stripe, alignItems: "center", justifyContent: "center" }}>
            {pick ? <SignedImage uri={pick.ref} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>아래에서 한 장</Text>}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.faint }}>가게</Text>
            <Text numberOfLines={2} style={{ fontFamily: F.serif, fontSize: 15, color: pick ? C.ink : C.faint }}>{pick?.r.name ?? "사진을 고르면 가게가 붙습니다"}</Text>
            {pick?.r.verified && <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.brick }}>✓ 인증 {monthDay(pick.r.verified_at)}</Text>}
          </View>
        </View>

        {pick && (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.faint }}>메뉴</Text>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: K.inactive }}>이 기록의 메뉴 {menus.length}개</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {menus.map((m) => chip(m, menu.kind === "record" && menu.name === m, () => setMenu({ kind: "record", name: m })))}
              {chip("+ 직접 쓰기", menu.kind === "custom", () => setMenu({ kind: "custom" }), true)}
              {chip("메뉴 없이", menu.kind === "none", () => setMenu({ kind: "none" }), true)}
            </View>
            {menu.kind === "custom" && (
              <TextInput
                autoFocus
                value={custom}
                onChangeText={(t) => setCustom(t.slice(0, MENU_MAX))}
                maxLength={MENU_MAX}
                placeholder="메뉴 이름(40자)"
                placeholderTextColor="#a8a196"
                style={{ minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: C.brick, backgroundColor: C.card, paddingHorizontal: 13, fontFamily: F.sans, fontSize: 13, color: C.ink }}
              />
            )}
          </View>
        )}

        <View style={{ minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={caption}
            onChangeText={(t) => setCaption(t.slice(0, CAPTION_MAX))}
            maxLength={CAPTION_MAX}
            placeholder="한 줄 남기기 (선택)"
            placeholderTextColor={K.inactive}
            style={{ flex: 1, paddingVertical: 12, fontFamily: F.serif, fontSize: 13, color: C.ink }}
          />
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: K.inactive }}>{caption.length} / {CAPTION_MAX}</Text>
        </View>
        {!!error && <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>{error}</Text>}

        {/* 내 기록의 사진 — 4칸, 이미 올린 사진은 흐리게 「올림」, 한 번에 한 장 */}
        <Text style={{ marginTop: 6, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.faint }}>내 기록의 사진</Text>
        {tiles.length === 0 && <Text style={{ paddingVertical: 20, fontFamily: F.sans, fontSize: 12, color: C.faint }}>사진이 있는 기록이 아직 없습니다.</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
          {tiles.slice(0, shown).map((t) => {
            const done = posted(t);
            const on = pick?.ref === t.ref && pick.r.id === t.r.id;
            return (
              <Pressable
                key={`${t.r.id}|${t.ref}`}
                disabled={done}
                onPress={() => { Haptics.selectionAsync(); setPick(on ? null : t); setError(""); }}
                accessibilityLabel={`${t.r.name}${done ? ", 올린 사진" : ""}`}
                accessibilityState={{ selected: on, disabled: done }}
                style={{ width: tile, height: tile, borderRadius: 10, overflow: "hidden", borderWidth: on ? 2 : 0, borderColor: C.brick, backgroundColor: K.stripe }}
              >
                <SignedImage uri={t.ref} style={{ width: "100%", height: "100%", opacity: done ? 0.35 : 1 }} resizeMode="cover" />
                {on && (
                  <View style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.card }}>1</Text>
                  </View>
                )}
                {done && <Text style={{ position: "absolute", left: 4, bottom: 4, borderRadius: 6, backgroundColor: "rgba(28,26,23,.7)", paddingHorizontal: 5, fontFamily: F.sans, fontSize: 9.5, color: C.card, overflow: "hidden" }}>올림</Text>}
                {!done && t.r.verified && !on && (
                  <View style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: F.sansBd, fontSize: 9, color: C.brick }}>✓</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        {tiles.length > shown && (
          <Pressable onPress={() => setShown((n) => n + PAGE)} style={{ minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>사진 더 보기 · {tiles.length - shown}장</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
