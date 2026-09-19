/** 자유 글에서 첫 URL만 뽑아냅니다 — 「출처 보기」 단추가 이걸 씁니다. */
export const firstUrl = (text: string | null) => text?.match(/https?:\/\/[^\s]+/)?.[0] ?? null;

/** 카드·시트에 보여줄 때는 URL 을 지운 본문만 보여줍니다. 편집칸 자체는 그대로 둡니다. */
export const noteWithoutUrl = (text: string | null, url: string | null) => {
  if (!text) return "";
  return (url ? text.replace(url, "") : text).replace(/\n{3,}/g, "\n\n").trim();
};
