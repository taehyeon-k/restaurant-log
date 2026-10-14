/** 받침이 있으면 true — 한글이 아니면 받침 없음으로 봅니다. */
const hasBatchim = (word: string) => {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};

/** 「태현이」 「미나가」 — 이름 뒤 주격 조사. */
export const iGa = (name: string) => `${name}${hasBatchim(name) ? "이" : "가"}`;
