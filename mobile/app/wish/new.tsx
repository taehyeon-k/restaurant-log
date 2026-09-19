/**
 * 가고 싶은 곳 — 담기와 고치기가 같은 화면입니다(`?id=` 가 있으면 고치기).
 * 웹 `WishForm.tsx` 그대로입니다. 첫 위시를 저장하는 순간 알림 권한을 묻고
 * 지오펜스를 다시 세웁니다(§7) — 앱 첫 실행이 아닙니다.
 */
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DateField from "@/components/DateField";
import SpotPicker from "@/components/SpotPicker";
import { Chip, Eyebrow, ToggleSwitch } from "@/components/ui";
import { supabase, requireUserId } from "@/lib/supabase";
import { forwardGeocode, type Place } from "@/lib/geocode";
import { useRefresh, useWishes } from "@/lib/data";
import {
  currentPositionOrNull,
  ensureBackgroundLocation,
  ensureNotificationPermission,
  syncWishGeofences,
} from "@/lib/notifications";
import { ALL_CATEGORIES, matchWish } from "@/lib/types";
import { C, FONT } from "@/lib/theme";

const fieldStyle = {
  marginTop: 7,
  minHeight: 46,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: C.hairline,
  backgroundColor: C.card,
  paddingHorizontal: 14,
  fontSize: 14,
  color: C.ink,
  fontFamily: FONT.sans,
} as const;

export default function WishFormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refresh = useRefresh();
  const { wishes } = useWishes();

  const p = useLocalSearchParams<{
    id?: string;
    name?: string;
    where_text?: string;
    category?: string;
    lat?: string;
    lng?: string;
    plan_date?: string;
  }>();

  const wish = p.id ? wishes.find((w) => w.id === p.id) ?? null : null;
  const isNew = wish === null;

  const num = (v?: string) => (v && v.length > 0 ? Number(v) : null);

  const [name, setName] = useState(wish?.name ?? p.name ?? "");
  const [whereText, setWhereText] = useState(wish?.where_text ?? p.where_text ?? "");
  const [category, setCategory] = useState(wish?.category ?? p.category ?? "");
  const [note, setNote] = useState(wish?.note ?? "");
  const [planDate, setPlanDate] = useState(wish?.plan_date ?? p.plan_date ?? "");
  const [notify, setNotify] = useState(wish?.notify ?? false);
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(() => {
    if (wish?.lat != null && wish?.lng != null) return { lat: wish.lat, lng: wish.lng };
    const lat = num(p.lat);
    const lng = num(p.lng);
    return lat != null && lng != null ? { lat, lng } : null;
  });

  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  // 「자리」 칸에서 바로 가게를 찾아 위치를 잡습니다 — 지도에서 손으로 짚지 않아도 되게.
  const [spotResults, setSpotResults] = useState<Place[]>([]);
  const [spotOpen, setSpotOpen] = useState(false);
  const [spotBusy, setSpotBusy] = useState(false);
  const skipSpotSearch = useRef(false);

  useEffect(() => {
    if (skipSpotSearch.current) {
      skipSpotSearch.current = false;
      return;
    }
    if (!spotOpen || whereText.trim().length < 2) {
      setSpotResults([]);
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSpotBusy(true);
      try {
        setSpotResults(await forwardGeocode(whereText, ctrl.signal));
      } catch {
        /* aborted or offline */
      } finally {
        setSpotBusy(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [whereText, spotOpen]);

  function chooseSpot(hit: Place) {
    skipSpotSearch.current = true;
    setWhereText(hit.name || hit.address);
    setSpot({ lat: hit.lat, lng: hit.lng });
    setSpotOpen(false);
    setSpotResults([]);
    if (!name.trim()) setName(hit.name);
  }

  const missing = !name.trim() ? "가게 이름을 적어주세요" : "";
  const canSave = !missing;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");

    const cleanName = name.trim();

    // 같은 이름의 위시가 이미 있으면 중복으로 만들지 않고 그 위시로 돌려보냅니다.
    if (isNew) {
      const dup = matchWish(wishes, cleanName);
      if (dup) {
        setSaving(false);
        router.replace({ pathname: "/wish/new", params: { id: dup.id } });
        return;
      }
    }

    const payload = {
      name: cleanName,
      where_text: whereText.trim() || null,
      category: category || null,
      note: note.trim() || null,
      plan_date: planDate || null,
      notify,
      lat: spot?.lat ?? null,
      lng: spot?.lng ?? null,
    };

    try {
      if (isNew) {
        const userId = await requireUserId();
        const { error: err } = await supabase.from("wishes").insert({ ...payload, user_id: userId });
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await supabase.from("wishes").update(payload).eq("id", wish.id);
        if (err) throw new Error(err.message);
      }

      // 알림을 켠 위시를 저장하는 순간이 권한을 묻는 자리입니다(§7).
      if (notify && spot) await armGeofences([...wishes, { ...payload, id: wish?.id ?? "new" }]);

      refresh();
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "담지 못했습니다");
      setSaving(false);
    }
  }

  /** 알림·배경 위치를 한 번 물어보고 감시 구역을 다시 세웁니다. 거부해도 저장은 끝난 뒤입니다. */
  async function armGeofences(next: { lat: number | null; lng: number | null; notify: boolean; name: string; id: string }[]) {
    const allowed = await ensureNotificationPermission();
    if (!allowed) return;
    if (!(await ensureBackgroundLocation())) return;

    const from = await currentPositionOrNull();
    await syncWishGeofences(
      next.map((w) => ({
        id: w.id,
        name: w.name,
        lat: w.lat,
        lng: w.lng,
        notify: w.notify,
        where_text: null,
        category: null,
        note: null,
        plan_date: null,
        saved_at: "",
        created_at: "",
      })),
      from
    );
  }

  async function remove() {
    if (!wish) return;
    setDeleting(true);
    setError("");
    const { error: err } = await supabase.from("wishes").delete().eq("id", wish.id);
    setDeleting(false);
    if (err) return setError(err.message);
    refresh();
    router.back();
  }

  if (picking) {
    return (
      <SpotPicker
        initial={spot}
        onCancel={() => setPicking(false)}
        onPick={(lat, lng, found) => {
          setSpot({ lat, lng });
          if (!whereText.trim()) setWhereText(found ? found.name || found.address : "지도에서 고른 자리");
          if (found?.name && !name.trim()) setName(found.name);
          setPicking(false);
        }}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.paper }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: FONT.serifBold, fontSize: 18, color: C.ink }}>
            {isNew ? "가고 싶은 곳" : "가고 싶은 곳 고치기"}
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={{ fontSize: 13, color: C.faint, fontFamily: FONT.sans }}>닫기</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 11, gap: 11 }}>
          <View>
            <Eyebrow>가게</Eyebrow>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="가게 이름"
              placeholderTextColor={C.placeholder}
              style={fieldStyle}
            />
          </View>

          <View>
            <Eyebrow>자리</Eyebrow>
            <View style={{ marginTop: 7, flexDirection: "row", alignItems: "center", gap: 7 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <TextInput
                  value={whereText}
                  onChangeText={(v) => {
                    setWhereText(v);
                    setSpotOpen(true);
                    if (spot) setSpot(null);
                  }}
                  onFocus={() => setSpotOpen(true)}
                  placeholder="가게 이름으로 찾기, 또는 동네나 주소"
                  placeholderTextColor={C.placeholder}
                  style={[fieldStyle, { marginTop: 0 }]}
                />
                {spotBusy && (
                  <Text
                    style={{
                      position: "absolute",
                      right: 14,
                      top: 16,
                      fontFamily: FONT.mono,
                      fontSize: 10,
                      color: C.faint,
                    }}
                  >
                    검색 중…
                  </Text>
                )}
              </View>

              <Pressable
                onPress={() => setPicking(true)}
                style={{
                  minHeight: 46,
                  justifyContent: "center",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: spot ? C.brick : C.hairline,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ fontSize: 12, color: spot ? C.brick : C.muted, fontFamily: FONT.sans }}>
                  {spot ? "자리 정해짐" : "지도에서 고르기"}
                </Text>
              </Pressable>
            </View>

            {spotOpen && spotResults.length > 0 && (
              <View
                style={{
                  marginTop: 6,
                  overflow: "hidden",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: C.line,
                  backgroundColor: C.card,
                }}
              >
                {spotResults.map((hit, i) => (
                  <Pressable
                    key={`${hit.lat}-${hit.lng}-${i}`}
                    onPress={() => chooseSpot(hit)}
                    style={{
                      gap: 2,
                      borderBottomWidth: i === spotResults.length - 1 ? 0 : 1,
                      borderBottomColor: C.line,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: C.ink, fontFamily: FONT.sansMedium }}>
                      {hit.name || hit.address}
                    </Text>
                    <Text style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>{hit.address}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {spot && (
              <Text style={{ marginTop: 6, fontSize: 11, color: C.brick, fontFamily: FONT.sans }}>
                자리가 정확히 잡혔습니다.
              </Text>
            )}
          </View>

          <View>
            <Eyebrow>종류</Eyebrow>
            <View style={{ marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {ALL_CATEGORIES.map((c) => (
                <Chip key={c} label={c} active={category === c} onPress={() => setCategory((v) => (v === c ? "" : c))} />
              ))}
            </View>
          </View>

          <View>
            <Eyebrow>가고 싶은 이유, 어디서 봤는지</Eyebrow>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="마음껏 적어두세요. 링크를 붙여두면 카드에서 바로 열립니다."
              placeholderTextColor={C.placeholder}
              style={[
                fieldStyle,
                {
                  minHeight: 140,
                  paddingVertical: 12,
                  textAlignVertical: "top",
                  fontFamily: FONT.serif,
                  lineHeight: 26,
                  color: "#2e2a25",
                },
              ]}
            />
          </View>

          <View>
            <Eyebrow>언제 갈지 (비워도 됩니다)</Eyebrow>
            <DateField
              value={planDate}
              onChange={setPlanDate}
              placeholder="날짜 고르기"
              allowClear
              style={{ marginTop: 7, minHeight: 46, borderRadius: 14 }}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#e2c9bb",
              backgroundColor: "#f9f0e9",
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, color: C.ink, fontFamily: FONT.sansMedium }}>근처를 지나면 알려주기</Text>
              <Text style={{ marginTop: 4, fontSize: 11.5, lineHeight: 18, color: C.muted, fontFamily: FONT.sans }}>
                이 가게에만 걸리는 알림입니다. 자리를 정해 두어야 켜집니다.
              </Text>
            </View>
            <ToggleSwitch checked={notify} onChange={() => setNotify((v) => !v)} label="근처 알림" />
          </View>
        </View>

        {error.length > 0 && (
          <Text style={{ marginTop: 14, fontSize: 12.5, color: "#a8412a", fontFamily: FONT.sans }}>{error}</Text>
        )}

        <Pressable
          onPress={save}
          disabled={!canSave || saving}
          style={{
            marginTop: 18,
            borderRadius: 20,
            padding: 16,
            alignItems: "center",
            backgroundColor: canSave ? C.ink : "#e4dfd3",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 14.5, color: canSave ? C.card : C.faint, fontFamily: FONT.sansMedium }}>
            {canSave ? (saving ? "담는 중…" : isNew ? "담기" : "고치기") : missing}
          </Text>
        </Pressable>

        {!isNew &&
          (confirmingDelete ? (
            <View
              style={{
                marginTop: 12,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "#e2c9bb",
                backgroundColor: "#f9f0e9",
                padding: 16,
              }}
            >
              <Text style={{ textAlign: "center", fontSize: 13, color: C.muted, fontFamily: FONT.sans }}>
                정말 삭제하시겠습니까?
              </Text>
              <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => setConfirmingDelete(false)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: C.hairline,
                    backgroundColor: C.card,
                  }}
                >
                  <Text style={{ fontSize: 13, color: C.muted, fontFamily: FONT.sans }}>취소</Text>
                </Pressable>
                <Pressable
                  onPress={remove}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 16,
                    backgroundColor: "#9a4a52",
                    opacity: deleting ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontSize: 13, color: C.card, fontFamily: FONT.sansMedium }}>
                    {deleting ? "삭제 중…" : "삭제"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setConfirmingDelete(true)}
              style={{
                marginTop: 12,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#e4dfd3",
                padding: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 13, color: C.faint, fontFamily: FONT.sans }}>계획 삭제</Text>
            </Pressable>
          ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
