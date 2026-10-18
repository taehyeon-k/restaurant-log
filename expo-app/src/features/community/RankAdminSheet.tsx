import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { BottomSheetModal } from "@/components/ui";
import { C, F } from "@/theme";
import { adminRankBan, type RankRow } from "./api";
import { Avatar, K } from "./ui";

const REASONS = ["부정 기록 의심", "인증 조작 의심", "기타"];

/**
 * 랭킹 관리(관리자) — 부정한 기록으로 랭킹을 채운 것 같은 사람을 랭킹에서 일시정지(7 · 30일)하거나 영구 제외합니다.
 * 기록장 · 게시판 · 친구 소식은 그대로이고 랭킹에만 안 나옵니다. 풀기는 내계정 › 운영 › 랭킹.
 */
export function RankAdminSheet({ row, onClose }: { row: RankRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (row) setReason(REASONS[0]); }, [row]);

  async function ban(days: number | null) {
    if (!row || busy) return;
    setBusy(true);
    try {
      await adminRankBan(qc, row.user_id, days, reason);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      setTimeout(() => Alert.alert(`${row.nickname} · ${days == null ? "랭킹에서 영구 제외" : `랭킹 ${days}일 정지`}`, "풀려면 내계정 › 운영 › 랭킹"), 380);
    } catch (e) {
      Alert.alert("처리하지 못했습니다", e instanceof Error ? e.message : "");
    }
    setBusy(false);
  }

  function confirmForever() {
    Alert.alert(`${row?.nickname}님을 랭킹에서 영구 제외할까요?`, "기록장 · 게시판은 그대로입니다. 나중에 운영 화면에서 풀 수 있습니다.", [
      { text: "취소", style: "cancel" },
      { text: "영구 제외", style: "destructive", onPress: () => ban(null) },
    ]);
  }

  const action = (label: string, onPress: () => void, danger = false) => (
    <Pressable onPress={onPress} disabled={busy} style={{ minHeight: 46, paddingHorizontal: 16, justifyContent: "center", borderTopWidth: 1, borderTopColor: C.lineSoft, opacity: busy ? 0.5 : 1 }}>
      <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: danger ? C.brick : C.ink }}>{label}</Text>
    </Pressable>
  );

  return (
    <BottomSheetModal visible={!!row} onClose={onClose}>
      {row && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Avatar name={row.nickname} url={row.avatar_url} size={34} seed={row.user_id} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.serif, fontSize: 17, color: C.ink }}>{row.nickname}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>{row.rank}위 · {row.value}</Text>
            </View>
          </View>
          <Text style={{ marginTop: 12, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>
            랭킹에만 안 나옵니다. 기록장 · 게시판 · 친구 소식은 그대로입니다.
          </Text>
          <Text style={{ marginTop: 14, fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: C.faint }}>사유</Text>
          <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {REASONS.map((r) => {
              const on = r === reason;
              return (
                <Pressable key={r} onPress={() => setReason(r)} style={{ height: 30, borderRadius: 15, paddingHorizontal: 12, justifyContent: "center", backgroundColor: on ? C.ink : C.card, borderWidth: on ? 0 : 1, borderColor: C.line }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 12, color: on ? C.card : K.text2 }}>{r}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, overflow: "hidden", borderTopWidth: 0 }}>
            {action("랭킹 7일 정지", () => ban(7))}
            {action("랭킹 30일 정지", () => ban(30))}
            {action("랭킹에서 영구 제외", confirmForever, true)}
          </View>
          <Pressable onPress={onClose} style={{ marginTop: 10, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>닫기</Text>
          </Pressable>
        </>
      )}
    </BottomSheetModal>
  );
}
