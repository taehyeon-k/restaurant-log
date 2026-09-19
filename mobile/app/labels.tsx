/**
 * 라벨첩 — 획득 조건은 아직 확정 전이라 `src/lib/labels.ts` 의 잠정 규칙을 씁니다.
 * 웹의 비대칭 border-radius(`42% 58% 45% 55% / …`)는 RN 에서 불가능해
 * clip-path 도형은 전부 SVG Polygon 으로 다시 그렸습니다(§9).
 */
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, ClipPath, Path, Polygon, Rect } from "react-native-svg";

import { BackButton, CLIP_POINTS, Eyebrow } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAccount, useRefresh, useRestaurants } from "@/lib/data";
import {
  earnedLabels,
  regionTitles,
  REGION_EN,
  type EarnedLabel,
  type RegionTitle,
} from "@/lib/labels";
import { C, FONT } from "@/lib/theme";

export default function LabelBookScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refresh = useRefresh();
  const { rows } = useRestaurants();
  const { data: account } = useAccount();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const titleId = account?.titleLabelId ?? null;
  const labels = earnedLabels(rows);
  const got = labels.filter((l) => l.earned).length;
  const districts = regionTitles(rows);
  const gotDistricts = districts.filter((t) => t.tier).length;

  async function toggleTitle(id: string) {
    if (busy) return;
    const next = titleId === id ? null : id;
    setBusy(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다");

      const { error: err } = await supabase.from("profiles").upsert({ id: user.id, title_label_id: next });
      if (err) throw new Error(err.message);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "대표 라벨을 바꾸지 못했습니다");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <BackButton onPress={() => router.back()} style={{ position: "absolute", left: 14, top: insets.top + 6, zIndex: 2 }} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: insets.top + 62, paddingBottom: insets.bottom + 40 }}>
        <Eyebrow wide>LABELS</Eyebrow>
        <Text style={{ marginTop: 8, fontFamily: FONT.serifBold, fontSize: 26, color: C.ink }}>라벨첩</Text>
        <Text style={{ marginTop: 6, fontSize: 12, color: C.faint, fontFamily: FONT.sans }}>
          모은 라벨 {got} / {labels.length}
        </Text>
        <Text style={{ marginTop: 4, fontSize: 11, color: C.faint, fontFamily: FONT.sans }}>
          탭하면 닉네임 옆 대표 라벨로 붙습니다
        </Text>
        {error.length > 0 && (
          <Text style={{ marginTop: 6, fontSize: 11, color: C.brick, fontFamily: FONT.sans }}>{error}</Text>
        )}

        {districts.length > 0 && (
          <View style={{ marginTop: 26, marginBottom: 30 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <Eyebrow>DISTRICTS</Eyebrow>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: FONT.sans }}>받은 칭호 {gotDistricts}개</Text>
            </View>
            <Text style={{ marginTop: 5, fontSize: 11.5, lineHeight: 18, color: C.faint, fontFamily: FONT.sans }}>
              한 구에서 인증한 기록이 쌓이면 칭호를 받습니다. 10곳 러버, 30곳 보안관, 50곳 맛잘알.
            </Text>

            <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", rowGap: 22 }}>
              {districts.map((t) => (
                <View key={t.region} style={{ width: "33.33%", alignItems: "center" }}>
                  <DistrictBadge title={t} />
                </View>
              ))}
            </View>
          </View>
        )}

        {districts.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Eyebrow>LABELS</Eyebrow>
          </View>
        )}

        <View style={{ marginTop: districts.length ? 0 : 22, flexDirection: "row", flexWrap: "wrap", rowGap: 26 }}>
          {labels.map((l) => (
            <View key={l.id} style={{ width: "33.33%", alignItems: "center", gap: 10, paddingHorizontal: 4 }}>
              <Shape label={l} selected={l.id === titleId} onToggle={l.earned ? () => toggleTitle(l.id) : undefined} />
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: FONT.serifBold, fontSize: 13, color: l.earned ? C.ink : C.faint, textAlign: "center" }}>
                  {l.name}
                </Text>
                <Text style={{ marginTop: 3, fontSize: 10, lineHeight: 15, color: C.faint, textAlign: "center", fontFamily: FONT.sans }}>
                  {l.earned || l.need === 1 ? l.desc : `${l.desc} · ${Math.min(l.have, l.need)}/${l.need}`}
                </Text>
                {l.id === titleId && (
                  <Text style={{ marginTop: 3, fontSize: 9.5, color: C.brick, fontFamily: FONT.sansBold }}>대표 라벨</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** 동네 칭호 배지 — 육각 별 하나에 등급색만 바뀝니다. */
function DistrictBadge({ title }: { title: RegionTitle }) {
  const { region, have, tier, next } = title;
  const on = tier !== null;
  const color = on ? tier.color : "#cfc7b6";

  const progress = on
    ? next
      ? `인증 ${have} · 다음 ${next.need}`
      : `인증 ${have} · 끝까지 왔습니다`
    : `인증 ${have} / ${next?.need ?? 10}`;

  return (
    <View style={{ alignItems: "center", gap: 9 }}>
      <View style={{ width: 78, height: 78 }}>
        <Svg width={78} height={78} viewBox="0 0 100 100">
          <Polygon points={CLIP_POINTS.sheriff} fill={color} />
        </Svg>

        <View
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
            backgroundColor: on ? tier.ink : "#f1ede4",
          }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontFamily: FONT.mono, fontSize: 8, color: on ? "#3a3128" : "#a8a094" }}
          >
            {REGION_EN[region] ?? region}
          </Text>
          {on && (
            <Text style={{ fontFamily: FONT.mono, fontSize: 7, letterSpacing: 0.4, color: "#7a6a52" }}>
              {"★★★".slice(0, tier.stars)}
            </Text>
          )}
        </View>

        {on && (
          <View
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: tier.color,
              backgroundColor: C.card,
            }}
          >
            <Text style={{ fontFamily: FONT.serifBold, fontSize: 11, color: tier.color }}>{tier.tier}</Text>
          </View>
        )}
      </View>

      <View style={{ alignItems: "center" }}>
        <Text style={{ fontFamily: FONT.serifBold, fontSize: 13, color: on ? C.ink : C.faint, textAlign: "center" }}>
          {on ? `${region} ${tier.suffix}` : region}
        </Text>
        <Text style={{ marginTop: 3, fontFamily: FONT.mono, fontSize: 9.5, color: C.faint, textAlign: "center" }}>
          {progress}
        </Text>
      </View>
    </View>
  );
}

/**
 * 도장 배지. 모은 라벨은 탭해서 대표 라벨로 고를 수 있습니다.
 * 테두리 고리는 진행률을 나타냅니다 — 웹의 conic-gradient 자리에 원호를 씁니다.
 */
function Shape({
  label,
  selected,
  onToggle,
}: {
  label: EarnedLabel;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const size = 92;
  const inner = 84;
  const progress = Math.min(1, label.have / label.need);
  const color = label.earned ? label.color : "#eae5da";
  const radius = (size - 3) / 2;

  const badge = (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#ded8cb" strokeWidth={3} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={label.color}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * radius * progress} ${2 * Math.PI * radius}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: "#cfc7b6",
          backgroundColor: color,
        }}
      >
        <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
          <Circle cx="16" cy="16" r="9" stroke={label.earned ? C.card : "#b3aa9a"} strokeWidth={1.5} />
          {label.id === "verified" ? (
            <Path d="m11 16 3 3 7-7" stroke={label.earned ? C.card : "#b3aa9a"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <Path d="M11 21h10M13 18h6M14 14h4" stroke={label.earned ? C.card : "#b3aa9a"} strokeWidth={1.5} strokeLinecap="round" />
          )}
        </Svg>
      </View>

      {selected && (
        <View
          style={{
            position: "absolute",
            width: size + 8,
            height: size + 8,
            borderRadius: (size + 8) / 2,
            borderWidth: 3,
            borderColor: C.brick,
          }}
        />
      )}
    </View>
  );

  if (!onToggle) return badge;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityState={{ selected }}
      accessibilityLabel={`${label.name} 대표 라벨로 ${selected ? "해제" : "선택"}`}
    >
      {badge}
    </Pressable>
  );
}
