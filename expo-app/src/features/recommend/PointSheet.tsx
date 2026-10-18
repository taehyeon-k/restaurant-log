import { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { LocateIcon, SearchIcon } from "@/components/icons";
import { BottomSheetModal } from "@/components/ui";
import { Wheel, WheelRow } from "@/components/Wheel";
import type { RecHere } from "@/data/store";
import { forwardGeocode, type Place } from "@/lib/geocode";
import { areaOf } from "@/lib/recommend";
import { C, F } from "@/theme";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, h) => pad(h));
const MINUTES = Array.from({ length: 6 }, (_, i) => pad(i * 10));
/** 오늘부터 7일 — 시간대 인증은 요일로 셉니다. */
const weekFrom = (base: Date) =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return d;
  });
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * 추천 기준 고르기 — 머리의 「성수동2가 · 토 15:02」를 누르면 열립니다.
 * 자리: 지금 위치 또는 동네 · 역 검색. 시각: 날짜(오늘부터 7일) · 시 · 분(10분 단위) 다이얼. 「지금으로」는 둘 다 지금으로 되돌립니다.
 * place / at 이 null 이면 지금 위치 · 지금 시각입니다.
 */
export function PointSheet({
  visible, gps, place, at, onClose, onApply,
}: {
  visible: boolean; gps: RecHere | null; place: RecHere | null; at: number | null;
  onClose: () => void; onApply: (place: RecHere | null, at: number | null) => void;
}) {
  const [draftPlace, setDraftPlace] = useState<RecHere | null>(place);
  const [draftAt, setDraftAt] = useState<number | null>(at);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraftPlace(place); setDraftAt(at); setQ(""); setHits([]);
  }, [visible, place, at]);

  // 동네 · 역 이름 검색 — 250ms 쉬면 찾습니다.
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      const found = await forwardGeocode(needle, ctrl.signal).catch(() => []);
      if (!ctrl.signal.aborted) { setHits(found.slice(0, 5)); setSearching(false); }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const now = new Date();
  const when = draftAt ? new Date(draftAt) : now;
  const days = weekFrom(now);
  const dayIdx = Math.max(0, days.findIndex((d) => sameDay(d, when)));
  const hour = when.getHours();
  const minIdx = Math.floor(when.getMinutes() / 10);
  const pick = (di: number, h: number, mi: number) => {
    const next = new Date(days[di]);
    next.setHours(h, mi * 10, 0, 0);
    setDraftAt(next.getTime());
  };
  const nameOf = (p: Place) => p.name || areaOf(p.address, p.region) || p.address;

  return (
    <BottomSheetModal visible={visible} onClose={onClose} dim={0.38}>
      <ScrollView style={{ maxHeight: Dimensions.get("window").height * 0.72 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink }}>언제 · 어디서 드세요?</Text>
        <Pressable onPress={() => { setDraftPlace(null); setDraftAt(null); }} hitSlop={10} accessibilityRole="button">
          <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>지금으로</Text>
        </Pressable>
      </View>

      {/* 자리 */}
      <Text style={{ marginTop: 18, fontFamily: F.sansBd, fontSize: 14, color: C.ink }}>어디서</Text>
      <Pressable
        onPress={() => setDraftPlace(null)}
        disabled={!gps}
        accessibilityState={{ selected: !draftPlace }}
        style={{ marginTop: 10, minHeight: 52, borderRadius: 16, borderWidth: !draftPlace ? 1.5 : 1, borderColor: !draftPlace ? C.brick : C.lineSoft, backgroundColor: !draftPlace ? C.brickSoft : C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, opacity: gps ? 1 : 0.5 }}
      >
        <LocateIcon size={18} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{gps?.fallback ? "자주 기록한 동네" : "지금 있는 곳"}</Text>
          <Text style={{ marginTop: 1, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{gps?.name ?? "위치를 찾는 중"}</Text>
        </View>
      </Pressable>
      {draftPlace && (
        <View style={{ marginTop: 8, minHeight: 52, borderRadius: 16, borderWidth: 1.5, borderColor: C.brick, backgroundColor: C.brickSoft, paddingHorizontal: 14, justifyContent: "center" }}>
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{draftPlace.name}</Text>
          <Text style={{ marginTop: 1, fontFamily: F.sans, fontSize: 11, color: C.faint }}>고른 곳</Text>
        </View>
      )}
      <View style={{ marginTop: 8, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <SearchIcon />
        <TextInput
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          placeholder="동네 · 역 이름으로 다른 곳 찾기"
          placeholderTextColor={C.faint}
          style={{ flex: 1, fontFamily: F.sans, fontSize: 13, color: C.ink, paddingVertical: 8 }}
        />
        {searching && <ActivityIndicator size="small" color={C.faint} />}
      </View>
      {hits.map((p, i) => (
        <Pressable
          key={`${p.lat},${p.lng},${i}`}
          onPress={() => { setDraftPlace({ lat: p.lat, lng: p.lng, name: nameOf(p), fallback: false }); setQ(""); setHits([]); }}
          style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6, borderBottomWidth: i < hits.length - 1 ? 1 : 0, borderColor: C.lineSoft }}
        >
          <Text numberOfLines={1} style={{ fontFamily: F.sansMd, fontSize: 13, color: C.ink }}>{nameOf(p)}</Text>
          {!!p.address && p.address !== nameOf(p) && <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{p.address}</Text>}
        </Pressable>
      ))}

      {/* 시각 */}
      <View style={{ marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.sansBd, fontSize: 14, color: C.ink }}>언제</Text>
        {draftAt ? (
          <Pressable onPress={() => setDraftAt(null)} hitSlop={10} accessibilityRole="button">
            <Text style={{ fontFamily: F.sansMd, fontSize: 12.5, color: C.brick }}>지금 시각으로</Text>
          </Pressable>
        ) : (
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>지금 · {pad(now.getHours())}:{pad(now.getMinutes())}</Text>
        )}
      </View>
      <View style={{ marginTop: 6 }}>
        <WheelRow>
          <Wheel
            label="날짜"
            items={days.map((d, i) => (i === 0 ? "오늘" : i === 1 ? "내일" : `${DAYS[d.getDay()]} ${d.getMonth() + 1}.${d.getDate()}`))}
            index={dayIdx}
            onChange={(i) => pick(i, hour, minIdx)}
          />
          <Wheel label="시" mono width={64} items={HOURS} index={hour} onChange={(h) => pick(dayIdx, h, minIdx)} />
          <Text style={{ fontFamily: F.mono, fontSize: 16, color: C.ink }}>:</Text>
          <Wheel label="분" mono width={64} items={MINUTES} index={minIdx} onChange={(mi) => pick(dayIdx, hour, mi)} />
        </WheelRow>
      </View>
      <Text style={{ marginTop: 8, fontFamily: F.sans, fontSize: 11, color: C.faint }}>그 요일 · 시각 앞뒤 1시간에 인증된 곳으로 골라요.</Text>
      </ScrollView>

      <Pressable
        onPress={() => onApply(draftPlace, draftAt)}
        style={{ marginTop: 20, height: 52, borderRadius: 18, backgroundColor: C.brick, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontFamily: F.sansMd, fontSize: 14, color: C.card }}>이 기준으로 추천 받기</Text>
      </Pressable>
    </BottomSheetModal>
  );
}
