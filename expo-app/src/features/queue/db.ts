import { supabase } from "@/lib/supabase";
import { File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { migrateQueue } from "@/lib/reliability/queueMigration";
import { SessionChanged, legacyOwner, operationId } from "@/lib/reliability/queue";

/**
 * 오프라인 큐(핸드오프 §6) — 지하 식당에서도 인증이 끊기지 않게, 촬영 직후 사진과 insert 페이로드를
 * 기기에 먼저 적어 두고 연결되면 비웁니다.
 */
export type QueueRow = {
  id: number;
  owner_id: string;
  op_id: string;
  photo_path: string | null;
  stage: string;
  record_id: number | null;
  attribution: string | null;
  extra_photos: string | null;
  /** 연인 기록장이면 찍은 사람의 한 줄(record_notes) — `{ rating, note }` JSON. 기록이 들어간 뒤 씁니다. */
  couple_note: string | null;
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
    await migrateQueue(d);
    return d;
  }).catch((error) => { dbPromise = null; throw error; });
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

export async function enqueue(
  payload: object, photoUri: string, wishId: string | null, attribution: string | null = null, extraPhotos: string[] = [],
  coupleNote: { rating: number | null; note: string | null } | null = null,
) {
  const d = await db();
  const serialized = JSON.stringify(payload);
  const owner = legacyOwner(serialized);
  if (!owner) throw new Error("queue_owner_missing");
  const res = await d.runAsync(
    "INSERT INTO pending_records (payload, photo_uri, wish_id, created_at, owner_id, op_id, attribution, extra_photos, couple_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    serialized, photoUri, wishId, Date.now(), owner, operationId(), attribution, JSON.stringify(extraPhotos), coupleNote ? JSON.stringify(coupleNote) : null
  );
  return res.lastInsertRowId;
}

export async function listQueue(ownerId: string): Promise<QueueRow[]> {
  const d = await db();
  return d.getAllAsync<QueueRow>("SELECT * FROM pending_records WHERE owner_id = ? ORDER BY created_at ASC", ownerId);
}

export async function removeFromQueue(id: number, ownerId: string) {
  if ((await supabase.auth.getSession()).data.session?.user.id !== ownerId) throw new SessionChanged();
  const d = await db();
  await d.runAsync("DELETE FROM pending_records WHERE id = ? AND owner_id = ?", id, ownerId);
}

export async function resetFailed(id: number, ownerId: string) {
  if ((await supabase.auth.getSession()).data.session?.user.id !== ownerId) throw new SessionChanged();
  const d = await db();
  await d.runAsync("UPDATE pending_records SET failed = 0, attempts = 0, next_at = 0 WHERE id = ? AND owner_id = ?", id, ownerId);
}

export async function saveQueueStage(id: number, ownerId: string, patch: { photo_path?: string | null; stage?: string; record_id?: number | null }) {
  const entries = Object.entries(patch);
  if (!entries.length) return;
  const allowed = new Set(["photo_path", "stage", "record_id"]);
  if (entries.some(([k]) => !allowed.has(k))) throw new Error("invalid_queue_patch");
  const result = await (await db()).runAsync(`UPDATE pending_records SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ? AND owner_id = ?`, ...entries.map(([,v]) => v ?? null), id, ownerId);
  if (result.changes !== 1) throw new SessionChanged("queue_entry_removed");
}
