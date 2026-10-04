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

// 브라우저에서 동작할 수 없는 네이티브 모듈은 빈 껍데기로 바꿉니다.
const stubs = {
  "expo-router": "export const useRouter = () => ({ push() {}, back() {}, replace() {} }); export const Link = ({ children }) => children;",
  "expo-haptics": "export const impactAsync = async () => {}; export const selectionAsync = async () => {}; export const ImpactFeedbackStyle = { Light: 'light' };",
};
const stubPlugin = {
  name: "native-stubs",
  setup(b) {
    b.onResolve({ filter: /^(expo-router|expo-haptics)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
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
  define: { __DEV__: "false", "process.env.NODE_ENV": '"production"' },
  loader: { ".png": "dataurl", ".jpg": "dataurl", ".ttf": "dataurl" },
  plugins: [stubPlugin],
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
