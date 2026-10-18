/**
 * 「바로 촬영」(누르면 dinary://capture) + 「이번 달 인증」 3종(누르면 dinary://calendar).
 * 이번 달 인증 수 · 마지막 기록은 앱이 App Group(group.app.dinary) UserDefaults 에 써 두고 위젯이 읽습니다(src/lib/widget.ts).
 */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "CaptureWidget",
  displayName: "DINARY",
  bundleIdentifier: ".widget",
  deploymentTarget: "16.4",
  entitlements: {
    "com.apple.security.application-groups": ["group.app.dinary"],
  },
  colors: {
    $accent: "#b4552d",
    $widgetBackground: "#b4552d",
    brick: "#b4552d",
    paper: "#fbfaf6",
  },
};
