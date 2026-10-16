import { formatDistance } from "../distance";
import { eulReul, euroRo } from "../josa";
import type { RecCategory, RecFilter } from "../recommend";
import type { Candidate } from "./candidates";
import { REC_CONFIG, type ComponentKey } from "./config";
import { slotFit, tasteOf, type TasteProfile } from "./taste";
import { dayDiff, isWeekend, SLOT_LABEL, type MealSlot } from "./time";

/**
 * Stage B — 해석 가능한 점수.
 *   S = Σ_k w_k·x_k − R_place − R_cuisine        (x_k ∈ [0,1], 결측이면 neutral_k)
 * 성분은 모두 남겨 두고(디버깅 · 로그 · 나중의 학습), 까닭 문장은 실제로 점수를 올린 성분에서만 씁니다.
 * 점수는 보정되지 않은 순위용 숫자라 「일치율 87%」처럼 확률로 보여 주지 않습니다.
 */

/** 기상청 초단기실황 — 서버가 준 값만. 못 받으면 null 이고 날씨 성분은 중립입니다. */
export type Weather = { tempC: number | null; rainMm: number | null; precip: boolean; observedAt: string };

export type RecContext = {
  /** 기준 날짜(한국) · 요일 · 식사 시간대. */
  today: string; dow: number; slot: MealSlot;
  taste: TasteProfile;
  filter: RecFilter;
  couple: boolean;
  weather: Weather | null;
  /** 최근 식사(지금 기록장) — 종류 반복 감점용. */
  recent: { date: string; cat: RecCategory | null }[];
};

export type Features = Record<ComponentKey, number>;
export type Scored = {
  c: Candidate;
  x: Features;
  /** w_k·(x_k − neutral_k) — 중립 대비 이 성분이 올리거나 내린 몫. */
  contrib: Features;
  repetition: { place: number; cuisine: number };
  score: number;
  reasons: string[];
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const DAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

export const badWeather = (w: Weather | null) => !!w && (w.precip || (w.tempC != null && (w.tempC <= -5 || w.tempC >= 31)));

/** 거리 민감도 τ(m) — 맥락에 따라. */
export function distanceTau(ctx: Pick<RecContext, "weather" | "slot" | "dow">) {
  const d = REC_CONFIG.distance;
  return d.tauM * (badWeather(ctx.weather) ? d.badWeatherFactor : 1) * (ctx.slot === "lunch" && !isWeekend(ctx.dow) ? d.weekdayLunchFactor : 1);
}

/** 이 가게에 마지막으로 간 뒤 지난 날 수 — 안 갔으면 null. */
const lastVisitAge = (c: Candidate, today: string) =>
  c.visits.length ? Math.min(...c.visits.map((r) => Math.max(0, dayDiff(r.visited_at!, today)))) : null;

export function features(c: Candidate, ctx: RecContext): { x: Features; repetition: { place: number; cuisine: number } } {
  const cfg = REC_CONFIG;
  const cat = c.cat.recCat;
  const taste = tasteOf(ctx.taste, cat);

  // D — 직선거리 감쇠(편한 거리 d₀ 안은 1).
  const distance = Math.exp(-Math.max(0, c.distance - cfg.distance.comfortM) / distanceTau(ctx));

  // W — 위시.
  const wish = c.wish ? 1 : 0;

  // F — 이 가게에서의 만족(별점 · 다시 갈래요). 안 갔으면 0.
  const sat = c.visits.map((r) => {
    const rating = ctx.taste.ratingOf(r);
    if (rating != null) return clamp01((rating - 1) / 4) * (r.revisit ? 1 : 0.9) + (r.revisit ? 0.1 : 0);
    return r.revisit ? 0.7 : 0.4;
  });
  const favorite = sat.length ? clamp01(sat.reduce((a, b) => a + b, 0) / (cfg.favorite.kappa + sat.length)) : 0;

  // Q — Dinary 인증 기록의 재방문율(수축). 숫자가 없으면 사전값 = 중립.
  const q = cfg.community;
  const community = c.stat
    ? clamp01(((c.stat.users * Number(c.stat.revisit_rate ?? 0) + q.priorN * q.priorRate) / (c.stat.users + q.priorN)) / q.fullRate)
    : cfg.neutral.community;

  // M — 이 시간대에 맞는지: 내 기록(종류 × 시간대)과 이 가게의 이 시간대 인증(있으면) 평균.
  const userPart = slotFit(ctx.taste, cat, ctx.slot);
  const placePart = c.stat ? 0.25 + 0.75 * (1 - Math.exp(-(c.stat.slot_dow + c.stat.slot_any) / 3)) : 0.5;
  const meal = (userPart + placePart) / 2;

  // N — 새로움. 맛 점수가 낮으면 문을 닫아(gate) 새로움이 취향 불일치를 메우지 못하게.
  const age = lastVisitAge(c, ctx.today);
  const g = cfg.novelty.tasteGate;
  const gate = clamp01((taste - g.lo) / (g.hi - g.lo));
  const novelty = (age == null ? 1 : age > cfg.novelty.revisitedLongAgoDays ? cfg.novelty.longAgo : 0) * gate;

  // C — 날씨 × 거리. 날씨가 나쁠 때만 가까운 곳을 조금 더. 그 밖 · 모름은 중립.
  const context = badWeather(ctx.weather) ? Math.exp(-c.distance / 400) : cfg.neutral.context;

  // R — 반복 감점. 같은 가게(최근 갔으면)와 같은 종류(최근 7일). 먹고 싶다고 고른 종류는 종류 감점 없음.
  const rp = cfg.repetition.place;
  const place = age == null ? 0 : rp.rho * Math.exp(-age / rp.hDays);
  const rc = cfg.repetition.cuisine;
  const asked = !!cat && ctx.filter.inc.includes(cat);
  const cuisine = !cat || asked ? 0 : rc.rho * Math.min(1, ctx.recent
    .filter((m) => m.cat === cat)
    .map((m) => dayDiff(m.date, ctx.today))
    .filter((d) => d >= 0 && d <= rc.windowDays)
    .reduce((s, d) => s + Math.exp(-d / rc.hDays), 0));

  return { x: { taste, distance, wish, favorite, community, meal, novelty, context }, repetition: { place, cuisine } };
}

export function score(c: Candidate, ctx: RecContext): Scored {
  const { x, repetition } = features(c, ctx);
  const w = REC_CONFIG.weights;
  const n = REC_CONFIG.neutral;
  const keys = Object.keys(w) as ComponentKey[];
  const contrib = Object.fromEntries(keys.map((k) => [k, w[k] * (x[k] - n[k])])) as Features;
  const total = keys.reduce((s, k) => s + w[k] * x[k], 0) - repetition.place - repetition.cuisine;
  return { c, x, contrib, repetition, score: Math.round(total * 1e6) / 1e6, reasons: reasons(c, x, contrib, ctx) };
}

/** 까닭 — 점수를 올린 성분 순으로 최대 3개. 모르는 숫자(영업시간 · 걷는 시간 · 가격)는 쓰지 않습니다. */
function reasons(c: Candidate, x: Features, contrib: Features, ctx: RecContext): string[] {
  const out: { v: number; text: string }[] = [];
  const cat = c.cat.recCat;
  const we = ctx.couple ? "우리 " : "";
  const t = cat ? ctx.taste.cats.get(cat) : undefined;

  if (c.wish) out.push({ v: contrib.wish, text: `${we}위시리스트에 담은 지 ${Math.max(0, dayDiff(c.wish.saved_at.slice(0, 10), ctx.today))}일 된 곳이에요` });
  if (contrib.favorite > 0.02) {
    const again = c.visits.some((r) => r.revisit);
    out.push({ v: contrib.favorite, text: again ? `${c.visits.length}번 다녀왔고 다시 가고 싶다고 남긴 곳이에요` : `${c.visits.length}번 다녀온 곳이에요` });
  }
  if (cat && t && contrib.taste > 0.015 && t.rated >= 1) {
    out.push({ v: contrib.taste, text: `${we}기록에서 평소보다 별점이 높았던 ${cat}${t.rated >= 2 ? ` · ${t.rated}곳` : ""}` });
  } else if (cat && t && contrib.taste > 0.015) {
    out.push({ v: contrib.taste, text: `${we}기록에서 다시 가고 싶다고 남긴 ${cat}` });
  }
  if (c.stat && contrib.community > 0.01) {
    out.push({ v: contrib.community, text: `인증한 사람의 ${Math.round(Number(c.stat.revisit_rate) * 100)}%가 다시 갔어요` });
  }
  if (c.stat && c.stat.slot_dow > 0) out.push({ v: contrib.meal, text: `지난 4주 ${DAY_NAMES[ctx.dow]} 이 시간대에 인증 ${c.stat.slot_dow}건` });
  else if (c.stat && c.stat.slot_any > 0) out.push({ v: contrib.meal * 0.9, text: `지난 4주 이 시간대에 인증 ${c.stat.slot_any}건` });
  else if (cat && contrib.meal > 0.01) out.push({ v: contrib.meal, text: `${we}${SLOT_LABEL[ctx.slot]}에 자주 드신 ${cat}` });
  if (contrib.novelty > 0.035 && !c.visits.length && !c.wish) out.push({ v: contrib.novelty * 0.8, text: "아직 안 가 본 곳 중 취향에 맞는 곳이에요" });
  if (contrib.context > 0.005 && ctx.weather) out.push({ v: contrib.context, text: `${ctx.weather.precip ? "비 · 눈이 와서" : "날씨가 궂어"} 가까운 곳을 앞에 뒀어요` });
  if (x.distance > 0.55) out.push({ v: contrib.distance * 0.5, text: `${formatDistance(c.distance)} 거리라 가까워요` });
  if (c.stat && c.stat.today_count > 0) out.push({ v: 0.012, text: `오늘 인증 ${c.stat.today_count}건` });

  // 어제 먹은 종류와 다르면 그 까닭(종류 반복 감점의 다른 얼굴).
  const yesterday = [...new Set(ctx.recent.filter((m) => m.cat && dayDiff(m.date, ctx.today) === 1).map((m) => m.cat!))];
  if (cat && yesterday.length && !yesterday.includes(cat)) out.push({ v: 0.011, text: `어제 ${eulReul(yesterday.join("·"))} 드셔서 ${euroRo(cat)} 골랐어요` });

  const top = out.sort((a, b) => b.v - a.v).slice(0, 3).map((o) => o.text);
  return top.length ? top : ["고른 조건에 맞는 가까운 곳이에요"];
}
