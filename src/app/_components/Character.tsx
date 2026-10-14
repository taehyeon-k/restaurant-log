import { ART, CHARACTER_VIEWBOX, type CharacterId, type Shape } from "@/lib/characters";

const SILHOUETTE = "#1c1a17";

function draw(shapes: Shape[], locked: boolean, prefix = ""): React.ReactNode[] {
  return shapes.map((s, i) => {
    const key = `${prefix}${i}`;
    if (s.t === "g") return <g key={key} transform={s.transform}>{draw(s.children, locked, `${key}-`)}</g>;
    const fill = s.fill && s.fill !== "none" ? (locked ? SILHOUETTE : s.fill) : "none";
    const stroke = s.stroke ? (locked ? SILHOUETTE : s.stroke) : undefined;
    const paint = { fill, stroke, strokeWidth: s.sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    switch (s.t) {
      case "path": return <path key={key} d={s.d} {...paint} />;
      case "circle": return <circle key={key} cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
      case "ellipse": return <ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...paint} />;
      case "rect": return <rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} {...paint} />;
    }
  });
}

/** 캐릭터 그림 — 앱 expo-app/src/components/Character.tsx 와 같은 그림(lib/characters.ts ART). */
export function Character({ id, size, locked = false }: { id: CharacterId; size: number; locked?: boolean }) {
  const { w, h } = CHARACTER_VIEWBOX;
  return (
    <svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} opacity={locked ? 0.12 : 1} aria-hidden className="shrink-0">
      {draw(ART[id], locked)}
    </svg>
  );
}
