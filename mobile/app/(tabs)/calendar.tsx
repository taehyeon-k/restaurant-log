/**
 * 월력 — 기록의 visited_at 을 날짜별로 모아 달력 칸 안에 가게 이름 미리보기로
 * 보여줍니다. 칸 전체가 버튼입니다 — 누르면 그 날짜의 하루 화면이 열립니다.
 * 웹 `CalendarScreen.tsx` 그대로입니다.
 */
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Eyebrow } from "@/components/ui";
import { useRestaurants, useWishes } from "@/lib/data";
import type { Restaurant, Wish } from "@/lib/types";
import { C, FONT, TAB_BAR_HEIGHT } from "@/lib/theme";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DD" — restaurants.visited_at 도 이 형식이라 문자열로 바로 비교합니다. */
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * 칸 안 이름 칩 최대 글자 수. 3자는 여유 있게 들어갑니다 — 이름이 잘려도 최소
 * 3자는 보이게 하려던 요구를 지킵니다.
 */
const MAX_CHIP_CHARS = 3;

const clipName = (name: string, max: number) => (name.length > max ? `${name.slice(0, max)}…` : name);

function monthOfKey(dateKey: string) {
  const [y, m] = dateKey.split("-").map(Number);
  return { year: y, month: m - 1 };
}

/** 그 달을 앞뒤로 채워 온전한 주 단위 격자를 만듭니다(일요일 시작). */
function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(year, month, 1 - first.getDay());
  const end = new Date(year, month, last.getDate() + (6 - last.getDay()));

  const cells: Date[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
  return cells;
}

function toWeeks(cells: Date[]) {
  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rows } = useRestaurants();
  const { wishes } = useWishes();

  const visibleRows = useMemo(() => rows.filter((r) => !r.pending), [rows]);

  const [showWishes, setShowWishes] = useState(true);
  const [cursorState, setCursorState] = useState<{ year: number; month: number } | null>(null);

  const maxVisitedAt = useMemo(() => {
    let max: string | null = null;
    for (const r of visibleRows) {
      if (r.visited_at && (!max || r.visited_at > max)) max = r.visited_at;
    }
    return max;
  }, [visibleRows]);

  /** 이번 달이 비어 있을 수 있으니, 처음에는 가장 최근 기록이 있는 달을 엽니다. */
  const defaultCursor = useMemo(() => monthOfKey(maxVisitedAt ?? keyOf(new Date())), [maxVisitedAt]);
  const cursor = cursorState ?? defaultCursor;

  const shiftMonth = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursorState({ year: d.getFullYear(), month: d.getMonth() });
  };

  const byDate = useMemo(() => {
    const map = new Map<string, Restaurant[]>();
    for (const r of visibleRows) {
      if (!r.visited_at) continue;
      const list = map.get(r.visited_at) ?? [];
      list.push(r);
      map.set(r.visited_at, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.name < b.name ? -1 : 1));
    return map;
  }, [visibleRows]);

  /** 날짜를 정한 위시만 — 날짜 없는 위시는 월력에 뜨지 않습니다. */
  const byDateWish = useMemo(() => {
    const map = new Map<string, Wish[]>();
    for (const w of wishes) {
      if (!w.plan_date) continue;
      const list = map.get(w.plan_date) ?? [];
      list.push(w);
      map.set(w.plan_date, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.name < b.name ? -1 : 1));
    return map;
  }, [wishes]);

  const weeks = useMemo(() => toWeeks(monthCells(cursor.year, cursor.month)), [cursor]);

  const monthPrefix = `${cursor.year}-${pad(cursor.month + 1)}`;
  const countThisMonth = visibleRows.filter((r) => r.visited_at?.startsWith(monthPrefix)).length;
  const todayKey = keyOf(new Date());

  return (
    <View style={{ flex: 1, backgroundColor: C.paper, paddingBottom: TAB_BAR_HEIGHT + insets.bottom }}>
      <View style={{ paddingHorizontal: 22, paddingTop: insets.top + 8 }}>
        <Eyebrow wide>CALENDAR</Eyebrow>

        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ fontFamily: FONT.serifBold, fontSize: 22, color: C.ink }}>
            {cursor.year}년 {cursor.month + 1}월
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <RoundButton label="‹" onPress={() => shiftMonth(-1)} accessibilityLabel="이전 달" />
            <Pressable
              onPress={() => {
                const d = new Date();
                setCursorState({ year: d.getFullYear(), month: d.getMonth() });
              }}
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: C.line,
                backgroundColor: C.card,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              <Text style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>오늘</Text>
            </Pressable>
            <RoundButton label="›" onPress={() => shiftMonth(1)} accessibilityLabel="다음 달" />
          </View>
        </View>

        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>이 달 기록 {countThisMonth}건</Text>
          <Pressable
            onPress={() => setShowWishes((v) => !v)}
            style={{
              minHeight: 30,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderRadius: 15,
              paddingHorizontal: 11,
              borderWidth: showWishes ? 1 : 0,
              borderColor: "#e0c3b1",
              backgroundColor: showWishes ? C.brickSoft : "transparent",
            }}
          >
            {showWishes && <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: C.brick }} />}
            <Text style={{ fontSize: 11, color: showWishes ? C.brick : C.faint, fontFamily: FONT.sans }}>
              {showWishes ? "예정 보임" : "예정 숨김"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 14, flexDirection: "row", paddingHorizontal: 12 }}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: "center", fontFamily: FONT.mono, fontSize: 10, color: C.faint }}>
            {w}
          </Text>
        ))}
      </View>

      <View style={{ flex: 1, gap: 4, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12 }}>
        {weeks.map((week, i) => (
          <View key={i} style={{ flex: 1, flexDirection: "row", gap: 4 }}>
            {week.map((date) => {
              const key = keyOf(date);
              const inMonth = date.getMonth() === cursor.month;
              const visits = byDate.get(key) ?? [];
              const wishChips = showWishes ? byDateWish.get(key) ?? [] : [];
              const shownVisits = visits.slice(0, 2);
              const shownWishes = wishChips.slice(0, Math.max(0, 2 - shownVisits.length));
              const extra = visits.length + wishChips.length - shownVisits.length - shownWishes.length;
              const isToday = key === todayKey;

              const cell = (
                <>
                  <Text
                    style={{
                      paddingHorizontal: 4,
                      fontFamily: FONT.mono,
                      fontSize: 10.5,
                      color: !inMonth ? "#d3cdc0" : isToday ? C.brick : C.ink,
                    }}
                  >
                    {date.getDate()}
                  </Text>

                  {inMonth && (shownVisits.length > 0 || shownWishes.length > 0) && (
                    <View style={{ marginTop: 4, flex: 1, gap: 2, overflow: "hidden" }}>
                      {shownVisits.map((v) => (
                        <View
                          key={v.id}
                          style={{
                            borderRadius: 5,
                            paddingHorizontal: 2,
                            paddingVertical: 2,
                            backgroundColor: v.verified ? "#f2e0d5" : "#eae5da",
                          }}
                        >
                          <Text numberOfLines={1} style={{ fontSize: 9, lineHeight: 12, color: v.verified ? "#a34d27" : C.muted, fontFamily: FONT.sans }}>
                            {clipName(v.name, MAX_CHIP_CHARS)}
                          </Text>
                        </View>
                      ))}
                      {shownWishes.map((w) => (
                        <View
                          key={w.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 3,
                            borderRadius: 5,
                            paddingHorizontal: 2,
                            paddingVertical: 2,
                            backgroundColor: "#eee9de",
                          }}
                        >
                          <View style={{ width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: C.brick }} />
                          <Text numberOfLines={1} style={{ flex: 1, fontSize: 9, lineHeight: 12, color: C.faint, fontFamily: FONT.sans }}>
                            {clipName(w.name, MAX_CHIP_CHARS)}
                          </Text>
                        </View>
                      ))}
                      {extra > 0 && (
                        <Text style={{ paddingHorizontal: 4, fontFamily: FONT.mono, fontSize: 8.5, color: C.dim }}>
                          +{extra}
                        </Text>
                      )}
                    </View>
                  )}
                </>
              );

              const style = {
                flex: 1,
                minWidth: 0,
                overflow: "hidden" as const,
                borderRadius: 12,
                paddingVertical: 5,
                paddingHorizontal: 1,
                borderWidth: isToday ? 1.5 : 1,
                borderColor: isToday ? C.brick : inMonth ? C.lineSoft : "transparent",
                backgroundColor: inMonth ? C.card : "transparent",
              };

              return inMonth ? (
                <Pressable
                  key={key}
                  onPress={() => router.push(`/day/${key}`)}
                  accessibilityLabel={`${cursor.year}년 ${cursor.month + 1}월 ${date.getDate()}일, 기록 ${visits.length}건${wishChips.length ? ` · 예정 ${wishChips.length}건` : ""}`}
                  style={style}
                >
                  {cell}
                </Pressable>
              ) : (
                <View key={key} style={style}>
                  {cell}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function RoundButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: C.line,
        backgroundColor: C.card,
      }}
    >
      <Text style={{ fontSize: 15, color: C.ink }}>{label}</Text>
    </Pressable>
  );
}
