import { Text, View } from "react-native";
import Svg, { Circle, G, Path, Polygon } from "react-native-svg";
import type { EarnedLabel, RegionTitle } from "@/lib/labels";
import { REGION_EN } from "@/lib/labels";
import { C, F } from "@/theme";

/** 라벨 로제트 테두리 — 원 둘레를 n 개의 물결로 나눈 path(0–100 좌표). */
function scallopPath(n = 16, r = 44, peak = 56) {
  const p = (a: number, rad: number) => `${(50 + rad * Math.sin(a)).toFixed(2)} ${(50 - rad * Math.cos(a)).toFixed(2)}`;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 0.5) / n) * 2 * Math.PI, a2 = ((i + 1) / n) * 2 * Math.PI;
    d += (i === 0 ? `M${p(a0, r)} ` : "") + `Q${p(a1, peak)} ${p(a2, r)} `;
  }
  return d + "Z";
}
const SCALLOP = scallopPath();

/** 보안관 배지 — 육각 별. 등급이 달라도 모양은 하나, 색만 바뀝니다. */
const SHERIFF_STAR = "50,0 68,18.8 93.3,25 86,50 93.3,75 68,81.2 50,100 32,81.2 6.7,75 14,50 6.7,25 32,18.8";

/** 라벨 로제트 메달 — 얻었으면 라벨 색 테두리에 아이콘, 아니면 회색으로 잠겨 있습니다. 대표 라벨이면 아래에 「대표」 알약이 붙습니다. */
export function LabelBadge({ label, selected }: { label: EarnedLabel; selected?: boolean }) {
  const { earned, color } = label;

  return (
    <View style={{ width: 80, height: 80 }}>
      <Svg width={80} height={80} viewBox="-4 -4 108 108">
        <Path d={SCALLOP} fill={earned ? color : "#e6e0d3"} />
        <Circle cx={50} cy={50} r={36} fill={earned ? C.card : "#f3efe6"} />
        {earned && <Circle cx={50} cy={50} r={31} fill="none" stroke={color + "55"} strokeWidth={1} strokeDasharray="2 2.5" />}
        <G transform="translate(29 29) scale(1.75)">
          <Path d={label.icon} fill="none" stroke={earned ? color : "#bdb4a3"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </G>
      </Svg>
      {selected && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: -6, alignItems: "center" }}>
          <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: C.ink }}>
            <Text style={{ fontFamily: F.sansBd, fontSize: 9, color: C.card }}>대표</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/** 동네 칭호 배지 — 육각 별 하나에 등급색만 바뀝니다. */
export function DistrictBadge({ title }: { title: RegionTitle }) {
  const { region, have, tier, next } = title;
  const on = tier !== null;
  const color = on ? tier.color : "#cfc7b6";
  const progress = on ? (next ? `인증 ${have} · 다음 ${next.need}` : `인증 ${have} · 끝까지 왔습니다`) : `인증 ${have} / ${next?.need ?? 10}`;

  return (
    <View style={{ alignItems: "center", gap: 9 }}>
      <View style={{ width: 78, height: 78, alignItems: "center", justifyContent: "center" }}>
        <Svg width={78} height={78} viewBox="0 0 100 100" style={{ position: "absolute" }}>
          <Polygon points={SHERIFF_STAR} fill={color} />
        </Svg>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: on ? tier.ink : "#f1ede4", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 8, color: on ? "#3a3128" : "#a8a094" }}>{REGION_EN[region] ?? region}</Text>
          {on && <Text style={{ fontFamily: F.mono, fontSize: 7, color: "#7a6a52" }}>{"★★★".slice(0, tier.stars)}</Text>}
        </View>
        {on && (
          <View style={{ position: "absolute", right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: tier.color, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.serif, fontSize: 11, color: tier.color }}>{tier.tier}</Text>
          </View>
        )}
      </View>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontFamily: F.serif, fontSize: 13, color: on ? C.ink : C.faint }}>{on ? `${region} ${tier.suffix}` : region}</Text>
        <Text style={{ marginTop: 3, fontFamily: F.mono, fontSize: 9.5, color: C.faint }}>{progress}</Text>
      </View>
    </View>
  );
}
