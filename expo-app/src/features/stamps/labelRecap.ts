import { ieosseoyo, nativeCount } from "@/features/recap/seasons";
import { eulReul, iNa } from "@/lib/josa";
import { BOWL_TIERS, earnedBy, labelById, nextBowl, recordTime, stampRows, type LabelDef } from "@/lib/labels";
import type { MenuItem, Restaurant } from "@/lib/types";

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
  discovery: Line;
};

/** 낱말 뒤에 붙는 조사만 — 강조어와 조사를 따로 그리려고. */
const josa = (word: string, f: (w: string) => string) => f(word).slice(word.length);
// 시각이 하나도 없는 행(옛 데이터)은 빈 날짜로 두고, 날짜 집계에서는 건너뜁니다.
const dateOf = (r: Restaurant) => (recordTime(r) ?? "").slice(0, 10);
const dayOf = (d: string) => Date.parse(`${d}T00:00:00Z`);
const validDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(dayOf(d));
const dayDiff = (a: string, b: string) => Math.round((dayOf(b) - dayOf(a)) / 86400000);
/** 좋았던 · 먹은 메뉴 이름 — 이름이 비었거나 없으면 "". */
const menuName = (m: MenuItem | null | undefined) => (typeof m?.name === "string" ? m.name.trim() : "");
const placeKey = (r: Restaurant) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase();

/** 「다섯이」 「하나가」 — 수 대명사 + 주격. 1~99 밖이면 숫자. */
function nativeSubject(n: number) {
  const special: Record<number, string> = { 1: "하나가", 2: "둘이", 3: "셋이", 4: "넷이", 20: "스물이" };
  if (special[n]) return special[n];
  const det = nativeCount(n);
  if (det === String(n)) return `${n}개가`;
  // 끝자리가 한·두·세·네이면 대명사 꼴로.
  const fix: Record<string, string> = { 한: "하나가", 두: "둘이", 세: "셋이", 네: "넷이" };
  const last = det.slice(-1);
  if (fix[last]) return det.slice(0, -1) + fix[last];
  return `${det}이`;
}

/** 좋았던 메뉴 이름으로 묶는 종류 — 이름에 든 말로만 봅니다. */
const MENU_KINDS: [string, RegExp][] = [
  ["국물", /(국밥|국수|떡국|국$|탕(?!수)|찌개|전골|라멘|라면|우동|짬뽕|수제비|샤브|훠궈|쌀국수|곰국|수프|스프)/],
  ["면", /(면|국수|파스타|스파게티|소바|우동|라멘|짜장|짬뽕)/],
  ["고기", /(고기|갈비|삼겹|목살|스테이크|불고기|돈까스|돈카츠|치킨|닭|족발|보쌈|곱창|막창)/],
  ["빵", /(빵|베이글|크루아상|크로와상|스콘|케이크|타르트|휘낭시에|마들렌|도넛)/],
  ["커피", /(커피|라떼|아메리카노|에스프레소|카푸치노|플랫화이트)/],
  ["밥", /(밥|덮밥|비빔|리조또|오므라이스|초밥|김밥)/],
];

type Candidate = { ratio: number; line: Line };

/**
 * 발견 한 줄 — 후보 중 비율이 가장 높은 하나. 요일 · 시간대로 만든 문장은 쓰지 않고,
 * 남과 견주지 않고 내 기록 안의 값만 씁니다. 「따봉」 대신 「좋았던 / 아쉬웠던」.
 */
function discoveryOf(def: LabelDef, journey: Restaurant[], all: Restaurant[]): Line {
  const out: Candidate[] = [];

  // 좋았던 메뉴의 공통 종류
  const liked = journey.flatMap((r) => (r.menus ?? []).filter((m) => m?.vote === 1 && menuName(m)).map(menuName));
  if (liked.length >= 3) {
    const best = MENU_KINDS.map(([k, re]) => [k, liked.filter((n) => re.test(n)).length] as const).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) {
      out.push({ ratio: best[1] / liked.length, line: [{ t: `좋았던 메뉴 ${nativeCount(liked.length)} 개 중 ${nativeSubject(best[1])} ` }, { t: best[0], em: true }, { t: josa(best[0], ieosseoyo) }] });
    }
  }

  // 5점 준 곳에 다시 갔는지
  const visits = new Map<string, number>();
  for (const r of all) visits.set(placeKey(r), (visits.get(placeKey(r)) ?? 0) + 1);
  const fives = [...new Set(journey.filter((r) => r.rating === 5).map(placeKey))];
  if (fives.length >= 2) {
    const again = fives.filter((k) => (visits.get(k) ?? 0) >= 2).length;
    if (again) out.push({ ratio: again / fives.length, line: [{ t: `5점 준 곳 ${nativeCount(fives.length)} 곳 중 ${nativeCount(again)} 곳에 ` }, { t: "다시", em: true }, { t: " 갔어요" }] });
  }

  // 같은 메뉴를 여러 곳에서
  const menuPlaces = new Map<string, Set<string>>();
  for (const r of journey) for (const m of r.menus ?? []) {
    const n = menuName(m).replace(/\s+/g, "");
    if (!n) continue;
    if (!menuPlaces.has(n)) menuPlaces.set(n, new Set());
    menuPlaces.get(n)!.add(placeKey(r));
  }
  const repeat = [...menuPlaces.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  const journeyPlaces = new Set(journey.map(placeKey)).size;
  if (repeat && repeat[1].size >= 2 && journeyPlaces) {
    out.push({ ratio: repeat[1].size / journeyPlaces, line: [{ t: repeat[0], em: true }, { t: `${josa(repeat[0], eulReul)} ${nativeCount(repeat[1].size)} 곳에서 먹었어요` }] });
  }

  // 위시에서 실제로 다녀온 수
  const fromWish = journey.filter((r) => r.from_wish).length;
  if (fromWish) out.push({ ratio: fromWish / journey.length, line: [{ t: `담아둔 곳 중 ${nativeCount(fromWish)} 곳을 ` }, { t: "실제로", em: true }, { t: " 다녀왔어요" }] });

  out.sort((a, b) => b.ratio - a.ratio);
  if (out[0]) return out[0].line;
  return [{ t: `${nativeCount(journeyPlaces || 1)} 곳을 다녀오며 ` }, { t: def.name, em: true }, { t: `${josa(def.name, eulReul)} 받았어요` }];
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
    discovery: discoveryOf(def, contrib, rows.filter((r) => !r.pending)),
  };
}
