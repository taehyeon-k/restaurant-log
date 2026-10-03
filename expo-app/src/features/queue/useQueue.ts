import { useEffect, useState } from "react";
import { listQueue, type QueueRow } from "./db";
import { onQueueChange } from "./process";

/** 보관함이 「올리는 중 / 올리지 못함」을 보여줄 때 씁니다. */
export function useQueue() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  useEffect(() => {
    let alive = true;
    const read = () => listQueue().then((r) => alive && setRows(r)).catch(() => {});
    read();
    const off = onQueueChange(read);
    const t = setInterval(read, 5000);
    return () => { alive = false; off(); clearInterval(t); };
  }, []);
  return rows;
}
