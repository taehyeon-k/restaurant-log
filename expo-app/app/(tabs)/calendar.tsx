import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eyebrow } from "@/components/ui";
import { useRows, useWishes } from "@/data/queries";
import type { Restaurant, Wish } from "@/lib/types";
import { C, F } from "@/theme";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 칸 안 이름 칩 최대 글자 수 — 390px 폭·7열 격자에서 들어가는 값(웹 HANDOFF-calendar 실측). */
const MAX_CHIP_CHARS = 3;
const clipName = (name: string, max: number) => (name.length > max ? `${name.slice(0, max)}…` : name);
const monthOfKey = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return { year: y, month: m - 1 };
};

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(year, month, 1 - first.getDay());
  const end = new Date(year, month, last.getDate() + (6 - last.getDay()));
  const cells: Date[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
  return cells;
}

function groupBy<T extends { name: string }>(list: T[], key: (t: T) => string | null) {
  const map = new Map<string, T[]>();
  for (const r of list) {
    const k = key(r);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  for (const l of map.values()) l.sort((a, b) => (a.name < b.name ? -1 : 1));
  return map;
}

/** 월력 — 기록의 visited_at 을 날짜별로 모아 칸 안에 가게 이름 미리보기로 보여줍니다. */
export default function CalendarTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: allRows = [] } = useRows();
  const { data: wishes = [] } = useWishes();
  const rows = useMemo(() => allRows.filter((r) => !r.pending), [allRows]);
  const [showWishes, setShowWishes] = useState(true);
  const [cursorState, setCursorState] = useState<{ year: number; month: number } | null>(null);

  const maxVisitedAt = useMemo(() => rows.reduce<string | null>((m, r) => (r.visited_at && (!m || r.visited_at > m) ? r.visited_at : m), null), [rows]);
  const cursor = cursorState ?? monthOfKey(maxVisitedAt ?? keyOf(new Date()));

  const shift = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursorState({ year: d.getFullYear(), month: d.getMonth() });
  };

  const byDate = useMemo(() => groupBy<Restaurant>(rows, (r) => r.visited_at), [rows]);
  const byDateWish = useMemo(() => groupBy<Wish>(wishes, (w) => w.plan_date), [wishes]);
  const weeks = useMemo(() => {
    const cells = monthCells(cursor.year, cursor.month);
    const out: Date[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cursor]);

  const prefix = `${cursor.year}-${pad(cursor.month + 1)}`;
  const countThisMonth = rows.filter((r) => r.visited_at?.startsWith(prefix)).length;
  const todayKey = keyOf(new Date());

  return (
    <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 22 }}>
        <Eyebrow wide>CALENDAR</Eyebrow>
        <View style={s.titleRow}>
          <Text style={s.title}>{cursor.year}년 {cursor.month + 1}월</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable onPress={() => shift(-1)} accessibilityLabel="이전 달" style={s.round}><Text style={s.arrow}>‹</Text></Pressable>
            <Pressable onPress={() => { const d = new Date(); setCursorState({ year: d.getFullYear(), month: d.getMonth() }); }} style={s.today}>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>오늘</Text>
            </Pressable>
            <Pressable onPress={() => shift(1)} accessibilityLabel="다음 달" style={s.round}><Text style={s.arrow}>›</Text></Pressable>
          </View>
        </View>
        <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>이 달 기록 {countThisMonth}건</Text>
          <Pressable
            onPress={() => setShowWishes((v) => !v)}
            style={[s.toggle, showWishes && { borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: C.brickSoft }]}
          >
            {showWishes && <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: C.brick }} />}
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: showWishes ? C.brick : C.faint }}>{showWishes ? "예정 보임" : "예정 숨김"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 14, flexDirection: "row", paddingHorizontal: 12 }}>
        {WEEKDAYS.map((w) => <Text key={w} style={s.weekday}>{w}</Text>)}
      </View>

      <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 74 + insets.bottom + 12, gap: 4 }}>
        {weeks.map((week, i) => (
          <View key={i} style={{ flex: 1, flexDirection: "row", gap: 4 }}>
            {week.map((date) => {
              const key = keyOf(date);
              const inMonth = date.getMonth() === cursor.month;
              const visits = byDate.get(key) ?? [];
              const wishChips = showWishes ? (byDateWish.get(key) ?? []) : [];
              const shownVisits = visits.slice(0, 2);
              const shownWishes = wishChips.slice(0, Math.max(0, 2 - shownVisits.length));
              const extra = visits.length + wishChips.length - shownVisits.length - shownWishes.length;
              const isToday = key === todayKey;
              return (
                <Pressable
                  key={key}
                  disabled={!inMonth}
                  onPress={() => router.push({ pathname: "/day/[date]", params: { date: key } })}
                  accessibilityLabel={`${cursor.year}년 ${cursor.month + 1}월 ${date.getDate()}일, 기록 ${visits.length}건${wishChips.length ? ` · 예정 ${wishChips.length}건` : ""}`}
                  style={[
                    s.cell,
                    { borderWidth: isToday ? 1.5 : 1, borderColor: isToday ? C.brick : inMonth ? C.lineSoft : "transparent", backgroundColor: inMonth ? C.card : "transparent" },
                  ]}
                >
                  <Text style={{ paddingHorizontal: 4, fontFamily: isToday ? F.sansBd : F.mono, fontSize: 10.5, color: !inMonth ? "#d3cdc0" : isToday ? C.brick : C.ink }}>{date.getDate()}</Text>
                  {inMonth && (
                    <View style={{ marginTop: 4, gap: 2, overflow: "hidden" }}>
                      {shownVisits.map((v) => (
                        <Text key={v.id} numberOfLines={1} style={[s.chip, { backgroundColor: v.verified ? "#f2e0d5" : "#eae5da", color: v.verified ? "#a34d27" : C.muted }]}>{clipName(v.name, MAX_CHIP_CHARS)}</Text>
                      ))}
                      {shownWishes.map((w) => (
                        <Text key={w.id} numberOfLines={1} style={[s.chip, { backgroundColor: "#eee9de", color: C.faint }]}>○ {clipName(w.name, MAX_CHIP_CHARS)}</Text>
                      ))}
                      {extra > 0 && <Text style={{ paddingHorizontal: 4, fontFamily: F.mono, fontSize: 8.5, color: "#a29a8c" }}>+{extra}</Text>}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  titleRow: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: F.serif, fontSize: 22, color: C.ink },
  round: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  arrow: { fontSize: 15, color: C.ink },
  today: { height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 12, justifyContent: "center" },
  toggle: { minHeight: 30, borderRadius: 15, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6 },
  weekday: { flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: 10, color: C.faint },
  cell: { flex: 1, minWidth: 0, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 1, overflow: "hidden" },
  chip: { borderRadius: 5, paddingHorizontal: 1, paddingVertical: 2, fontFamily: F.sans, fontSize: 9, lineHeight: 12, overflow: "hidden" },
});
