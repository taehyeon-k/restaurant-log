import { Button } from "dinary-expo";

const noop = () => {};
const wrap = { width: 320 } as const;

export const Dark = () => <div style={wrap}><Button label="기록 시작하기" onPress={noop} /></div>;
export const Brick = () => <div style={wrap}><Button label="방문 인증하기" kind="brick" onPress={noop} /></div>;
export const Line = () => <div style={wrap}><Button label="나중에 하기" kind="line" onPress={noop} /></div>;
export const Disabled = () => <div style={wrap}><Button label="저장하는 중…" kind="brick" disabled onPress={noop} /></div>;
