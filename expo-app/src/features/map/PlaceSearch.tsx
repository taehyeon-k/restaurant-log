import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { SearchIcon } from "@/components/icons";
import { forwardGeocode, type Place } from "@/lib/geocode";
import { C, F, SHADOW } from "@/theme";

/** 지도 위 메인 검색창 — 어디든 실시간으로 찾아 지도를 옮깁니다. */
export default function PlaceSearch({
  value, onChange, onChoose, hasPicked, onClearPicked, onListOpenChange, placeholder = "음식점이나 지역 찾기",
}: {
  value: string; onChange: (v: string) => void; onChoose: (p: Place) => void; hasPicked: boolean; onClearPicked: () => void;
  /** 결과 목록이 보이는지 — 지도 화면이 그동안 마커 탭을 막는 데 씁니다. */
  onListOpenChange?: (open: boolean) => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (!open || value.trim().length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try { setResults(await forwardGeocode(value, ctrl.signal)); } catch { /* 취소·오프라인 */ } finally { setBusy(false); }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value, open]);

  const listOpen = open && results.length > 0;
  useEffect(() => { onListOpenChange?.(listOpen); }, [listOpen, onListOpenChange]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[{ height: 46, borderRadius: 23, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 9 }, SHADOW.card]}>
        <SearchIcon />
        <TextInput
          value={value}
          onChangeText={(t) => { onChange(t); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          placeholderTextColor="#b3ada1"
          returnKeyType="search"
          style={{ flex: 1, fontFamily: F.sans, fontSize: 13.5, color: C.ink, padding: 0 }}
        />
        {busy && <ActivityIndicator size="small" color={C.faint} />}
        {(!!value || hasPicked) && !busy && (
          <Pressable onPress={() => { onChange(""); setResults([]); onClearPicked(); }} hitSlop={8}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint }}>지우기</Text>
          </Pressable>
        )}
      </View>

      {/* 목록은 absolute 로 띄우지 않고 이 View 안에 쌓습니다. 부모 상자 밖으로 삐져나오면 RN 은 항목 탭을 받지만
          네이티브 지도도 같은 탭을 받아, 그 자리의 기록 마커가 함께 눌려 기록 화면이 열려버립니다. */}
      {listOpen && (
        <View style={[{ marginTop: 6, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, overflow: "hidden" }, SHADOW.card]}>
          {results.map((p, i) => (
            <Pressable
              key={`${p.lat}-${p.lng}-${i}`}
              onPress={() => { skip.current = true; onChange(p.name || p.address); setOpen(false); setResults([]); onChoose(p); }}
              style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 2, borderBottomWidth: i === results.length - 1 ? 0 : 1, borderBottomColor: C.line }}
            >
              <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>{p.name || p.address}</Text>
              <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>{p.address}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
