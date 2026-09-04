/**
 * 모바일 화면이 함께 쓰는 조각들 — 도형, 별점, 돼지, 사진 자리.
 * 값은 design_handoff_mobile 의 하이파이 시제품과 같습니다.
 */
import { pinColor } from "@/lib/types";
import { feltLevel, type PriceRow } from "@/lib/price";

/** 인증 뱃지 = 24각 버스트 */
export const BURST =
  "polygon(50.0% 0.0%, 60.6% 10.4%, 75.0% 6.7%, 79.0% 21.0%, 93.3% 25.0%, 89.6% 39.4%, 100.0% 50.0%, 89.6% 60.6%, 93.3% 75.0%, 79.0% 79.0%, 75.0% 93.3%, 60.6% 89.6%, 50.0% 100.0%, 39.4% 89.6%, 25.0% 93.3%, 21.0% 79.0%, 6.7% 75.0%, 10.4% 60.6%, 0.0% 50.0%, 10.4% 39.4%, 6.7% 25.0%, 21.0% 21.0%, 25.0% 6.7%, 39.4% 10.4%)";

export const CLIP = {
  burst: BURST,
  check: BURST,
  hex: "polygon(50.0% 0.0%, 93.3% 25.0%, 93.3% 75.0%, 50.0% 100.0%, 6.7% 75.0%, 6.7% 25.0%)",
  shield: "polygon(50% 0%, 100% 17%, 100% 60%, 50% 100%, 0% 60%, 0% 17%)",
  oct: "polygon(30.9% 3.8%, 69.1% 3.8%, 96.2% 30.9%, 96.2% 69.1%, 69.1% 96.2%, 30.9% 96.2%, 3.8% 69.1%, 3.8% 30.9%)",
} as const;

/** 인증 도형 + 체크. size 에 맞춰 체크 굵기를 얇게 잡습니다. */
export function VerifiedMark({
  size,
  shadow = false,
}: {
  size: number;
  shadow?: boolean;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center bg-brick"
      style={{
        width: size,
        height: size,
        clipPath: BURST,
        boxShadow: shadow ? "0 4px 12px rgba(28,26,23,.26)" : undefined,
      }}
    >
      <svg
        width={size * 0.42}
        height={size * 0.42}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fbfaf6"
        strokeWidth={size > 30 ? 2.7 : 3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12.6L9.6 17.2L19 7.4" />
      </svg>
    </span>
  );
}

/** 부분 채움 별점 — 데스크톱 Stars 와 같은 방식, 모바일 자간으로. */
export function MobileStars({
  rating,
  size = 12.5,
  gap = 1,
}: {
  rating: number | null;
  size?: number;
  gap?: number;
}) {
  const value = Math.max(0, Math.min(5, rating ?? 0));

  return (
    <span
      className="relative inline-block leading-none whitespace-nowrap text-[#ded8cb]"
      style={{ fontSize: size, letterSpacing: `${gap}px` }}
      aria-label={`별점 ${value} / 5`}
    >
      ★★★★★
      <span
        className="absolute top-0 left-0 overflow-hidden whitespace-nowrap text-brick"
        style={{ width: `${(value / 5) * 100}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}

/** 체감 가격 돼지 다섯 마리. */
export function Pigs({
  row,
  w = 15,
  h = 14,
}: {
  row: PriceRow;
  w?: number;
  h?: number;
}) {
  const level = feltLevel(row);

  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`체감 가격 ${level} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={n}
          src="/piggy.png"
          alt=""
          width={w}
          height={h}
          className={`block shrink-0 object-contain ${
            n <= level ? "opacity-100" : "opacity-30 grayscale-[0.85]"
          }`}
        />
      ))}
    </span>
  );
}

/**
 * 사진이 있으면 덮어 채우고, 없으면 종류 색의 사선 스트라이프.
 * 인라인 style 로 돌려줍니다 — 색이 데이터에서 오기 때문입니다.
 */
export function photoFill(
  src: string | null | undefined,
  category: string | null
): React.CSSProperties {
  if (src) {
    return {
      backgroundImage: `url(${JSON.stringify(src)})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  const c = pinColor(category);
  return {
    backgroundColor: "#ded8cb",
    backgroundImage: `repeating-linear-gradient(135deg, ${c}22 0 9px, ${c}0f 9px 18px)`,
  };
}

/** 돋보기 */
export const SearchIcon = ({ size = 15 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="#8a8377"
    strokeWidth="1.6"
    className="shrink-0"
  >
    <circle cx="7" cy="7" r="4.6" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);

export const CameraIcon = ({
  size = 25,
  stroke = "#fbfaf6",
  width = 1.7,
}: {
  size?: number;
  stroke?: string;
  width?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2.5" y="5.5" width="19" height="14" rx="3.5" />
    <circle cx="12" cy="12.5" r="4" />
    <path d="M8 5.5L9.4 3h5.2l1.4 2.5" />
  </svg>
);

export const PlusIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#1c1a17"
    strokeWidth="1.7"
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const PinIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#b4552d"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    <path d="M12 21s7-6.3 7-11.3A7 7 0 005 9.7C5 14.7 12 21 12 21z" />
    <circle cx="12" cy="9.7" r="2.4" />
  </svg>
);

/** 라벨(작은 대문자 모노) — 상세·폼 화면의 섹션 머리말 */
export const Eyebrow = ({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) => (
  <span
    className="font-mono text-[10px] text-faint"
    style={{ letterSpacing: wide ? "0.22em" : "0.16em" }}
  >
    {children}
  </span>
);

/** 44×44 원형 뒤로가기 */
export const BackButton = ({
  onClick,
  label = "←",
  className = "",
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="뒤로"
    className={`grid size-11 cursor-pointer place-items-center rounded-full border-none text-[17px] text-ink ${className}`}
  >
    {label}
  </button>
);

export const chipClass = (active: boolean) =>
  `min-h-9 cursor-pointer rounded-[18px] border px-[13px] text-[12.5px] ${
    active
      ? "border-brick bg-brick text-[#fdf9f3]"
      : "border-[#cdc6b8] bg-transparent text-[#4a453d]"
  }`;

/** 폼 입력 공통 — 높이 48, radius 16 */
export const fieldClass =
  "mt-2 min-h-12 w-full rounded-[16px] border border-[#ded8cb] bg-card px-[15px] text-[13.5px] text-ink outline-none placeholder:text-[#b3ada1] focus:border-brick";
