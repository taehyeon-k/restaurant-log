/**
 * 방문 인증 뱃지 — 지도 핀과 같은 물방울(정사각형을 45도 돌려 모서리 하나를
 * 뾰족하게 만든 모양) 위에 흰 원을 얹고, 그 안에 벽돌색 체크를 넣습니다.
 * 벽돌 단색 채움 + 종이색 얇은 테두리 한 겹뿐인 평평한 스티커 모양입니다
 * (마커.PNG 시안 기준 — 기울임·그라디언트·이중 테두리 없음).
 */
export default function VerifiedMark({
  size = 26,
  shadow = false,
}: {
  size?: number;
  shadow?: boolean;
}) {
  const drop = size / Math.SQRT2;
  const circle = drop * 0.58;
  const check = circle * 0.6;
  const border = Math.max(1, drop * 0.045);
  const strokeWidth = Math.max(1.6, check * 0.22);
  /**
   * 물방울은 한쪽 모서리가 뾰족해 무게 중심이 그 반대쪽(위)으로 쏠립니다.
   * 원을 사각형의 기하학적 가운데 그대로 두면 뾰족한 쪽으로 처져 보이므로,
   * 그만큼 위로 살짝 올립니다. rotate(45deg) 뒤에 translateY 를 붙이면(행렬이
   * R(45)·T 가 되어 바깥 rotate(-45) 와 상쇄되고) 화면 기준 수직 이동만
   * 남아 항상 곧게 위로 올라갑니다.
   */
  const centerNudge = drop * 0.02;

  const dropShadow = shadow ? "drop-shadow(1px -1px 4px rgba(28,26,23,.22))" : undefined;

  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size, filter: dropShadow }}
      role="img"
      aria-label="인증"
    >
      <span
        className="absolute grid place-items-center"
        style={{
          width: drop,
          height: drop,
          left: (size - drop) / 2,
          top: (size - drop) / 2,
          boxSizing: "border-box",
          borderRadius: "50% 50% 50% 0",
          background: "#b4552d",
          border: `${border}px solid #f7ece5`,
          transform: "rotate(-45deg)",
        }}
      >
        <span
          className="grid place-items-center rounded-full bg-[#fbfaf6]"
          style={{ width: circle, height: circle, transform: `rotate(45deg) translateY(-${centerNudge}px)` }}
        >
          <svg
            width={check}
            height={check}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#a8491f"
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
