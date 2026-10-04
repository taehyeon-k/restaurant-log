import { Placeholder } from "dinary-expo";

const frame = { width: 340, height: 220, position: "relative", display: "flex", border: "1px solid #d8d3c8", borderRadius: 16, overflow: "hidden" } as const;

export const Default = () => (
  <div style={frame}><Placeholder title="보관함" from="web/DraftsScreen.tsx" /></div>
);
export const Long = () => (
  <div style={frame}><Placeholder title="라벨첩 상세" from="web/LabelDetailScreen.tsx" /></div>
);
