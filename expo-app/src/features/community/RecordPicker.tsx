import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { BottomSheetModal } from "@/components/ui";
import { usePersonalRows } from "@/data/queries";
import { coverPhoto, type Kind, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";
import { K, metaLine, monthDay, PhotoOrStripes } from "./ui";

/** 내 기록(보관함 · 연인 복사본 제외) — 최근 인증이 위, 인증 안 된 기록은 아래(HANDOFF-board-v2 §06). */
export function useMyBoardRecords(kind?: Kind | null) {
  const { data: rows = [] } = usePersonalRows();
  return useMemo(() => {
    const mine = rows.filter((r) => !r.pending && r.source_record_id == null && r.copied_at == null && (!kind || r.kind === kind));
    const at = (r: Restaurant) => r.verified_at ?? r.visited_at ?? r.created_at ?? "";
    const verified = mine.filter((r) => r.verified).sort((a, b) => (at(a) < at(b) ? 1 : -1));
    const rest = mine.filter((r) => !r.verified).sort((a, b) => (at(a) < at(b) ? 1 : -1));
    return [...verified, ...rest];
  }, [rows, kind]);
}

/**
 * 「내 기록에서 고르기」 시트. max 가 1 이면 누르는 즉시 고르고 닫힙니다.
 * 여럿이면(코스) 고른 순서대로 번호가 붙고 「n곳 고르기」로 닫습니다.
 */
export function RecordPickerSheet({
  visible, onClose, onPick, kind, max = 1, selected = [], title = "내 기록에서 고르기",
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (records: Restaurant[]) => void;
  kind?: Kind | null;
  max?: number;
  selected?: number[];
  title?: string;
}) {
  const records = useMyBoardRecords(kind);
  const [ids, setIds] = useState<number[]>(selected);
  useEffect(() => { if (visible) setIds(selected); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstUnverified = records.findIndex((r) => !r.verified);

  function tap(r: Restaurant) {
    Haptics.selectionAsync();
    if (max === 1) { onPick([r]); onClose(); return; }
    setIds((cur) => (cur.includes(r.id) ? cur.filter((x) => x !== r.id) : cur.length >= max ? cur : [...cur, r.id]));
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.ink }}>{title}</Text>
      {max > 1 && <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>순서대로 눌러 주세요 · 최대 {max}곳</Text>}
      <FlatList
        style={{ marginTop: 10, maxHeight: 380 }}
        data={records}
        keyExtractor={(r) => String(r.id)}
        ListEmptyComponent={<Text style={{ paddingVertical: 24, textAlign: "center", fontFamily: F.sans, fontSize: 12, color: C.faint }}>고를 수 있는 기록이 없습니다.</Text>}
        renderItem={({ item: r, index }) => {
          const order = ids.indexOf(r.id);
          return (
            <View>
              {index === firstUnverified && firstUnverified > 0 && (
                <Text style={{ paddingTop: 12, paddingBottom: 4, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.faint }}>인증 없는 기록</Text>
              )}
              <Pressable onPress={() => tap(r)} accessibilityState={{ selected: order >= 0 }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#ece8de" }}>
                <PhotoOrStripes uri={coverPhoto(r)} width={44} height={44} radius={10} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14, color: C.ink }}>{r.name}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>
                    {metaLine(r.category, r.region, r.rating != null ? `★ ${r.rating}` : null)}
                  </Text>
                  {r.verified && <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: C.brick }}>✓ 인증 {monthDay(r.verified_at)}</Text>}
                </View>
                {max > 1 && (
                  <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: order >= 0 ? C.brick : "transparent", borderWidth: order >= 0 ? 0 : 1.5, borderColor: K.dashed }}>
                    {order >= 0 && <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.card }}>{order + 1}</Text>}
                  </View>
                )}
              </Pressable>
            </View>
          );
        }}
      />
      {max > 1 && (
        <Pressable
          onPress={() => { onPick(ids.map((id) => records.find((r) => r.id === id)!).filter(Boolean)); onClose(); }}
          disabled={ids.length === 0}
          style={{ marginTop: 12, minHeight: 48, borderRadius: 16, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: ids.length ? 1 : 0.4 }}
        >
          <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.card }}>{ids.length}곳 고르기</Text>
        </Pressable>
      )}
    </BottomSheetModal>
  );
}
