import type { RecInput } from "../pipeline";
import { at, input, kakao, neighborhood, row, wish } from "./fixtures";

/** Fixed synthetic examples for calibration, not a representative sample of app users. */
export function benchmarkCases(): { name: string; input: RecInput }[] {
  const sushiAndRamen = [
    kakao("2001", "새스시", "음식점 > 일식 > 초밥,롤", 700),
    kakao("2002", "새라멘", "음식점 > 일식 > 일본식라면", 150),
    ...neighborhood(),
  ];
  return [
    { name: "cold-start", input: input() },
    { name: "sushi-liked-ramen-disliked", input: input({
      kakao: sushiAndRamen,
      rows: ["A", "B", "C"].map((id) => row({ name: `기록${id}`, category: "일식", rating: 5, menus: [{ name: "초밥", vote: null }] }))
        .concat(["D", "E", "F"].map((id) => row({ name: `기록${id}`, category: "일식", rating: 1.5, menus: [{ name: "라멘", vote: null }] }))),
    }) },
    { name: "generous-rater", input: input({ rows: ["A", "B", "C"].map((id) => row({ name: id, category: "한식", rating: 4.5 })) }) },
    { name: "wishlist-800m-vs-neutral-300m", input: input({
      kakao: [kakao("3001", "위시", "한식", 800), kakao("3002", "근처", "한식", 300), ...neighborhood()],
      wishes: [wish({ name: "위시", ...at(800) })],
    }) },
    { name: "happy-regular", input: input({
      kakao: [kakao("4001", "단골", "한식", 200), ...neighborhood()],
      rows: ["2026-09-24", "2026-09-30", "2026-10-05", "2026-10-10", "2026-10-15"].map((visited_at) => row({ name: "단골", visited_at, rating: 5, revisit: true, ...at(200) })),
    }) },
  ];
}
