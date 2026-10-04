import { Chip } from "dinary-expo";

const noop = () => {};
// 앱에서는 칩이 가로 줄 안에서 내용 폭만큼만 차지합니다 — 카드에서도 inline-flex 로 감쌉니다.
const fit = (node: React.ReactNode) => <div style={{ display: "inline-flex" }}>{node}</div>;
const row = { display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 360 } as const;

export const Active = () => fit(<Chip label="한식" active onPress={noop} />);
export const Inactive = () => fit(<Chip label="일식" active={false} onPress={noop} />);
export const FilterRow = () => (
  <div style={row}>
    <Chip label="전체" active onPress={noop} />
    <Chip label="한식" active={false} onPress={noop} />
    <Chip label="중식" active={false} onPress={noop} />
    <Chip label="일식" active={false} onPress={noop} />
    <Chip label="카페·디저트" active={false} onPress={noop} />
  </div>
);
