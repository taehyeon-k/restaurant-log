/** Pure resumable queue state machine. Native persistence and network I/O are injected. */
export const operationId = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const n = Math.floor(Math.random() * 16);
  return (c === "x" ? n : (n & 3) | 8).toString(16);
});
export type Job = {
  id: number; owner_id: string; op_id: string; photo_path: string | null;
  stage: string; record_id: number | null; payload: string;
};
export class SessionChanged extends Error {}
export async function resumeJob(job: Job, io: {
  owner: () => Promise<string | null>;
  save: (patch: Partial<Job>) => Promise<void>;
  upload: (path: string) => Promise<void>;
  findRecord: (operation: string) => Promise<number | null>;
  insert: (operation: string, path: string) => Promise<number>;
  reconcileWish: () => Promise<void>;
  attribute: (recordId: number) => Promise<boolean>;
  cleanup: () => Promise<void>;
}): Promise<number | null> {
  const check = async () => { if (await io.owner() !== job.owner_id) throw new SessionChanged(); };
  const save = async (patch: Partial<Job>) => { await io.save(patch); Object.assign(job, patch); };
  await check();
  if (!job.record_id) {
    // Resolve ambiguous commits before uploading anything again.
    const existing = await io.findRecord(job.op_id);
    if (existing != null) await save({ record_id: existing, stage: "inserted" });
  }
  if (!job.record_id) {
    if (!job.photo_path) await save({ photo_path: `${job.op_id}.jpg` });
    if (job.stage !== "uploaded") {
      await check();
      await io.upload(job.photo_path!);
      await save({ stage: "uploaded" });
    }
    await check();
    const id = await io.insert(job.op_id, job.photo_path!);
    await save({ record_id: id, stage: "inserted" });
  }
  if (job.stage === "inserted") {
    await check();
    await io.reconcileWish();
    await save({ stage: "reconciled" });
  }
  await check();
  if (!(await io.attribute(job.record_id!))) return null;
  await check();
  await io.cleanup();
  return job.record_id;
}
/** Network, session and schema rollout errors reschedule without exhausting data-error attempts. */
export function dataFailure(error: unknown) {
  const e = error as { code?: string; status?: number | string; statusCode?: number | string; message?: string };
  if (error instanceof SessionChanged) return false;
  const code = e?.code ?? "";
  const status = Number(e?.status ?? e?.statusCode);
  if (code === "42501" || code.startsWith("28") || code.startsWith("08") || code.startsWith("PGRST")) return false;
  if (status === 401 || status === 403 || status >= 500) return false;
  return code === "ENOENT" || /^(22|23)/.test(code) || status === 400 || status === 422 || error instanceof SyntaxError;
}
export function legacyOwner(payload: string): string | null {
  try { const p = JSON.parse(payload); return typeof p.user_id === "string" && p.user_id ? p.user_id : null; } catch { return null; }
}
