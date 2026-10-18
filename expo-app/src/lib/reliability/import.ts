export const MIN_IMPORT_COVERAGE = 0.9;
export function closureAllowed(total: number, open: number, full: boolean, force: boolean) {
  return full && total > 0 && (force || open === 0 || total / open >= MIN_IMPORT_COVERAGE);
}
export function requireHeaders(headers: string[]) {
  const required = ["상가업소번호", "상호명", "시도코드", "상권업종대분류명", "상권업종소분류명", "경도", "위도"];
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length) throw new Error(`CSV 필수 헤더 누락: ${missing.join(", ")}`);
}
