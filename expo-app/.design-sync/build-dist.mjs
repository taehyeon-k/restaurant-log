// react-native 컴포넌트를 브라우저용 ESM dist + .d.ts 로 만듭니다 — design-sync 변환기가 읽는 "빌드된 패키지" 역할.
// 실행: node .design-sync/build-dist.mjs   (expo-app 루트에서)
import { build } from "../.ds-sync/node_modules/esbuild/lib/main.js";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dsNm = path.join(root, ".ds-sync/node_modules");
const out = path.join(root, "ds-dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 브라우저에서 동작할 수 없는 모듈(라우터·Supabase·지도·위치·카메라…)은 대용품으로 바꿉니다.
//  - 파일 대용품: design-sync-entry/stubs/* (React 컴포넌트가 필요한 것)
//  - 소스 대용품: .design-sync/native-stubs.mjs (빈 성공을 돌려주는 모듈)
const stubDir = path.join(root, "design-sync-entry/stubs");
const fileStubs = {
  "expo-router": path.join(stubDir, "expo-router.tsx"),
  "@/lib/supabase": path.join(stubDir, "supabase.ts"),
  "@mj-studio/react-native-naver-map": path.join(stubDir, "naver-map.tsx"),
  "@gorhom/bottom-sheet": path.join(stubDir, "gorhom-bottom-sheet.tsx"),
};
const { stubs } = await import("./native-stubs.mjs");
const stubPlugin = {
  name: "native-stubs",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      if (a.namespace === "stub") return;
      if (fileStubs[a.path]) return { path: fileStubs[a.path] };
      if (stubs[a.path]) return { path: a.path, namespace: "stub" };
    });
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js", resolveDir: root }));
  },
};

// 웹 호환용 번들 시점 패치(앱 소스는 그대로) — react-native-web 은 numberOfLines={1} 글자에 max-width:100% 를 걸어서,
// MobileStars 가 부모 폭에 맞춰 잘리는 대신 "…" 로 줄어듭니다. 네이티브에서처럼 200px 폭을 지키게 줄바꿈만 막습니다.
const webPatchPlugin = {
  name: "web-patches",
  setup(b) {
    b.onLoad({ filter: /src\/components\/ui\.tsx$/ }, (a) => {
      const src = readFileSync(a.path, "utf8");
      const patched = src.replace(
        'numberOfLines={1} style={[row, { color: C.brick, width: 200 }]}',
        'style={[row, { color: C.brick, width: 200, whiteSpace: "nowrap" } as any]}',
      );
      if (patched === src) console.warn("[web-patches] MobileStars pattern not found — ui.tsx changed; update build-dist.mjs");
      return { contents: patched, loader: "tsx", resolveDir: path.dirname(a.path) };
    });
  },
};

await build({
  entryPoints: [path.join(root, "design-sync-entry/index.ts")],
  outfile: path.join(out, "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime"],
  resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".mjs"],
  alias: { "react-native": path.join(dsNm, "react-native-web") },
  nodePaths: [dsNm, path.join(root, "node_modules")],
  tsconfig: path.join(root, "tsconfig.json"),
  // 앱이 읽는 EXPO_PUBLIC_* 값은 브라우저에 없으니 비워 둡니다(키·주소가 번들에 들어가지 않게).
  define: {
    __DEV__: "false",
    "process.env.NODE_ENV": '"production"',
    "process.env.EXPO_OS": '"web"',
    "process.env.EXPO_PUBLIC_API_BASE_URL": '"https://preview.invalid"',
    "process.env.EXPO_PUBLIC_NAVER_MAP_STYLE_ID": "undefined",
    "process.env.EXPO_PUBLIC_SUPABASE_URL": '""',
    "process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY": '""',
  },
  loader: { ".png": "dataurl", ".jpg": "dataurl", ".ttf": "dataurl" },
  plugins: [stubPlugin, webPatchPlugin],
  logLevel: "warning",
});

// 타입: 컴포넌트 props 가 .d.ts 로 읽히도록 선언 파일을 냅니다.
writeFileSync(
  path.join(root, ".design-sync/tsconfig.dist.json"),
  JSON.stringify({
    extends: "../tsconfig.json",
    compilerOptions: { declaration: true, emitDeclarationOnly: true, noEmit: false, skipLibCheck: true, outDir: "../ds-dist/types", rootDir: ".." },
    include: ["../design-sync-entry/index.ts", "../expo-env.d.ts"],
  }, null, 2),
);
execFileSync(path.join(root, "node_modules/.bin/tsc"), ["-p", ".design-sync/tsconfig.dist.json"], { cwd: root, stdio: "inherit" });
// 변환기가 `export *` 를 따라가지 못해서, 번들이 실제로 내보내는 이름을 하나씩 나열합니다.
const bundle = readFileSync(path.join(out, "index.js"), "utf8");
const names = [...bundle.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(",")).map((n) => n.trim().split(/\s+as\s+/).pop()).filter(Boolean);
writeFileSync(path.join(out, "index.d.ts"), `export { ${names.join(", ")} } from "./types/design-sync-entry/index";\n`);
// 변환기는 cssEntry·글꼴 경로를 패키지 기준으로 읽으므로, 스타일시트와 글꼴 파일(저장소엔 커밋하지 않음)을 dist 안에 둡니다.
mkdirSync(path.join(out, "fonts"), { recursive: true });
copyFileSync(path.join(root, ".design-sync/styles.css"), path.join(out, "styles.css"));
const gf = path.join(root, "node_modules/@expo-google-fonts");
for (const [pkg, dir, file] of [
  ["gowun-batang", "700Bold", "GowunBatang_700Bold"],
  ["noto-sans-kr", "400Regular", "NotoSansKR_400Regular"],
  ["noto-sans-kr", "500Medium", "NotoSansKR_500Medium"],
  ["noto-sans-kr", "700Bold", "NotoSansKR_700Bold"],
  ["jetbrains-mono", "400Regular", "JetBrainsMono_400Regular"],
]) copyFileSync(path.join(gf, pkg, dir, `${file}.ttf`), path.join(out, "fonts", `${file}.ttf`));

// 변환기는 node_modules/<pkg> 를 패키지로 읽으니, dist 를 그 이름의 패키지로 꾸며 .ds-sync/node_modules 에 이어 둡니다.
writeFileSync(path.join(out, "package.json"), JSON.stringify({ name: "dinary-expo", version: "0.1.0", type: "module", main: "index.js", module: "index.js", types: "index.d.ts" }, null, 2));
const link = path.join(dsNm, "dinary-expo");
rmSync(link, { recursive: true, force: true });
symlinkSync(out, link, "dir");
console.log("dist ready:", out);
