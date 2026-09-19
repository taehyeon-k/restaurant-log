/**
 * 보관함 — 사진을 찍고 아직 본문을 쓰지 않은 기록(pending)이 모이는 곳.
 * 여기에 오프라인 큐 상태(「올리는 중 / 올리지 못함」)만 더했습니다(§6).
 * 새 화면을 만들지 않고 같은 자리에 붙입니다.
 */
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton, Eyebrow, PhotoFill, VerifiedMark } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useRefresh, useRestaurants } from "@/lib/data";
import { discardQueued, listQueue, retryQueued, type QueuedRecord } from "@/lib/offline";
import { coverPhoto, type Restaurant } from "@/lib/types";
import { C, FONT } from "@/lib/theme";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026.09.06 13:24 · 인증됨" */
function meta(iso: string, verified: boolean) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}${verified ? " · 인증됨" : ""}`;
}

export default function DraftsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refresh = useRefresh();
  const { rows } = useRestaurants();

  const drafts = rows.filter((r) => r.pending);

  const [queue, setQueue] = useState<QueuedRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reloadQueue = useCallback(() => {
    void listQueue().then(setQueue).catch(() => {});
  }, []);

  useFocusEffect(reloadQueue);

  async function discardDraft(r: Restaurant) {
    setBusyId(`db:${r.id}`);
    setError("");
    const { error: err } = await supabase.from("restaurants").delete().eq("id", r.id);
    setBusyId(null);
    if (err) return setError(err.message);
    refresh();
  }

  function confirmDiscard(label: string, run: () => void) {
    Alert.alert("버리기", `"${label}" 을(를) 버릴까요?`, [
      { text: "취소", style: "cancel" },
      { text: "버리기", style: "destructive", onPress: run },
    ]);
  }

  const total = drafts.length + queue.length;

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <BackButton onPress={() => router.back()} style={{ position: "absolute", left: 14, top: insets.top + 6, zIndex: 2 }} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 62, paddingBottom: insets.bottom + 40 }}>
        <Eyebrow wide>DRAFTS</Eyebrow>
        <Text style={{ marginTop: 8, fontFamily: FONT.serifBold, fontSize: 26, color: C.ink }}>보관함</Text>
        <Text style={{ marginTop: 6, fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>
          {total ? `아직 쓰지 않은 기록 ${total}개` : "비어 있습니다"}
        </Text>

        <View style={{ marginTop: 22, gap: 10 }}>
          {queue.map((q) => (
            <View
              key={`q:${q.id}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: q.status === "failed" ? "#e2c9bb" : C.lineSoft,
                backgroundColor: C.card,
                padding: 12,
              }}
            >
              <PhotoFill src={q.photoPath} category={null} radius={15} style={{ width: 64, height: 64 }} />

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONT.serifBold, fontSize: 15.5, color: C.ink }}>
                  {q.name}
                </Text>
                <Text style={{ marginTop: 4, fontFamily: FONT.mono, fontSize: 10.5, color: q.status === "failed" ? C.brick : C.faint }}>
                  {q.status === "failed"
                    ? `올리지 못함 · ${q.attempts}번 시도`
                    : q.status === "uploading"
                      ? "올리는 중…"
                      : "연결되면 올라갑니다"}
                </Text>

                <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {q.status === "failed" && (
                    <Pressable
                      onPress={() => {
                        setBusyId(`q:${q.id}`);
                        void retryQueued(q.id).then(() => {
                          setBusyId(null);
                          reloadQueue();
                          refresh();
                        });
                      }}
                      disabled={busyId === `q:${q.id}`}
                      style={{ borderRadius: 15, backgroundColor: C.ink, paddingHorizontal: 14, paddingVertical: 8 }}
                    >
                      <Text style={{ fontSize: 12, color: C.card, fontFamily: FONT.sans }}>다시 올리기</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() =>
                      confirmDiscard(q.name, () => {
                        void discardQueued(q.id).then(reloadQueue);
                      })
                    }
                    hitSlop={6}
                    style={{ paddingHorizontal: 4, paddingVertical: 8 }}
                  >
                    <Text style={{ fontSize: 12, color: C.dim, fontFamily: FONT.sans }}>버리기</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}

          {drafts.map((r) => (
            <View
              key={`db:${r.id}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#e0c3b1",
                backgroundColor: C.card,
                padding: 12,
              }}
            >
              <PhotoFill src={coverPhoto(r)} category={r.category} radius={15} style={{ width: 64, height: 64 }}>
                {r.verified && (
                  <View style={{ position: "absolute", right: -3, bottom: -3 }}>
                    <VerifiedMark size={22} shadow />
                  </View>
                )}
              </PhotoFill>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONT.serifBold, fontSize: 15.5, color: C.ink }}>
                  {r.name}
                </Text>
                <Text style={{ marginTop: 4, fontFamily: FONT.mono, fontSize: 10.5, color: C.faint }}>
                  {meta(r.created_at, r.verified)}
                </Text>

                <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Pressable
                    onPress={() => router.push(`/record/${r.id}/edit`)}
                    style={{ borderRadius: 15, backgroundColor: C.ink, paddingHorizontal: 14, paddingVertical: 8 }}
                  >
                    <Text style={{ fontSize: 12, color: C.card, fontFamily: FONT.sans }}>기록 쓰기</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDiscard(r.name, () => void discardDraft(r))}
                    disabled={busyId === `db:${r.id}`}
                    hitSlop={6}
                    style={{ paddingHorizontal: 4, paddingVertical: 8 }}
                  >
                    <Text style={{ fontSize: 12, color: C.dim, fontFamily: FONT.sans }}>버리기</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}

          {total === 0 && (
            <Text style={{ paddingHorizontal: 20, paddingVertical: 44, textAlign: "center", fontSize: 12.5, lineHeight: 22, color: C.faint, fontFamily: FONT.sans }}>
              아직 쓰지 않은 기록이 없습니다.{"\n"}사진을 찍고 «나중에 쓸게요»를 누르면 여기에 담깁니다.
            </Text>
          )}
        </View>

        {error.length > 0 && (
          <Text style={{ marginTop: 14, fontSize: 12.5, color: "#a8412a", fontFamily: FONT.sans }}>{error}</Text>
        )}
      </ScrollView>
    </View>
  );
}
