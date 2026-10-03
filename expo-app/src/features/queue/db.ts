import { File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";

/**
 * 오프라인 큐(핸드오프 §6) — 지하 식당에서도 인증이 끊기지 않게, 촬영 직후 사진과 insert 페이로드를
 * 기기에 먼저 적어 두고 연결되면 비웁니다.
 */
export type QueueRow = {
  id: number;
  /** restaurants.insert 에 그대로 들어갈 필드(photo_url 은 업로드 뒤에 채웁니다). user_id 포함. */
  payload: string;
  /** documentDirectory 에 복사해 둔 사진 */
  photo_uri: string;
  /** 인증과 짝지어진 위시 id — 기록이 들어간 뒤 지웁니다. */
  wish_id: string | null;
  attempts: number;
  /** 3회 실패하면 1 — 보관함에 「올리지 못함」으로 보입니다. */
  failed: number;
  next_at: number;
  created_at: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function db() {
  dbPromise ??= SQLite.openDatabaseAsync("dinary.db").then(async (d) => {
    await d.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        photo_uri TEXT NOT NULL,
        wish_id TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        next_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);
    return d;
  });
  return dbPromise;
}

/** 사진을 지워지지 않는 문서 폴더로 옮겨 둡니다(캐시는 시스템이 비울 수 있습니다). */
export function persistPhoto(uri: string): string {
  const dest = new File(Paths.document, `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`);
  new File(uri).copy(dest);
  return dest.uri;
}

export function removePhoto(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* 이미 없으면 그만 */
  }
}

export async function enqueue(payload: object, photoUri: string, wishId: string | null) {
  const d = await db();
  const res = await d.runAsync(
    "INSERT INTO pending_records (payload, photo_uri, wish_id, created_at) VALUES (?, ?, ?, ?)",
    JSON.stringify(payload), photoUri, wishId, Date.now()
  );
  return res.lastInsertRowId;
}

export async function listQueue(): Promise<QueueRow[]> {
  const d = await db();
  return d.getAllAsync<QueueRow>("SELECT * FROM pending_records ORDER BY created_at ASC");
}

export async function removeFromQueue(id: number) {
  const d = await db();
  await d.runAsync("DELETE FROM pending_records WHERE id = ?", id);
}

export async function resetFailed(id: number) {
  const d = await db();
  await d.runAsync("UPDATE pending_records SET failed = 0, attempts = 0, next_at = 0 WHERE id = ?", id);
}
