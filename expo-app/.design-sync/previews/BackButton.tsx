import { BackButton } from "dinary-expo";

export const Arrow = () => <BackButton onPress={() => {}} />;
export const Close = () => <BackButton onPress={() => {}} label="✕" />;
export const OnCard = () => (
  <div style={{ background: "#f6f3ec", padding: 12, borderRadius: 16, display: "inline-flex" }}>
    <BackButton onPress={() => {}} />
  </div>
);
