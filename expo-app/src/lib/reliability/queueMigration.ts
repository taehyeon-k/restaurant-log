import { legacyOwner, operationId } from "./queue";
export interface QueueDatabase {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  runAsync(sql: string, ...values: (string | number | null)[]): Promise<unknown>;
}
/** Guarded ALTERs are restart-safe; malformed rows remain quarantined on disk. */
export async function migrateQueue(d: QueueDatabase) {
    // CREATE IF NOT EXISTS does not migrate existing devices. Preserve every pending row.
    const columns = new Set((await d.getAllAsync<{ name: string }>("PRAGMA table_info(pending_records)")).map((c) => c.name));
    for (const [name, definition] of Object.entries({ owner_id: "TEXT", op_id: "TEXT", photo_path: "TEXT", stage: "TEXT NOT NULL DEFAULT 'pending'", record_id: "INTEGER", attribution: "TEXT", extra_photos: "TEXT", couple_note: "TEXT" })) {
      if (!columns.has(name)) await d.execAsync(`ALTER TABLE pending_records ADD COLUMN ${name} ${definition}`);
    }
    for (const row of await d.getAllAsync<{ id: number; payload: string; owner_id: string | null; op_id: string | null }>("SELECT id, payload, owner_id, op_id FROM pending_records")) {
      const owner = legacyOwner(row.payload);
      await d.runAsync("UPDATE pending_records SET owner_id = ?, op_id = ?, failed = CASE WHEN ? IS NULL THEN 1 ELSE failed END WHERE id = ?", owner, row.op_id ?? operationId(), owner, row.id);
    }
    await d.execAsync("CREATE INDEX IF NOT EXISTS pending_records_owner ON pending_records(owner_id)");
}
