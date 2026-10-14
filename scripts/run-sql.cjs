// SQL 파일을 Supabase DB에 순서대로 실행합니다. 파일마다 트랜잭션이라 실패하면 그 파일은 되돌려집니다.
// 접속 주소는 .env.local 의 SUPABASE_DB_URL(대시보드 Connect → Session pooler URI)에서 읽습니다.
//   npm run db:run -- supabase/migrations/20261016000000_copy_couple_record.sql [다음 파일 …]
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const files = process.argv.slice(2);
if (!files.length) {
  console.log("실행할 SQL 파일을 적어 주세요: npm run db:run -- <파일.sql> [...]");
  process.exit(1);
}

const envPath = path.join(__dirname, "..", ".env.local");
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const url = env.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();
if (!url || url.includes("[YOUR-PASSWORD]")) {
  console.log(".env.local 에 SUPABASE_DB_URL(비밀번호 포함)이 없습니다.");
  process.exit(1);
}

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const f of files) {
    const name = path.basename(f);
    try {
      await c.query("begin");
      await c.query(fs.readFileSync(f, "utf8"));
      await c.query("commit");
      console.log("OK  ", name);
    } catch (e) {
      await c.query("rollback");
      console.log("FAIL", name, "—", e.message);
      await c.end();
      process.exit(1);
    }
  }
  await c.end();
})().catch((e) => {
  console.log("연결 실패:", e.message.replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
  process.exit(1);
});
