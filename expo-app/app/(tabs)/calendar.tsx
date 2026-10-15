import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eyebrow } from "@/components/ui";
import { useActiveBook, useAnniversaryPicks } from "@/data/books";
import { useAccount } from "@/data/profile";
import { useRows, useWishes } from "@/data/queries";
import AnniversaryBanner from "@/features/couple/AnniversaryBanner";
import RecapCard from "@/features/recap/RecapCard";
import RecapListSheet from "@/features/recap/RecapListSheet";
import { useRecapState, useRecaps } from "@/features/recap/useRecapState";
import { dayCount, milestoneOn } from "@/lib/anniversary";
import type { Restaurant, Wish } from "@/lib/types";
import { C, F } from "@/theme";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 칸 안 이름 칩 최대 글자 수 — 390px 폭·7열 격자에서 들어가는 값(웹 HANDOFF-calendar 실측). */
const MAX_CHIP_CHARS = 3;
const clipName = (name: string, max: number) => (name.length > max ? `${name.slice(0, max)}…` : name);
/** 연도 다이얼 범위(HANDOFF-calendar-nav §3) */
const YEARS = Array.from({ length: 16 }, (_, i) => 2020 + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i);
const ROW = 40;
const monthOfKey = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return { year: y, month: m - 1 };
};

/** 달력 칸 — 달마다 칸 크기가 같도록 언제나 6주(42칸)를 채웁니다. 남는 앞뒤 칸은 이웃 달 날짜(흐리게). */
function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(year, month, 1 - first.getDay() + i));
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

/**
 * 연·월 다이얼 — 굴리는 동안은 가운데 강조만 바뀌고, 항목을 눌러야 onPick 으로 적용됩니다.
 * 처음부터 contentOffset 으로 현재 값을 가운데에 둡니다.
 */
function Dial({ labels, index, onPick }: { labels: string[]; index: number; onPick: (i: number) => void }) {
  const [center, setCenter] = useState(index);
  return (
    <View style={{ height: ROW * 5, borderRadius: 15, overflow: "hidden" }}>
      <View pointerEvents="none" style={{ position: "absolute", top: ROW * 2, height: ROW, left: 6, right: 6, borderRadius: 10, backgroundColor: C.brickSoft }} />
      <ScrollView
        contentOffset={{ x: 0, y: index * ROW }}
        contentContainerStyle={{ paddingVertical: ROW * 2 }}
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => setCenter(Math.max(0, Math.min(labels.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW))))}
      >
        {labels.map((label, i) => (
          <Pressable key={label} onPress={() => onPick(i)} style={{ height: ROW, alignItems: "center", justifyContent: "center" }}>
            <Text style={i === center
              ? { fontFamily: F.serif, fontSize: 18, fontWeight: "700", color: C.brick }
              : { fontFamily: F.serif, fontSize: 15, color: C.faint }}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
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
  const { data: account } = useAccount();
  const recaps = useRecaps();
  const recapState = useRecapState();
  const [recapList, setRecapList] = useState(false);
  // 연인 기록(HANDOFF-couple §3-10) — 머리 「CALENDAR · 우리」 + D+N, 기념일 배너·칸 강조. 리캡은 개인 기록에만.
  const { book, isCouple } = useActiveBook();
  const { data: picks = [] } = useAnniversaryPicks();
  const startedOn = isCouple ? book?.startedOn ?? null : null;
  const openRecap = (quarter: string) => router.push({ pathname: "/recap/[quarter]", params: { quarter } });

  const maxVisitedAt = useMemo(() => rows.reduce<string | null>((m, r) => (r.visited_at && (!m || r.visited_at > m) ? r.visited_at : m), null), [rows]);
  const cursor = cursorState ?? monthOfKey(maxVisitedAt ?? keyOf(new Date()));

  const shift = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursorState({ year: d.getFullYear(), month: d.getMonth() });
  };

  // 격자를 좌우로 밀면 달 이동(HANDOFF-calendar-nav §2). 스와이프로 잡힌 터치는 칸 onPress 가 나지 않습니다.
  // 격자는 손가락을 따라오고, 넘기면 짧게 밀려 사라진 뒤 다음 달이 반대쪽에서 살짝 들어옵니다 — 어지럽지 않게 이동 폭은 작게.
  const shiftRef = useRef(shift);
  shiftRef.current = shift;
  const tx = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const pan = useMemo(() => {
    const horizontal = (g: { dx: number; dy: number }) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy);
    const back = () => Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => horizontal(g),
      onMoveShouldSetPanResponderCapture: (_, g) => horizontal(g),
      onPanResponderMove: (_, g) => tx.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (!(Math.abs(g.dx) > 40 && Math.abs(g.dx) > Math.abs(g.dy))) return back();
        const sign = g.dx < 0 ? -1 : 1; // 손가락이 간 쪽
        const ease = Easing.out(Easing.cubic);
        Animated.parallel([
          Animated.timing(tx, { toValue: sign * (Math.abs(g.dx) + 40), duration: 110, easing: ease, useNativeDriver: true }),
          Animated.timing(fade, { toValue: 0, duration: 110, useNativeDriver: true }),
        ]).start(() => {
          shiftRef.current(-sign);
          tx.setValue(-sign * 36);
          Animated.parallel([
            Animated.timing(tx, { toValue: 0, duration: 200, easing: ease, useNativeDriver: true }),
            Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]).start();
        });
      },
      onPanResponderTerminate: back,
    });
  }, [tx, fade]);

  // 연·월 다이얼(§3) — 누른 글자 바로 아래에 펼칩니다. 위치는 글자를 창 기준으로 재서 맞춥니다.
  const yearRef = useRef<View>(null);
  const monthRef = useRef<View>(null);
  const [picker, setPicker] = useState<null | { kind: "year" | "month"; x: number; y: number }>(null);
  const openPicker = (kind: "year" | "month") =>
    (kind === "year" ? yearRef : monthRef).current?.measureInWindow((x, y, _w, h) => setPicker({ kind, x, y: y + h + 2 }));

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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Eyebrow wide>{isCouple ? "CALENDAR · 우리" : "CALENDAR"}</Eyebrow>
          {startedOn && <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: C.brick }}>D+{dayCount(startedOn)}</Text>}
        </View>
        <View style={s.titleRow}>
          <Pressable ref={yearRef} onPress={() => openPicker("year")} hitSlop={8} accessibilityHint="연도를 고르는 다이얼이 열립니다">
            <Text style={s.title}>{cursor.year}년</Text>
          </Pressable>
          <Pressable ref={monthRef} onPress={() => openPicker("month")} hitSlop={8} accessibilityHint="월을 고르는 다이얼이 열립니다">
            <Text style={s.title}>{cursor.month + 1}월</Text>
          </Pressable>
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

      {/* 연인 기록이면 리캡 자리에 기념일 배너(HANDOFF-recommend §3-2). */}
      {startedOn && <AnniversaryBanner startedOn={startedOn} picks={picks} rows={rows} />}

      {!isCouple && recaps.latest && (
        <RecapCard
          summary={recaps.latest}
          nick={account?.nickname?.trim() || "나"}
          unseen={recapState.loaded && !recapState.seen(recaps.latest.quarter)}
          onOpen={() => openRecap(recaps.latest!.quarter)}
          onList={() => setRecapList(true)}
        />
      )}

      <View style={{ marginTop: 14, flexDirection: "row", paddingHorizontal: 12 }}>
        {WEEKDAYS.map((w) => <Text key={w} style={s.weekday}>{w}</Text>)}
      </View>

      <Animated.View {...pan.panHandlers} style={{ flex: 1, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 74 + insets.bottom + 12, gap: 4, opacity: fade, transform: [{ translateX: tx }] }}>
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
              const milestone = inMonth && startedOn ? milestoneOn(startedOn, key) : null;
              return (
                <Pressable
                  key={key}
                  disabled={!inMonth}
                  onPress={() => router.push({ pathname: "/day/[date]", params: { date: key } })}
                  accessibilityLabel={`${cursor.year}년 ${cursor.month + 1}월 ${date.getDate()}일, 기록 ${visits.length}건${wishChips.length ? ` · 예정 ${wishChips.length}건` : ""}`}
                  style={[
                    s.cell,
                    { borderWidth: isToday ? 1.5 : 1, borderColor: isToday ? C.brick : inMonth ? C.lineSoft : "transparent", backgroundColor: inMonth ? C.card : "transparent" },
                    milestone && { backgroundColor: C.brick, borderColor: isToday ? C.ink : C.brick },
                  ]}
                >
                  {milestone ? (
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2, paddingHorizontal: 4 }}>
                      <Text style={{ fontFamily: F.sansBd, fontSize: 10.5, color: C.card }}>{date.getDate()}</Text>
                      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: 8, color: C.card }}>{milestone.label}</Text>
                    </View>
                  ) : (
                    <Text style={{ paddingHorizontal: 4, fontFamily: isToday ? F.sansBd : F.mono, fontSize: 10.5, color: !inMonth ? "#d3cdc0" : isToday ? C.brick : C.ink }}>{date.getDate()}</Text>
                  )}
                  {inMonth && (
                    <View style={{ marginTop: 4, gap: 2, overflow: "hidden" }}>
                      {shownVisits.map((v) => (
                        <Text key={v.id} numberOfLines={1} style={[s.chip, milestone ? { backgroundColor: C.card, color: "#a34d27" } : { backgroundColor: v.verified ? "#f2e0d5" : "#eae5da", color: v.verified ? "#a34d27" : C.muted }]}>{clipName(v.name, MAX_CHIP_CHARS)}</Text>
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
      </Animated.View>

      <Modal visible={!!picker} transparent animationType="none" onRequestClose={() => setPicker(null)} statusBarTranslucent>
        <Pressable onPress={() => setPicker(null)} style={{ flex: 1 }}>
          {picker && (
            <Pressable onPress={() => {}} style={[s.popover, { left: picker.x, top: picker.y, width: picker.kind === "year" ? 104 : 84 }]}>
              {picker.kind === "year" ? (
                <Dial
                  labels={YEARS.map((y) => `${y}년`)}
                  index={Math.max(0, YEARS.indexOf(cursor.year))}
                  onPick={(i) => { setCursorState({ year: YEARS[i], month: cursor.month }); setPicker(null); }}
                />
              ) : (
                <Dial
                  labels={MONTHS.map((m) => `${m + 1}월`)}
                  index={cursor.month}
                  onPick={(i) => { setCursorState({ year: cursor.year, month: i }); setPicker(null); }}
                />
              )}
            </Pressable>
          )}
        </Pressable>
      </Modal>

      <RecapListSheet
        visible={recapList}
        list={recaps.list}
        seen={recapState.seen}
        onClose={() => setRecapList(false)}
        onPick={(q) => { setRecapList(false); openRecap(q); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  titleRow: { marginTop: 8, flexDirection: "row", alignItems: "baseline", gap: 6 },
  title: { fontFamily: F.serif, fontSize: 22, color: C.ink },
  popover: {
    position: "absolute", borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    ...Platform.select({ ios: { shadowColor: C.ink, shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 12 } }, default: { elevation: 8 } }),
  },
  toggle: { minHeight: 30, borderRadius: 15, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6 },
  weekday: { flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: 10, color: C.faint },
  cell: { flex: 1, minWidth: 0, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 1, overflow: "hidden" },
  chip: { borderRadius: 5, paddingHorizontal: 1, paddingVertical: 2, fontFamily: F.sans, fontSize: 9, lineHeight: 12, overflow: "hidden" },
});
