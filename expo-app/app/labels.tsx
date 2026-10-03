import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DistrictBadge, LabelBadge } from "@/components/Badges";
import { Eyebrow, ScreenHead } from "@/components/ui";
import { refreshAll } from "@/data/invalidate";
import { useRows } from "@/data/queries";
import { useAccount } from "@/data/profile";
import { earnedLabels, regionTitles } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import { C, F } from "@/theme";

/** 라벨첩. 획득 조건은 아직 확정 전이라 `lib/labels.ts` 의 잠정 규칙을 씁니다. 모은 라벨을 탭하면 닉네임 옆 대표 라벨로 붙습니다. */
export default function Labels() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: rows = [] } = useRows();
  const { data: account } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const titleId = account?.titleLabelId ?? null;
  const labels = earnedLabels(rows);
  const got = labels.filter((l) => l.earned).length;
  const districts = regionTitles(rows);

  async function toggleTitle(id: string) {
    if (busy) return;
    const next = titleId === id ? null : id;
    setBusy(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("로그인이 필요합니다"); setBusy(false); return; }
    const { error: err } = await supabase.from("profiles").upsert({ id: user.id, title_label_id: next });
    setBusy(false);
    if (err) return setError(err.message);
    refreshAll(qc);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScreenHead eyebrow="LABELS" title="라벨첩" sub={`모은 라벨 ${got} / ${labels.length}`} />
      <Text style={{ paddingHorizontal: 22, fontFamily: F.sans, fontSize: 11, color: C.faint }}>탭하면 닉네임 옆 대표 라벨로 붙습니다</Text>
      {!!error && <Text style={{ paddingHorizontal: 22, marginTop: 6, fontFamily: F.sans, fontSize: 11, color: C.brick }}>{error}</Text>}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: insets.bottom + 40 }}>
        {districts.length > 0 && (
          <View style={{ marginBottom: 30 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Eyebrow>DISTRICTS</Eyebrow>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: "#a29a8c" }}>받은 칭호 {districts.filter((t) => t.tier).length}개</Text>
            </View>
            <Text style={{ marginTop: 5, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>한 구에서 인증한 기록이 쌓이면 칭호를 받습니다. 10곳 러버, 30곳 보안관, 50곳 맛잘알.</Text>
            <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", rowGap: 22 }}>
              {districts.map((t) => <View key={t.region} style={{ width: "33.33%" }}><DistrictBadge title={t} /></View>)}
            </View>
          </View>
        )}

        {districts.length > 0 && <View style={{ marginBottom: 16 }}><Eyebrow>LABELS</Eyebrow></View>}

        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 26 }}>
          {labels.map((l) => (
            <View key={l.id} style={{ width: "33.33%", alignItems: "center", gap: 10 }}>
              <Pressable disabled={!l.earned} onPress={() => toggleTitle(l.id)} accessibilityLabel={`${l.name} 대표 라벨로 ${l.id === titleId ? "해제" : "선택"}`}>
                <LabelBadge label={l} selected={l.id === titleId} />
              </Pressable>
              <View style={{ alignItems: "center", paddingHorizontal: 2 }}>
                <Text style={{ fontFamily: F.serif, fontSize: 13, color: l.earned ? C.ink : C.faint }}>{l.name}</Text>
                <Text style={{ marginTop: 3, textAlign: "center", fontFamily: F.sans, fontSize: 10, lineHeight: 14, color: C.faint }}>
                  {l.earned || l.need === 1 ? l.desc : `${l.desc} · ${Math.min(l.have, l.need)}/${l.need}`}
                </Text>
                {l.id === titleId && <Text style={{ marginTop: 3, fontFamily: F.sansBd, fontSize: 9.5, color: C.brick }}>대표 라벨</Text>}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
