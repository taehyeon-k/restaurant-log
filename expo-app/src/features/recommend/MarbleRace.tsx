import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { C, F } from "@/theme";
import type { PachinkoOption } from "./Pachinko";
import { REC } from "./ui";

/**
 * 구슬 경주(마블 레이스) — 칸마다 색이 다른 구슬 하나. 위에서 하나씩 떨어져 핀 · 비탈 · 도는 막대에 부딪히며 내려가고,
 * 결승선을 가장 먼저 지난 구슬이 이깁니다. 결과를 미리 뽑지 않고 작은 물리(중력 · 튕김 · 구슬끼리 부딪힘)로 정합니다.
 * 코스는 300 × 572 좌표로 두고 화면 폭에 맞춰 늘립니다. 결승선 바로 앞은 「마지막 관문」 — 구슬 두 개 폭의 구멍 위에서 막대가 돌며 쳐냅니다.
 */

const CW = 300;
const CH = 572;
const PAD = 10;
const BALL_R = 7;
const PEG_R = 3.2;
const G = 900;
const BOUNCE = 0.45;
const SUBSTEPS = 4;
/** 구슬을 하나씩 놓는 간격 · 1등이 나온 뒤 더 보여 주는 시간 · 아무도 못 들어와도 끝내는 시간. */
const RELEASE_MS = 110;
const AFTER_MS = 2500;
const MAX_MS = 25000;

/** 구슬 색 — 앱 톤(벽돌 · 살구 · 겨자 · 올리브 · 청록 · 남색 · 자두 · 장미 · 모래 · 밤 · 하늘 · 먹). */
const MARBLES = ["#b4552d", "#e08a63", "#d9a441", "#7d8a4a", "#4f7f7a", "#4f6b7a", "#7a4f6b", "#c9727d", "#c8ab83", "#6b4a33", "#8fb0c4", "#3b3733"];

type Pt = { x: number; y: number };
type Seg = { a: Pt; b: Pt };
type Spinner = { c: Pt; len: number; w: number };
type Ball = { x: number; y: number; vx: number; vy: number; on: boolean; done: boolean; still: number };

/* ── 코스 ─────────────────────────────── */

function stagger(y0: number, rows: number, gap: number, dy: number): Pt[] {
  const out: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? gap / 2 : 0;
    for (let x = gap / 2 + off; x < CW - 4; x += gap) out.push({ x, y: y0 + r * dy });
  }
  return out;
}
const PEGS: Pt[] = [...stagger(52, 5, 30, 24), ...stagger(300, 4, 34, 24)];
const SEGS: Seg[] = [
  // 첫 깔때기
  { a: { x: 0, y: 176 }, b: { x: 118, y: 206 } },
  { a: { x: CW, y: 176 }, b: { x: CW - 118, y: 206 } },
  // 아래 엇갈린 비탈
  { a: { x: 0, y: 404 }, b: { x: 112, y: 424 } },
  { a: { x: CW, y: 404 }, b: { x: CW - 112, y: 424 } },
  { a: { x: 96, y: 446 }, b: { x: 140, y: 452 } },
  { a: { x: CW - 96, y: 446 }, b: { x: CW - 140, y: 452 } },
];
/** 마지막 관문 — 양쪽에서 내려오는 깔때기, 가운데 구멍은 구슬 두 개 폭이 안 됩니다. */
const GATE_Y = 528;
const GATE_GAP = 15;
const GATE: Seg[] = [
  { a: { x: 0, y: 466 }, b: { x: CW / 2 - GATE_GAP, y: GATE_Y } },
  { a: { x: CW, y: 466 }, b: { x: CW / 2 + GATE_GAP, y: GATE_Y } },
];
const SPINNERS: Spinner[] = [
  { c: { x: CW * 0.28, y: 252 }, len: 72, w: 2.4 },
  { c: { x: CW * 0.72, y: 252 }, len: 72, w: -2.4 },
  // 관문지기 — 구멍 바로 위에서 돌며 막았다 열었다, 다가온 구슬을 쳐올립니다.
  { c: { x: CW / 2, y: GATE_Y - 26 }, len: 40, w: 2.2 },
];
const spinSeg = (s: Spinner, t: number): Seg => {
  const a = s.w * t;
  const dx = (Math.cos(a) * s.len) / 2, dy = (Math.sin(a) * s.len) / 2;
  return { a: { x: s.c.x - dx, y: s.c.y - dy }, b: { x: s.c.x + dx, y: s.c.y + dy } };
};

/** 공을 바깥으로 밀고 튕깁니다. surf 는 닿은 면의 속도(도는 막대). */
function resolve(b: Ball, nx: number, ny: number, pen: number, surf: Pt = { x: 0, y: 0 }) {
  b.x += nx * pen;
  b.y += ny * pen;
  const rx = b.vx - surf.x, ry = b.vy - surf.y;
  const vn = rx * nx + ry * ny;
  if (vn >= 0) return;
  // 법선 쪽은 튕기고, 옆으로는 살짝만 줄입니다. 핀에 똑바로 얹히지 않게 아주 조금 흔듭니다.
  const tx = rx - vn * nx, ty = ry - vn * ny;
  const jitter = (Math.random() - 0.5) * 18;
  b.vx = surf.x + tx * 0.985 - BOUNCE * vn * nx + jitter * -ny;
  b.vy = surf.y + ty * 0.985 - BOUNCE * vn * ny + jitter * nx;
}

function hitSeg(b: Ball, s: Seg, surfAt?: (p: Pt) => Pt) {
  const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y;
  const L2 = ex * ex + ey * ey;
  const t = Math.max(0, Math.min(1, ((b.x - s.a.x) * ex + (b.y - s.a.y) * ey) / L2));
  const px = s.a.x + ex * t, py = s.a.y + ey * t;
  const dx = b.x - px, dy = b.y - py;
  const d = Math.hypot(dx, dy);
  if (d >= BALL_R + 1.5 || d === 0) return;
  resolve(b, dx / d, dy / d, BALL_R + 1.5 - d, surfAt?.({ x: px, y: py }));
}

function step(balls: Ball[], dt: number, t: number) {
  const spins = SPINNERS.map((s) => ({ s, seg: spinSeg(s, t) }));
  for (const b of balls) {
    if (!b.on || b.done) continue;
    b.vy += G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    for (const p of PEGS) {
      const dx = b.x - p.x, dy = b.y - p.y;
      const rr = BALL_R + PEG_R;
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      const d = Math.hypot(dx, dy);
      if (d < rr && d > 0) resolve(b, dx / d, dy / d, rr - d);
    }
    for (const s of SEGS) hitSeg(b, s);
    for (const s of GATE) hitSeg(b, s);
    for (const { s, seg } of spins) hitSeg(b, seg, (p) => ({ x: -s.w * (p.y - s.c.y), y: s.w * (p.x - s.c.x) }));
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * BOUNCE; }
    if (b.x > CW - BALL_R) { b.x = CW - BALL_R; b.vx = -Math.abs(b.vx) * BOUNCE; }
  }
  // 구슬끼리
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (!a.on || a.done) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (!b.on || b.done) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= BALL_R * 2 || d === 0) continue;
      const nx = dx / d, ny = dy / d, pen = (BALL_R * 2 - d) / 2;
      a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const k = ((1 + 0.6) * vn) / 2;
        a.vx += k * nx; a.vy += k * ny; b.vx -= k * nx; b.vy -= k * ny;
      }
    }
  }
}

/* ── 화면 ─────────────────────────────── */

export function MarbleRace({ options, busy, onStart, onDone }: {
  options: PachinkoOption[]; busy: boolean;
  onStart: () => void; onDone: (o: PachinkoOption) => void;
}) {
  const [w, setW] = useState(0);
  const k = Math.max(0, w - PAD * 2) / CW;
  const n = options.length;
  const ready = n >= 2 && k > 0;

  const balls = useRef<Ball[]>([]);
  const [, setFrame] = useState(0);
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const [rank, setRank] = useState<number[]>([]);
  const simT = useRef(0);
  const raf = useRef<number | null>(null);

  const idle = (): Ball[] => options.map((_, i) => ({ x: CW / 2 + (i - (n - 1) / 2) * (BALL_R * 2 + 2), y: 18, vx: 0, vy: 0, on: false, done: false, still: 0 }));
  const sig = options.map((o) => o.key).join("|");
  useEffect(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
    balls.current = idle();
    simT.current = 0;
    setRunning(false);
    setWinner(null);
    setRank([]);
    setFrame((f) => f + 1);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  function race() {
    if (!ready || busy || running) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // 놓는 순서도 마구 섞습니다.
    const order = options.map((_, i) => i).sort(() => Math.random() - 0.5);
    const releaseAt = new Map(order.map((i, r) => [i, r * RELEASE_MS]));
    balls.current = options.map(() => ({ x: CW / 2 + (Math.random() - 0.5) * 120, y: -BALL_R * 2, vx: (Math.random() - 0.5) * 60, vy: 0, on: false, done: false, still: 0 }));
    simT.current = 0;
    setWinner(null);
    setRank([]);
    setRunning(true);
    onStart();

    const finished: number[] = [];
    let firstAt: number | null = null;
    let last = performance.now();
    const tick = (now: number) => {
      const dtMs = Math.min(33, now - last);
      last = now;
      simT.current += dtMs;
      const t = simT.current;
      const bs = balls.current;
      bs.forEach((b, i) => { if (!b.on && t >= releaseAt.get(i)!) b.on = true; });
      const dt = dtMs / 1000 / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) step(bs, dt, t / 1000 + s * dt);
      bs.forEach((b, i) => {
        if (!b.on || b.done) return;
        // 오래 멈춰 있으면 살짝 밀어 줍니다(핀 사이에 끼었을 때).
        b.still = Math.hypot(b.vx, b.vy) < 12 ? b.still + dtMs : 0;
        if (b.still > 900) { b.vx = (Math.random() - 0.5) * 160; b.vy = -80; b.still = 0; }
        if (b.y - BALL_R > CH) {
          b.done = true;
          finished.push(i);
          if (finished.length === 1) {
            firstAt = t;
            setWinner(i);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onDone(options[i]);
          } else Haptics.selectionAsync();
          setRank([...finished]);
        }
      });
      const allDone = finished.length === bs.length;
      const timeUp = t > MAX_MS;
      if (allDone || (firstAt != null && t - firstAt > AFTER_MS) || timeUp) {
        if (finished.length === 0) {
          // 아무도 못 들어왔으면 가장 아래 있는 구슬이 이깁니다.
          const best = bs.reduce((bi, b, i) => (b.y > bs[bi].y ? i : bi), 0);
          setWinner(best);
          onDone(options[best]);
        }
        raf.current = null;
        setRunning(false);
        setFrame((f) => f + 1);
        return;
      }
      setFrame((f) => f + 1);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  const segView = (s: Seg, key: string, color: string, thick: number) => {
    const cx = ((s.a.x + s.b.x) / 2) * k, cy = ((s.a.y + s.b.y) / 2) * k;
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) * k;
    const ang = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
    return <View key={key} style={{ position: "absolute", left: cx - len / 2, top: cy - thick / 2, width: len, height: thick, borderRadius: thick / 2, backgroundColor: color, transform: [{ rotate: `${ang}rad` }] }} />;
  };
  const pegs = useMemo(() => PEGS.map((p, i) => (
    <View key={`p${i}`} style={{ position: "absolute", left: (p.x - PEG_R) * k, top: (p.y - PEG_R) * k, width: PEG_R * 2 * k, height: PEG_R * 2 * k, borderRadius: PEG_R * k, backgroundColor: "#d9cfc0" }} />
  )), [k]);
  const place = (i: number) => rank.indexOf(i);

  return (
    <View style={{ alignItems: "center" }}>
      <View
        onLayout={(e) => setW(Math.min(320, e.nativeEvent.layout.width))}
        style={{ width: "100%", maxWidth: 320, borderRadius: 26, backgroundColor: C.ink, padding: PAD, shadowColor: C.ink, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
      >
        <View style={{ height: 10, flexDirection: "row", justifyContent: "space-evenly", alignItems: "center", marginBottom: 6 }}>
          {Array.from({ length: 11 }, (_, i) => (
            <View key={i} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: i % 2 ? "#f2ddcf" : "#e08a63" }} />
          ))}
        </View>
        <View style={{ height: (CH + 14) * k, borderRadius: 18, backgroundColor: "#2a2622", overflow: "hidden" }}>
          {k > 0 && (
            <>
              {pegs}
              {SEGS.map((s, i) => segView(s, `s${i}`, "#d9cfc0", 3.5))}
              {GATE.map((s, i) => segView(s, `g${i}`, C.brick, 4.5))}
              {SPINNERS.map((s, i) => segView(spinSeg(s, simT.current / 1000), `sp${i}`, ["#b4552d", "#e08a63", "#d9a441"][i], 5))}
              {SPINNERS.map((s, i) => (
                <View key={`spc${i}`} style={{ position: "absolute", left: s.c.x * k - 3, top: s.c.y * k - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: "#fbf3ec" }} />
              ))}
              {/* 결승선 — 체크무늬 */}
              <View style={{ position: "absolute", left: 0, right: 0, top: CH * k, height: 8, flexDirection: "row" }}>
                {Array.from({ length: 30 }, (_, i) => (
                  <View key={i} style={{ flex: 1 }}>
                    <View style={{ flex: 1, backgroundColor: i % 2 ? "#fbf3ec" : C.ink }} />
                    <View style={{ flex: 1, backgroundColor: i % 2 ? C.ink : "#fbf3ec" }} />
                  </View>
                ))}
              </View>
              {/* 구슬 */}
              {balls.current.map((b, i) => (b.on || !running) && !(b.done && b.y > CH + 40) && (
                <View
                  key={`b${i}`}
                  style={{
                    position: "absolute", left: (b.x - BALL_R) * k, top: (Math.min(b.y, CH + 6) - BALL_R) * k,
                    width: BALL_R * 2 * k, height: BALL_R * 2 * k, borderRadius: BALL_R * k,
                    backgroundColor: MARBLES[i % MARBLES.length], borderWidth: winner === i ? 2 : 1, borderColor: winner === i ? "#fbf3ec" : "rgba(0,0,0,.25)",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <View style={{ position: "absolute", left: 2.5 * k, top: 2 * k, width: 3.5 * k, height: 3.5 * k, borderRadius: 2 * k, backgroundColor: "rgba(255,255,255,.55)" }} />
                </View>
              ))}
            </>
          )}
        </View>
      </View>

      {/* 누가 어느 색인지 · 들어온 순서 */}
      <View style={{ marginTop: 12, maxWidth: 320, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
        {options.map((o, i) => {
          const r = place(i);
          const won = winner === i;
          return (
            <View key={o.key} style={{ height: 26, borderRadius: 13, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: won ? C.brick : C.lineSoft, backgroundColor: won ? C.brickSoft : C.card }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: MARBLES[i % MARBLES.length] }} />
              <Text numberOfLines={1} style={{ maxWidth: 90, fontFamily: won ? F.sansMd : F.sans, fontSize: 11, color: C.ink }}>{o.label}</Text>
              {r >= 0 && <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: won ? C.brick : C.faint }}>{r + 1}</Text>}
            </View>
          );
        })}
      </View>

      <Pressable
        onPress={race}
        disabled={!ready || busy || running}
        accessibilityRole="button"
        style={{ marginTop: 14, height: 44, borderRadius: 22, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: ready ? C.ink : "#a8a196" }}
      >
        <View style={{ flexDirection: "row", gap: 2 }}>
          {[0, 1, 2].map((i) => <View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: MARBLES[i * 2] }} />)}
        </View>
        <Text style={{ fontFamily: F.serif, fontSize: 14, color: REC.paper }}>{running ? "달리는 중…" : "출발"}</Text>
      </Pressable>
    </View>
  );
}
