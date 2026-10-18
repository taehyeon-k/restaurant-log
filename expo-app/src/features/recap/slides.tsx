import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { REGION_TIERS } from "@/lib/labels";
import { pinColor } from "@/lib/types";
import { F } from "@/theme";
import { A, CountUp, Rosette, Star } from "./anim";
import type { RecapData, TopPlace } from "./compute";
import { eunNeun, gwaWa, mdd, mmdd, nativeCount, parseQuarter, type Season } from "./seasons";
import { SignedImage } from "@/lib/signedPhoto";

/**
 * 리캡 14장 — HANDOFF quarterly recap §1 Slides. 위치·크기·문구는 「DINARY Quarterly Recap - Player」
 * 시제품(390×844)을 그대로 따릅니다. 지연(d)도 시제품의 data-d, 없으면 120 + 순서×90 입니다.
 */

export type Layout = {
  /** 시제품의 top(px, 상태바 포함 844 기준) → 이 기기의 top */
  y: (mockTop: number) => number;
  /** 홈 표시줄 위 여백 */
  bottom: number;
  /** 화면이 시제품보다 낮을 때 큰 상자 높이를 줄이는 비율 */
  scale: number;
};

export type SlideProps = {
  data: RecapData;
  season: Season;
  nick: string;
  L: Layout;
};

const INK = "#1c1a17";
const CARD = "#fbfaf6";
const PAPER = "#f6f3ec";

const serif = (size: number, color?: string, lh?: number): TextStyle => ({
  fontFamily: F.serif, fontSize: size, color, lineHeight: lh ? Math.round(size * lh) : undefined,
});
const sans = (size: number, color?: string, lh?: number): TextStyle => ({
  fontFamily: F.sans, fontSize: size, color, lineHeight: lh ? Math.round(size * lh) : undefined,
});
const mono = (size: number, color?: string, ls = 0): TextStyle => ({ fontFamily: F.mono, fontSize: size, color, letterSpacing: ls });

/** 사진이 없을 때 — 분류 색이 비치는 빗금 대신 옅은 면. */
function Thumb({ uri, category, size, radius, h }: { uri: string | null; category: string | null; size?: number; radius: number; h?: number }) {
  return (
    <View style={{ width: size ?? "100%", height: h ?? size, borderRadius: radius, overflow: "hidden", backgroundColor: uri ? "#ded8cb" : pinColor(category) + "40" }}>
      {uri ? <SignedImage uri={uri} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

/* 1a · 표지 */
export function Cover({ season, nick, L }: SlideProps) {
  return (
    <View style={[s.fill, { backgroundColor: season.deep }]}>
      <A k="spin" d={120} style={{ position: "absolute", right: -170, top: L.y(250), width: 460, height: 460 }}>
        <Star size={460} fill={season.accent} />
      </A>
      <View style={{ position: "absolute", left: 28, right: 28, bottom: L.bottom + 30, gap: 18 }}>
        <A k="up" d={210}><Text style={mono(11, "#cdc6b8", 2.2)}>{season.months}</Text></A>
        <A k="up" d={300}><Text style={serif(54, CARD, 1.18)}>{`${nick}의\n${season.name} 식탁`}</Text></A>
        <A k="up" d={390}><Text style={sans(14, "#cdc6b8", 1.8)}>{season.range}, 석 달 동안 남긴 기록을 한 장씩 넘겨 봅니다.</Text></A>
        <A k="fade" d={900} style={{ marginTop: 18 }}><Text style={mono(10.5, "#a29a8c", 1.6)}>탭해서 넘기기 →</Text></A>
      </View>
    </View>
  );
}

/* 1b · 석 달의 숫자 */
export function Numbers({ data, season, L }: SlideProps) {
  const { prev } = data;
  const diffText = !prev
    ? null
    : prev.diff > 0
      ? `지난 ${season.prev}보다 ${nativeCount(prev.diff)} 끼 더`
      : prev.diff < 0
        ? `지난 ${season.prev}보다 ${nativeCount(-prev.diff)} 끼 덜`
        : `지난 ${gwaWa(season.prev)} 같은 만큼`;
  const cols: { n: number; label: string; accent?: boolean; d: number }[] = [
    { n: data.newPlaces, label: "처음 간 집", d: 900 },
    { n: data.repeatPlaces, label: "다시 간 집", d: 1000 },
    { n: data.verified, label: "인증한 방문", accent: true, d: 1100 },
  ];
  return (
    <View style={[s.fill, { backgroundColor: PAPER }]}>
      <View style={{ position: "absolute", top: L.y(150), left: 28, right: 28 }}>
        <A k="up" d={120}><Text style={serif(22, INK)}>석 달 동안 먹은 끼니</Text></A>
        <A k="up" d={210} style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6 }}>
          <CountUp value={data.count} style={[serif(168, INK), { lineHeight: 176, letterSpacing: -4 }]} />
          <Text style={serif(30, INK)}>끼</Text>
        </A>
        {prev && diffText && (
          <A k="up" d={700} style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ borderRadius: 12, backgroundColor: season.accent, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={mono(11, CARD)}>{prev.diff > 0 ? `+${prev.diff}` : prev.diff < 0 ? `−${-prev.diff}` : "±0"}</Text>
            </View>
            <Text style={sans(13, "#6b665e")}>{diffText}</Text>
          </A>
        )}
        <View style={{ marginTop: 48, flexDirection: "row", borderTopWidth: 1, borderTopColor: "#d8d3c8" }}>
          {cols.map((c, i) => (
            <A key={c.label} k="up" d={c.d} style={[{ flex: 1, paddingTop: 18, gap: 6 }, i > 0 && { paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: "#d8d3c8" }]}>
              <CountUp value={c.n} style={serif(38, c.accent ? season.accent : INK)} />
              <Text style={sans(12, "#6b665e")}>{c.label}</Text>
            </A>
          ))}
        </View>
        <A k="fade" d={1400} style={{ marginTop: 30 }}>
          <Text style={sans(13, "#8a8377", 1.8)}>
            {data.verified
              ? `${data.count}끼 중 ${data.verified}끼는 가게 앞에서 찍은 사진으로 인증했어요. 인증률 ${data.verifiedRate}%.`
              : `${data.count}끼 중 가게 앞에서 찍어 인증한 끼니는 아직 없어요.`}
          </Text>
        </A>
      </View>
    </View>
  );
}

/* 1c · 이번 분기 라벨 */
export function Labels({ data, season, L }: SlideProps) {
  const { earned, near, total, all } = data.labels;
  const many = earned.length > 2;
  const cards = earned.slice(0, 4);
  const nearShown = many ? near.slice(0, 1) : near;
  const rosette = many ? 60 : 88;
  return (
    <View style={[s.fill, { backgroundColor: PAPER }]}>
      <View style={{ position: "absolute", top: L.y(130), left: 28, right: 28 }}>
        <A k="up" d={120}><Text style={mono(10, "#8a8377", 2.2)}>NEW LABELS</Text></A>
        <A k="up" d={210} style={{ marginTop: 8 }}>
          <Text style={serif(28, INK, 1.35)}>
            {earned.length ? `라벨 ${nativeCount(earned.length)} 개를\n새로 받았어요` : "이번 분기엔 새 라벨이 없었어요"}
          </Text>
        </A>
        {cards.length > 0 && (
          <View style={{ marginTop: 34, flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
            {cards.map((e, i) => (
              <A key={e.def.id} k="up" d={300 + i * 120} style={s.labelCard}>
                <A k="pop" d={500 + i * 180}><Rosette size={rosette} fill={e.def.color} /></A>
                <Text style={serif(17, INK)} numberOfLines={1}>{e.def.name}</Text>
                <Text style={sans(11.5, "#8a8377")} numberOfLines={1}>{e.def.desc} · {mdd(e.date)}</Text>
              </A>
            ))}
          </View>
        )}
        {nearShown.length > 0 && (
          <>
            <A k="fade" d={900} style={{ marginTop: 34 }}><Text style={mono(10, "#8a8377", 2.2)}>거의 다 왔어요</Text></A>
            <View style={{ marginTop: 12, gap: 14 }}>
              {nearShown.map((p, i) => (
                <A key={p.def.id} k="fade" d={1000 + i * 100} style={{ gap: 7 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                    <Text style={[sans(13, INK), { flexShrink: 1 }]} numberOfLines={1}>
                      {p.def.name} <Text style={{ color: "#8a8377" }}>· {p.def.desc}</Text>
                    </Text>
                    <Text style={mono(11, season.accent)}>{p.have} / {p.need}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: "#e6e0d3" }}>
                    <A k="x" d={1100 + i * 100} style={{ width: `${(p.have / p.need) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: season.accent }} />
                  </View>
                </A>
              ))}
            </View>
          </>
        )}
        <A k="fade" d={1300} style={{ marginTop: 22 }}><Text style={sans(12, "#8a8377", 1.7)}>모은 라벨 {total} / {all}</Text></A>
      </View>
    </View>
  );
}

/* 1d · 가장 자주 간 곳 */
export function TopPlaceSlide({ data, season, L }: SlideProps) {
  const t = data.top;
  const meta = [t.category, t.where].filter(Boolean).join(" · ");
  const tail = [`첫 방문 ${mmdd(t.first)}`, `마지막 ${mmdd(t.last)}`, t.avg != null ? `평균 ★${t.avg.toFixed(1)}` : null].filter(Boolean).join(" · ");
  return (
    <View style={[s.fill, { backgroundColor: season.accent }]}>
      <View style={{ position: "absolute", top: L.y(120), left: 24, right: 24 }}>
        <A k="up" d={120} style={{ paddingHorizontal: 4 }}><Text style={serif(22, CARD)}>이번 {season.name}, 가장 자주 간 곳</Text></A>
        <A k="zoom" d={200} style={{ marginTop: 20 }}>
          <Thumb uri={t.photo} category={t.category} h={Math.round(330 * L.scale)} radius={24} />
          <View style={{ position: "absolute", left: 14, top: 14, borderRadius: 14, backgroundColor: INK, paddingVertical: 6, paddingHorizontal: 11 }}>
            <Text style={serif(15, CARD)}>1위</Text>
          </View>
        </A>
        <View style={{ marginTop: 22, paddingHorizontal: 4, gap: 10 }}>
          <A k="up" d={600}><Text style={serif(38, CARD, 1.2)} numberOfLines={2}>{t.name}</Text></A>
          {!!meta && <A k="up" d={700}><Text style={sans(13, "#f2e0d5")} numberOfLines={1}>{meta}</Text></A>}
          <A k="up" d={850} style={{ marginTop: 10, flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <CountUp value={t.count} style={[serif(56, CARD), { lineHeight: 60 }]} />
            <Text style={sans(15, CARD)}>번 다녀왔어요</Text>
          </A>
          <A k="fade" d={1100}><Text style={mono(11, "#f2e0d5", 0.4)}>{tail}</Text></A>
        </View>
      </View>
    </View>
  );
}

/* 1e · 자주 간 다섯 곳 */
const TOP5_DELAYS = [900, 720, 560, 420, 300];
export function Top5({ data, L }: SlideProps) {
  const list = data.top5!;
  return (
    <View style={[s.fill, { backgroundColor: PAPER }]}>
      <View style={{ position: "absolute", top: L.y(130), left: 24, right: 24 }}>
        <A k="up" d={120} style={{ paddingHorizontal: 4 }}><Text style={mono(10, "#8a8377", 2.2)}>TOP {list.length}</Text></A>
        <A k="up" d={210} style={{ paddingHorizontal: 4, marginTop: 8 }}><Text style={serif(28, INK)}>자주 간 {nativeCount(list.length)} 곳</Text></A>
        <View style={{ marginTop: 26, gap: 10 }}>
          {list.map((p, i) => <Top5Row key={`${p.name}${i}`} p={p} rank={i + 1} d={TOP5_DELAYS[i]} />)}
        </View>
        {data.top5Insight && (
          <A k="fade" d={1200} style={{ marginTop: 20, paddingHorizontal: 4 }}><Text style={sans(12, "#8a8377", 1.7)}>{data.top5Insight}</Text></A>
        )}
      </View>
    </View>
  );
}

function Top5Row({ p, rank, d }: { p: TopPlace; rank: number; d: number }) {
  const first = rank === 1;
  return (
    <A
      k="left"
      d={d}
      style={[
        { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, paddingVertical: 12, paddingLeft: 12, paddingRight: 16 },
        first ? { backgroundColor: INK } : { backgroundColor: CARD, borderWidth: 1, borderColor: "#e2ddd2" },
      ]}
    >
      <Text style={[serif(20, first ? CARD : INK), { width: 22, textAlign: "center" }]}>{rank}</Text>
      <Thumb uri={p.photo} category={p.category} size={56} radius={14} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={serif(16, first ? CARD : INK)} numberOfLines={1}>{p.name}</Text>
        <Text style={[sans(11.5, first ? "#cdc6b8" : "#8a8377"), { marginTop: 3 }]} numberOfLines={1}>
          {[p.category, p.district].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Text style={mono(12, first ? CARD : "#6b665e")}>{p.count}회</Text>
    </A>
  );
}

/* 1f · 가장 많이 머문 동네 */
export function Districts({ data, season, L }: SlideProps) {
  const d = data.districts!;
  const max = Math.max(...d.bars.map((b) => b.count));
  const tierChar = d.title ? REGION_TIERS.find((t) => t.need === d.title!.tier.need)?.tier : null;
  const fresh = d.fresh.length > 4 ? [...d.fresh.slice(0, 4), `외 ${d.fresh.length - 4}곳`] : d.fresh;
  return (
    <View style={[s.fill, { backgroundColor: season.alt }]}>
      <View style={{ position: "absolute", top: L.y(140), left: 28, right: 28 }}>
        <A k="up" d={120}><Text style={serif(22, CARD)}>가장 많이 머문 동네</Text></A>
        <A k="up" d={210} style={{ marginTop: 10 }}><Text style={serif(72, CARD, 1.1)} numberOfLines={1} adjustsFontSizeToFit>{d.top}</Text></A>
        {d.title && (
          <A k="pop" d={500} style={{ marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, backgroundColor: CARD, paddingVertical: 7, paddingLeft: 9, paddingRight: 13 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: season.alt, alignItems: "center", justifyContent: "center" }}>
              <Text style={sans(10, CARD)}>{tierChar}</Text>
            </View>
            <Text style={sans(12.5, INK)}>{d.title.region} {d.title.tier.suffix} 칭호를 받았어요</Text>
          </A>
        )}
        <View style={{ marginTop: 40, gap: 14 }}>
          {d.bars.map((b, i) => (
            <View key={b.name} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={[sans(13, CARD), { width: 52 }]} numberOfLines={1}>{b.name}</Text>
              <View style={{ flex: 1, height: 22, borderRadius: 6, backgroundColor: "rgba(251,250,246,.16)" }}>
                <A k="x" d={700 + i * 100} style={{ width: `${(b.count / max) * 100}%`, height: "100%", borderRadius: 6, backgroundColor: i === 0 ? CARD : "#dfe4d6" }} />
              </View>
              <Text style={[mono(11, CARD), { width: 22, textAlign: "right" }]}>{b.count}</Text>
            </View>
          ))}
        </View>
        {fresh.length > 0 && (
          <A k="up" d={1400} style={{ marginTop: 36, borderTopWidth: 1, borderTopColor: "rgba(251,250,246,.3)", paddingTop: 18 }}>
            <Text style={sans(13, CARD, 1.8)}>처음 발 디딘 동네 {d.fresh.length}곳</Text>
            <Text style={serif(17, CARD, 1.6)}>{fresh.join(" · ")}</Text>
          </A>
        )}
      </View>
    </View>
  );
}

/* 1g · 입맛 지도 */
export function Taste({ data, season, L }: SlideProps) {
  const t = data.taste;
  // 범례는 여섯 칸까지 — 나머지는 「그 외」로 묶습니다.
  const segs = t.segments.length > 6
    ? [...t.segments.slice(0, 5), { label: "그 외", color: "#a29a8c", count: t.segments.slice(5).reduce((n, x) => n + x.count, 0) }]
    : t.segments;
  const untried = t.untried.slice(0, 4);
  const tip = untried.length
    ? `한 번도 안 간 분류: ${untried.join(" · ")}. ` +
      (t.palate.earned
        ? "다음 분기엔 하나 열어 볼까요?"
        : `다음 분기에 하나만 열어 보면 ‘고루 먹는 입’ 라벨에 가까워져요 (${t.palate.have} / ${t.palate.need}).`)
    : null;
  return (
    <View style={[s.fill, { backgroundColor: PAPER }]}>
      <View style={{ position: "absolute", top: L.y(130), left: 28, right: 28 }}>
        <A k="up" d={120}><Text style={mono(10, "#8a8377", 2.2)}>TASTE</Text></A>
        <A k="up" d={210} style={{ marginTop: 8 }}><Text style={serif(28, INK, 1.35)}>{t.title}</Text></A>
        <A k="up" d={300} style={{ marginTop: 12 }}><Text style={sans(13, "#6b665e", 1.8)} numberOfLines={3}>{t.sub}</Text></A>
        <A k="x" d={500} style={{ marginTop: 34, flexDirection: "row", height: Math.round(120 * L.scale), borderRadius: 18, overflow: "hidden", gap: 3 }}>
          {segs.map((g) => <View key={g.label} style={{ flex: g.count, backgroundColor: g.color }} />)}
        </A>
        <A k="fade" d={1100} style={{ marginTop: 22, flexDirection: "row", flexWrap: "wrap", rowGap: 12, columnGap: 18 }}>
          {segs.map((g) => (
            <View key={g.label} style={{ width: "46%", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: g.color }} />
              <Text style={sans(13, INK)}>{g.label}</Text>
              <Text style={[mono(11, "#8a8377"), { marginLeft: "auto" }]}>{g.count}</Text>
            </View>
          ))}
        </A>
        {tip && (
          <A k="up" d={1400} style={{ marginTop: 30, borderRadius: 18, backgroundColor: season.tint, borderWidth: 1, borderColor: season.tintLine, paddingVertical: 14, paddingHorizontal: 16 }}>
            <Text style={sans(12.5, season.tintInk, 1.7)}>{tip}</Text>
          </A>
        )}
      </View>
    </View>
  );
}

/* 1h · 식사 시각 */
export function Time({ data, season, L }: SlideProps) {
  const t = data.time;
  const max = Math.max(1, ...t.hist);
  return (
    <View style={[s.fill, { backgroundColor: INK }]}>
      <View style={{ position: "absolute", top: L.y(140), left: 28, right: 28 }}>
        {data.timeStatsAvailable && <>
        <A k="up" d={120}><Text style={serif(22, CARD)}>가장 많이 기록한 시각</Text></A>
        <A k="up" d={210} style={{ marginTop: 8 }}><Text style={[serif(96, CARD), { lineHeight: 101, letterSpacing: -2 }]}>{t.peak}</Text></A>
        <View style={{ marginTop: 44, flexDirection: "row", alignItems: "flex-end", gap: 4, height: Math.round(150 * L.scale) }}>
          {t.hist.map((v, i) => (
            <A
              key={i}
              k="y"
              d={400 + i * 30}
              style={{
                flex: 1,
                height: `${Math.max(v / max, 0.03) * 100}%`,
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
                backgroundColor: i === t.peakIndex ? season.accent : i >= 15 ? "#c07a2e" : "#4d4842",
              }}
            />
          ))}
        </View>
        <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
          {["07", "12", "18", "24"].map((h) => <Text key={h} style={mono(10, "#8a8377")}>{h}</Text>)}
        </View>
        </>}
        <View style={{ marginTop: 36, borderTopWidth: 1, borderTopColor: "#4a453d" }}>
          <A k="up" d={1100} style={s.timeRow}>
            <Text style={sans(13, "#cdc6b8")}>가장 많이 먹은 요일</Text>
            <Text style={serif(17, CARD)}>{t.day} · {t.dayCount}끼</Text>
          </A>
          {data.timeStatsAvailable && t.midnight > 0 && (
            <A k="up" d={1250} style={s.timeRow}>
              <Text style={sans(13, "#cdc6b8")}>자정 넘어 남긴 기록</Text>
              <Text style={serif(17, "#c07a2e")}>{t.midnight}개</Text>
            </A>
          )}
        </View>
      </View>
    </View>
  );
}

/* 1i · 단골 ↔ 탐험가 */
export function Persona({ data, season, nick, L }: SlideProps) {
  const p = data.persona;
  const side = p.explorer ? "탐험가" : "단골";
  const pct = (explorer: boolean, ratio: number) => Math.round((explorer ? ratio : 1 - ratio) * 100);
  const notes: string[] = [];
  if (p.explorer && p.regular) notes.push(`그래도 ${p.regular}만큼은 단골이었어요.`);
  if (p.prevRatio != null) {
    const pe = p.prevRatio >= 0.5;
    notes.push(`지난 ${season.prev}엔 ${pe ? "탐험가" : "단골"} 쪽(${pct(pe, p.prevRatio)}%)이었습니다.`);
  }
  return (
    <View style={[s.fill, { backgroundColor: PAPER }]}>
      <View style={{ position: "absolute", top: L.y(150), left: 28, right: 28 }}>
        <A k="up" d={120}><Text style={serif(22, INK)}>이번 분기의 {eunNeun(nick)}</Text></A>
        <A k="pop" d={300} style={{ marginTop: 10, alignSelf: "flex-start" }}><Text style={serif(64, season.accent, 1.1)}>{side}</Text></A>
        <A k="fade" d={500} style={{ marginTop: 6 }}><Text style={sans(13, "#6b665e")}>에 가까웠어요</Text></A>
        <View style={{ marginTop: Math.round(70 * L.scale), height: 56 }}>
          <Svg width="100%" height={8} style={{ position: "absolute", top: 24 }}>
            <Defs>
              <LinearGradient id="meter" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={INK} />
                <Stop offset="1" stopColor={season.accent} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="8" rx="4" fill="url(#meter)" />
          </Svg>
          <A k="knob" d={600} to={p.ratio} style={{ position: "absolute", top: 10, width: 36, height: 36, marginLeft: -18, borderRadius: 18, backgroundColor: CARD, borderWidth: 3, borderColor: season.accent }} />
        </View>
        <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[sans(13, p.explorer ? INK : season.accent), !p.explorer && { fontFamily: F.sansMd }]}>단골</Text>
          <Text style={[sans(13, p.explorer ? season.accent : INK), p.explorer && { fontFamily: F.sansMd }]}>탐험가</Text>
        </View>
        <View style={{ marginTop: Math.round(54 * L.scale), flexDirection: "row", gap: 12 }}>
          <A k="up" d={1300} style={s.statCard}>
            <Text style={serif(32, INK)}>{p.newCount}</Text>
            <Text style={sans(12, "#8a8377")}>처음 가 본 집</Text>
          </A>
          <A k="up" d={1400} style={s.statCard}>
            <Text style={serif(32, INK)}>{p.repeatCount}</Text>
            <Text style={sans(12, "#8a8377")}>두 번 이상 간 집</Text>
          </A>
        </View>
        {notes.length > 0 && (
          <A k="fade" d={1600} style={{ marginTop: 22 }}><Text style={sans(12.5, "#8a8377", 1.8)}>{notes.join(" ")}</Text></A>
        )}
      </View>
    </View>
  );
}

/** 공유 카드 「성향」 칸 — 탐험가 71% / 단골 62% */
export const personaWord = (p: RecapData["persona"]) =>
  p.explorer ? `탐험가 ${Math.round(p.ratio * 100)}%` : `단골 ${Math.round((1 - p.ratio) * 100)}%`;

/* 1j · 가장 긴 메모 */
export function Memo({ data, season, L, onOpen }: SlideProps & { onOpen: (id: number) => void }) {
  const m = data.memo!;
  const meta = [mmdd(m.date), m.rating != null ? `★${m.rating.toFixed(1)}` : null, `${m.text.length}자`].filter(Boolean).join(" · ");
  return (
    <View style={[s.fill, { backgroundColor: season.alt2 }]}>
      <View style={{ position: "absolute", top: L.y(140), left: 28, right: 28 }}>
        <A k="up" d={120}><Text style={serif(22, CARD)}>가장 길게 남긴 한 끼</Text></A>
        <A k="fade" d={200} style={{ marginTop: 36, height: 48, overflow: "visible" }}>
          <Text style={[serif(80, "#f2e0d5"), { lineHeight: 92 }]}>“</Text>
        </A>
        <A k="type" d={400} style={{ marginTop: 6 }}>
          <Text style={serif(23, CARD, 1.65)} numberOfLines={Math.max(5, Math.round(9 * L.scale))}>{m.text}</Text>
        </A>
        <A k="up" d={1500} style={{ marginTop: 36 }}>
          <Pressable onPress={() => onOpen(m.id)} accessibilityLabel="기록 열어 보기" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Thumb uri={m.photo} category={m.category} size={64} radius={15} />
            <View style={{ gap: 5, flexShrink: 1 }}>
              <Text style={serif(16, CARD)} numberOfLines={1}>{m.place}</Text>
              <Text style={mono(11, "#f2e0d5")}>{meta}</Text>
            </View>
          </Pressable>
        </A>
        <A k="up" d={1650} style={{ marginTop: 34, alignSelf: "flex-start" }}>
          <Pressable onPress={() => onOpen(m.id)} style={{ borderRadius: 18, borderWidth: 1, borderColor: "rgba(251,250,246,.55)", paddingVertical: 10, paddingHorizontal: 16 }}>
            <Text style={sans(12.5, CARD)}>기록 열어 보기</Text>
          </Pressable>
        </A>
      </View>
    </View>
  );
}

/* 1k · 위시 → 방문 */
export function WishSlide({ data, L, onDirections }: SlideProps & { onDirections: (query: string) => void }) {
  const w = data.wish!;
  const cells = Math.min(w.total, 18);
  const filled = w.total <= 18 ? w.visited : Math.round((w.visited / w.total) * 18);
  return (
    <View style={[s.fill, { backgroundColor: "#c07a2e" }]}>
      <View style={{ position: "absolute", top: L.y(140), left: 28, right: 28 }}>
        <A k="up" d={120}><Text style={serif(22, INK)}>담아둔 곳, 다녀온 곳</Text></A>
        <A k="up" d={210} style={{ marginTop: 12, flexDirection: "row", alignItems: "baseline", gap: 10 }}>
          <CountUp value={w.visited} style={[serif(96, INK), { lineHeight: 100 }]} />
          <Text style={serif(24, INK)}>/ {w.total}곳</Text>
        </A>
        <View style={{ marginTop: 20, flexDirection: "row", gap: 4 }}>
          {Array.from({ length: cells }, (_, i) =>
            i < filled ? (
              <A key={i} k="y" d={400 + i * 60} style={s.wishCellOn} />
            ) : (
              <View key={i} style={s.wishCell} />
            )
          )}
        </View>
        <A k="fade" d={800} style={{ marginTop: 12 }}>
          <Text style={sans(13, INK)}>
            {w.visited ? `위시에 담아둔 곳 중 ${nativeCount(w.visited)} 곳을 실제로 다녀왔어요.` : "위시에 담아둔 곳 중 아직 다녀온 곳이 없어요."}
          </Text>
        </A>
        <View style={{ marginTop: 36, gap: 10 }}>
          {w.fastest && (
            <A k="up" d={1000} style={{ borderRadius: 20, backgroundColor: CARD, paddingVertical: 14, paddingHorizontal: 16, gap: 4 }}>
              <Text style={mono(10, "#8a8377", 1.6)}>가장 빨리 간 곳</Text>
              <Text style={serif(17, INK)} numberOfLines={1}>
                {w.fastest.name}{" "}
                <Text style={sans(12.5, "#6b665e")}>· {w.fastest.days ? `담고 ${w.fastest.days}일 만에` : "담은 날 바로"}</Text>
              </Text>
            </A>
          )}
          {w.oldest && (
            <A k="up" d={1150} style={{ borderRadius: 20, backgroundColor: INK, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={mono(10, "#a29a8c", 1.6)}>가장 오래 기다리는 곳</Text>
                <Text style={serif(17, CARD)} numberOfLines={1}>
                  {w.oldest.name} <Text style={sans(12.5, "#cdc6b8")}>· {w.oldest.days}일째</Text>
                </Text>
              </View>
              <Pressable onPress={() => onDirections(w.oldest!.query)} style={{ borderRadius: 15, backgroundColor: "#c07a2e", paddingVertical: 8, paddingHorizontal: 12 }}>
                <Text style={sans(12, INK)}>길찾기</Text>
              </Pressable>
            </A>
          )}
        </View>
      </View>
    </View>
  );
}

/* 1l · 의외의 기록 */
export function Odd({ data, season, L }: SlideProps) {
  const items = data.odd!;
  return (
    <View style={[s.fill, { backgroundColor: PAPER }]}>
      <View style={{ position: "absolute", top: L.y(130), left: 28, right: 28 }}>
        <A k="up" d={120}><Text style={mono(10, "#8a8377", 2.2)}>ODD MOMENTS</Text></A>
        <A k="up" d={210} style={{ marginTop: 8 }}><Text style={serif(28, INK, 1.35)}>{"기록 속\n의외의 순간들"}</Text></A>
        <View style={{ marginTop: 30 }}>
          {items.map((it, i) => (
            <A
              key={it.kicker}
              k="up"
              d={400 + i * 500}
              style={[
                { flexDirection: "row", gap: 16, paddingVertical: 20, borderTopWidth: 1, borderTopColor: "#d8d3c8" },
                i === items.length - 1 && { borderBottomWidth: 1, borderBottomColor: "#d8d3c8" },
              ]}
            >
              <Text style={[mono(11, season.accent), { paddingTop: 5 }]}>{String(i + 1).padStart(2, "0")}</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={sans(12.5, "#8a8377")}>{it.kicker}</Text>
                <Text style={serif(20, INK)} numberOfLines={2}>{it.title}</Text>
                <Text style={mono(11, "#6b665e")} numberOfLines={2}>{it.sub}</Text>
              </View>
            </A>
          ))}
        </View>
      </View>
    </View>
  );
}

/* 1m · 다음 분기 */
export function Next({ data, season, L }: SlideProps) {
  const n = data.next!;
  return (
    <View style={[s.fill, { backgroundColor: season.deep }]}>
      <View style={{ position: "absolute", top: L.y(140), left: 28, right: 28 }}>
        <A k="up" d={120}><Text style={mono(10, "#a29a8c", 2.2)}>NEXT · {season.nextMonths}</Text></A>
        <A k="up" d={210} style={{ marginTop: 8 }}><Text style={serif(36, CARD, 1.3)}>{`${season.next} 식탁에서\n열릴 것들`}</Text></A>
        <View style={{ marginTop: 40, gap: 12 }}>
          {n.cards.map((c, i) => (
            <A key={c.title} k="left" d={400 + i * 150} style={{ borderRadius: 20, backgroundColor: "rgba(251,250,246,.08)", padding: 16, gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <Text style={[serif(17, CARD), { flexShrink: 1 }]} numberOfLines={1}>{c.title}</Text>
                <Text style={mono(11, c.seasonal ? "#c07a2e" : "#cdc6b8")}>{c.right}</Text>
              </View>
              <Text style={sans(12.5, "#cdc6b8")}>{c.body}</Text>
            </A>
          ))}
        </View>
        {n.openWishes > 0 && (
          <A k="fade" d={1100} style={{ marginTop: 28 }}><Text style={sans(12.5, "#a29a8c", 1.8)}>위시 {n.openWishes}곳이 아직 기다리고 있어요.</Text></A>
        )}
      </View>
    </View>
  );
}

/* 1n · 공유 카드 — 바깥 단추는 재생기가 그립니다(캡처 대상은 카드만). */
export function ShareCard({ data, season, nick, height }: SlideProps & { height: number }) {
  const q = parseQuarter(data.quarter)!;
  const facts = [
    { k: "단골집", v: data.top.name },
    { k: "동네", v: data.districts?.top ?? "—" },
    { k: "입맛", v: data.taste.word },
    { k: "성향", v: personaWord(data.persona) },
  ];
  return (
    <View collapsable={false} style={{ height, borderRadius: 26, overflow: "hidden", backgroundColor: season.accent, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 22 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={mono(10, "#f2e0d5", 2)}>DINARY</Text>
        <Text style={mono(10, "#f2e0d5", 2)}>{q.year} · {q.q}분기</Text>
      </View>
      <Text style={[serif(32, CARD, 1.25), { marginTop: 22 }]}>{`${nick}의\n${season.name} 식탁`}</Text>
      <View style={{ marginTop: 18, flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text style={[serif(80, CARD), { lineHeight: 86, letterSpacing: -2 }]}>{data.count}</Text>
        <Text style={serif(20, CARD)}>끼</Text>
      </View>
      <View style={{ marginTop: "auto", flexDirection: "row", flexWrap: "wrap", rowGap: 16, columnGap: 14, borderTopWidth: 1, borderTopColor: "rgba(251,250,246,.35)", paddingTop: 16 }}>
        {facts.map((f) => (
          <View key={f.k} style={{ width: "46%", gap: 3 }}>
            <Text style={sans(10.5, "#f2e0d5")}>{f.k}</Text>
            <Text style={serif(15, CARD)} numberOfLines={1}>{f.v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  labelCard: {
    width: "47%", borderRadius: 22, backgroundColor: CARD, borderWidth: 1, borderColor: "#e2ddd2",
    paddingTop: 22, paddingHorizontal: 14, paddingBottom: 18, alignItems: "center", gap: 10,
  },
  timeRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#4a453d",
  },
  statCard: { flex: 1, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: "#e2ddd2", padding: 16, gap: 4 },
  wishCellOn: { flex: 1, height: 14, borderRadius: 3, backgroundColor: INK },
  wishCell: { flex: 1, height: 14, borderRadius: 3, backgroundColor: "rgba(28,26,23,.18)" },
});
