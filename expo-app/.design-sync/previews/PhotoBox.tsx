import { PhotoBox } from "dinary-expo";

export const Korean = () => <PhotoBox category="한식" size={96} />;
export const Japanese = () => <PhotoBox category="일식" size={96} />;
export const Dessert = () => <PhotoBox category="디저트" size={96} />;
export const Uncategorized = () => <PhotoBox size={96} />;
export const Round = () => <PhotoBox category="커피" size={72} radius={36} />;
export const WithLabel = () => (
  <PhotoBox category="베이커리" size={120}>
    <span style={{ fontFamily: "var(--dinary-font-serif)", fontSize: 14, color: "#a8853f" }}>소금빵</span>
  </PhotoBox>
);
