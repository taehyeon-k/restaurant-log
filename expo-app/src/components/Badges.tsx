import { Text, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import type { EarnedLabel } from "@/lib/labels";
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

/**
 * 라벨 로제트 메달(그릇 수 라벨이 생기기 전 라벨첩의 모양) — 얻었으면 라벨 색 테두리에 아이콘, 아니면 회색으로 잠겨 있습니다.
 * 대표 라벨이면 아래에 「대표」 알약이 붙습니다.
 */
export function LabelBadge({ label, selected, size = 80 }: { label: EarnedLabel; selected?: boolean; size?: number }) {
  const { earned, color } = label;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="-4 -4 108 108">
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
