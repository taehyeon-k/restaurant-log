import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VerifiedMark } from "@/components/icons";
import { PhotoBox, ScreenHead } from "@/components/ui";
import { refreshAll } from "@/data/invalidate";
import { useRows } from "@/data/queries";
import { removeFromQueue, removePhoto, resetFailed } from "@/features/queue/db";
import { drainQueue, notifyQueue } from "@/features/queue/process";
import { useQueue } from "@/features/queue/useQueue";
import { supabase } from "@/lib/supabase";
import { coverPhoto, type Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026.09.06 13:24 · 인증됨" */
function meta(r: Restaurant) {
  const d = new Date(r.created_at);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}${r.verified ? " · 인증됨" : ""}`;
}

/**
 * 보관함 — 사진을 찍고 «나중에 쓸게요»를 누른 기록(pending)과, 아직 올라가지 못한 큐(오프라인 큐)를 함께 모읍니다.
 * 큐 항목은 「올리는 중」, 3회 실패하면 「올리지 못함」으로 보입니다.
 */
export default function Drafts() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: rows = [] } = useRows();
  const queue = useQueue();
  const drafts = rows.filter((r) => r.pending);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function discard(id: number) {
    setBusyId(id);
    setError("");
    const { error: err } = await supabase.from("restaurants").delete().eq("id", id);
    setBusyId(null);
    if (err) return setError(err.message);
    refreshAll(qc);
  }

  const total = drafts.length + queue.length;

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScreenHead eyebrow="DRAFTS" title="보관함" sub={total ? `아직 쓰지 않은 기록 ${drafts.length}개${queue.length ? ` · 올리는 중 ${queue.length}개` : ""}` : "비어 있습니다"} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 40, gap: 10 }}>
        {total === 0 && (
          <Text style={{ paddingHorizontal: 20, paddingVertical: 44, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, lineHeight: 22, color: C.faint }}>
            {"아직 쓰지 않은 기록이 없습니다.\n사진을 찍고 «나중에 쓸게요»를 누르면 여기에 담깁니다."}
          </Text>
        )}

        {queue.map((q) => {
          const p = JSON.parse(q.payload) as { name: string };
          const failed = q.failed === 1;
          return (
            <View key={`q${q.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, borderColor: failed ? "#d9a89c" : "#e0c3b1", backgroundColor: C.card, padding: 12 }}>
              <Image source={{ uri: q.photo_uri }} style={{ width: 64, height: 64, borderRadius: 15, backgroundColor: "#ded8cb" }} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15.5, color: C.ink }}>{p.name}</Text>
                <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {!failed && <ActivityIndicator size="small" color={C.brick} />}
                  <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: failed ? "#a8412a" : C.faint }}>{failed ? "올리지 못함" : "올리는 중 · 연결되면 이어서 올라갑니다"}</Text>
                </View>
                <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={async () => { await resetFailed(q.id); notifyQueue(); drainQueue(qc); }} style={{ borderRadius: 15, backgroundColor: C.ink, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.card }}>{failed ? "다시 올리기" : "지금 올리기"}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => Alert.alert("이 인증을 버릴까요?", "올라가지 않은 사진과 기록이 지워집니다.", [
                      { text: "취소", style: "cancel" },
                      { text: "버리기", style: "destructive", onPress: async () => { removePhoto(q.photo_uri); await removeFromQueue(q.id); notifyQueue(); } },
                    ])}
                    style={{ paddingHorizontal: 4, paddingVertical: 8 }}
                  >
                    <Text style={{ fontFamily: F.sans, fontSize: 12, color: "#a29a8c" }}>버리기</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}

        {drafts.map((r) => (
          <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: C.card, padding: 12 }}>
            <View>
              <PhotoBox src={coverPhoto(r)} category={r.category} size={64} radius={15} />
              {r.verified && <View style={{ position: "absolute", right: -3, bottom: -3 }}><VerifiedMark size={22} /></View>}
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 15.5, color: C.ink }}>{r.name}</Text>
              <Text style={{ marginTop: 4, fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{meta(r)}</Text>
              <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable onPress={() => router.push({ pathname: "/record/edit", params: { id: String(r.id) } })} style={{ borderRadius: 15, backgroundColor: C.ink, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.card }}>기록 쓰기</Text>
                </Pressable>
                <Pressable onPress={() => discard(r.id)} disabled={busyId === r.id} style={{ paddingHorizontal: 4, paddingVertical: 8, opacity: busyId === r.id ? 0.5 : 1 }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 12, color: "#a29a8c" }}>버리기</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}

        {!!error && <Text style={{ marginTop: 14, fontFamily: F.sans, fontSize: 12.5, color: "#a8412a" }}>{error}</Text>}
      </ScrollView>
    </View>
  );
}
