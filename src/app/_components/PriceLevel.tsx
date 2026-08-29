export const PRICE_HINTS = [
  "",
  "가볍게",
  "부담 없이",
  "보통",
  "특별한 날",
  "큰맘 먹고",
];

export default function PriceLevel({
  level,
  size = 14,
}: {
  level: number | null;
  size?: number;
}) {
  if (!level) return <span className="text-[13px] text-[#a8a196]">—</span>;

  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={PRICE_HINTS[level]}
      aria-label={`가격 ${level}단계`}
    >
      {Array.from({ length: level }, (_, i) => (
        <span key={i} style={{ fontSize: size, lineHeight: 1 }}>
          🐷
        </span>
      ))}
    </span>
  );
}
