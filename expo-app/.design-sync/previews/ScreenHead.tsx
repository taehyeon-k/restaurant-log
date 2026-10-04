import { ScreenHead, Chip } from "dinary-expo";

const noop = () => {};
const phone = { width: 360, background: "#f6f3ec", borderRadius: 24, overflow: "hidden" } as const;

export const Basic = () => (
  <div style={phone}><ScreenHead eyebrow="LABEL BOOK" title="라벨첩" onBack={noop} /></div>
);
export const WithSub = () => (
  <div style={phone}><ScreenHead eyebrow="DRAFTS" title="보관함" sub="아직 인증하지 못한 기록 3개가 기다리고 있어요." onBack={noop} /></div>
);
export const WithAction = () => (
  <div style={phone}>
    <ScreenHead eyebrow="RECORD" title="을지로 골뱅이집" sub="2026.09.14 · 한식" onBack={noop} right={<Chip label="수정" active={false} onPress={noop} />} />
  </div>
);
