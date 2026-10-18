import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { LabelBadge } from "@/components/Badges";
import { BackButton, BottomSheetModal, Button, Eyebrow } from "@/components/ui";
import { refreshAll } from "@/data/invalidate";
import { usePersonalRows } from "@/data/queries";
import { useAccount } from "@/data/profile";
import { EmptySlot, Stamp } from "@/features/stamps/Stamp";
import { useSeenLabels } from "@/lib/labelSeen";
import { earnedLabels, regionTitles, stampTilt, type EarnedLabel } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

/**
 * 라벨첩(지시서 3 §E-4) — 그릇 수 8단계 타일 · 이야기 목록 · 동네 칭호 칩.
 * 그릇 수 타일을 누르면 리캡, 이야기 줄을 누르면 메달 · 도장 · 채운 가게 시트(「기록 보기」로 리캡).
 * 받은 라벨을 길게 누르면 닉네임 옆 대표 라벨로 붙습니다.
 */
export default function Labels() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: rows = [], isSuccess } = usePersonalRows();
  const { data: account } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<EarnedLabel | null>(null);

  const titleId = account?.titleLabelId ?? null;
  const labels = earnedLabels(rows);
  const bowls = labels.filter((l) => l.group === "bowl");
  const stories = labels.filter((l) => l.group === "story");
  const seen = useSeenLabels(account?.userId, labels.filter((l) => l.earned).map((l) => l.id), isSuccess);
  const title = labels.find((l) => l.id === titleId && l.earned) ?? null;
  // 인증 기록이 한 건이라도 있는 구는 모두 — 칭호를 받기 전이면 회색으로 다음 칭호까지 보여 줍니다.
  const districts = regionTitles(rows);

  const open = (l: EarnedLabel) => {
    if (!l.earned) return;
    router.push({ pathname: "/label-recap", params: { id: l.id } });
  };

  async function toggleTitle(l: EarnedLabel) {
    if (busy || !l.earned) return;
    Haptics.selectionAsync();
    const next = titleId === l.id ? null : l.id;
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
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 14, paddingBottom: 6 }}>
        <BackButton />
        <View style={{ paddingHorizontal: 8, marginTop: 6 }}>
          <Eyebrow wide>LABELS</Eyebrow>
          <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 26, color: C.ink }}>라벨첩</Text>
        </View>
      </View>
      {!!error && <Text style={{ paddingHorizontal: 22, marginTop: 6, fontFamily: F.sans, fontSize: 11, color: C.brick }}>{error}</Text>}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: insets.bottom + 40 }}>
        <View style={{ marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: "#e6e0d3", backgroundColor: C.card, flexDirection: "row", alignItems: "center", gap: 12 }}>
          {title ? (
            <>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: title.color, alignItems: "center", justifyContent: "center" }}>
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Path d={title.icon} fill="none" stroke={C.card} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.sansBd, fontSize: 12.5, color: C.ink }}>
                  {account?.nickname || "나"}
                  <Text style={{ color: title.color }}> · {title.name}</Text>
                </Text>
                <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>받은 라벨을 길게 누르면 대표 라벨이 바뀌어요</Text>
              </View>
            </>
          ) : (
            <>
              <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderStyle: "dashed", borderColor: "#cfc7b6" }} />
              <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>받은 라벨을 길게 누르면 대표 라벨로 붙어요</Text>
            </>
          )}
        </View>

        <SectionHead title="그릇 수" right={`${bowls.filter((l) => l.earned).length} / ${bowls.length}`} />
        <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
          {bowls.map((l) => {
            const fresh = l.earned && seen.isNew(l.id);
            return (
              <View key={l.id} style={{ width: "25%", padding: 4 }}>
                <Pressable
                  onPress={() => open(l)}
                  onLongPress={() => toggleTitle(l)}
                  disabled={!l.earned}
                  accessibilityLabel={`${l.name}${l.earned ? "" : " · 아직"}`}
                  style={{
                    aspectRatio: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 4,
                    ...(l.earned
                      ? { backgroundColor: fresh ? C.brick : C.brickSoft, borderWidth: l.id === titleId ? 1.5 : 1, borderColor: l.id === titleId ? C.ink : fresh ? C.brick : "rgba(180,85,45,.2)" }
                      : { borderWidth: 1.5, borderStyle: "dashed", borderColor: "#d6c4b8" }),
                  }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 17, color: fresh ? C.card : l.earned ? C.brick : "#c9b5a7" }}>{l.need}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 10, color: fresh ? C.card : l.earned ? C.ink : C.faint }}>{l.name}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <SectionHead title="이야기" right={`${stories.filter((l) => l.earned).length} / ${stories.length}`} />
        <View style={{ marginTop: 10, borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card, overflow: "hidden" }}>
          {stories.map((l, i) => {
            const fresh = l.earned && seen.isNew(l.id);
            return (
              <Pressable
                key={l.id}
                onPress={() => setDetail(l)}
                onLongPress={() => toggleTitle(l)}
                accessibilityLabel={`${l.name}${l.earned ? "" : " · 아직"} 자세히 보기`}
                style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: "#ece7dc" }}
              >
                <LabelBadge label={l} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.serif, fontSize: 14, color: l.earned ? C.ink : C.muted }}>
                    {l.name}
                    {l.id === titleId && <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.brick }}>  대표</Text>}
                    {fresh && <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.brick }}>  · 새로</Text>}
                  </Text>
                  <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{l.desc}</Text>
                </View>
                {l.earned ? (
                  <Pressable onPress={() => open(l)} hitSlop={10} accessibilityLabel={`${l.name} 기록 보기`}>
                    <Text style={{ fontFamily: F.sansMd, fontSize: 11.5, color: C.brick }}>기록 보기 ›</Text>
                  </Pressable>
                ) : (
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint }}>{Math.min(l.have, l.need)} / {l.need}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <SectionHead title="동네 칭호" right={`${districts.filter((t) => t.tier).length}`} />
        {districts.length > 0 ? (
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {districts.map((t) =>
              t.tier ? (
                <View key={t.region} style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 13, borderWidth: 1, borderColor: `${t.tier.color}66`, backgroundColor: `${t.tier.color}1a`, paddingHorizontal: 11, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: t.tier.color }}>{t.region} {t.tier.suffix}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: t.tier.color }}>{"★★★".slice(0, t.tier.stars)}</Text>
                </View>
              ) : (
                <View key={t.region} accessibilityLabel={`${t.region} ${t.next!.suffix} · 아직 ${t.have} / ${t.next!.need}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 13, borderWidth: 1, borderStyle: "dashed", borderColor: "#d6cfc2", backgroundColor: "#f3efe6", paddingHorizontal: 11, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{t.region} {t.next!.suffix}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: "#bdb4a3" }}>{t.have} / {t.next!.need}</Text>
                </View>
              )
            )}
          </View>
        ) : (
          <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 12, color: C.faint }}>한 구에서 인증 기록 10건이면 첫 칭호를 받아요</Text>
        )}
      </ScrollView>
      {detail && (
        <LabelSheet
          label={detail}
          rows={rows}
          isTitle={detail.id === titleId}
          onClose={() => setDetail(null)}
          onRecap={() => { setDetail(null); open(detail); }}
        />
      )}
    </View>
  );
}

/** 이야기 라벨 시트 — 큰 메달, 채운 만큼 찍힌 도장, 어느 가게를 몇 번 가서 채웠는지. */
function LabelSheet({ label, rows, isTitle, onClose, onRecap }: {
  label: EarnedLabel; rows: Restaurant[]; isTitle: boolean; onClose: () => void; onRecap: () => void;
}) {
  const { height } = useWindowDimensions();
  const contrib = label.contrib(rows);
  const stores = new Map<string, { name: string; n: number }>();
  for (const r of contrib) {
    const k = r.place_key ?? `${r.name}|${r.address ?? ""}`;
    const s = stores.get(k);
    if (s) s.n += 1;
    else stores.set(k, { name: r.name, n: 1 });
  }
  const list = [...stores.values()].sort((a, b) => b.n - a.n);
  const size = 34, gap = 8;

  return (
    <BottomSheetModal visible onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.72 }} contentContainerStyle={{ alignItems: "center", paddingBottom: 6 }}>
        <LabelBadge label={label} selected={isTitle} size={132} />
        <Text style={{ marginTop: 14, fontFamily: F.serif, fontSize: 21, color: label.earned ? C.ink : C.muted }}>{label.name}</Text>
        <Text style={{ marginTop: 5, fontFamily: F.sans, fontSize: 12, color: C.faint }}>
          {label.desc} · <Text style={{ fontFamily: F.mono, color: label.earned ? label.color : C.faint }}>{Math.min(label.have, label.need)} / {label.need}</Text>
        </Text>

        <View style={{ marginTop: 18, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", width: size * 5 + gap * 4, rowGap: gap, columnGap: gap }}>
          {Array.from({ length: label.need }, (_, i) =>
            i < contrib.length ? <Stamp key={i} n={i + 1} size={size} tilt={stampTilt(i)} /> : <EmptySlot key={i} size={size} label={i + 1} />,
          )}
        </View>

        <View style={{ alignSelf: "stretch", marginTop: 20, borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card }}>
          {list.length > 0 ? list.map((s, i) => (
            <View key={s.name + i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: "#ece7dc" }}>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 13, color: C.ink }}>{s.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.brick }}>{s.n}번</Text>
            </View>
          )) : (
            <Text style={{ padding: 14, fontFamily: F.sans, fontSize: 12, color: C.faint, textAlign: "center" }}>아직 채운 가게가 없어요</Text>
          )}
        </View>
      </ScrollView>
      {label.earned && <Button style={{ marginTop: 14 }} label="기록 보기" onPress={onRecap} />}
    </BottomSheetModal>
  );
}

const SectionHead = ({ title, right }: { title: string; right: string }) => (
  <View style={{ paddingTop: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
    <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{title} · <Text style={{ fontFamily: F.mono, fontSize: 13 }}>{right}</Text></Text>
  </View>
);

export { ErrorBoundary } from "expo-router";
