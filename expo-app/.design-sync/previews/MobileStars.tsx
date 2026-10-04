import { MobileStars } from "dinary-expo";

// 앱에서는 별점이 가로 줄 안에 놓여 내용 폭만큼만 차지합니다 — 카드에서도 같게 inline-flex 로 감쌉니다.
const fit = (node: React.ReactNode) => <div style={{ display: "inline-flex" }}>{node}</div>;

export const Full = () => fit(<MobileStars rating={5} size={20} />);
export const Partial = () => fit(<MobileStars rating={3.5} size={20} />);
export const Low = () => fit(<MobileStars rating={1.5} size={20} />);
export const Unrated = () => fit(<MobileStars rating={null} size={20} />);
export const Small = () => fit(<MobileStars rating={4.2} />);
