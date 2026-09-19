/**
 * 오프라인 큐(§6) — 지하 식당에서도 인증이 끊기지 않아야 합니다.
 *
 * 1. 촬영 직후 사진을 FileSystem.documentDirectory 에 복사합니다.
 * 2. SQLite `pending_records` 에 insert 페이로드 + 로컬 사진 경로를 씁니다.
 * 3. 화면은 즉시 「인증 완료」로 넘어갑니다 — 네트워크를 기다리지 않습니다.
 * 4. 연결되면 큐를 비웁니다: 사진 업로드 → restaurants insert → 짝 위시 delete
 *    → 로컬 파일 삭제.
 * 5. 실패는 지수 백오프로 재시도. 3회 실패하면 보관함에 「올리지 못함」으로 남습니다.
 */
import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";
import { uploadPhotoFromUri } from "@/lib/photos";

const DB_NAME = "dinary.db";
const PHOTO_DIR = `${FileSystem.documentDirectory}pending-photos/`;
const MAX_ATTEMPTS = 3;
/** 지수 백오프 — 1차 8초, 2차 32초, 3차 128초 뒤에 다시 시도합니다. */
const BACKOFF_MS = (attempts: number) => 8000 * 4 ** attempts;

export type QueueStatus = "queued" | "uploading" | "failed";

export type QueuedRecord = {
  id: number;
  /** restaurants insert 에 그대로 들어갈 값 — photo_url 만 업로드 뒤에 채웁니다. */
  payload: Record<string, unknown>;
  photoPath: string;
  /** 짝지어진 위시 id — 올라가면 지웁니다(WISH MET). */
  wishId: string | null;
  name: string;
  status: QueueStatus;
  attempts: number;
  createdAt: string;
};

type Row = {
  id: number;
  payload: string;
  photo_path: string;
  wish_id: string | null;
  name: string;
  status: QueueStatus;
  attempts: number;
  next_try_at: number;
  created_at: string;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function db() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (handle) => {
      await handle.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS pending_records (
          id INTEGER PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          photo_path TEXT NOT NULL,
          wish_id TEXT,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          attempts INTEGER NOT NULL DEFAULT 0,
          next_try_at INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
      `);
      await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => {});
      return handle;
    });
  }
  return dbPromise;
}

const toQueued = (r: Row): QueuedRecord => ({
  id: r.id,
  payload: JSON.parse(r.payload) as Record<string, unknown>,
  photoPath: r.photo_path,
  wishId: r.wish_id,
  name: r.name,
  status: r.status,
  attempts: r.attempts,
  createdAt: r.created_at,
});

/**
 * 사진을 앱 전용 폴더로 옮기고 큐에 넣습니다. 카메라가 준 uri 는 캐시라
 * 언제든 지워질 수 있어, 그대로 두면 나중에 올릴 파일이 사라집니다.
 */
export async function enqueueRecord(args: {
  payload: Record<string, unknown>;
  photoUri: string;
  wishId: string | null;
  name: string;
}) {
  const handle = await db();
  const photoPath = `${PHOTO_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.copyAsync({ from: args.photoUri, to: photoPath });

  const result = await handle.runAsync(
    `INSERT INTO pending_records (payload, photo_path, wish_id, name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    JSON.stringify(args.payload),
    photoPath,
    args.wishId,
    args.name,
    new Date().toISOString()
  );

  // 연결돼 있으면 곧바로 한 번 밀어봅니다 — 화면은 이미 다음으로 넘어갔습니다.
  void flushQueue();

  return result.lastInsertRowId;
}

/** 보관함이 「올리는 중 / 올리지 못함」을 보여줄 때 씁니다. */
export async function listQueue(): Promise<QueuedRecord[]> {
  const handle = await db();
  const rows = await handle.getAllAsync<Row>(
    `SELECT * FROM pending_records ORDER BY id DESC`
  );
  return rows.map(toQueued);
}

/** 사용자가 버린 미전송 기록 — 로컬 사진까지 함께 지웁니다. */
export async function discardQueued(id: number) {
  const handle = await db();
  const row = await handle.getFirstAsync<Row>(
    `SELECT * FROM pending_records WHERE id = ?`,
    id
  );
  if (row) await FileSystem.deleteAsync(row.photo_path, { idempotent: true }).catch(() => {});
  await handle.runAsync(`DELETE FROM pending_records WHERE id = ?`, id);
}

/** 「올리지 못함」으로 멈춘 것을 손으로 다시 밀어봅니다. */
export async function retryQueued(id: number) {
  const handle = await db();
  await handle.runAsync(
    `UPDATE pending_records SET status = 'queued', attempts = 0, next_try_at = 0 WHERE id = ?`,
    id
  );
  return flushQueue();
}

let flushing = false;

/**
 * 큐를 비웁니다. 한 번에 하나씩, 실패하면 백오프를 걸고 다음으로 넘어갑니다.
 * 올라간 기록 수를 돌려주므로 호출한 쪽이 목록을 다시 읽을지 정할 수 있습니다.
 */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;

  const net = await NetInfo.fetch();
  if (net.isConnected === false) return 0;

  flushing = true;
  let uploaded = 0;

  try {
    const handle = await db();
    const now = Date.now();
    const rows = await handle.getAllAsync<Row>(
      `SELECT * FROM pending_records
       WHERE status != 'failed' AND next_try_at <= ?
       ORDER BY id ASC`,
      now
    );

    for (const row of rows) {
      await handle.runAsync(`UPDATE pending_records SET status = 'uploading' WHERE id = ?`, row.id);

      try {
        const url = await uploadPhotoFromUri(row.photo_path, "verified.jpg");
        const payload = JSON.parse(row.payload) as Record<string, unknown>;

        const { error } = await supabase.from("restaurants").insert({
          ...payload,
          photo_url: url,
          photo_urls: [url],
          cover_index: 0,
        });
        if (error) throw new Error(error.message);

        if (row.wish_id) await supabase.from("wishes").delete().eq("id", row.wish_id);

        await FileSystem.deleteAsync(row.photo_path, { idempotent: true }).catch(() => {});
        await handle.runAsync(`DELETE FROM pending_records WHERE id = ?`, row.id);
        uploaded += 1;
      } catch (err) {
        const attempts = row.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        console.error("미전송 기록 업로드 실패:", err);
        await handle.runAsync(
          `UPDATE pending_records
           SET status = ?, attempts = ?, next_try_at = ?
           WHERE id = ?`,
          failed ? "failed" : "queued",
          attempts,
          failed ? 0 : Date.now() + BACKOFF_MS(attempts),
          row.id
        );
      }
    }
  } finally {
    flushing = false;
  }

  return uploaded;
}

/**
 * 연결이 돌아오거나 앱이 앞으로 나올 때 큐를 밉니다(§6).
 * 올라간 게 있으면 `onUploaded` 로 알려 목록을 다시 읽게 합니다.
 */
export function startQueueWatcher(onUploaded: () => void) {
  const run = () => {
    void flushQueue().then((n) => {
      if (n > 0) onUploaded();
    });
  };

  run();

  const netSub = NetInfo.addEventListener((state) => {
    if (state.isConnected) run();
  });
  const appSub = AppState.addEventListener("change", (s) => {
    if (s === "active") run();
  });

  return () => {
    netSub();
    appSub.remove();
  };
}
