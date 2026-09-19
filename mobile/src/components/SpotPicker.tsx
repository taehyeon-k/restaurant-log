/**
 * 전체 화면 지도로 위시의 자리를 고릅니다(§4, SpotPicker).
 * 지도를 움직여 가운데 책갈피에 맞추는 방식이라 마커를 두지 않고, 지도 중심
 * 좌표를 그대로 읽습니다. 웹 `SpotPicker.tsx` 와 같은 방식입니다.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NaverMapView, type NaverMapViewRef } from "@mj-studio/react-native-naver-map";

import { BookmarkIcon, SearchIcon } from "@/components/ui";
import { forwardGeocode, type Place } from "@/lib/geocode";
import { C, FONT, SHADOW } from "@/lib/theme";

const SEOUL = { latitude: 37.5665, longitude: 126.978 };

export default function SpotPicker({
  initial,
  onCancel,
  onPick,
}: {
  initial: { lat: number; lng: number } | null;
  onCancel: () => void;
  /** 검색으로 골랐으면 그 이름·주소도 함께 넘깁니다. */
  onPick: (lat: number, lng: number, found?: { name: string; address: string }) => void;
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<NaverMapViewRef>(null);
  const centerRef = useRef({ lat: initial?.lat ?? SEOUL.latitude, lng: initial?.lng ?? SEOUL.longitude });
  /** 검색으로 옮겨간 자리 정보 — 사람이 손으로 지도를 다시 끌면 지웁니다. */
  const foundRef = useRef<{ name: string; address: string } | null>(null);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const skipSearch = useRef(false);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    if (!open || q.trim().length < 2) {
      setResults([]);
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        setResults(await forwardGeocode(q, ctrl.signal));
      } catch {
        /* aborted or offline */
      } finally {
        setBusy(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  function chooseResult(p: Place) {
    skipSearch.current = true;
    setQ(p.name || p.address);
    setOpen(false);
    setResults([]);
    centerRef.current = { lat: p.lat, lng: p.lng };
    foundRef.current = { name: p.name, address: p.address };
    mapRef.current?.animateCameraTo({ latitude: p.lat, longitude: p.lng, zoom: 17, duration: 500 });
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          zIndex: 10,
        }}
      >
        <Pressable onPress={onCancel} hitSlop={8} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 13, color: C.faint, fontFamily: FONT.sans }}>취소</Text>
        </Pressable>
        <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: 1.7, color: C.faint }}>PICK A SPOT</Text>
        <Pressable
          onPress={() => onPick(centerRef.current.lat, centerRef.current.lng, foundRef.current ?? undefined)}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}
        >
          <Text style={{ fontSize: 13, color: C.brick, fontFamily: FONT.sansMedium }}>이 자리</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <NaverMapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialCamera={{
            latitude: centerRef.current.lat,
            longitude: centerRef.current.lng,
            zoom: initial ? 16 : 13,
          }}
          isShowZoomControls={false}
          isShowLocationButton={false}
          isShowScaleBar={false}
          onCameraIdle={({ latitude, longitude }) => {
            centerRef.current = { lat: latitude, lng: longitude };
          }}
          // 손으로 끌기 시작하면 검색으로 잡아둔 이름은 더 이상 이 자리의 것이 아닙니다.
          onCameraChanged={({ reason }) => {
            if (reason === "Gesture") foundRef.current = null;
          }}
        />

        <View style={{ position: "absolute", top: 14, left: 16, right: 16, zIndex: 10 }}>
          <View
            style={[
              {
                height: 46,
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
                borderRadius: 23,
                borderWidth: 1,
                borderColor: C.line,
                backgroundColor: C.card,
                paddingHorizontal: 15,
              },
              SHADOW.card,
            ]}
          >
            <SearchIcon />
            <TextInput
              value={q}
              onChangeText={(v) => {
                setQ(v);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="가게 이름이나 주소로 찾기"
              placeholderTextColor="#a8a196"
              style={{ flex: 1, fontSize: 13.5, color: C.ink, fontFamily: FONT.sans, padding: 0 }}
            />
            {busy && <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.faint }}>검색 중…</Text>}
          </View>

          {open && results.length > 0 && (
            <View
              style={[
                {
                  marginTop: 6,
                  maxHeight: 280,
                  overflow: "hidden",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: C.line,
                  backgroundColor: C.card,
                },
                SHADOW.card,
              ]}
            >
              <ScrollView keyboardShouldPersistTaps="handled">
                {results.map((p, i) => (
                  <Pressable
                    key={`${p.lat}-${p.lng}-${i}`}
                    onPress={() => chooseResult(p)}
                    style={{
                      gap: 2,
                      borderBottomWidth: i === results.length - 1 ? 0 : 1,
                      borderBottomColor: C.line,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ fontSize: 13.5, color: C.ink, fontFamily: FONT.sansMedium }}>
                      {p.name || p.address}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT.sans }}>{p.address}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* 가운데 십자 — 책갈피 하나. 지도를 이 표시에 맞춥니다. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            marginLeft: -19,
            marginTop: -38,
          }}
        >
          <View
            style={{
              borderRadius: 24,
              borderWidth: 1.4,
              borderColor: C.card,
              backgroundColor: C.brick,
              padding: 7,
              shadowColor: C.ink,
              shadowOpacity: 0.35,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
            }}
          >
            <BookmarkIcon size={20} fill={C.card} stroke={C.card} strokeWidth={0} />
          </View>
        </View>

        <View
          style={[
            {
              position: "absolute",
              left: 20,
              right: 20,
              bottom: insets.bottom + 24,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: C.line,
              backgroundColor: C.card,
              paddingHorizontal: 16,
              paddingVertical: 12,
            },
            SHADOW.card,
          ]}
        >
          <Text style={{ textAlign: "center", fontSize: 12, lineHeight: 19, color: C.muted, fontFamily: FONT.sans }}>
            위에서 찾아 바로 옮겨가거나, 지도를 움직여 가운데 표시를 가게 자리에 맞춰주세요.
          </Text>
        </View>
      </View>
    </View>
  );
}
