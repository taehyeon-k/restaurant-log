import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PaperMap } from "@/components/PaperMap";
import { useAppState } from "@/data/store";
import { report } from "@/features/community/api";
import { useMyTours, useTourDetail, useTourWeekly, type Tour, type TourPlace } from "@/features/recommend/api";
import { BackPill, HereMarker, KakaoLink, NumberMarker, REC, Stamp } from "@/features/recommend/ui";
import { metersBetweenLL } from "@/lib/geo";
import { formatDistance } from "@/lib/distance";
import { pctOf } from "@/lib/recommend";
import { C, F } from "@/theme";

const dotted = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};
/** 「2026.09 방영」 */
const airedOf = (d: string) => `${d.slice(0, 4)}.${d.slice(5, 7)} 방영`;

/**
 * 투어 상세(HANDOFF-recommend-all §8 · §9, 시안 5d · 5f) — 같은 주제 후보 10곳 중 아무 곳이나 need 곳 인증하면 완주.
 * 화제 투어(kind = trend)는 같은 틀에 「방송 뒤에도 다시 갈까」 카드와 「방송 전 방문」 태그를 더합니다.
 */
export default function TourDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { recHere: here } = useAppState();
  const { data: tours = [], isLoading } = useMyTours();
  const { data: places = [] } = useTourDetail(id);
  const t = tours.find((x) => x.id === id) ?? null;
  const trend = t?.kind === "trend";
  const { data: weekly = [] } = useTourWeekly(id, trend);
  const [mapOpen, setMapOpen] = useState(false);

  // 가까운 순 — 자리를 모르면 받은 순서 그대로.
  const sorted = useMemo(() => {
    const dist = (p: TourPlace) => (here && p.lat != null && p.lng != null ? Math.round(metersBetweenLL(here.lat, here.lng, p.lat, p.lng)) : null);
    return places.map((p) => ({ ...p, distance: dist(p) })).sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  }, [places, here]);

  if (!t) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top + 10, paddingHorizontal: 22 }}>
        <BackPill label="둘러보기" onPress={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {isLoading ? <ActivityIndicator color={C.brick} /> : <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>끝났거나 없는 투어예요.</Text>}
        </View>
      </View>
    );
  }

  const done = Math.min(t.done, t.need);
  const crowd = [t.finishers != null && `완주 ${t.finishers.toLocaleString()}명`, t.in_progress != null && `진행 중 ${t.in_progress.toLocaleString()}명`].filter(Boolean).join(" · ");
  const label = trend ? `TOUR · 화제${t.aired_at ? ` · ${airedOf(t.aired_at)}` : ""}` : `TOUR${t.region ? ` · ${t.region}` : ""}`;

  const flag = () =>
    Alert.alert("틀린 곳 알려 주기", "방송 출연 정보가 틀렸거나 문을 닫은 곳이 있나요?", [
      { text: "취소", style: "cancel" },
      { text: "알려 주기", onPress: () => report("tour", t.id, "투어 정보 오류").then(() => Alert.alert("고마워요", "살펴본 뒤 고칠게요.")).catch(() => {}) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 22, paddingBottom: 24 }}>
        <BackPill label="둘러보기" onPress={() => router.back()} />
        <Text style={{ marginTop: 18, fontFamily: F.mono, fontSize: 10, letterSpacing: 2.2, color: trend ? REC.trend : REC.label }}>{label}</Text>
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ flex: 1, fontFamily: F.serif, fontSize: 24, color: C.ink }}>{t.title}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 20, fontWeight: "700", color: C.brick }}>{done}/{t.need}</Text>
        </View>
        <Text style={{ marginTop: 6, fontFamily: F.sans, fontSize: 12.5, lineHeight: 19, color: C.muted }}>
          {t.region ? `${t.region} ` : ""}후보 {t.total}곳 중 아무 곳이나 {t.need}곳을 인증하면 완주예요.
        </Text>

        {/* 도장 */}
        <View style={{ marginTop: 16, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: t.need }, (_, k) => <Stamp key={k} done={k < done} n={k + 1} size={trend ? 38 : 46} />)}
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            {t.completed_at ? (
              <Text style={{ fontFamily: F.sansMd, fontSize: 12, color: C.brick }}>{t.mark_name ?? `${t.title} 완주`} ✓</Text>
            ) : null}
            {!!crowd && <Text style={{ marginTop: 2, fontFamily: F.mono, fontSize: 10.5, color: C.muted, textAlign: "right" }}>{crowd}</Text>}
          </View>
        </View>

        {trend && weekly.length > 0 && <AfterAir tour={t} weekly={weekly} />}

        {/* 후보 */}
        <Text style={{ marginTop: 22, fontFamily: F.serif, fontSize: 16, color: C.ink }}>후보 {t.total}곳</Text>
        <View style={{ marginTop: 6 }}>
          {sorted.map((p, i) => {
            const before = trend && t.aired_at && p.my_first_at && p.my_first_at.slice(0, 10) < t.aired_at;
            return (
              <View key={p.place} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: i < sorted.length - 1 ? 1 : 0, borderColor: C.lineSoft }}>
                <Text style={{ width: 18, fontFamily: F.mono, fontSize: 11, color: C.faint }}>{i + 1}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.serif, fontSize: 14.5, color: C.ink }}>{p.name}</Text>
                    {before && (
                      <View style={{ borderRadius: 6, backgroundColor: REC.ink, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: F.sansMd, fontSize: 9.5, color: REC.paper }}>방송 전 방문</Text>
                      </View>
                    )}
                  </View>
                  {!!p.place_url && <KakaoLink url={p.place_url} />}
                </View>
                {p.my_first_at ? (
                  <View style={{ borderRadius: 12, borderWidth: 1.2, borderStyle: "dashed", borderColor: C.brick, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.brick }}>✓ {dotted(p.my_first_at)}</Text>
                  </View>
                ) : (
                  <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>
                    {[p.distance != null && formatDistance(p.distance), p.revisit_rate != null && `재방문 ${pctOf(p.revisit_rate)}%`].filter(Boolean).join(" · ")}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        <Text style={{ marginTop: 16, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>
          {trend ? (
            <>
              방송 출연 정보는 외부 자료예요. 틀린 곳은{" "}
              <Text onPress={flag} style={{ color: C.brick, textDecorationLine: "underline" }}>알려 주세요</Text>. 후보 선정에 유료 입점은 받지 않습니다.
            </>
          ) : (
            `어느 ${t.need}곳을 갈지는 내가 고릅니다. 후보는 인증 데이터로만 고르고 유료 입점을 받지 않습니다.`
          )}
        </Text>
      </ScrollView>

      <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderColor: C.lineSoft }}>
        <Pressable onPress={() => setMapOpen(true)} style={{ height: 52, borderRadius: 18, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>후보 {t.total}곳 지도에서 보기</Text>
        </Pressable>
      </View>

      <TourMap visible={mapOpen} places={sorted} onClose={() => setMapOpen(false)} />
    </View>
  );
}

/** 방송 뒤에도 다시 갈까(§9) — 후보 합산 주간 인증 12주 막대(방송 전 회색 · 후 벽돌색) + 방송 직후 배수 · 지금 재방문율. */
function AfterAir({ tour, weekly }: { tour: Tour; weekly: { week_start: string; n: number }[] }) {
  const aired = tour.aired_at;
  const max = Math.max(1, ...weekly.map((w) => w.n));
  const airIdx = aired ? weekly.findIndex((w, i) => aired >= w.week_start && (i === weekly.length - 1 || aired < weekly[i + 1].week_start)) : -1;
  const before = airIdx > 0 ? weekly.slice(0, airIdx) : [];
  const avgBefore = before.length ? before.reduce((n, w) => n + w.n, 0) / before.length : 0;
  const right = airIdx >= 0 ? weekly[Math.min(airIdx + 1, weekly.length - 1)].n : 0;
  const lift = avgBefore > 0 && right > 0 ? (right / avgBefore).toFixed(1) : null;
  const H = 72;
  return (
    <View style={{ marginTop: 14, borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, padding: 16 }}>
      <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>방송 뒤에도 다시 갈까</Text>
      <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>후보 {tour.total}곳 합산 주간 인증 · 12주</Text>
      <View style={{ marginTop: 14, height: H + 16, flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
        {weekly.map((w, i) => (
          <View key={w.week_start} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: H + 16 }}>
            {i === airIdx && (
              <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: -2, borderLeftWidth: 1, borderStyle: "dashed", borderColor: C.ink }}>
                <Text style={{ position: "absolute", top: -2, left: 3, width: 30, fontFamily: F.sans, fontSize: 9, color: C.ink }}>방송</Text>
              </View>
            )}
            <View style={{ width: "100%", height: Math.max(2, (w.n / max) * H), borderRadius: 3, backgroundColor: airIdx >= 0 && i >= airIdx ? C.brick : REC.dot }} />
          </View>
        ))}
      </View>
      <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 18, color: C.ink }}>{lift ? `×${lift}` : "—"}</Text>
          <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>방송 직후 인증</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 18, color: C.brick }}>{tour.revisit_rate != null ? `${pctOf(tour.revisit_rate)}%` : "—"}</Text>
          <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>지금 재방문율</Text>
        </View>
      </View>
    </View>
  );
}

/** 후보를 번호 마커로 — 화면을 덮는 지도. */
function TourMap({ visible, places, onClose }: { visible: boolean; places: (TourPlace & { distance: number | null })[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { recHere: here } = useAppState();
  const pts = useMemo(() => places.filter((p) => p.lat != null && p.lng != null), [places]);
  const region = useMemo(() => {
    const all = [...pts.map((p) => [p.lat!, p.lng!]), ...(here ? [[here.lat, here.lng]] : [])];
    if (!all.length) return undefined;
    const lats = all.map((p) => p[0]), lngs = all.map((p) => p[1]);
    const padLat = Math.max(0.002, (Math.max(...lats) - Math.min(...lats)) * 0.2);
    const padLng = Math.max(0.002, (Math.max(...lngs) - Math.min(...lngs)) * 0.2);
    return { latitude: Math.min(...lats) - padLat, longitude: Math.min(...lngs) - padLng, latitudeDelta: Math.max(...lats) - Math.min(...lats) + padLat * 2, longitudeDelta: Math.max(...lngs) - Math.min(...lngs) + padLng * 2 };
  }, [pts, here]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: C.paper }}>
        <PaperMap initialRegion={region}>
          {here && <HereMarker lat={here.lat} lng={here.lng} />}
          {pts.map((p, i) => <NumberMarker key={p.place} lat={p.lat!} lng={p.lng!} n={i + 1} name={p.name} active={!!p.my_first_at} label />)}
        </PaperMap>
        <View style={{ position: "absolute", top: insets.top + 10, left: 22 }}>
          <BackPill label="투어" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
