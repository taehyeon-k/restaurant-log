import { nativeCount } from "@/features/recap/seasons";
import { eulReul, iNa } from "@/lib/josa";
import { BOWL_TIERS, earnedBy, labelById, nextBowl, recordTime, stampRows, type LabelDef } from "@/lib/labels";
import type { Restaurant } from "@/lib/types";

/** 강조어만 벽돌색으로 그리는 한 줄. */
export type Line = { t: string; em?: boolean }[];

export type LabelRecap = {
  def: LabelDef;
  /** 받은 기록과 그 날(YYYY-MM-DD) */
  earnedOn: string;
  /** 어떻게 받았는지 — 「5.0을 준 집을 열 곳이나 찾으셨네요?」 */
  how: Line;
  /** 이 라벨에 들어간 기록, 오래된 순 · 번호는 1부터 */
  journey: { no: number; row: Restaurant }[];
  days: number;
  places: number;
  topCategory: string | null;
  next: { name: string; left: number; have: number; need: number; from: number } | null;
  /** 무엇을 해내서 받았는지 — 「인증 기록 40개를 채웠어요」(마지막 장 · 공유 카드) */
  brag: Line;
};

/** 낱말 뒤에 붙는 조사만 — 강조어와 조사를 따로 그리려고. */
const josa = (word: string, f: (w: string) => string) => f(word).slice(word.length);
// 시각이 하나도 없는 행(옛 데이터)은 빈 날짜로 두고, 날짜 집계에서는 건너뜁니다.
const dateOf = (r: Restaurant) => (recordTime(r) ?? "").slice(0, 10);
const dayOf = (d: string) => Date.parse(`${d}T00:00:00Z`);
const validDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(dayOf(d));
const dayDiff = (a: string, b: string) => Math.round((dayOf(b) - dayOf(a)) / 86400000);
const placeKey = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

/**
 * 무엇을 해내서 받았는지 — 리캡 마지막 장 · 공유 카드에 그대로 실려 자랑이 되는 한 줄.
 * 내 말투(「~했어요」)로, 수는 숫자로 또렷하게.
 */
function bragOf(def: LabelDef, journey: Restaurant[]): Line {
  const n = def.need;
  const tier = BOWL_TIERS.find((t) => t.id === def.id);
  if (tier) {
    return tier.need === 1
      ? [{ t: "가게에서 찍은 " }, { t: "첫 인증 기록", em: true }, { t: "을 남겼어요" }]
      : [{ t: "가게에서 찍은 인증 기록 " }, { t: `${n}개`, em: true }, { t: "를 채웠어요" }];
  }
  const year = journey[0]?.visited_at?.slice(0, 4);
  switch (def.id) {
    case "verified": return [{ t: "가게에서 찍은 인증 기록 " }, { t: `${n}개`, em: true }, { t: "를 채웠어요" }];
    case "gold": return [{ t: "5.0을 준 집을 " }, { t: `${n}곳`, em: true }, { t: " 찾았어요" }];
    case "regular": return [{ t: `${journey[0]?.name ?? "한 가게"}에 ` }, { t: `${n}번`, em: true }, { t: " 다녀왔어요" }];
    case "midnight": return [{ t: "자정 넘어 남긴 기록 " }, { t: `${n}개`, em: true }, { t: "를 채웠어요" }];
    case "regions": return [{ t: "서로 다른 " }, { t: `${n}개 동네`, em: true }, { t: "에서 기록했어요" }];
    case "years": return [{ t: `${n}년 연속`, em: true }, { t: " 기록을 이어 왔어요" }];
    case "revisit": return [{ t: "다시 찾은 가게 " }, { t: `${n}곳`, em: true }, { t: "을 채웠어요" }];
    case "palate": return [{ t: "음식 종류 " }, { t: `${n}가지`, em: true }, { t: "를 고루 먹었어요" }];
    case "weekend": return [{ t: "토 · 일요일 기록 " }, { t: `${n}개`, em: true }, { t: "를 채웠어요" }];
    case "album": return [{ t: "사진을 세 장 넘게 담은 기록 " }, { t: `${n}개`, em: true }, { t: "를 채웠어요" }];
    case "longform": return [{ t: "100자 넘는 메모를 " }, { t: `${n}번`, em: true }, { t: " 썼어요" }];
    case "morning": return [{ t: "오전 11시 전 인증 " }, { t: `${n}번`, em: true }, { t: "을 채웠어요" }];
    case "planner": return [{ t: "위시에 담아 둔 곳 " }, { t: `${n}곳`, em: true }, { t: "을 실제로 다녀왔어요" }];
    case "seasons": return [{ t: year ? `${year}년 ` : "한 해에 " }, { t: "봄 · 여름 · 가을 · 겨울", em: true }, { t: "을 모두 기록했어요" }];
    case "solo": return [{ t: "혼밥 기록 " }, { t: `${n}개`, em: true }, { t: "를 채웠어요" }];
    case "weeks": return [{ t: `${n}주 연속`, em: true }, { t: " 매주 기록했어요" }];
    case "explorer": return [{ t: "서로 다른 가게 " }, { t: `${n}곳`, em: true }, { t: "을 찾아냈어요" }];
    case "december": return [{ t: "12월 기록 " }, { t: `${n}개`, em: true }, { t: "를 채웠어요" }];
    default: return [{ t: def.desc, em: true }, { t: `${josa(def.desc, eulReul)} 달성했어요` }];
  }
}

/** 수를 강조하고 뒤에 「이나 / 나」를 붙인 조각 — 「열 곳」 + 「이나 」. */
const many = (count: string): Line => [{ t: count, em: true }, { t: iNa(count).slice(count.length) }];

/** 이 라벨을 어떻게 받았는지 — 조건을 내 이야기처럼 한 줄로. */
function howOf(def: LabelDef, journey: Restaurant[]): Line {
  const n = nativeCount(def.need);
  const tier = BOWL_TIERS.find((t) => t.id === def.id);
  if (tier) {
    return tier.need === 1
      ? [{ t: "가게에서 찍은 " }, { t: "첫 인증", em: true }, { t: " 기록을 남기셨네요!" }]
      : [{ t: "가게에서 찍은 인증 기록을 " }, ...many(`${tier.word} 번`), { t: " 남기셨네요?" }];
  }
  switch (def.id) {
    case "verified": return [{ t: "가게에서 찍은 인증 기록을 " }, ...many(`${n} 번`), { t: " 남기셨네요?" }];
    case "gold": return [{ t: "5.0을 준 집을 " }, ...many(`${n} 곳`), { t: " 찾으셨네요?" }];
    case "regular": return [{ t: `${journey[0]?.name ?? "한 가게"}에 ` }, ...many(`${n} 번`), { t: " 가셨네요?" }];
    case "midnight": return [{ t: "자정 넘어 남긴 기록이 " }, ...many(`${n} 개`), { t: " 되네요?" }];
    case "regions": return [{ t: "서로 다른 " }, { t: `${n} 동네`, em: true }, { t: "에서 기록을 남기셨네요?" }];
    case "years": return [{ t: `${n} 해`, em: true }, { t: " 연속으로 기록을 이어 오셨네요?" }];
    case "revisit": return [{ t: "다시 찾은 가게가 " }, ...many(`${n} 곳`), { t: " 되네요?" }];
    case "palate": return [{ t: `${n} 가지`, em: true }, { t: " 종류를 고루 드셨네요?" }];
    case "weekend": return [{ t: "토 · 일요일에 남긴 기록이 " }, ...many(`${n} 개`), { t: " 되네요?" }];
    case "album": return [{ t: "사진을 세 장 넘게 담은 기록이 " }, ...many(`${n} 개`), { t: " 되네요?" }];
    case "longform": return [{ t: "100자 넘는 메모를 " }, ...many(`${n} 번`), { t: " 쓰셨네요?" }];
    case "morning": return [{ t: "오전 11시 전에 인증을 " }, ...many(`${n} 번`), { t: " 하셨네요?" }];
    case "planner": return [{ t: "위시에 담아 둔 곳을 " }, ...many(`${n} 곳`), { t: " 실제로 가셨네요?" }];
    case "seasons": return [{ t: `${journey[0]?.visited_at ? `${journey[0].visited_at.slice(0, 4)}년` : "한 해"}에 ` }, { t: "봄 · 여름 · 가을 · 겨울", em: true }, { t: "을 모두 기록하셨네요!" }];
    case "solo": return [{ t: "혼자 먹은 기록이 " }, ...many(`${n} 개`), { t: " 되네요?" }];
    case "weeks": return [{ t: `${n} 주`, em: true }, { t: " 연속으로 매주 기록을 남기셨네요?" }];
    case "explorer": return [{ t: "서로 다른 가게를 " }, ...many(`${n} 곳`), { t: " 찾아내셨네요?" }];
    case "december": return [{ t: "12월에 남긴 기록이 " }, ...many(`${n} 개`), { t: " 되네요?" }];
    default: return [{ t: def.desc, em: true }, { t: `${josa(def.desc, eulReul)} 채우셨네요!` }];
  }
}

/** 다음 그릇 수 단계 — 그릇 수 라벨에만 보여 줍니다(이야기 라벨은 다음 라벨을 안내하지 않음). 다 받았으면 null. */
function nextOf(rows: Restaurant[]): LabelRecap["next"] {
  const stamps = stampRows(rows).length;
  const bowl = nextBowl(stamps);
  return bowl ? { name: bowl.tier.name, left: bowl.left, have: stamps, need: bowl.tier.need, from: bowl.from } : null;
}

export function computeLabelRecap(id: string, rows: Restaurant[]): LabelRecap | null {
  const def = labelById(id);
  if (!def) return null;
  const by = earnedBy(def, rows);
  if (!by) return null;
  const contrib = def.contrib(rows);
  const stamps = stampRows(rows);
  // 그릇 수는 도장 번호 그대로, 이야기는 1부터.
  const journey = contrib.map((row, i) => ({ no: def.group === "bowl" ? stamps.indexOf(row) + 1 : i + 1, row }));
  const dates = contrib.map(dateOf).filter(validDay).sort();
  const cats = new Map<string, number>();
  for (const r of contrib) if (r.category) cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
  return {
    def,
    earnedOn: dateOf(by),
    how: howOf(def, contrib),
    journey,
    days: dates.length ? dayDiff(dates[0], dates[dates.length - 1]) + 1 : 1,
    places: new Set(contrib.map(placeKey)).size,
    topCategory: [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    next: def.group === "bowl" ? nextOf(rows) : null,
    brag: bragOf(def, contrib),
  };
}
