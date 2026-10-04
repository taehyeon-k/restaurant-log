import { DistrictBadge } from "dinary-expo";

const gold = { need: 50, tier: "금", suffix: "맛잘알", stars: 3, color: "#b58a2b", ink: "#fbf4e2" } as const;
const silver = { need: 30, tier: "은", suffix: "보안관", stars: 2, color: "#8e949b", ink: "#f7f8f9" } as const;
const bronze = { need: 10, tier: "동", suffix: "러버", stars: 1, color: "#8c6239", ink: "#f6ece2" } as const;

export const Gold = () => <DistrictBadge title={{ region: "마포구", have: 54, tier: gold, next: null }} />;
export const Silver = () => <DistrictBadge title={{ region: "종로구", have: 32, tier: silver, next: gold }} />;
export const Bronze = () => <DistrictBadge title={{ region: "중구", have: 12, tier: bronze, next: silver }} />;
export const Locked = () => <DistrictBadge title={{ region: "강남구", have: 4, tier: null, next: bronze }} />;
