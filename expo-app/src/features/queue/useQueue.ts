import { useSession } from "@/data/session";
import { useEffect, useState } from "react";
import { listQueue, type QueueRow } from "./db";
import { onQueueChange } from "./process";

/** 보관함이 「올리는 중 / 올리지 못함」을 보여줄 때 씁니다. */
export function useQueue() {
  const ownerId = useSession()?.user.id;
  const [rows, setRows] = useState<QueueRow[]>([]);
  useEffect(() => {
    let alive = true;
    const read = () => (ownerId ? listQueue(ownerId) : Promise.resolve([])).then((r) => alive && setRows(r)).catch(() => {});
    read();
    const off = onQueueChange(read);
    const t = setInterval(read, 5000);
    return () => { alive = false; off(); clearInterval(t); };
  }, [ownerId]);
  return rows.filter((r) => r.owner_id === ownerId);
}
