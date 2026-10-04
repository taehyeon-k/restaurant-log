import { Row, Chip } from "dinary-expo";

const noop = () => {};

export const Chips = () => (
  <Row style={{ gap: 8 }}>
    <Chip label="한식" active onPress={noop} />
    <Chip label="일식" active={false} onPress={noop} />
    <Chip label="양식" active={false} onPress={noop} />
  </Row>
);
export const SpaceBetween = () => (
  <div style={{ width: 300 }}>
    <Row style={{ justifyContent: "space-between" }}>
      <span style={{ fontFamily: "var(--dinary-font-serif)", fontSize: 17 }}>을지로 노포</span>
      <span style={{ fontFamily: "var(--dinary-font-mono)", fontSize: 11, color: "#8a8377" }}>3.9 km</span>
    </Row>
  </div>
);
