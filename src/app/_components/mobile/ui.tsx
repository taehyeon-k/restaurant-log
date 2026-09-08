/**
 * 모바일 화면이 함께 쓰는 조각들 — 도형, 별점, 돼지, 사진 자리.
 * 값은 design_handoff_mobile 의 하이파이 시제품과 같습니다.
 */
import { pinColor } from "@/lib/types";
import { feltLevel, type PriceRow } from "@/lib/price";

export { default as VerifiedMark } from "../VerifiedMark";

/** 라벨첩 버튼 아이콘 = 24각 버스트 (인증 뱃지와는 다른 모양입니다) */
export const BURST =
  "polygon(50.0% 0.0%, 60.6% 10.4%, 75.0% 6.7%, 79.0% 21.0%, 93.3% 25.0%, 89.6% 39.4%, 100.0% 50.0%, 89.6% 60.6%, 93.3% 75.0%, 79.0% 79.0%, 75.0% 93.3%, 60.6% 89.6%, 50.0% 100.0%, 39.4% 89.6%, 25.0% 93.3%, 21.0% 79.0%, 6.7% 75.0%, 10.4% 60.6%, 0.0% 50.0%, 10.4% 39.4%, 6.7% 25.0%, 21.0% 21.0%, 25.0% 6.7%, 39.4% 10.4%)";

export const CLIP = {
  burst: BURST,
  check: BURST,
  hex: "polygon(50.0% 0.0%, 93.3% 25.0%, 93.3% 75.0%, 50.0% 100.0%, 6.7% 75.0%, 6.7% 25.0%)",
  shield: "polygon(50% 0%, 100% 17%, 100% 60%, 50% 100%, 0% 60%, 0% 17%)",
  oct: "polygon(30.9% 3.8%, 69.1% 3.8%, 96.2% 30.9%, 96.2% 69.1%, 69.1% 96.2%, 30.9% 96.2%, 3.8% 69.1%, 3.8% 30.9%)",
} as const;

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

export const PlusIcon = ({ stroke = "#1c1a17" }: { stroke?: string }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="1.7"
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** 보관함(사진 상자) — 지도 우하단 단추와 보관함 카드 사진이 함께 씁니다. */
export const DraftsBoxIcon = ({
  size = 23,
  stroke = "#1c1a17",
}: {
  size?: number;
  stroke?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3.2" y="6.6" width="17.6" height="13.4" rx="2.6" />
    <path d="M3.2 10.6h17.6" />
    <circle cx="12" cy="15.3" r="2.7" />
    <path d="M8.8 6.6 9.9 4.2h4.2l1.1 2.4" />
  </svg>
);

/**
 * 책갈피 — 위시(가고싶다)를 나타내는 단 하나의 도형입니다. 하단 탭 아이콘,
 * SpotPicker 십자, + 메뉴의 「계획 추가」, WISH MET 카드, 지도 위시 마커가
 * 모두 이 path 를 씁니다(HANDOFF-wish.md §5). 점선 변형은 두지 않습니다 —
 * 작아지면 안 보이기 때문입니다.
 */
export const BookmarkIcon = ({
  size = 20,
  fill = "none",
  stroke = "#1c1a17",
  strokeWidth = 1.6,
}: {
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round">
    <path d="M6.5 2.6h11a1.4 1.4 0 0 1 1.4 1.4v17a.6.6 0 0 1-.95.49L12 16.7l-5.95 4.79a.6.6 0 0 1-.95-.49V4a1.4 1.4 0 0 1 1.4-1.4Z" />
  </svg>
);

export const BellIcon = ({ size = 15, stroke = "currentColor" }: { size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.5c-3 0-5 2.2-5 5.4v3.3c0 1-.4 2-1.2 2.9l-.7.8h13.8l-.7-.8c-.8-.9-1.2-1.9-1.2-2.9V8.9c0-3.2-2-5.4-5-5.4Z" />
    <path d="M9.6 19.5a2.4 2.4 0 0 0 4.8 0" />
  </svg>
);

export const ExternalLinkIcon = ({ size = 15, stroke = "currentColor" }: { size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6H5.5A2.5 2.5 0 0 0 3 8.5v10A2.5 2.5 0 0 0 5.5 21h10a2.5 2.5 0 0 0 2.5-2.5V15" />
    <path d="M14 3h7v7" />
    <path d="m21 3-10.5 10.5" />
  </svg>
);

/** 50×28 켜짐/꺼짐 스위치 — EditScreen 의 재방문 토글과 같은 모양. */
export function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-7 w-[50px] shrink-0 cursor-pointer rounded-full border-none transition-colors duration-150 ${checked ? "bg-brick" : "bg-[#d8d3c8]"}`}
    >
      <span
        className="absolute top-0.5 size-6 rounded-full bg-card shadow-[0_1px_3px_rgba(28,26,23,.28)] transition-[left] duration-150"
        style={{ left: checked ? 24 : 2 }}
      />
    </button>
  );
}

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
