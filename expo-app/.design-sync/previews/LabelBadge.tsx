import { LabelBadge } from "dinary-expo";

const label = (id: string, name: string, color: string, have: number, need: number) => ({
  id, name, color, have, need, earned: have >= need, shape: "seal", desc: "", count: () => have,
}) as any;

export const Earned = () => <LabelBadge label={label("verified", "인증 도장", "#b4552d", 10, 10)} />;
export const InProgress = () => <LabelBadge label={label("gold", "황금 입맛", "#b58a2b", 6, 10)} />;
export const JustStarted = () => <LabelBadge label={label("regular", "단골", "#6f8455", 1, 10)} />;
export const Selected = () => <LabelBadge label={label("first", "첫 기록", "#5f7a8a", 1, 1)} selected />;
