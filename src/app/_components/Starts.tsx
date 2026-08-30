/**
 * 별점 표시 — 회색 별 5개 위에 벽돌색 별 5개를 겹치고, 폭을 rating/5 만큼만 보여줍니다.
 * 0.5 단위가 그대로 보입니다. size 는 글자 크기(px).
 */
export default function Stars({
  rating,
  size = 13,
}: {
  rating: number | null;
  size?: number;
}) {
  const value = Math.max(0, Math.min(5, rating ?? 0));

  return (
    <span
      className="relative inline-block leading-none whitespace-nowrap"
      style={{ fontSize: size, letterSpacing: "0.14em" }}
      aria-label={`별점 ${value} / 5`}
    >
      <span className="text-[#dcd6ca]">★★★★★</span>
      <span
        className="absolute top-0 left-0 overflow-hidden text-brick"
        style={{ width: `${(value / 5) * 100}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}
