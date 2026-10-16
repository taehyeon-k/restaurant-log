import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";
import { setState, useAppState } from "@/data/store";
import { todayIso } from "@/lib/anniversary";
import { metersBetweenLL, norm } from "@/lib/geo";
import { formatDistance } from "@/lib/distance";
import { recCategoryOf } from "@/lib/recommend";
import type { Restaurant } from "@/lib/types";
import { C, F } from "@/theme";
import { useMyTours, useNextAfter, useToursAt } from "./api";
import { REC } from "./ui";

/**
 * 촬영 직후(HANDOFF-recommend-all §10, 시안 5e) — 인증 완료 카드 아래.
 *   · 따라가던 코스가 이번 인증으로 끝났으면 검정 띠 「2/2 코스 완주」
 *   · 투어 후보 가게면 「○○ 투어 3/3 완주」
 *   · 여기서 인증한 사람들이 2시간 안에 이어서 인증한 곳 — 「코스 잇기」
 * 방금 찍은 사진은 내 기록장에만 남고, 추천에는 시각 · 위치만 쓰입니다.
 */
export function AfterCapture({ placeKey, name, lat, lng, rows }: { placeKey: string; name: string; lat: number | null; lng: number | null; rows: Restaurant[] }) {
  const { recCourse } = useAppState();
  const today = todayIso();
  const { data: next = [] } = useNextAfter(placeKey);
  const { data: tourIds = [] } = useToursAt(placeKey);
  const { data: tours = [] } = useMyTours();

  // 오늘 인증한 가게(이번 것 포함) — 코스 진행을 셉니다.
  const verifiedToday = new Set([
    placeKey,
    ...rows.filter((r) => r.verified_at && r.visited_at === today).map((r) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase()),
  ]);
  const course = recCourse?.date === today && recCourse.places.some((p) => p.placeKey === placeKey) ? recCourse : null;
  const courseDone = course ? course.places.filter((p) => verifiedToday.has(p.placeKey)).length : 0;

  // 투어 — 서버 done 은 이번 기록이 올라가기 전 값일 수 있어, 처음 가는 곳이면 하나 더 셉니다.
  const firstHere = !rows.some((r) => r.verified_at && (r.place_key ?? "") === placeKey && r.visited_at !== today);
  const tour = tours.find((t) => tourIds.includes(t.id));
  const tourDone = tour ? Math.min(tour.need, tour.done + (firstHere && !tour.completed_at ? 1 : 0)) : 0;

  const chain = (p: (typeof next)[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const base = course?.places ?? [{ placeKey, name }];
    setState({
      recHeading: { placeKey: p.place, name: p.name, lat: p.lat, lng: p.lng, at: Date.now() },
      recCourse: { id: course?.id ?? `today:${today}`, date: today, places: [...base.filter((x) => x.placeKey !== p.place), { placeKey: p.place, name: p.name }] },
    });
  };
  const chained = (place: string) => !!recCourse && recCourse.date === today && recCourse.places.some((x) => x.placeKey === place);

  if (!course && !tour && !next.length) return null;

  const strip = (text: string) => (
    <View style={{ marginTop: 12, borderRadius: 14, backgroundColor: REC.ink, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: REC.paper }}>{text}</Text>
    </View>
  );

  return (
    <View>
      {course && course.places.length > 1 && strip(
        courseDone >= course.places.length
          ? `${courseDone}/${course.places.length} 코스 완주 · 오늘 기록이 「그날의 코스」로 묶였어요`
          : `코스 ${courseDone}/${course.places.length} · 다음은 ${course.places.find((p) => !verifiedToday.has(p.placeKey))?.name ?? ""}`
      )}
      {tour && strip(tourDone >= tour.need ? `${tour.title} ${tour.need}/${tour.need} 완주` : `${tour.title} ${tourDone}/${tour.need}`)}

      {next.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>여기서 인증한 사람들이 다음에 간 곳</Text>
          <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{name} 인증 후 2시간 안에 이어서 인증한 기록</Text>
          <View style={{ marginTop: 8 }}>
            {next.map((p, i) => {
              const d = lat != null && lng != null ? metersBetweenLL(lat, lng, p.lat, p.lng) : null;
              const on = chained(p.place) || norm(p.name) === norm(name);
              return (
                <View key={p.place} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: i < next.length - 1 ? 1 : 0, borderColor: C.lineSoft }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>
                      {p.name}
                      <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{`  ${recCategoryOf(p.category, p.name) ?? p.category ?? ""}`}</Text>
                    </Text>
                    <Text style={{ marginTop: 2, fontFamily: F.mono, fontSize: 10, color: C.muted }}>
                      {[d != null && formatDistance(d), `이어서 간 사람 ${p.users}명`].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => chain(p)}
                    disabled={on}
                    accessibilityRole="button"
                    style={{ height: 32, borderRadius: 16, borderWidth: 1, borderColor: REC.chipLine, paddingHorizontal: 12, justifyContent: "center", opacity: on ? 0.5 : 1 }}
                  >
                    <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.brick }}>{on ? "잇는 중" : "코스 잇기"}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
