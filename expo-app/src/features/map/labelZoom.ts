import { LABEL_BOTTOM, tagHeight, tagWidth } from "./Markers";

/**
 * 마커마다 「이름표를 언제부터 보여줄지」 줌을 따로 정합니다.
 * 이름표가 다른 이름표·핀과 겹치지 않게 되는 가장 낮은 줌을 구하고, MIN_ZOOM~MAX_ZOOM 으로 묶습니다.
 * 한산한 곳은 일찍, 붐비는 곳은 더 당겨야 보이고, MAX_ZOOM 부터는 겹쳐도 모두 보입니다.
 */
export const MIN_ZOOM = 13;
export const MAX_ZOOM = 16;
/** 이름표 둘레 여유(dp). */
const GAP = 4;

export type LabelItem = { id: string; lat: number; lng: number; name: string; kind: "record" | "wish"; planned?: boolean };

/** 마커 기준점에서 본 상자(dp, y 는 아래로 +). */
type Box = { x0: number; x1: number; y0: number; y1: number };

/* Markers.tsx 의 생김새 그대로 — 기록 핀은 기준점이 상자 바닥 6px 위, 위시는 10px 위. */
function boxes(it: LabelItem): { label: Box; pin: Box } {
  const lift = LABEL_BOTTOM - (it.kind === "record" ? 6 : 10);
  const h = tagHeight(it.kind === "record" ? "rating" : "none");
  const w = tagWidth(it.name);
  const label = { x0: -w / 2 - GAP, x1: w / 2 + GAP, y0: -lift - h - GAP, y1: -lift + GAP };
  if (it.kind === "wish") return { label, pin: { x0: -13, x1: 13, y0: -24, y1: 2 } };
  // 물방울(23px) 꼭대기는 기준점 25px 위, 위시 책갈피 배지는 오른쪽 위로 삐져나옵니다.
  return { label, pin: it.planned ? { x0: -12, x1: 22, y0: -32, y1: 6 } : { x0: -12, x1: 12, y0: -25, y1: 6 } };
}

/** 줌 0 에서의 화면 좌표(256dp 세계, 웹 메르카토르). 줌 z 에서는 2^z 배. */
function project(lat: number, lng: number) {
  const r = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * 256, y: ((1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2) * 256 };
}

/** 한 축에서 s·d 가 (a, b) 안에 드는 배율 s 의 구간. */
function axis(a: number, b: number, d: number): [number, number] | null {
  if (d === 0) return a < 0 && 0 < b ? [0, Infinity] : null;
  const p = a / d, q = b / d;
  return [Math.min(p, q), Math.max(p, q)];
}

/** 상자 A(원점)와 s·d 만큼 옮긴 상자 B 가 겹치는 가장 큰 배율 — 이보다 당기면 더는 겹치지 않습니다. 안 겹치면 0. */
function clearScale(A: Box, B: Box, dx: number, dy: number) {
  const ix = axis(A.x0 - B.x1, A.x1 - B.x0, dx);
  const iy = axis(A.y0 - B.y1, A.y1 - B.y0, dy);
  if (!ix || !iy) return 0;
  const lo = Math.max(ix[0], iy[0], 0), hi = Math.min(ix[1], iy[1]);
  return lo < hi ? hi : 0;
}

/** 이 배율 이상 떨어져 있으면 MIN_ZOOM 에서 이미 어떤 상자도 닿지 않습니다(이름표 최대 폭 220dp 기준). */
const FAR_X = 500, FAR_Y = 300;

export function revealZooms(items: LabelItem[]): Map<string, number> {
  const pts = items.map((it) => ({ ...project(it.lat, it.lng), ...boxes(it) }));
  const need = items.map(() => 0); // 겹치지 않으려면 필요한 배율(2^줌)
  const minScale = 2 ** MIN_ZOOM;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) * minScale > FAR_X || Math.abs(dy) * minScale > FAR_Y) continue;
      const both = clearScale(a.label, b.label, dx, dy);
      need[i] = Math.max(need[i], both, clearScale(a.label, b.pin, dx, dy));
      need[j] = Math.max(need[j], both, clearScale(b.label, a.pin, -dx, -dy));
    }
  }
  return new Map(items.map((it, i) => [it.id, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, need[i] > 0 ? Math.log2(need[i]) : MIN_ZOOM))]));
}
