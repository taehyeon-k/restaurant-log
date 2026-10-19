import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Platform, Pressable, Text, View } from "react-native";
import { refreshAll } from "@/data/invalidate";
import { setState, useAppState, type MapSegment } from "@/data/store";
import { sourceShort } from "@/lib/sourceLink";
import { supabase } from "@/lib/supabase";
import { dottedDate, type Wish, type WishGroup } from "@/lib/types";
import { releasePastWishes } from "@/lib/wishes";
import { C, F } from "@/theme";

/**
 * 지도 시트의 위시리스트(커뮤니티 핸드오프 §2 · 1a). 예전 위시리스트 탭(wish.tsx)의 목록을 줄여 옮겼습니다 —
 * 카드를 누르면 그 위시 시트(/wish/[id])가 열려 방문 인증 · 수정 · 알림을 그대로 씁니다.
 */

/** 시트 머리의 전환 — 맛집 기록 / 위시리스트 + 개수. */
export function SegmentSwitch({ value, recordLabel, recordCount, wishCount, onChange }: {
  value: MapSegment; recordLabel: string; recordCount: number; wishCount: number; onChange: (v: MapSegment) => void;
}) {
  const seg = (id: MapSegment, label: string, count: number) => {
    const on = value === id;
    return (
      <Pressable
        key={id}
        onPress={() => { if (!on) { Haptics.selectionAsync(); onChange(id); } }}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={{ flex: 1, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: on ? C.ink : "transparent" }}
      >
        <Text style={{ fontFamily: on ? F.sansMd : F.sans, fontSize: 13, color: on ? C.card : C.muted }}>{label}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: on ? "#e2a585" : "#a29a8c" }}>{count}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ marginTop: 4, marginBottom: 14, height: 42, borderRadius: 21, backgroundColor: "#efebe2", padding: 3, flexDirection: "row", gap: 3 }}>
      {seg("records", recordLabel, recordCount)}
      {seg("wish", "위시리스트", wishCount)}
    </View>
  );
}

export type WishItem =
  | { t: "head"; key: string; title: string; first: boolean }
  | { t: "wish"; key: string; wish: Wish; dated: boolean }
  /** 링크 하나로 담은 그룹(HANDOFF-wish-group §5-3) — wishes 는 보이는 가게(group_pos 순), all 은 그룹 전체. */
  | { t: "group"; key: string; group: WishGroup; wishes: Wish[]; all: Wish[]; date: string | null }
  | { t: "empty"; key: string };

/** 예정 · N / 언젠가 · N 두 묶음으로 펼친 목록. 불러온 뒤 한 번, 지난 예정은 조용히 「언젠가」로 되돌립니다. */
/** shown — 목록에 보일 위시(「이 지도 범위」로 좁힌 것). 지난 예정 정리는 늘 전체(wishes)로 합니다. */
export function useWishItems(wishes: Wish[], shown: Wish[] = wishes) {
  const qc = useQueryClient();
  const swept = useRef(false);
  useEffect(() => {
    if (swept.current || !wishes.length) return;
    swept.current = true;
    releasePastWishes(supabase, wishes).then((next) => { if (next !== wishes) void refreshAll(qc); });
  }, [wishes, qc]);

  return useMemo(() => {
    // 그룹 — 전체에서 2곳 넘게 남은 그룹만 묶고, 1곳만 남았으면 보통 위시 줄로.
    const members = new Map<string, Wish[]>();
    for (const w of wishes) if (w.group_id && w.group) members.set(w.group_id, [...(members.get(w.group_id) ?? []), w]);
    const byPos = (a: Wish, b: Wish) => (a.group_pos ?? 0) - (b.group_pos ?? 0);
    type Entry = { date: string | null; count: number; item: WishItem };
    const entries: Entry[] = [];
    const grouped = new Map<string, Wish[]>();
    for (const w of shown) {
      if (w.group_id && (members.get(w.group_id)?.length ?? 0) > 1) grouped.set(w.group_id, [...(grouped.get(w.group_id) ?? []), w]);
      else entries.push({ date: w.plan_date, count: 1, item: { t: "wish", key: w.id, wish: w, dated: !!w.plan_date } });
    }
    for (const [id, ws] of grouped) {
      const all = [...members.get(id)!].sort(byPos);
      const date = all.map((w) => w.plan_date).filter((d): d is string => !!d).sort()[0] ?? null;
      entries.push({ date, count: ws.length, item: { t: "group", key: `g-${id}`, group: ws[0].group!, wishes: [...ws].sort(byPos), all, date } });
    }
    // 예정은 날짜순, 언젠가는 받아 온 순서(담은 날 최신순) 그대로 — 그룹은 그 첫 가게 자리에.
    const firstAt = new Map(shown.map((w, i) => [w.id, i]));
    const orderOf = (e: Entry) => (e.item.t === "group" ? Math.min(...e.item.wishes.map((w) => firstAt.get(w.id)!)) : e.item.t === "wish" ? firstAt.get(e.item.wish.id)! : 0);
    const dated = entries.filter((e) => e.date).sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : orderOf(a) - orderOf(b)));
    const someday = entries.filter((e) => !e.date).sort((a, b) => orderOf(a) - orderOf(b));
    const sum = (es: Entry[]) => es.reduce((n, e) => n + e.count, 0);
    const items: WishItem[] = [];
    if (dated.length) {
      items.push({ t: "head", key: "h-dated", title: `예정 · ${sum(dated)}`, first: true });
      dated.forEach((e) => items.push(e.item));
    }
    if (someday.length) {
      items.push({ t: "head", key: "h-someday", title: `언젠가 · ${sum(someday)}`, first: !dated.length });
      someday.forEach((e) => items.push(e.item));
    }
    if (!items.length) items.push({ t: "empty", key: "empty" });
    return items;
  }, [wishes, shown]);
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "2026-10-17" → "10.17" */
const monthDot = (d: string | null) => dottedDate(d).slice(5);

const AddLink = () => {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push("/wish/new")} hitSlop={8}>
      <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>+ 가고 싶은 곳 담기</Text>
    </Pressable>
  );
};

/** 목록 한 칸 — 묶음 머리 · 위시 카드 · 빈 목록. */
export function WishRow({ item }: { item: WishItem }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [dating, setDating] = useState(false);

  if (item.t === "head") {
    return (
      <View style={{ marginTop: item.first ? 0 : 8, marginBottom: 0, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.faint }}>{item.title}</Text>
        {item.first && <AddLink />}
      </View>
    );
  }

  if (item.t === "empty") {
    return (
      <View>
        <View style={{ paddingHorizontal: 4, flexDirection: "row", justifyContent: "flex-end" }}><AddLink /></View>
        <Text style={{ paddingVertical: 44, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>아직 담아둔 곳이 없습니다.</Text>
      </View>
    );
  }

  if (item.t === "group") return <GroupRow item={item} />;

  const { wish: w, dated } = item;
  const meta = [w.category, w.where_text].filter(Boolean).join(" · ");
  async function setDate(d: string) {
    setDating(false);
    await supabase.from("wishes").update({ plan_date: d }).eq("id", w.id);
    refreshAll(qc);
  }

  return (
    <View>
      <Pressable
        onPress={() => router.push({ pathname: "/wish/[id]", params: { id: w.id } })}
        style={{
          borderRadius: 18, borderWidth: 1, borderStyle: dated ? "solid" : "dashed", borderColor: dated ? "#e0c3b1" : "#ded8cb",
          backgroundColor: dated ? C.card : "transparent", paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{w.name}</Text>
          {!!meta && <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{meta}</Text>}
        </View>
        {dated ? (
          <Text style={{ borderRadius: 9, borderWidth: 1, borderStyle: "dashed", borderColor: C.brick, paddingHorizontal: 8, paddingVertical: 1, fontFamily: F.mono, fontSize: 10.5, color: C.brick, overflow: "hidden" }}>{monthDot(w.plan_date)}</Text>
        ) : (
          <Pressable onPress={() => setDating(true)} hitSlop={8}>
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>날짜 정하기</Text>
          </Pressable>
        )}
      </Pressable>
      {dating && (
        <DateTimePicker
          value={new Date()}
          minimumDate={new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(e, d) => {
            if (e.type === "dismissed") return setDating(false);
            if (d) setDate(isoOf(d));
          }}
        />
      )}
    </View>
  );
}

const datePill = (d: string | null) => (
  <Text style={{ borderRadius: 9, borderWidth: 1, borderStyle: "dashed", borderColor: C.brick, paddingHorizontal: 8, paddingVertical: 1, fontFamily: F.mono, fontSize: 10.5, color: C.brick, overflow: "hidden" }}>{monthDot(d)}</Text>
);

/**
 * 그룹 줄(HANDOFF-wish-group §5-3) — 접힘: 가게 수 · 그룹 이름 · 「출처 · 가게1 · 가게2 · 가게3」. 누르면 그 자리에서 펼칩니다.
 * 펼침: 가게 줄(누르면 /wish/[id]) + 출처 보기 · 이름 바꾸기 · 날짜 정하기(그룹 전체). 길게 누르면 그룹 풀기 · 그룹째 지우기.
 */
function GroupRow({ item }: { item: Extract<WishItem, { t: "group" }> }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { openWishGroup } = useAppState();
  const { group: g, wishes: ws, all, date } = item;
  const [open, setOpen] = useState(openWishGroup === g.id);
  // 방금 담은 그룹이면 펼친 채로 — 한 번만.
  useEffect(() => {
    if (openWishGroup !== g.id) return;
    setOpen(true);
    setState({ openWishGroup: null });
  }, [openWishGroup, g.id]);
  const [dating, setDating] = useState<"all" | string | null>(null);
  const label = g.source_kind ? sourceShort(g.source_kind) : null;
  const sub = [label, ...ws.slice(0, 3).map((w) => w.name)].filter(Boolean).join(" · ") + (ws.length > 3 ? " …" : "");

  async function setDate(d: string) {
    const target = dating;
    setDating(null);
    if (target === "all") await supabase.from("wishes").update({ plan_date: d }).eq("group_id", g.id);
    else if (target) await supabase.from("wishes").update({ plan_date: d }).eq("id", target);
    refreshAll(qc);
  }

  function rename() {
    if (Platform.OS !== "ios") return Alert.alert("이름 바꾸기는 iOS 에서만 됩니다");
    Alert.prompt("그룹 이름 바꾸기", "20자까지", [
      { text: "취소", style: "cancel" },
      {
        text: "바꾸기",
        onPress: async (v?: string) => {
          const name = (v ?? "").trim().slice(0, 20);
          if (!name || name === g.name) return;
          await supabase.from("wish_groups").update({ name }).eq("id", g.id);
          refreshAll(qc);
        },
      },
    ], "plain-text", g.name);
  }

  function menu() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(g.name, `${all.length}곳`, [
      {
        text: "그룹 풀기",
        onPress: async () => {
          await supabase.from("wishes").update({ group_id: null, group_pos: null }).eq("group_id", g.id);
          refreshAll(qc);
        },
      },
      {
        text: "그룹째 지우기",
        style: "destructive",
        onPress: () => Alert.alert(`"${g.name}" ${all.length}곳을 위시리스트에서 지울까요?`, undefined, [
          { text: "취소", style: "cancel" },
          {
            text: "지우기",
            style: "destructive",
            onPress: async () => {
              await supabase.from("wishes").delete().eq("group_id", g.id);
              await supabase.from("wish_groups").delete().eq("id", g.id);
              refreshAll(qc);
            },
          },
        ]),
      },
      { text: "취소", style: "cancel" },
    ]);
  }

  const pill = (text: string, onPress: () => void, brick = false) => (
    <Pressable onPress={onPress} hitSlop={6} style={{ height: 30, borderRadius: 15, borderWidth: 1, borderColor: brick ? C.brick : C.line, backgroundColor: C.card, paddingHorizontal: 12, justifyContent: "center" }}>
      <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: brick ? C.brick : "#4d4842" }}>{text}</Text>
    </Pressable>
  );

  return (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: open ? "#e0c3b1" : date ? "#e0c3b1" : "#ded8cb", borderStyle: open || date ? "solid" : "dashed", backgroundColor: open || date ? C.card : "transparent", overflow: "hidden" }}>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); setOpen((v) => !v); }}
        onLongPress={menu}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#efebe2", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.brick }}>{ws.length}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{g.name}</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{sub}</Text>
        </View>
        {!!date && datePill(date)}
        <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>{open ? "⌃" : "⌄"}</Text>
      </Pressable>

      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: C.lineSoft }}>
          {ws.map((w) => {
            const meta = [w.category, w.where_text].filter(Boolean).join(" · ");
            return (
              <Pressable
                key={w.id}
                onPress={() => router.push({ pathname: "/wish/[id]", params: { id: w.id } })}
                style={{ paddingVertical: 10, paddingLeft: 61, paddingRight: 14, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14, color: C.ink }}>{w.name}</Text>
                  {!!meta && <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{meta}</Text>}
                </View>
                {w.plan_date ? datePill(w.plan_date) : (
                  <Pressable onPress={() => setDating(w.id)} hitSlop={8}>
                    <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>날짜 정하기</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
          <View style={{ paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
            {!!g.source_url && !!label && pill(`${label}에서 보기 ↗`, () => { Linking.openURL(g.source_url!).catch(() => {}); })}
            {pill("이름 바꾸기", rename)}
            <View style={{ flex: 1 }} />
            {pill(date ? `${monthDot(date)} · 바꾸기` : "날짜 정하기", () => setDating("all"), true)}
          </View>
        </View>
      )}
      {dating && (
        <DateTimePicker
          value={dating === "all" && date ? new Date(date + "T00:00:00") : new Date()}
          minimumDate={new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(e, d) => {
            if (e.type === "dismissed") return setDating(null);
            if (d) setDate(isoOf(d));
          }}
        />
      )}
    </View>
  );
}
