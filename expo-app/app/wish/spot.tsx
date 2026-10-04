import type { NaverMapViewRef } from "@mj-studio/react-native-naver-map";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookmarkIcon } from "@/components/icons";
import { PaperMap } from "@/components/PaperMap";
import PlaceSearch from "@/features/map/PlaceSearch";
import { setState } from "@/data/store";
import { C, F, SHADOW } from "@/theme";

/**
 * 전체 화면 지도로 위시의 자리를 고릅니다 — 지도를 움직여 가운데 책갈피에 맞추거나,
 * 위 검색줄에서 이름으로 바로 찾아갑니다. 지도 중심 좌표를 그대로 읽습니다.
 */
export default function SpotPicker() {
  const p = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const initial = p.lat && p.lng ? { lat: Number(p.lat), lng: Number(p.lng) } : null;
  const mapRef = useRef<NaverMapViewRef>(null);
  const center = useRef(initial ?? { lat: 37.5665, lng: 126.978 });
  /** 검색으로 옮겨간 자리 정보 — 사람이 손으로 지도를 다시 끌면 지웁니다. */
  const found = useRef<{ name: string; address: string } | null>(null);
  const [q, setQ] = useState("");
  // 아래 안내 카드가 네이버 로고(왼쪽 아래)를 가리지 않게, 카드 높이만큼 로고를 올립니다.
  const [hintH, setHintH] = useState(70);

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 14, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable onPress={() => router.back()} style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: "center" }}><Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>취소</Text></Pressable>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.6, color: C.faint }}>PICK A SPOT</Text>
        <Pressable
          onPress={() => { setState({ spotPick: { lat: center.current.lat, lng: center.current.lng, found: found.current ?? undefined } }); router.back(); }}
          style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: "center" }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 13, color: C.brick }}>이 자리</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <PaperMap
          ref={mapRef}
          initialCamera={{ latitude: center.current.lat, longitude: center.current.lng, zoom: initial ? 16 : 13 }}
          onCameraChanged={(e) => { if (e.reason === "Gesture") found.current = null; }}
          onCameraIdle={(e) => { center.current = { lat: e.latitude, lng: e.longitude }; }}
          logoAlign="BottomLeft"
          logoMargin={{ bottom: insets.bottom + 24 + hintH + 6 }}
        />

        <View style={{ position: "absolute", left: 16, right: 16, top: 14, zIndex: 10 }}>
          <PlaceSearch
            value={q} onChange={setQ} hasPicked={false} onClearPicked={() => {}} placeholder="가게 이름이나 주소로 찾기"
            onChoose={(r) => {
              center.current = { lat: r.lat, lng: r.lng };
              found.current = { name: r.name, address: r.address };
              mapRef.current?.animateCameraTo({ latitude: r.lat, longitude: r.lng, zoom: 17, duration: 500 });
            }}
          />
        </View>

        {/* 가운데 책갈피 십자 — 끝이 지도 중심을 가리킵니다 */}
        <View pointerEvents="none" style={{ position: "absolute", top: "50%", left: "50%", marginLeft: -17, marginTop: -40, alignItems: "center" }}>
          <View style={{ borderRadius: 20, borderWidth: 1.4, borderColor: C.card, backgroundColor: C.brick, padding: 7 }}>
            <BookmarkIcon size={20} fill={C.card} stroke={C.card} strokeWidth={0} />
          </View>
        </View>

        <View onLayout={(e) => setHintH(e.nativeEvent.layout.height)} style={[{ position: "absolute", left: 20, right: 20, bottom: insets.bottom + 24, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 12 }, SHADOW.card]}>
          <Text style={{ textAlign: "center", fontFamily: F.sans, fontSize: 12, lineHeight: 19, color: C.muted }}>위에서 찾아 바로 옮겨가거나, 지도를 움직여 가운데 표시를 가게 자리에 맞춰주세요.</Text>
        </View>
      </View>
    </View>
  );
}
