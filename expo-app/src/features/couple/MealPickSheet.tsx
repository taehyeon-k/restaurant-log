import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { BottomSheetModal, PhotoBox } from "@/components/ui";
import { savePick } from "@/data/books";
import { daysBetween, dottedWithDay, type Meal, type Milestone } from "@/lib/anniversary";
import { coverPhoto, dottedDate, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

const gapLabel = (diff: number) => (diff === 0 ? "당일" : diff < 0 ? `${-diff}일 전` : `${diff}일 뒤`);

/**
 * 기념일 식사 고르기(HANDOFF-couple §3-9, 시안 2e) — 같은 기록장의 기록을 기념일과 날짜가 가까운 순으로.
 * 「비워두기」 / 「n일 식사로 정하기」 → anniversary_picks upsert.
 */
export default function MealPickSheet({
  bookId, milestone, meal, rows, onClose, onFindByDate,
}: {
  bookId: string;
  milestone: Milestone | null;
  meal: Meal | null;
  rows: Restaurant[];
  onClose: () => void;
  /** 「다른 날짜에서 찾기」 — 캘린더를 엽니다. */
  onFindByDate: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const current = meal && (meal.kind === "picked" || meal.kind === "day") ? meal.record.id : null;
  useEffect(() => {
    setSelected(current);
    setError("");
  }, [milestone?.key, current]);

  const list = useMemo(() => {
    if (!milestone) return [];
    return rows
      .filter((r) => r.visited_at)
      .map((r) => ({ r, diff: daysBetween(milestone.date, r.visited_at!) }))
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || a.diff - b.diff);
  }, [rows, milestone]);

  async function save(pick: { record_id: number | null; cleared: boolean }) {
    if (!milestone) return;
    setBusy(true);
    setError("");
    try {
      await savePick(qc, bookId, milestone.key, pick);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheetModal visible={!!milestone} onClose={onClose}>
      {milestone && (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.brick }}>{milestone.label} · {dottedWithDay(milestone.date)}</Text>
          <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 20, color: C.ink }}>기념일 식사 고르기</Text>
          <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>날짜가 가까운 순서입니다.</Text>

          <ScrollView style={{ marginTop: 12, maxHeight: 340 }} contentContainerStyle={{ gap: 6 }}>
            {list.length === 0 && (
              <Text style={{ paddingVertical: 28, textAlign: "center", fontFamily: F.sans, fontSize: 12, color: C.faint }}>아직 함께 쓴 기록이 없어요</Text>
            )}
            {list.map(({ r, diff }) => {
              const on = selected === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setSelected(r.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 16, padding: 9, backgroundColor: C.card,
                    borderWidth: on ? 1.5 : 1, borderColor: on ? C.brick : C.lineSoft,
                  }}
                >
                  <PhotoBox src={coverPhoto(r)} category={r.category} size={44} radius={11} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14.5, color: C.ink }}>{r.name}</Text>
                    <Text style={{ marginTop: 3, fontFamily: F.mono, fontSize: 10, color: C.faint }}>
                      {dottedDate(r.visited_at)} · <Text style={{ color: diff === 0 ? C.brick : C.muted }}>{gapLabel(diff)}</Text>
                    </Text>
                  </View>
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: on ? C.brick : "#cdc6b8", alignItems: "center", justifyContent: "center" }}>
                    {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.brick }} />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable onPress={onFindByDate} style={{ alignSelf: "center", paddingVertical: 12 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, textDecorationLine: "underline" }}>다른 날짜에서 찾기</Text>
          </Pressable>

          {!!error && <Text style={{ marginBottom: 8, fontFamily: F.sans, fontSize: 12, color: "#a8412a" }}>{error}</Text>}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => save({ record_id: null, cleared: true })}
              disabled={busy}
              style={{ minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: "#ded8cb", paddingHorizontal: 18, justifyContent: "center", opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>비워두기</Text>
            </Pressable>
            <Pressable
              onPress={() => save({ record_id: selected, cleared: false })}
              disabled={busy || selected == null}
              style={{ flex: 1, minHeight: 50, borderRadius: 18, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: busy || selected == null ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.card }}>{milestone.label} 식사로 정하기</Text>
            </Pressable>
          </View>
        </>
      )}
    </BottomSheetModal>
  );
}
