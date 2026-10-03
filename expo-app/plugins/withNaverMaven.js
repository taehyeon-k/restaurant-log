const { withProjectBuildGradle } = require("expo/config-plugins");

/**
 * 네이버 지도 SDK(com.naver.maps:map-sdk)는 Maven Central 이 아니라 네이버 저장소에만 있습니다.
 * 모든 모듈이 받아 갈 수 있게 루트 build.gradle 의 allprojects.repositories 에 넣습니다.
 */
const REPO = "https://repository.map.naver.com/archive/maven";

module.exports = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(REPO)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /allprojects\s*\{\s*repositories\s*\{/,
        (m) => `${m}\n    maven { url '${REPO}' }`
      );
    }
    return cfg;
  });
