import NetInfo from "@react-native-community/netinfo";
import type { QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import { refreshAll } from "@/data/invalidate";
import { uploadPhoto } from "@/lib/photos";
import { supabase } from "@/lib/supabase";
import { db, listQueue, removeFromQueue, removePhoto, type QueueRow } from "./db";

const MAX_ATTEMPTS = 3;
/** 지수 백오프: 5s, 20s, 80s… */
const backoff = (attempts: number) => 5000 * 4 ** Math.max(0, attempts - 1);

let running: Promise<void> | null = null;
const listeners = new Set<() => void>();
export const onQueueChange = (f: () => void) => {
  listeners.add(f);
  return () => { listeners.delete(f); };
};
export const notifyQueue = () => listeners.forEach((f) => f());

/** 한 건을 올립니다: 사진 업로드 → restaurants insert → 짝 위시 delete → 로컬 파일 삭제. 새 기록 id 를 돌려줍니다. */
async function processOne(row: QueueRow): Promise<number> {
  const payload = JSON.parse(row.payload) as Record<string, unknown>;
  const url = await uploadPhoto(row.photo_uri, "verified.jpg");
  const { data, error } = await supabase
    .from("restaurants")
    .insert({ ...payload, photo_url: url, photo_urls: [url], cover_index: 0 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (row.wish_id) await supabase.from("wishes").delete().eq("id", row.wish_id);
  removePhoto(row.photo_uri);
  await removeFromQueue(row.id);
  return data.id as number;
}

async function markFailure(row: QueueRow) {
  const d = await db();
  const attempts = row.attempts + 1;
  await d.runAsync(
    "UPDATE pending_records SET attempts = ?, failed = ?, next_at = ? WHERE id = ?",
    attempts, attempts >= MAX_ATTEMPTS ? 1 : 0, Date.now() + backoff(attempts), row.id
  );
}

/**
 * 큐를 비웁니다. 앱 복귀·연결 복구·촬영 직후에 부릅니다. 이미 도는 중이면 그 결과를 그대로 기다립니다.
 * `only` 를 주면 그 한 건만 올리고 새 기록 id 를 돌려줍니다(촬영 직후 「이어서 기록 쓰기」용).
 */
export function drainQueue(qc: QueryClient, only?: number): Promise<number | null> {
  // 동시에 두 번 돌면 같은 행이 두 번 올라갑니다 — 앞 작업이 끝난 뒤에 시작하도록 직렬화합니다.
  const job = (running ?? Promise.resolve()).then(async () => {
    let doneId: number | null = null;
    const net = await NetInfo.fetch();
    if (!net.isConnected) return null;

    for (const row of await listQueue()) {
      if (only != null && row.id !== only) continue;
      if (row.failed && only == null) continue;
      if (row.next_at > Date.now() && only == null) continue;
      try {
        const id = await processOne(row);
        if (only === row.id) doneId = id;
      } catch (e) {
        console.warn("큐 전송 실패", e);
        await markFailure(row);
      }
      notifyQueue();
    }
    await refreshAll(qc);
    return doneId;
  });
  running = job.then(() => undefined, () => undefined);
  return job;
}

/** 앱 복귀·네트워크 연결 이벤트에서 큐 처리를 트리거합니다. */
export function startQueueTriggers(qc: QueryClient) {
  const run = () => void drainQueue(qc);
  run();
  const app = AppState.addEventListener("change", (s) => s === "active" && run());
  const net = NetInfo.addEventListener((s) => s.isConnected && run());
  // 백오프 시간이 지난 건을 다시 시도합니다.
  const timer = setInterval(run, 30000);
  return () => { app.remove(); net(); clearInterval(timer); };
}
