import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { RingsIcon } from "@/components/icons";
import { daysBetween, mealFor, milestonesUntil, nextMilestone, todayIso, type AnniversaryPick } from "@/lib/anniversary";
import type { Restaurant } from "@/lib/types";
import { F } from "@/theme";

/**
 * 캘린더 위 기념일 배너(HANDOFF-recommend §3-2, 시안 4a) — 연인 기록일 때 RecapCard 자리.
 * 「다음 500일 D-88 / 지난 400일 · 10월 2일 · 스시 하루」, 누르면 기념일 화면.
 * rows 는 같은 기록장의 보이는 기록(보관함 제외)이어야 합니다.
 */
export default function AnniversaryBanner({ startedOn, picks, rows }: { startedOn: string; picks: AnniversaryPick[]; rows: Restaurant[] }) {
  const router = useRouter();
  const today = todayIso();
  const next = nextMilestone(startedOn, today);
  const left = daysBetween(today, next.date);
  const last = milestonesUntil(startedOn, today).filter((m) => m.date < today).at(-1) ?? null;
  const meal = last ? mealFor(last, picks, rows) : null;
  const place = meal && (meal.kind === "picked" || meal.kind === "day") ? meal.record.name : null;
  const pastLine = last
    ? [`지난 ${last.label}`, `${Number(last.date.slice(5, 7))}월 ${Number(last.date.slice(8))}일`, place].filter(Boolean).join(" · ")
    : null;

  return (
    <Pressable
      onPress={() => router.push("/anniversary")}
      accessibilityRole="button"
      accessibilityLabel={`다음 ${next.label}, ${left === 0 ? "오늘" : `${left}일 남음`}. 기념일 보기`}
      style={{
        marginTop: 10, marginHorizontal: 22, minHeight: 52, borderRadius: 16, backgroundColor: "#1c1a17",
        paddingTop: 10, paddingRight: 12, paddingBottom: 10, paddingLeft: 14, flexDirection: "row", alignItems: "center", gap: 12,
      }}
    >
      <View style={{ width: 26, height: 24, alignItems: "center", justifyContent: "center" }}>
        <RingsIcon size={26} stroke="#e08a63" strokeWidth={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Text style={{ fontFamily: F.serif, fontSize: 14.5, color: "#fbfaf6" }}>다음 {next.label}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: "#e08a63" }}>{left === 0 ? "D-DAY" : `D-${left}`}</Text>
        </View>
        {pastLine && <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: F.sans, fontSize: 10.5, color: "#c9c2b4" }}>{pastLine}</Text>}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Text style={{ fontFamily: F.sans, fontSize: 11, color: "#c9c2b4" }}>기념일</Text>
        <Text style={{ fontSize: 16, color: "#fbfaf6" }}>›</Text>
      </View>
    </Pressable>
  );
}
