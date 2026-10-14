import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { ART, CHARACTER_VIEWBOX, type CharacterId, type Shape } from "@/lib/characters";

const SILHOUETTE = "#1c1a17";

function draw(shapes: Shape[], locked: boolean, prefix = ""): React.ReactNode[] {
  return shapes.map((s, i) => {
    const key = `${prefix}${i}`;
    if (s.t === "g") return <G key={key} transform={s.transform}>{draw(s.children, locked, `${key}-`)}</G>;
    const fill = s.fill && s.fill !== "none" ? (locked ? SILHOUETTE : s.fill) : "none";
    const stroke = s.stroke ? (locked ? SILHOUETTE : s.stroke) : undefined;
    const paint = { fill, stroke, strokeWidth: s.sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    switch (s.t) {
      case "path": return <Path key={key} d={s.d} {...paint} />;
      case "circle": return <Circle key={key} cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
      case "ellipse": return <Ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...paint} />;
      case "rect": return <Rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} {...paint} />;
    }
  });
}

/** 캐릭터 그림 — 높이는 size × 212 / 200. locked 면 도감의 실루엣. */
export function Character({ id, size, locked = false }: { id: CharacterId; size: number; locked?: boolean }) {
  const { w, h } = CHARACTER_VIEWBOX;
  return (
    <Svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} opacity={locked ? 0.12 : 1}>
      {draw(ART[id], locked)}
    </Svg>
  );
}
