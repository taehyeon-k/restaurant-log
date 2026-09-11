/**
 * 방문 인증 뱃지 — 지도 핀과 같은 물방울(정사각형을 45도 돌려 모서리 하나를
 * 뾰족하게 만든 모양) 위에 흰 원을 얹고, 그 안에 벽돌색 체크를 넣습니다.
 */
export default function VerifiedMark({
  size = 26,
  shadow = false,
}: {
  size?: number;
  shadow?: boolean;
}) {
  const drop = size / Math.SQRT2;
  const circle = size * 0.62;
  const check = size * 0.365;
  const strokeWidth =
    size >= 40 ? 3 : size >= 24 ? 3.6 : size >= 22 ? 3.8 : size >= 20 ? 4 : 4.4;
  const dropShadow = !shadow
    ? undefined
    : size >= 40
      ? "drop-shadow(3px -3px 12px rgba(28,26,23,.28))"
      : "drop-shadow(1px -1px 4px rgba(28,26,23,.2))";

  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size, filter: dropShadow }}
      role="img"
      aria-label="인증"
    >
      <span
        className="absolute grid place-items-center bg-brick"
        style={{
          width: drop,
          height: drop,
          left: (size - drop) / 2,
          top: (size - drop) / 2,
          borderRadius: "50% 50% 50% 0",
          transform: "rotate(-45deg)",
        }}
      >
        <span
          className="grid place-items-center rounded-full bg-[#fbfaf6]"
          style={{ width: circle, height: circle, transform: "rotate(45deg)" }}
        >
          <svg
            width={check}
            height={check}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#b4552d"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.6L9.6 17.2L19 7.4" />
          </svg>
        </span>
      </span>
    </span>
  );
}
