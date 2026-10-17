const fs = require("fs");
const path = require("path");
const { withFinalizedMod } = require("expo/config-plugins");

/**
 * 공유 시트에 보이는 확장 이름을 「DINARY」로 둡니다.
 * expo-share-intent 는 iosShareExtensionName 으로 표시 이름과 Xcode 타깃 이름을 함께 정하는데,
 * 「DINARY」로 주면 타깃 이름이 앱 본체(DINARY)와 같아져 EAS 가 본체에 확장의 프로비저닝 프로파일을 붙입니다.
 * 그래서 타깃은 기본값(ShareExtension)으로 두고, 다 만들어진 Info.plist 의 표시 이름만 바꿉니다.
 */
module.exports = (config, { name = "DINARY" } = {}) =>
  withFinalizedMod(config, [
    "ios",
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, "ShareExtension", "ShareExtension-Info.plist");
      if (fs.existsSync(file)) {
        const xml = fs.readFileSync(file, "utf8");
        fs.writeFileSync(
          file,
          xml.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${name}$2`)
        );
      }
      return cfg;
    },
  ]);
