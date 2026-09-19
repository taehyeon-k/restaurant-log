import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { forwardGeocode, type Place } from "@/lib/geocode";
import { SearchIcon } from "@/components/ui";
import { C, FONT, SHADOW } from "@/lib/theme";

export type PickedPlace = { name: string; address: string; lat: number; lng: number } | null;

/**
 * 지도 위 검색창(§4.1-2) — 높이 46, radius 23, 좌우 패딩 15.
 * 어디든 실시간으로 찾아 지도를 옮기고, 아직 기록에 없는 곳이면 그 자리에
 * 새 기록을 붙일 수 있게 합니다. 250ms 디바운스, 두 글자부터.
 */
export default function PlaceSearchBar({
  value,
  onChange,
  onChoose,
  picked,
  onClearPicked,
}: {
  value: string;
  onChange: (v: string) => void;
  onChoose: (p: Place) => void;
  picked: PickedPlace;
  onClearPicked: () => void;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (!open || value.trim().length < 2) {
      setResults([]);
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        setResults(await forwardGeocode(value, ctrl.signal));
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
  }, [value, open]);

  function choose(p: Place) {
    skip.current = true;
    onChange(p.name || p.address);
    setOpen(false);
    setResults([]);
    Keyboard.dismiss();
    onChoose(p);
  }

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
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
          value={value}
          onChangeText={(v) => {
            onChange(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="음식점이나 지역 찾기"
          placeholderTextColor={C.placeholder}
          returnKeyType="search"
          style={{ flex: 1, fontSize: 13.5, color: C.ink, fontFamily: FONT.sans, padding: 0 }}
        />

        {busy && <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.faint }}>검색 중…</Text>}

        {(value.length > 0 || picked) && !busy && (
          <Pressable
            hitSlop={8}
            onPress={() => {
              onChange("");
              setResults([]);
              onClearPicked();
            }}
          >
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>지우기</Text>
          </Pressable>
        )}
      </View>

      {open && results.length > 0 && (
        <View
          style={[
            {
              position: "absolute",
              top: 52,
              left: 0,
              right: 0,
              maxHeight: 300,
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
                onPress={() => choose(p)}
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
  );
}
