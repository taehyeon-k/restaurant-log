/**
 * 홈 화면 · 잠금화면 「바로 촬영」 위젯. 누르면 dinary://capture 로 앱이 열려 카메라가 바로 뜹니다.
 * 보여줄 데이터가 없어 App Group 은 쓰지 않습니다.
 */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "CaptureWidget",
  displayName: "DINARY",
  bundleIdentifier: ".widget",
  deploymentTarget: "16.4",
  colors: {
    $accent: "#b4552d",
    $widgetBackground: "#b4552d",
    brick: "#b4552d",
    paper: "#fbfaf6",
  },
};
