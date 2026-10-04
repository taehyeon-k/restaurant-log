/** NAVER credentials belong in local/EAS environment variables, never in app.json. */
module.exports = ({ config }) => {
  const clientId = process.env.NAVER_MAP_CLIENT_ID?.trim();
  // 로컬의 `eas build` 는 업로드용으로 설정만 읽고(민감 변수는 여기서 비어 있을 수 있음),
  // 키가 실제로 박히는 건 EAS 서버나 로컬 prebuild 입니다. 그때만 막고 그 외엔 경고만 합니다.
  const bakesKey = !!process.env.EAS_BUILD || process.argv.some((a) => a === "prebuild" || a === "run:android" || a === "run:ios");
  if (!clientId && !bakesKey) {
    console.warn("[app.config] NAVER_MAP_CLIENT_ID is not set locally — fine for `eas build` (the EAS server supplies it), but a local native build would have a blank map.");
  } else if (!clientId) {
    throw new Error(
      "NAVER_MAP_CLIENT_ID is required to build DINARY with NAVER Map. " +
      "Set the NAVER Cloud Platform Maps Client ID in your local environment " +
      "or the EAS environment selected by the build profile (development, preview, production). " +
      "Use EAS sensitive or plaintext visibility so EAS CLI can resolve app.config.js; " +
      "secret visibility is unavailable during local config resolution. " +
      "Then rebuild and reinstall the native app; an OTA update cannot change this credential."
    );
  }

  const pluginName = "@mj-studio/react-native-naver-map";
  return {
    ...config,
    plugins: [
      // Keep a single authoritative registration, even if static config adds one later.
      ...(config.plugins ?? []).filter(
        (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) !== pluginName
      ),
      [pluginName, { client_id: clientId }],
    ],
  };
};
