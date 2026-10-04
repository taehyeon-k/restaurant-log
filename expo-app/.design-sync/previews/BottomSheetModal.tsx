import { BottomSheetModal, Button, Chip, Eyebrow } from "dinary-expo";

const noop = () => {};

export const Filter = () => (
  <BottomSheetModal visible onClose={noop}>
    <Eyebrow wide>FILTER</Eyebrow>
    <div style={{ fontFamily: "var(--dinary-font-serif)", fontSize: 22, margin: "8px 0 16px" }}>어떤 곳을 볼까요?</div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
      <Chip label="전체" active onPress={noop} />
      <Chip label="한식" active={false} onPress={noop} />
      <Chip label="일식" active={false} onPress={noop} />
      <Chip label="카페" active={false} onPress={noop} />
    </div>
    <Button label="적용하기" kind="brick" onPress={noop} />
  </BottomSheetModal>
);
