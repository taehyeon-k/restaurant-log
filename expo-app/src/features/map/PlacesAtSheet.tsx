import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { BottomSheetModal, Button, Chip, Eyebrow } from "@/components/ui";
import { pinColor, type Restaurant, type Wish } from "@/lib/types";
import { C, F } from "@/theme";
import { RADII, recordsAt, wishAt, type BuildingData, type PlaceAt, type PlacesAtState, type Radius, type RadiusData } from "./usePlacesAt";

/** 층마다 처음에 보여 줄 가게 수 — 넘으면 「외 N곳 더 보기」. */
const FOLD = 3;

type Props = {
  state: PlacesAtState;
  rows: Restaurant[];
  wishes: Wish[];
  /** 시트 최대 높이 — 지도에서 누른 자리가 시트 위에 보이게 index 가 정합니다. */
  maxHeight: number;
  onClose: () => void;
  onRadius: (r: Radius) => void;
  onRetry: () => void;
  onPick: (place: PlaceAt, records: Restaurant[]) => void;
};

/** 지도 탭 → 그 건물(1b) 또는 둘레(1a)의 식당·카페. */
export default function PlacesAtSheet(p: Props) {
  const { state } = p;
  // 앱이 가진 최신 기록으로 셉니다(서버 값은 기록을 아직 못 불러왔을 때만).
  const info = (pl: PlaceAt) => {
    const recs = p.rows.length ? recordsAt(pl, p.rows) : [];
    return { recs, count: p.rows.length ? recs.length : pl.myRecordCount, wish: pl.isWish || wishAt(pl, p.wishes) };
  };

  return (
    <BottomSheetModal visible={state.status !== "idle"} onClose={p.onClose} dim={0.16}>
      <View style={{ maxHeight: p.maxHeight }}>
        {state.status === "loading" && <Skeleton radiusMode={state.radius != null} onClose={p.onClose} />}
        {state.status === "error" && (
          <>
            <Head eyebrow="이 자리" title="불러오지 못했어요" sub="연결이 느리거나 끊겼어요. 잠시 뒤 다시 해 보세요." onClose={p.onClose} />
            <Button label="다시 시도" onPress={p.onRetry} style={{ marginTop: 16 }} />
          </>
        )}
        {state.status === "done" && state.data.mode === "building" && (
          <BuildingView data={state.data} info={info} onPick={p.onPick} onClose={p.onClose} />
        )}
        {state.status === "done" && state.data.mode === "radius" && (
          <RadiusView data={state.data} info={info} onPick={p.onPick} onRadius={p.onRadius} onClose={p.onClose} />
        )}
      </View>
    </BottomSheetModal>
  );
}

type Info = (pl: PlaceAt) => { recs: Restaurant[]; count: number; wish: boolean };

/* ── 머리 ──────────────────────────────────── */

function Head({ eyebrow, title, sub, onClose }: { eyebrow: string; title: string; sub?: string; onClose: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow wide>{eyebrow}</Eyebrow>
        <Text numberOfLines={2} style={{ marginTop: 6, fontFamily: F.serif, fontSize: 21, lineHeight: 28, color: C.ink }}>{title}</Text>
        {!!sub && <Text numberOfLines={2} style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, lineHeight: 17, color: C.faint }}>{sub}</Text>}
      </View>
      <Pressable onPress={onClose} accessibilityLabel="닫기" hitSlop={8} style={{ width: 32, height: 32, marginTop: -4, marginRight: -6, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 15, color: C.faint }}>✕</Text>
      </Pressable>
    </View>
  );
}

/* ── 가게 줄 ───────────────────────────────── */

function PlaceRow({ place, info, num, distance, onPick, last }: {
  place: PlaceAt; info: Info; num?: number; distance?: number; onPick: Props["onPick"]; last: boolean;
}) {
  const { recs, count, wish } = info(place);
  const sub = count > 0 ? `${place.category} · 기록 ${count}건` : wish ? `${place.category} · 위시` : place.category;
  return (
    <Pressable
      onPress={() => onPick(place, recs)}
      accessibilityLabel={`${place.name}, ${sub}`}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: 11, minHeight: 56, paddingVertical: 9,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: C.lineSoft, opacity: pressed ? 0.6 : 1,
      })}
    >
      {num != null ? (
        <View style={{
          width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: count > 0 ? C.brick : C.brick,
          backgroundColor: count > 0 ? C.brick : C.card, alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: count > 0 ? C.card : C.brick }}>{num}</Text>
        </View>
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, marginHorizontal: 2, backgroundColor: pinColor(place.appCategory) }} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.sansBd, fontSize: 14, lineHeight: 19, color: C.ink }}>{place.name}</Text>
        <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11.5, lineHeight: 16, color: count > 0 || wish ? C.muted : C.faint }}>{sub}</Text>
        {count === 0 && num == null && (
          <Text style={{ marginTop: 3, fontFamily: F.sansMd, fontSize: 11.5, lineHeight: 16, color: C.brick }}>+ 여기에 기록 추가</Text>
        )}
      </View>
      {distance != null ? (
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint }}>{distance}m</Text>
      ) : count > 0 ? (
        <Text style={{ fontSize: 16, color: "#b9b2a5" }}>›</Text>
      ) : null}
    </Pressable>
  );
}

/* ── 1b 건물 ───────────────────────────────── */

function BuildingView({ data, info, onPick, onClose }: {
  data: BuildingData;
  info: Info; onPick: Props["onPick"]; onClose: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const total = data.floors.reduce((n, f) => n + f.places.length, 0);
  const road = data.building.roadAddr.replace(/^\S+\s/, "");
  return (
    <>
      <Head eyebrow="이 건물" title={data.building.name} sub={`${road} · 식당 ${total}곳`} onClose={onClose} />
      <ScrollView style={{ marginTop: 10, flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
        {data.floors.map((f) => {
          const expanded = open.has(f.floor) || f.places.length <= FOLD + 1;
          const shown = expanded ? f.places : f.places.slice(0, FOLD);
          return (
            <View key={f.floor} style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.5, color: C.ink }}>{f.floor}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: C.lineSoft }} />
                <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.5, color: C.faint }}>{f.places.length}곳</Text>
              </View>
              {shown.map((pl, i) => (
                <PlaceRow key={pl.id} place={pl} info={info} onPick={onPick} last={i === shown.length - 1 && expanded} />
              ))}
              {!expanded && (
                <Pressable
                  onPress={() => setOpen((s) => new Set(s).add(f.floor))}
                  style={{ paddingVertical: 10 }}
                  accessibilityLabel={`${f.floor} 외 ${f.places.length - FOLD}곳 더 보기`}
                >
                  <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>외 {f.places.length - FOLD}곳 더 보기 ⌄</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

/* ── 1a 둘레 ───────────────────────────────── */

function RadiusView({ data, info, onPick, onRadius, onClose }: {
  data: RadiusData;
  info: Info; onPick: Props["onPick"]; onRadius: (r: Radius) => void; onClose: () => void;
}) {
  const chips = (
    <View style={{ marginTop: 12, flexDirection: "row", gap: 7 }}>
      {RADII.map((r) => <Chip key={r} label={`${r}m`} active={data.radius === r} onPress={() => r !== data.radius && onRadius(r)} />)}
    </View>
  );
  if (!data.places.length) {
    return (
      <>
        <Head eyebrow="이 근처" title="이 자리엔 식당이 없어요" sub={[data.addr, `반경 ${data.radius}m`].filter(Boolean).join(" · ")} onClose={onClose} />
        {data.radius < 100 ? (
          <Button kind="line" label="반경 100m로 넓히기" onPress={() => onRadius(100)} style={{ marginTop: 16 }} />
        ) : (
          chips
        )}
      </>
    );
  }
  return (
    <>
      <Head eyebrow="이 근처" title={`식당 ${data.places.length}곳`} sub={[data.addr, `반경 ${data.radius}m`].filter(Boolean).join(" · ")} onClose={onClose} />
      {chips}
      <ScrollView style={{ marginTop: 8, flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false}>
        {data.places.map((pl, i) => (
          <PlaceRow key={pl.id} place={pl} info={info} num={i + 1} distance={pl.distanceM} onPick={onPick} last={i === data.places.length - 1} />
        ))}
      </ScrollView>
    </>
  );
}

/* ── 불러오는 중 ───────────────────────────── */

function Skeleton({ radiusMode, onClose }: { radiusMode: boolean; onClose: () => void }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const bar = (w: number | `${number}%`, h: number, mt = 0) => <View style={{ width: w, height: h, marginTop: mt, borderRadius: h / 2, backgroundColor: "#e6e0d3" }} />;
  const rows = useMemo(() => [0.62, 0.48, 0.55], []);
  return (
    <View accessibilityLabel="불러오는 중">
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Eyebrow wide>{radiusMode ? "이 근처" : "이 건물"}</Eyebrow>
          <Animated.View style={{ opacity: pulse }}>
            {bar("58%", 20, 9)}
            {bar("40%", 10, 9)}
          </Animated.View>
        </View>
        <Pressable onPress={onClose} accessibilityLabel="닫기" hitSlop={8} style={{ width: 32, height: 32, marginTop: -4, marginRight: -6, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 15, color: C.faint }}>✕</Text>
        </Pressable>
      </View>
      <Animated.View style={{ opacity: pulse, marginTop: 18 }}>
        {rows.map((w, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 11, minHeight: 56, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: C.lineSoft }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginHorizontal: 2, backgroundColor: "#e6e0d3" }} />
            <View style={{ flex: 1 }}>
              {bar(`${Math.round(w * 100)}%` as `${number}%`, 12)}
              {bar(`${Math.round(w * 60)}%` as `${number}%`, 9, 7)}
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
