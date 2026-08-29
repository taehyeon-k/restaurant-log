import { feltLevel, priceTitle, type PriceRow } from "@/lib/price";

export default function PriceLevel({
  row,
  size = 16,
}: {
  row: PriceRow;
  size?: number;
}) {
  const level = feltLevel(row);

  if (!level) {
    return <span className="text-[13px] text-[#a8a196]">—</span>;
  }

  return (
    <span
      className="flex items-center gap-0.5"
      title={priceTitle(row)}
      aria-label={`체감 가격 ${level} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={n}
          src="/piggy.png"
          alt=""
          width={size}
          height={size}
          className={`block shrink-0 object-contain ${
            n <= level ? "opacity-100" : "opacity-30 grayscale-[0.85]"
          }`}
        />
      ))}
    </span>
  );
}
