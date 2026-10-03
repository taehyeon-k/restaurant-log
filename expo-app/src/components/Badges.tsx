import { Text, View } from "react-native";
import Svg, { Circle, Path, Polygon } from "react-native-svg";
import type { EarnedLabel, RegionTitle } from "@/lib/labels";
import { REGION_EN } from "@/lib/labels";
import { C, F } from "@/theme";

/**
 * 웹의 `.label-badge-*` 비대칭 border-radius / clip-path 를 react-native-svg 로 다시 그립니다(핸드오프 §9).
 * border-radius 8값 → 타원 호 path, polygon → 0–100 좌표 그대로.
 */
function roundedPath(s: number, h: [number, number, number, number], v: [number, number, number, number]) {
  // h/v: 좌상·우상·우하·좌하 모서리의 가로·세로 반지름(0–1 비율)
  const [htl, htr, hbr, hbl] = h.map((n) => n * s);
  const [vtl, vtr, vbr, vbl] = v.map((n) => n * s);
  return [
    `M${htl} 0`, `H${s - htr}`, `A${htr} ${vtr} 0 0 1 ${s} ${vtr}`, `V${s - vbr}`, `A${hbr} ${vbr} 0 0 1 ${s - hbr} ${s}`,
    `H${hbl}`, `A${hbl} ${vbl} 0 0 1 0 ${s - vbl}`, `V${vtl}`, `A${htl} ${vtl} 0 0 1 ${htl} 0`, "Z",
  ].join(" ");
}

const SHAPES: Record<string, { d?: string; points?: string }> = {
  verified: { d: roundedPath(100, [18, 18, 18, 18], [18, 18, 18, 18]) },
  gold: { d: roundedPath(100, [42, 58, 45, 55], [52, 44, 56, 48]) },
  regular: { points: "50,0 100,17 100,62 50,100 0,62 0,17" },
  hundred: { d: roundedPath(100, [18, 18, 50, 50], [18, 18, 50, 50]) },
  midnight: { d: roundedPath(100, [50, 50, 50, 8], [50, 50, 50, 8]) },
  first: { d: roundedPath(100, [50, 50, 50, 50], [50, 50, 50, 50]) },
  regions: { points: "50,0 93,25 93,75 50,100 7,75 7,25" },
  years: { d: roundedPath(100, [50, 50, 12, 12], [50, 50, 12, 12]) },
};

/** 보안관 배지 — 육각 별. 등급이 달라도 모양은 하나, 색만 바뀝니다. */
const SHERIFF_STAR = "50,0 68,18.8 93.3,25 86,50 93.3,75 68,81.2 50,100 32,81.2 6.7,75 14,50 6.7,25 32,18.8";

/** 라벨 도장 배지 — 모은 만큼 테두리가 채워지고, 얻었으면 안이 라벨 색으로 찹니다. */
export function LabelBadge({ label, selected }: { label: EarnedLabel; selected?: boolean }) {
  const progress = Math.min(1, label.have / label.need);
  const shape = SHAPES[label.id] ?? SHAPES.verified;
  const inner = label.earned ? label.color : "#eae5da";
  const fg = label.earned ? C.card : "#b3aa9a";

  const render = (props: object) =>
    shape.points ? <Polygon points={shape.points} {...props} /> : <Path d={shape.d} {...props} />;

  return (
    <View style={{ width: 92, height: 92, alignItems: "center", justifyContent: "center", borderRadius: 46, borderWidth: selected ? 3 : 0, borderColor: C.brick }}>
      <Svg width={92} height={92} viewBox="-3 -3 106 106" style={{ position: "absolute" }}>
        {render({ fill: "none", stroke: "#ded8cb", strokeWidth: 5 })}
        {progress > 0 && render({ fill: "none", stroke: label.color, strokeWidth: 5, pathLength: 100, strokeDasharray: `${progress * 100} 100` })}
      </Svg>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: inner, borderWidth: 1, borderStyle: "dashed", borderColor: "#cfc7b6", alignItems: "center", justifyContent: "center" }}>
        <Svg width={32} height={32} viewBox="0 0 32 32" fill="none" stroke={fg} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="16" cy="16" r="9" />
          {label.id === "verified" ? <Path d="m11 16 3 3 7-7" /> : <Path d="M11 21h10M13 18h6M14 14h4" />}
        </Svg>
      </View>
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
