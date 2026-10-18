/// <reference types="node" />
/**
 * 소상공인시장진흥공단 상가(상권)정보 CSV → Supabase public_stores 적재.
 * 앱 밖에서(노트북·codespace) 분기마다 한 번 돌립니다 — README 「상가 데이터 적재」 참고.
 *
 *   node --experimental-strip-types --env-file=.env scripts/import-stores.ts <csv 또는 csv 폴더> [--sido 11] [--dry-run] [--full] [--force]
 *
 * - 음식 업종(상권업종대분류명 = 음식)만, 시도코드(--sido, 기본 11 = 서울)만 넣습니다.
 * - store_id(상가업소번호) 기준 upsert. 이번 파일에 없는 같은 시도 가게는 closed_at 을 찍고 지우지 않습니다.
 * - 유흥 주점·구내식당은 뺍니다(기록할 식당이 아닙니다).
 *
 * 필요한 환경변수: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL(없으면 EXPO_PUBLIC_SUPABASE_URL).
 */
import { createReadStream, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { closureAllowed, requireHeaders } from "../src/lib/reliability/import.ts";

const SKIP_SMALL = new Set(["일반 유흥 주점", "무도 유흥 주점", "구내식당"]);
const BATCH = 1000;

type Row = {
  store_id: string; name: string; branch: string | null; cat_large: string; cat_mid: string | null; cat_small: string | null;
  sido_code: string; bld_mgt_no: string | null; bld_name: string | null; road_addr: string | null;
  floor: string | null; unit: string | null; geom: string; updated_at: string; closed_at: null;
};

/** 층정보 → "B2" | "B1" | "1F" | "2F" … , 모르면 null. 파일에는 "지"·"반지층"·"01"·호수("101", "B124")가 섞여 있습니다. */
export function normFloor(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/층$/, "");
  if (!v) return null;
  if (v === "지" || v === "지하" || v === "반지층" || v === "반지하") return "B1";
  const under = v.match(/^(?:B|지하?|-)(\d+)$/);
  if (under) {
    const n = Number(under[1]);
    const f = n >= 100 ? Math.floor(n / 100) : n; // B124 → B1(호수가 섞인 값)
    return f >= 1 && f <= 9 ? `B${f}` : null;
  }
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    const f = n >= 100 ? Math.floor(n / 100) : n; // 101 → 1F, 1502 → 15F
    return f >= 1 && f <= 130 ? `${f}F` : null;
  }
  return null;
}

/** 따옴표를 아는 CSV 한 줄 분해(이 파일은 줄 안에 줄바꿈이 없습니다). */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function csvFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).filter((f) => f.toLowerCase().endsWith(".csv")).map((f) => join(path, f));
}

async function* rows(file: string, sido: string, runAt: string): AsyncGenerator<Row> {
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  let head: string[] | null = null;
  for await (const raw of lines) {
    const line = head ? raw : raw.replace(/^﻿/, "");
    const cells = splitCsv(line);
    if (!head) { requireHeaders(cells); head = cells; continue; }
    const get = (k: string) => (cells[head!.indexOf(k)] ?? "").trim();
    if (get("시도코드") !== sido || get("상권업종대분류명") !== "음식") continue;
    if (SKIP_SMALL.has(get("상권업종소분류명"))) continue;
    const lng = Number(get("경도")), lat = Number(get("위도"));
    if (!get("상가업소번호") || !get("상호명")) throw new Error(`CSV 식별자 누락: ${file}`);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) continue;
    yield {
      store_id: get("상가업소번호"),
      name: get("상호명"),
      branch: get("지점명") || null,
      cat_large: "음식",
      cat_mid: get("상권업종중분류명") || null,
      cat_small: get("상권업종소분류명") || null,
      sido_code: sido,
      bld_mgt_no: get("건물관리번호") || null,
      bld_name: get("건물명") || null,
      road_addr: get("도로명주소") || null,
      floor: normFloor(get("층정보")),
      unit: get("호정보") || null,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      updated_at: runAt,
      closed_at: null,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) { if (args[i] === "--sido") { i++; continue; } if (!args[i].startsWith("--")) positionals.push(args[i]); }
  const path = positionals[0];
  const sidoAt = args.indexOf("--sido");
  const sido = sidoAt >= 0 ? args[sidoAt + 1] : "11";
  const dry = args.includes("--dry-run");
  const full = args.includes("--full");
  const force = args.includes("--force");
  if (!path) throw new Error("CSV 파일(또는 폴더) 경로를 주세요");

  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL(EXPO_PUBLIC_SUPABASE_URL)·SUPABASE_SERVICE_ROLE_KEY 가 필요합니다");
  const db = createClient(url!, key!, { auth: { persistSession: false } });
  const files = csvFiles(path);
  // Validate every file before the first write, including later files in a directory.
  for (const file of files) {
    const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
    let valid = false;
    for await (const line of lines) { requireHeaders(splitCsv(line.replace(/^﻿/, ""))); valid = true; break; }
    if (!valid) throw new Error(`빈 CSV: ${file}`);
  }
  const before = await db.from("public_stores").select("store_id", { count: "exact", head: true }).eq("sido_code", sido).is("closed_at", null);
  if (before.error) throw before.error;
  const openBefore = before.count ?? 0;

  const runAt = new Date().toISOString();
  let batch: Row[] = [];
  let total = 0;
  const seen = new Set<string>();

  const flush = async () => {
    if (!batch.length) return;
    if (!dry) {
      for (let attempt = 1; ; attempt++) {
        const { error } = await db.from("public_stores").upsert(batch, { onConflict: "store_id" });
        if (!error) break;
        if (attempt >= 4) throw new Error(`upsert 실패: ${error.message}`);
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
    total += batch.length;
    process.stdout.write(`\r${total.toLocaleString()}곳 적재`);
    batch = [];
  };

  for (const file of files) {
    for await (const row of rows(file, sido, runAt)) {
      if (seen.has(row.store_id)) continue; // 파일 안 중복 — 한 upsert 묶음에 같은 키가 둘이면 실패합니다.
      seen.add(row.store_id);
      batch.push(row);
      if (batch.length >= BATCH) await flush();
    }
  }
  await flush();
  process.stdout.write("\n");

  if (!total) throw new Error(`시도코드 ${sido} 의 음식 업종 행이 없습니다 — 파일이 맞는지 보세요`);

  console.log(`기존 영업 ${openBefore}곳, 입력 ${total}곳, 비율 ${openBefore ? (100 * total / openBefore).toFixed(1) : "신규"}%`);
  if (full) {
    if (!closureAllowed(total, openBefore, full, force)) throw new Error("폐업 표시 중단: 기존 영업점의 90% 미만입니다. 전체 파일을 확인하거나 --force 를 명시하세요. 적재한 행은 유지됩니다.");
    if (dry) {
      let wouldClose = 0;
      for (let offset = 0; ; ) {
        const page = await db.from("public_stores").select("store_id").eq("sido_code", sido).is("closed_at", null).order("store_id").range(offset, offset + 999);
        if (page.error) throw page.error;
        const items = page.data ?? [];
        wouldClose += items.filter((row) => !seen.has(row.store_id)).length;
        if (!items.length) break;
        offset += items.length;
      }
      console.log(`(dry-run) 폐업 표시 예정 ${wouldClose}곳 — 쓰기 없음`);
    } else {
      const { count, error } = await db.from("public_stores").update({ closed_at: runAt }, { count: "exact" }).eq("sido_code", sido).lt("updated_at", runAt).is("closed_at", null);
      if (error) throw new Error(`closed_at 표시 실패: ${error.message}`);
      console.log(`폐업 표시 ${count ?? 0}곳`);
    }
  } else console.log("부분 적재: 폐업 표시 생략 (--full 필요)");
  console.log(`${dry ? "(dry-run) " : ""}시도 ${sido}: ${total.toLocaleString()}곳`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
