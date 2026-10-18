/** 받침이 있으면 true — 한글이 아니면 받침 없음으로 봅니다. */
const hasBatchim = (word: string) => {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};

/** 「태현이」 「미나가」 — 이름 뒤 주격 조사. */
export const iGa = (name: string) => `${name}${hasBatchim(name) ? "이" : "가"}`;
/** 「태현과」 「미나와」 — 이름 뒤 접속 조사. */
export const waGwa = (name: string) => `${name}${hasBatchim(name) ? "과" : "와"}`;
/** 「중식을」 「스시를」 — 목적격 조사. */
export const eulReul = (word: string) => `${word}${hasBatchim(word) ? "을" : "를"}`;
/** 「한식으로」 「일식으로」 「국밥·탕으로」 「면으로」 「고기로」 — ㄹ 받침은 「로」. */
export const euroRo = (word: string) => {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  const jong = code >= 0 && code <= 11171 ? code % 28 : 0;
  return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`;
};
/** 「열 곳이나」 「열 개나」 — 많다는 뜻의 보조사. */
export const iNa = (word: string) => `${word}${hasBatchim(word) ? "이나" : "나"}`;
