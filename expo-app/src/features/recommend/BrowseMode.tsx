import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { clockOf, courseTitle, courseTotal, durationOf, fmtDistance, pctOf, recCategoryOf, statLine, walkMin, type Course, type PlaceStat } from "@/lib/recommend";
import { C, F } from "@/theme";
import type { Tour } from "./api";
import { REC, SectionHead, Stamp } from "./ui";

/**
 * 「둘러보기」(§6, 시안 5b) — 지금 당장이 아니라 나중에 갈 곳. 코스 · 투어 · 다시 가는 사람이 많은 곳.
 * 사진은 쓰지 않습니다. 셋 다 비었으면 빈 상태 한 장.
 */
export function BrowseMode({ courses, tours, revisits }: { courses: Course[]; tours: Tour[]; revisits: PlaceStat[] }) {
  const empty = !courses.length && !tours.length && !revisits.length;
  return (
    <View style={{ gap: 26 }}>
      {courses.length > 0 && <CourseCard courses={courses.slice(0, 3)} />}
      {tours.length > 0 && <Tours tours={tours} />}
      {revisits.length > 0 && (
        <View>
          <SectionHead title="다시 가는 사람이 많은 곳" right="재방문율순" />
          <View style={{ marginTop: 10, gap: 8 }}>
            {revisits.map((s) => (
              <View key={s.place} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, paddingVertical: 13, paddingHorizontal: 15 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{s.name}</Text>
                  <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>
                    {[recCategoryOf(s.category, s.name) ?? s.category, fmtDistance(s.distance_m)].filter(Boolean).join(" · ")}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 5, fontFamily: F.mono, fontSize: 10, color: C.muted }}>{statLine(s)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 19, color: C.brick }}>{pctOf(s.revisit_rate)}%</Text>
                  <Text style={{ fontFamily: F.sans, fontSize: 10, color: C.faint }}>재방문</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
      {empty && (
        <View style={{ borderRadius: 20, borderWidth: 1, borderStyle: "dashed", borderColor: "#cdc6b8", padding: 18 }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 20, color: C.faint }}>
            이 동네는 아직 인증 기록이 적어 보여 드릴 코스 · 투어가 없어요. 인증한 사람이 3명 넘는 곳부터 하나씩 채워져요.
          </Text>
        </View>
      )}
      <Text style={{ fontFamily: F.sans, fontSize: 11, lineHeight: 17, color: C.faint }}>
        추천 · 코스 · 투어 후보는 인증 데이터로만 고르고, 유료 입점을 받지 않습니다.
      </Text>
    </View>
  );
}

/** 지금 시작하는 코스(§6-1) — 검정 카드, 좌우로 3개. */
function CourseCard({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const c = courses[Math.min(i, courses.length - 1)];
  const cell = (time: string, kind: string | null, name: string) => (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, color: REC.sub }}>{[time, kind].filter(Boolean).join(" · ")}</Text>
      <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: F.sansMd, fontSize: 13.5, color: REC.paper }}>{name}</Text>
    </View>
  );
  return (
    <View style={{ borderRadius: 22, backgroundColor: REC.ink, padding: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.sansMd, fontSize: 11, color: REC.accent }}>지금 시작하는 코스</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Pressable onPress={() => setI((n) => Math.max(0, n - 1))} hitSlop={8} disabled={i === 0} accessibilityLabel="이전 코스" style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center", opacity: i === 0 ? 0.3 : 1 }}>
            <Text style={{ fontSize: 16, color: REC.paper }}>‹</Text>
          </Pressable>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: REC.sub }}>{i + 1} / {courses.length}</Text>
          <Pressable onPress={() => setI((n) => Math.min(courses.length - 1, n + 1))} hitSlop={8} disabled={i >= courses.length - 1} accessibilityLabel="다음 코스" style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center", opacity: i >= courses.length - 1 ? 0.3 : 1 }}>
            <Text style={{ fontSize: 16, color: REC.paper }}>›</Text>
          </Pressable>
        </View>
      </View>
      <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 19, color: REC.paper }}>{courseTitle(c)}</Text>
      <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
        {cell(clockOf(c.start_min), c.a_category, c.a_name)}
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: REC.accent }}>도보 {walkMin(c.walk_m)}분 →</Text>
        {cell(clockOf(c.start_min + c.gap_min), c.b_category, c.b_name)}
      </View>
      <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 11.5, color: REC.sub }}>
          이 순서로 인증한 사람 {c.users}명 · 총 {durationOf(courseTotal(c))}
        </Text>
        <Pressable onPress={() => router.push({ pathname: "/recommend/course/[id]", params: { id: c.id } })} accessibilityRole="button" style={{ height: 34, borderRadius: 17, backgroundColor: REC.paper, paddingHorizontal: 13, justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: REC.ink }}>코스 보기</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const tourTone = (t: Pick<Tour, "kind" | "done" | "need">) =>
  t.done > 0 && t.done < t.need
    ? { label: "진행 중", color: C.brick, border: C.brick, width: 1.5 }
    : t.kind === "trend"
      ? { label: "화제", color: REC.trend, border: C.lineSoft, width: 1 }
      : t.kind === "season"
        ? { label: "시즌", color: REC.season, border: C.lineSoft, width: 1 }
        : { label: "투어", color: C.brick, border: C.lineSoft, width: 1 };

/** 「2월까지」 */
const untilOf = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일까지`;

/** 투어 · 인증마크 모으기(§6-2) — 208px 카드 가로 스크롤. */
function Tours({ tours }: { tours: Tour[] }) {
  const router = useRouter();
  return (
    <View>
      <SectionHead title="투어 · 인증마크 모으기" right={`전체 ${tours.length}`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -22 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 10 }}>
        {tours.map((t) => {
          const tone = tourTone(t);
          const foot = t.kind === "trend" && t.revisit_rate != null
            ? `방송 후 재방문율 ${pctOf(t.revisit_rate)}%`
            : t.finishers != null ? `완주 ${t.finishers.toLocaleString()}명` : "완주자를 기다리는 중";
          return (
            <Pressable
              key={t.id}
              onPress={() => router.push({ pathname: "/recommend/tour/[id]", params: { id: t.id } })}
              style={{ width: 208, borderRadius: 20, borderWidth: tone.width, borderColor: tone.border, backgroundColor: C.card, padding: 15 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: F.sansMd, fontSize: 11, color: tone.color }}>
                  {tone.label}{t.kind === "season" && t.ends_at ? ` · ${untilOf(t.ends_at)}` : ""}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.brick }}>{Math.min(t.done, t.need)}/{t.need}</Text>
              </View>
              <Text numberOfLines={2} style={{ marginTop: 6, fontFamily: F.serif, fontSize: 15.5, color: C.ink }}>{t.title}</Text>
              <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11, color: C.faint }}>후보 {t.total}곳 중 {t.done}곳 인증</Text>
              <View style={{ marginTop: 10, flexDirection: "row", gap: 6 }}>
                {Array.from({ length: t.need }, (_, k) => <Stamp key={k} done={k < t.done} n={k + 1} size={30} />)}
              </View>
              <Text numberOfLines={1} style={{ marginTop: 10, fontFamily: F.mono, fontSize: 10, color: C.muted }}>{foot}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
