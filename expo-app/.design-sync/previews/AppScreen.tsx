import { AppScreen, ScreenHead, Chip, Eyebrow, Button } from "dinary-expo";

const noop = () => {};

export const Framed = () => (
  <AppScreen>
    <ScreenHead eyebrow="DRAFTS" title="보관함" sub="아직 인증하지 못한 기록 3개가 기다리고 있어요." onBack={noop} />
    <div style={{ display: "flex", gap: 8, padding: "8px 22px" }}>
      <Chip label="전체" active onPress={noop} />
      <Chip label="한식" active={false} onPress={noop} />
    </div>
    <div style={{ marginTop: "auto", padding: 22 }}>
      <Eyebrow>SAMPLE DATA</Eyebrow>
      <div style={{ height: 8 }} />
      <Button label="기록 시작하기" kind="brick" onPress={noop} />
    </div>
  </AppScreen>
);
