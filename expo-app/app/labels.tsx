import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { DistrictBadge, LabelBadge } from "@/components/Badges";
import { BackButton, Eyebrow } from "@/components/ui";
import { refreshAll } from "@/data/invalidate";
import { useRows } from "@/data/queries";
import { useAccount } from "@/data/profile";
import { earnedLabels, regionTitles, type EarnedLabel } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import { C, F } from "@/theme";

type Tab = "labels" | "districts";

const SEGMENT_SHADOW = Platform.select({
  ios: { shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  default: { elevation: 1 },
});

/** 라벨첩. 획득 조건은 아직 확정 전이라 `lib/labels.ts` 의 잠정 규칙을 씁니다. 모은 라벨을 탭하면 닉네임 옆 대표 라벨로 붙습니다. */
export default function Labels() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: rows = [] } = useRows();
  const { data: account } = useAccount();
  const [tab, setTab] = useState<Tab>("labels");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const earnedY = useRef(0);

  const titleId = account?.titleLabelId ?? null;
  const labels = earnedLabels(rows);
  const earned = labels.filter((l) => l.earned);
  // 가까운 순 — sort 는 안정 정렬이라 같은 비율이면 LABELS 순서를 지킵니다.
  const collecting = labels.filter((l) => !l.earned).sort((a, b) => b.have / b.need - a.have / a.need);
  // 계정 화면처럼, 지금도 얻은 상태인 라벨만 대표로 보여줍니다.
  const title = labels.find((l) => l.id === titleId && l.earned) ?? null;
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
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 14, paddingBottom: 6 }}>
        <BackButton />
        <View style={{ paddingHorizontal: 8, marginTop: 6, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <View>
            <Eyebrow wide>LABELS</Eyebrow>
            <Text style={{ marginTop: 8, fontFamily: F.serif, fontSize: 26, color: C.ink }}>라벨첩</Text>
          </View>
          <View style={{ flexDirection: "row", borderRadius: 12, padding: 3, backgroundColor: "#ece7dc" }}>
            {([["labels", "라벨"], ["districts", "구 칭호"]] as const).map(([key, text]) => {
              const on = tab === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[{ borderRadius: 9, paddingVertical: 7, paddingHorizontal: 12 }, on && { backgroundColor: C.card, ...SEGMENT_SHADOW }]}
                >
                  <Text style={{ fontFamily: F.sansBd, fontSize: 12, color: on ? C.ink : C.faint }}>{text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      {!!error && <Text style={{ paddingHorizontal: 22, marginTop: 6, fontFamily: F.sans, fontSize: 11, color: C.brick }}>{error}</Text>}

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {tab === "districts" ? (
          <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Eyebrow>DISTRICTS</Eyebrow>
              <Text style={{ fontFamily: F.sans, fontSize: 11, color: "#a29a8c" }}>받은 칭호 {districts.filter((t) => t.tier).length}개</Text>
            </View>
            <Text style={{ marginTop: 5, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.faint }}>한 구에서 인증한 기록이 쌓이면 칭호를 받습니다. 10곳 러버, 30곳 보안관, 50곳 맛잘알.</Text>
            {districts.length > 0 ? (
              <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", rowGap: 22 }}>
                {districts.map((t) => <View key={t.region} style={{ width: "33.33%" }}><DistrictBadge title={t} /></View>)}
              </View>
            ) : (
              <Text style={{ marginTop: 16, fontFamily: F.sans, fontSize: 12, color: C.faint }}>아직 칭호를 받은 구가 없어요</Text>
            )}
          </View>
        ) : (
          <>
            <Pressable
              onPress={() => scrollRef.current?.scrollTo({ y: earnedY.current, animated: true })}
              accessibilityLabel="대표 라벨 바꾸기"
              style={{ marginTop: 18, marginHorizontal: 22, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: "#e6e0d3", backgroundColor: C.card, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
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
                    <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 10.5, color: C.faint }}>닉네임 옆에 이렇게 붙어요 · 탭해서 바꾸기</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderStyle: "dashed", borderColor: "#cfc7b6" }} />
                  <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>대표 라벨을 골라보세요</Text>
                </>
              )}
            </Pressable>

            <View onLayout={(e) => { earnedY.current = e.nativeEvent.layout.y; }}>
              <SectionHead title="모은 라벨" right={`${earned.length} / ${labels.length}`} mono top={22} />
              {earned.length > 0 ? (
                <Grid>
                  {earned.map((l) => (
                    <Pressable
                      key={l.id}
                      disabled={busy}
                      onPress={() => toggleTitle(l.id)}
                      accessibilityLabel={`${l.name} 대표 라벨로 ${l.id === titleId ? "해제" : "선택"}`}
                      style={CELL}
                    >
                      <LabelBadge label={l} selected={l.id === titleId} />
                      <CellText label={l} />
                    </Pressable>
                  ))}
                </Grid>
              ) : (
                <Text style={{ paddingHorizontal: 22, marginTop: 12, fontFamily: F.sans, fontSize: 12, color: C.faint }}>아직 모은 라벨이 없어요. 아래에서 가까운 것부터 모아보세요</Text>
              )}
            </View>

            {collecting.length > 0 && (
              <>
                <SectionHead title="모으는 중" right="가까운 순" top={28} />
                <Grid>
                  {collecting.map((l) => (
                    <View key={l.id} style={CELL}>
                      <LabelBadge label={l} />
                      <CellText label={l} />
                      <View style={{ width: 70, flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: "#e6e0d3", overflow: "hidden" }}>
                          <View style={{ width: `${Math.min(1, l.have / l.need) * 100}%`, height: 3, borderRadius: 2, backgroundColor: l.color }} />
                        </View>
                        <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.faint }}>{Math.min(l.have, l.need)} / {l.need}</Text>
                      </View>
                    </View>
                  ))}
                </Grid>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const CELL = { width: "33.33%", alignItems: "center", gap: 8, paddingHorizontal: 4 } as const;

const SectionHead = ({ title, right, mono, top }: { title: string; right: string; mono?: boolean; top: number }) => (
  <View style={{ paddingTop: top, paddingHorizontal: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
    <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.ink }}>{title}</Text>
    <Text style={{ fontFamily: mono ? F.mono : F.sans, fontSize: 10.5, color: C.faint }}>{right}</Text>
  </View>
);

const Grid = ({ children }: { children: React.ReactNode }) => (
  <View style={{ paddingHorizontal: 14, marginTop: 14, flexDirection: "row", flexWrap: "wrap", rowGap: 20 }}>{children}</View>
);

const CellText = ({ label }: { label: EarnedLabel }) => (
  <>
    <Text style={{ textAlign: "center", fontFamily: F.serif, fontSize: 13, color: label.earned ? C.ink : C.muted }}>{label.name}</Text>
    <Text style={{ textAlign: "center", fontFamily: F.sans, fontSize: 10, lineHeight: 14, color: C.faint }}>{label.desc}</Text>
  </>
);
