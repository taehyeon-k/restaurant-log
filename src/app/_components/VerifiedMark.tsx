/**
 * 방문 인증 뱃지 — 지도 핀과 같은 물방울(정사각형을 45도 돌려 모서리 하나를
 * 뾰족하게 만든 모양) 위에 흰 원을 얹고, 그 안에 벽돌색 체크를 넣습니다.
 *
 * 손으로 찍은 인주(印朱) 도장처럼 보이도록 세 가지를 더합니다.
 * 1) 파인 테두리 — 흰 선 한 겹 + 그 안쪽 어두운 선 한 겹으로 홈을 팜
 * 2) 2.5° 기울기 — 눌러 찍은 흔적처럼 살짝 비뚤어지게
 * 3) 잉크 번짐 — 단색 대신 한쪽에서 빛이 드는 방사 그라디언트
 *
 * 20px 밑으로는 흰 선이 1px 아래로 내려가지 않게 하고, 그보다도 더
 * 작아지면(예: 인라인 배지) 파인 테두리를 빼고 단색으로 둡니다.
 */
type Tier = {
  refS: number;
  C: number;
  K: number;
  W: number;
  A: number;
  B: number;
  shadow: string;
  flat: boolean;
};

const TIERS: Tier[] = [
  { refS: 52, C: 30, K: 18, W: 3.2, A: 2, B: 3.2, shadow: "3px -3px 12px rgba(28,26,23,.28)", flat: false },
  { refS: 24, C: 14, K: 8.5, W: 3.8, A: 1.2, B: 1.9, shadow: "1px -1px 4px rgba(28,26,23,.2)", flat: false },
  { refS: 22, C: 13, K: 8, W: 4, A: 1.1, B: 1.8, shadow: "1px -1px 4px rgba(28,26,23,.2)", flat: false },
  { refS: 20, C: 12, K: 7.5, W: 4.2, A: 1, B: 1.6, shadow: "1px -1px 4px rgba(28,26,23,.2)", flat: false },
];

function tierFor(size: number): Tier {
  if (size >= 40) return TIERS[0];
  if (size >= 24) return TIERS[1];
  if (size >= 22) return TIERS[2];
  if (size >= 20) return TIERS[3];
  // 20px 밑 — 파인 테두리 없이 단색으로, 가장 가까운 위 단계(20)의 비율을 그대로 줄여 씁니다.
  // refS 를 size 그대로 두어 아래에서 다시 비례 배율을 곱하지 않게 합니다(C·K 는 이미 최종값).
  return { refS: size, C: 0.6 * size, K: 0.375 * size, W: 4.4, A: 0, B: 0, shadow: "1px -1px 4px rgba(28,26,23,.2)", flat: true };
}

export default function VerifiedMark({
  size = 26,
  shadow = false,
}: {
  size?: number;
  shadow?: boolean;
}) {
  const drop = size / Math.SQRT2;
  const tier = tierFor(size);
  const scale = size / tier.refS;
  const circle = tier.C * scale;
  const check = tier.K * scale;

  const dropShadow = shadow ? `drop-shadow(${tier.shadow})` : undefined;

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
          borderRadius: "50% 50% 50% 0",
          background: tier.flat
            ? "#ac4f28"
            : "radial-gradient(circle at 62% 34%, #bd5c31 0%, #ac4f28 65%, #9a4422 100%)",
          boxShadow: tier.flat
            ? undefined
            : `inset 0 0 0 ${tier.A}px rgba(251,250,246,.9), inset 0 0 0 ${tier.B}px #ac4f28`,
          transform: "rotate(-45deg) rotate(2.5deg)",
        }}
      >
        <span
          className="grid place-items-center rounded-full bg-[#fbfaf6]"
          style={{ width: circle, height: circle, transform: "rotate(45deg) rotate(-2.5deg)" }}
        >
          <svg
            width={check}
            height={check}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#a8491f"
            strokeWidth={tier.W}
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
