/**
 * 글꼴 파일을 직접 require 하기 위한 선언.
 * `@expo-google-fonts/*` 의 index 를 통째로 가져오면 쓰지도 않는 웨이트가
 * 전부 번들에 들어갑니다 — 한글 웨이트는 하나에 5MB 안팎이라 앱 크기가 크게
 * 불어납니다. 그래서 필요한 ttf 만 경로로 집어 옵니다.
 */
declare module "*.ttf" {
  const asset: number;
  export default asset;
}
