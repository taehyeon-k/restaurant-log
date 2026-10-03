/**
 * app.json 에 네이버 지도 키를 얹습니다 — 키는 저장소에 두지 않고 환경변수로 받습니다.
 * NCP 콘솔 > Maps > 인증 정보의 Client ID(NCP_KEY_ID) 를 NAVER_MAP_CLIENT_ID 로 넣으세요.
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ["@mj-studio/react-native-naver-map", { client_id: process.env.NAVER_MAP_CLIENT_ID ?? "" }],
  ],
});
