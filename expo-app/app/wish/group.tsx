import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SourceIcon } from "@/components/SourceIcon";
import { Eyebrow } from "@/components/ui";
import { useActiveBook } from "@/data/books";
import { refreshAll } from "@/data/invalidate";
import { useWishes } from "@/data/queries";
import { setState, useAppState, type GroupDraft } from "@/data/store";
import { sourceShort, sourceStrip } from "@/lib/sourceLink";
import { supabase } from "@/lib/supabase";
import { dottedDate } from "@/lib/types";
import { C, F } from "@/theme";

const NAME_MAX = 20;
const ROW_H = 58;
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Place = NonNullable<GroupDraft>["places"][number];

/** 주소에서 가장 많이 나온 동(「망원동」→「망원」) + 「 한 바퀴」. 동이 없으면 구 + 「 맛집」. */
function areaName(places: Place[]): string | null {
  const count = (re: RegExp) => {
    const n = new Map<string, number>();
    for (const p of places) {
      const m = p.address.split(/\s+/).map((w) => w.match(re)?.[1]).find(Boolean);
      if (m) n.set(m, (n.get(m) ?? 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const dong = count(/^([가-힣]{1,6}?)\d*(?:가)?동$/);
  if (dong) return `${dong} 한 바퀴`;
  const gu = count(/^([가-힣]{1,5})구$/);
  return gu ? `${gu} 맛집` : null;
}

/**
 * 그룹으로 담기(HANDOFF-wish-group §5-2) — 「어느 가게인가요」에서 2곳 넘게 고른 뒤.
 * 그룹 이름(필수 · 20자) · 순서(길게 눌러 끌기) · 갈 날짜(모든 가게 같게)를 정하고 한 번에 담습니다.
 * 담으면 폼 · 고르기 화면까지 닫고 지도 시트를 위시리스트로 바꿔 그 그룹을 펼쳐 보여 줍니다.
 */
export default function WishGroupRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { groupDraft: draft } = useAppState();
  const { data: wishes = [] } = useWishes();
  const { id: bookId } = useActiveBook();

  const [name, setName] = useState("");
  const [places, setPlaces] = useState<Place[]>(draft?.places ?? []);
  const [planDate, setPlanDate] = useState("");
  const [pickDate, setPickDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scrollOn, setScrollOn] = useState(true);

  // 고르기 화면에서 다시 고르고 오면(뒤로 → 다시 선택 완료) 새 목록으로.
  useEffect(() => { if (draft) setPlaces(draft.places); }, [draft]);

  const suggestions = useMemo(() => {
    if (!draft) return [];
    const recent = [...wishes].filter((w) => w.group?.name).sort((a, b) => (a.saved_at < b.saved_at ? 1 : -1))[0]?.group?.name ?? null;
    const now = new Date();
    const dated = `${sourceShort(draft.kind)} ${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
    return [...new Set([areaName(draft.places), recent, dated].filter((v): v is string => !!v).map((v) => v.slice(0, NAME_MAX)))];
  }, [draft, wishes]);

  if (!draft) return <Pressable style={{ flex: 1, backgroundColor: C.paper }} onPress={() => router.back()} />;

  const clean = name.trim();

  async function save() {
    if (!draft || !clean || saving) return;
    setSaving(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return setError("로그인이 필요합니다"); }
    const book = bookId ? { book_id: bookId } : {};
    const { data: group, error: gErr } = await supabase
      .from("wish_groups")
      .insert({ name: clean, user_id: user.id, ...book, source_url: draft.url, source_kind: draft.kind, source_title: draft.title, source_author: draft.author })
      .select("id").single();
    if (gErr || !group) { setSaving(false); return setError(gErr?.message ?? "그룹을 만들지 못했습니다"); }
    const rows = places.map((p, i) => ({
      name: p.name, where_text: p.address || null, category: p.category, lat: p.lat, lng: p.lng, plan_date: planDate || null,
      group_id: group.id, group_pos: i + 1, user_id: user.id, ...book,
      source_url: draft.url, source_kind: draft.kind, source_title: draft.title, source_author: draft.author,
    }));
    const { error: wErr } = await supabase.from("wishes").insert(rows);
    if (wErr) {
      // 하나라도 안 들어갔으면 만든 것을 모두 되돌립니다.
      await supabase.from("wishes").delete().eq("group_id", group.id);
      await supabase.from("wish_groups").delete().eq("id", group.id);
      setSaving(false);
      return setError("담지 못했어요. 잠시 뒤 다시 해 주세요");
    }
    await refreshAll(qc);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setState({ groupDraft: null, mapSegment: "wish", openWishGroup: group.id, wishToast: `${clean} · ${places.length}곳을 담았어요` });
    router.dismissTo("/");
  }

  const strip = sourceStrip({ url: draft.url, kind: draft.kind, title: draft.title, author: draft.author });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView scrollEnabled={scrollOn} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30 }}>
        <View style={{ height: 44, justifyContent: "center" }}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ position: "absolute", left: 0, paddingVertical: 8, zIndex: 1 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>‹ 가게 고르기</Text>
          </Pressable>
          <Text style={{ textAlign: "center", fontFamily: F.serif, fontSize: 18, color: C.ink }}>그룹으로 담기</Text>
        </View>

        <View style={s.strip}>
          <SourceIcon kind={draft.kind} size={26} />
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 12, color: "#8f4323" }}>{strip}</Text>
        </View>

        <View style={{ marginTop: 18 }}>
          <Eyebrow>그룹 이름</Eyebrow>
          <View style={s.nameBox}>
            <TextInput
              autoFocus
              value={name}
              onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
              placeholder="예: 망원 한 바퀴" placeholderTextColor="#b3ada1" returnKeyType="done"
              style={{ flex: 1, height: "100%", fontFamily: F.serif, fontSize: 16, fontWeight: "700", color: C.ink }}
            />
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{name.length} / {NAME_MAX}</Text>
          </View>
          {suggestions.length > 0 && (
            <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {suggestions.map((v) => (
                <Pressable key={v} onPress={() => { Haptics.selectionAsync(); setName(v); }} style={s.suggest}>
                  <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>{v}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Eyebrow>담을 곳</Eyebrow>
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>{places.length}곳</Text>
          </View>
          <PlaceList places={places} onChange={setPlaces} onDragging={(d) => setScrollOn(!d)} />
        </View>

        <Pressable onPress={() => setPickDate((v) => !v)} style={s.dateRow}>
          <Text style={{ flex: 1, fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>갈 날짜</Text>
          <Text style={{ fontFamily: planDate ? F.mono : F.sans, fontSize: 12.5, color: planDate ? C.brick : C.muted }}>{planDate ? dottedDate(planDate) : "언젠가"} ›</Text>
        </Pressable>
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
        {pickDate && (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 4 }}>
            {!!planDate && <Pressable onPress={() => { setPlanDate(""); setPickDate(false); }} style={{ padding: 8 }}><Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>언젠가로</Text></Pressable>}
            {Platform.OS === "ios" && <Pressable onPress={() => setPickDate(false)} style={{ padding: 8 }}><Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.brick }}>완료</Text></Pressable>}
          </View>
        )}

        {!!error && <Text style={{ marginTop: 14, fontFamily: F.sans, fontSize: 12.5, color: "#a8412a" }}>{error}</Text>}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 14, backgroundColor: C.paper }}>
        <Pressable
          onPress={save}
          disabled={!clean || saving}
          accessibilityRole="button"
          style={{ height: 54, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: clean ? C.ink : "#bdb6a9", opacity: saving ? 0.7 : 1 }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 15, color: C.card }}>{saving ? "담는 중…" : `${places.length}곳 담기`}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** 담을 곳 — 번호 원 · 이름 · 「종류 · 주소」. 줄을 길게 누른 채 끌면 순서가 바뀝니다(group_pos). */
function PlaceList({ places, onChange, onDragging }: { places: Place[]; onChange: (p: Place[]) => void; onDragging: (d: boolean) => void }) {
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const clamp = (i: number) => Math.max(0, Math.min(places.length - 1, i));
  const to = drag ? clamp(drag.from + Math.round(drag.dy / ROW_H)) : -1;

  function drop(from: number, dy: number) {
    const target = clamp(from + Math.round(dy / ROW_H));
    setDrag(null);
    onDragging(false);
    if (target === from) return;
    Haptics.selectionAsync();
    const next = [...places];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < to && i > drag.from && i <= to) return -ROW_H;
    if (drag.from > to && i < drag.from && i >= to) return ROW_H;
    return 0;
  };

  return (
    <View style={{ marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card }}>
      {places.map((p, i) => (
        <PlaceRow
          key={`${p.name}|${p.lat}|${p.lng}`}
          place={p}
          index={i}
          last={i === places.length - 1}
          dragging={drag?.from === i}
          offset={drag?.from === i ? drag.dy : shift(i)}
          onArm={() => onDragging(true)}
          onMove={(dy) => setDrag({ from: i, dy })}
          onDrop={(dy) => drop(i, dy)}
        />
      ))}
    </View>
  );
}

function PlaceRow({ place, index, last, dragging, offset, onArm, onMove, onDrop }: {
  place: Place; index: number; last: boolean; dragging: boolean; offset: number;
  onArm: () => void; onMove: (dy: number) => void; onDrop: (dy: number) => void;
}) {
  // 길게 누르면(armed) 그 터치를 이어서 끌 수 있습니다. 핸들러가 늘 지금 줄의 콜백을 부르도록 ref 로.
  const armed = useRef(false);
  const granted = useRef(false);
  const cb = useRef({ onArm, onMove, onDrop });
  cb.current = { onArm, onMove, onDrop };
  const release = (dy: number) => {
    if (!armed.current) return;
    armed.current = false;
    granted.current = false;
    cb.current.onDrop(dy);
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => armed.current,
      onMoveShouldSetPanResponderCapture: () => armed.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { granted.current = true; },
      onPanResponderMove: (_, g) => { if (armed.current) cb.current.onMove(g.dy); },
      onPanResponderRelease: (_, g) => release(g.dy),
      onPanResponderTerminate: (_, g) => release(g.dy),
    }),
  ).current;
  const meta = [place.category, place.address].filter(Boolean).join(" · ");

  return (
    <View
      {...pan.panHandlers}
      style={{
        height: ROW_H, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.lineSoft, backgroundColor: C.card,
        transform: [{ translateY: offset }], zIndex: dragging ? 2 : 0,
        ...(dragging ? { shadowColor: C.ink, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6, borderRadius: 12 } : null),
      }}
    >
      <Pressable
        delayLongPress={280}
        onLongPress={() => { armed.current = true; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); cb.current.onArm(); cb.current.onMove(0); }}
        // 길게 누르고 끌지 않은 채 떼면 — 끌기(pan)가 터치를 넘겨받지 않았을 때만 여기서 내려놓습니다.
        onPressOut={() => setTimeout(() => { if (armed.current && !granted.current) release(0); }, 60)}
        accessibilityLabel={`${place.name} · 길게 눌러 순서 바꾸기`}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.card }}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14, color: C.ink }}>{place.name}</Text>
          {!!meta && <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{meta}</Text>}
        </View>
        <Text style={{ fontFamily: F.sans, fontSize: 15, color: "#c4bdb0" }}>≡</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  strip: { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9efe8", paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  nameBox: { marginTop: 8, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: C.brick, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  suggest: { height: 32, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: "#c9a593", paddingHorizontal: 12, justifyContent: "center" },
  dateRow: { marginTop: 18, height: 46, borderRadius: 14, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" },
});
