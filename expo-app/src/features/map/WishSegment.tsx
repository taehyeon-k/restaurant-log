import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { refreshAll } from "@/data/invalidate";
import type { MapSegment } from "@/data/store";
import { supabase } from "@/lib/supabase";
import { dottedDate, type Wish } from "@/lib/types";
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
    const dated = shown.filter((w) => w.plan_date).sort((a, b) => (a.plan_date! < b.plan_date! ? -1 : 1));
    const someday = shown.filter((w) => !w.plan_date);
    const items: WishItem[] = [];
    if (dated.length) {
      items.push({ t: "head", key: "h-dated", title: `예정 · ${dated.length}`, first: true });
      dated.forEach((w) => items.push({ t: "wish", key: w.id, wish: w, dated: true }));
    }
    if (someday.length) {
      items.push({ t: "head", key: "h-someday", title: `언젠가 · ${someday.length}`, first: !dated.length });
      someday.forEach((w) => items.push({ t: "wish", key: w.id, wish: w, dated: false }));
    }
    if (!items.length) items.push({ t: "empty", key: "empty" });
    return items;
  }, [shown]);
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
