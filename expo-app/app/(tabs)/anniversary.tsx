import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon } from "@/components/icons";
import { Eyebrow, PhotoBox } from "@/components/ui";
import { useActiveBook, useAnniversaryPicks } from "@/data/books";
import { useRows } from "@/data/queries";
import MealPickSheet from "@/features/couple/MealPickSheet";
import {
  anniversaryList, daysBetween, dayCount, dottedWithDay, mealFor, nextMilestone, todayIso, type Milestone,
} from "@/lib/anniversary";
import { coverPhoto, dottedDate, type Restaurant } from "@/lib/types";
import { C, F, TAB_BAR_H } from "@/theme";

/**
 * 기념일 탭(HANDOFF-couple §3-8, 시안 2d) — 연인 기록일 때 위시리스트 칸에 들어옵니다.
 * 다음 기념일 카드 + 지난 기념일 목록(날짜 내림차순). 기념일마다 그날 식사(기본 = 그날 기록)를 보여주고 바꿀 수 있습니다.
 */
export default function AnniversaryTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { book, isCouple, readOnly } = useActiveBook();
  const { data: allRows = [] } = useRows();
  const { data: picks = [] } = useAnniversaryPicks();
  const rows = useMemo(() => allRows.filter((r) => !r.pending), [allRows]);
  const [picking, setPicking] = useState<Milestone | null>(null);

  const startedOn = isCouple ? book?.startedOn ?? null : null;
  const today = todayIso();
  const list = useMemo(() => (startedOn ? anniversaryList(startedOn, today) : []), [startedOn, today]);

  if (!startedOn || !book) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top + 8, paddingHorizontal: 22 }}>
        <Eyebrow wide>ANNIVERSARY</Eyebrow>
        <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 24, color: C.ink }}>우리의 기념일</Text>
        <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 12.5, lineHeight: 20, color: C.faint }}>연인 기록장에서 볼 수 있어요. 지도 ≡ 메뉴에서 연인 기록을 골라 주세요.</Text>
      </View>
    );
  }

  const next = nextMilestone(startedOn, today);
  const left = daysBetween(today, next.date);

  const openRecord = (r: Restaurant) => router.push({ pathname: "/record/[id]", params: { id: String(r.id) } });

  const recordCard = (m: Milestone) => {
    const meal = mealFor(m, picks, rows);
    const future = m.date > today;
    if (future) {
      return (
        <View style={[emptyBox, { justifyContent: "center" }]}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>{left === 0 ? "오늘이에요" : `${left}일 뒤예요`}</Text>
        </View>
      );
    }
    if (meal.kind === "none" || meal.kind === "cleared") {
      return (
        <View style={emptyBox}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>{meal.kind === "cleared" ? "비워 둔 날이에요" : "그날 기록이 없어요"}</Text>
          {!readOnly && (
            <Pressable onPress={() => setPicking(m)} style={{ marginTop: 8, alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.brick }}>다른 기록 고르기</Text>
            </Pressable>
          )}
        </View>
      );
    }
    const r = meal.record;
    return (
      <View style={{ flex: 1 }}>
        <Pressable onPress={() => openRecord(r)} style={{ flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 10 }}>
          <PhotoBox src={coverPhoto(r)} category={r.category} size={52} radius={12} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{r.name}</Text>
            <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{[r.category, r.region].filter(Boolean).join(" · ")}</Text>
          </View>
        </Pressable>
        <View style={{ marginTop: 5, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: meal.kind === "picked" ? C.brick : C.faint }}>
            {meal.kind === "picked" ? `${dottedDate(r.visited_at).slice(5)} 기록 · 직접 고름` : "당일 기록"}
          </Text>
          {!readOnly && (
            <Pressable onPress={() => setPicking(m)} hitSlop={8}>
              <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>바꾸기</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 22, paddingBottom: TAB_BAR_H + insets.bottom + 28 }}>
        <Eyebrow wide>ANNIVERSARY</Eyebrow>
        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.serif, fontSize: 24, color: C.ink }}>우리의 기념일</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.brick }}>D+{dayCount(startedOn, today)}</Text>
        </View>
        <Text style={{ marginTop: 5, fontFamily: F.sans, fontSize: 12, color: C.faint }}>{dottedDate(startedOn)}부터</Text>

        {/* 다음 기념일 */}
        <View style={{ marginTop: 18, borderRadius: 22, backgroundColor: C.ink, padding: 18 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: "#c9c2b4" }}>다음 · {left === 0 ? "오늘" : `${left}일 남음`}</Text>
          <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 20, color: C.card }}>{next.label} · <Text style={{ fontFamily: F.mono, fontSize: 15 }}>{dottedWithDay(next.date)}</Text></Text>
          {!readOnly && (
            <Pressable
              onPress={() => router.push({ pathname: "/wish/new", params: { plan_date: next.date } })}
              style={{ marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, borderRadius: 19, backgroundColor: C.card, paddingHorizontal: 14 }}
            >
              <BookmarkIcon size={14} fill={C.brick} stroke={C.brick} />
              <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.ink }}>갈 곳 담기</Text>
            </Pressable>
          )}
        </View>

        <View style={{ marginTop: 22, gap: 16 }}>
          {list.map((m) => (
            <View key={m.key} style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ width: 54, paddingTop: 6 }}>
                <Text style={{ fontFamily: F.serif, fontSize: 14, color: m.date > today ? C.faint : C.ink }}>{m.label}</Text>
                <Text style={{ marginTop: 3, fontFamily: F.mono, fontSize: 9.5, color: C.faint }}>{m.date.slice(2).replaceAll("-", ".")}</Text>
              </View>
              {recordCard(m)}
            </View>
          ))}
        </View>
      </ScrollView>

      <MealPickSheet
        bookId={book.id}
        milestone={picking}
        meal={picking ? mealFor(picking, picks, rows) : null}
        rows={rows}
        onClose={() => setPicking(null)}
        onFindByDate={() => { setPicking(null); router.navigate("/calendar"); }}
      />
    </View>
  );
}

const emptyBox = {
  flex: 1, minHeight: 72, borderRadius: 18, borderWidth: 1, borderStyle: "dashed" as const, borderColor: "#cdc6b8", padding: 14,
};
