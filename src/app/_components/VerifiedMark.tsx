/**
 * 방문 인증 뱃지 — 지도 핀과 같은 모양(정사각형을 45도 돌려 모서리 하나를
 * 뾰족하게 만든 뒤집힌 물방울)에 체크를 얹습니다.
 */
export default function VerifiedMark({
  size = 26,
  shadow = false,
}: {
  size?: number;
  shadow?: boolean;
}) {
  const drop = size / Math.SQRT2;
  const strokeWidth = size >= 40 ? 2.6 : size >= 22 ? 3 : 3.4;
  const dropShadow = !shadow
    ? undefined
    : size >= 40
      ? "drop-shadow(0 4px 12px rgba(28,26,23,.3))"
      : "drop-shadow(0 2px 5px rgba(28,26,23,.22))";

  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size, filter: dropShadow }}
      role="img"
      aria-label="인증"
    >
      <span
        className="absolute bg-brick"
        style={{
          width: drop,
          height: drop,
          left: (size - drop) / 2,
          top: (size - drop) / 2,
          borderRadius: "50% 50% 50% 0",
          transform: "rotate(-45deg)",
        }}
      />
      <svg
        className="absolute"
        style={{ left: "50%", top: "42%", transform: "translate(-50%, -50%)" }}
        width={size * 0.4}
        height={size * 0.4}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fbfaf6"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12.6L9.6 17.2L19 7.4" />
      </svg>
    </span>
  );
}
