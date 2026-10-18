import { strict as assert } from "node:assert";
import { test } from "node:test";
import { bookScoped, buildTaste } from "../../rec/taste";
import { row } from "../../rec/__tests__/fixtures";
import { boundedFix, usableMealTime, verificationAllowed } from "../guards";
import { dataFailure, legacyOwner, resumeJob, SessionChanged, type Job } from "../queue";
import { closureAllowed, requireHeaders } from "../import";
import { fetchAll } from "../pagination";
import { communityEvidence } from "../community";
import { DatabaseSync } from "node:sqlite";
import { migrateQueue, type QueueDatabase } from "../queueMigration";
import { bootState } from "../boot";
import { computeRecap, MIN_TIME_RECORDS } from "../../../features/recap/compute";
import { deliverOutbox } from "../outbox";

test("unresolved book cannot expose personal or couple evidence", () => {
  const rows = [row({ name: "personal", book_id: "personal", rating: 5 }), row({ name: "couple", book_id: "couple", rating: 1 })];
  assert.deepEqual(bookScoped(rows, null), []);
  assert.equal(buildTaste({ rows, wishes: [], bookId: null, today: "2026-10-18" }).meals, 0);
  assert.equal(bookScoped(rows, "personal").length, 1);
});
test("verification requires finite GPS and branch coordinates within 50 metres", () => {
  const fix = { lat: 37.5, lng: 127, acc: 200 };
  assert.equal(verificationAllowed(fix, { lat: 37.5001, lng: 127 }), true);
  assert.equal(verificationAllowed(fix, { lat: 37.501, lng: 127 }), false);
  assert.equal(verificationAllowed(null, fix), false);
  assert.equal(verificationAllowed(fix, { lat: null, lng: null }), false);
  assert.equal(verificationAllowed({ ...fix, lat: NaN }, fix), false);
  assert.equal(verificationAllowed(fix, { lat: Infinity, lng: 127 }), false);
});
test("late GPS is awaited within a bound without requiring network", async () => {
  const fix = { lat: 37.5, lng: 127, acc: 10 };
  assert.deepEqual(await boundedFix(Promise.resolve(fix), 10), fix);
  assert.equal(await boundedFix(new Promise(() => {}), 5), null);
});
test("meal times do not use manual entry time; captures precede delayed upload time", () => {
  assert.equal(usableMealTime({ verified: false, verified_at: null }), null);
  assert.equal(usableMealTime({ verified: true, verified_at: "bad" }), null);
  assert.equal(usableMealTime({ verified: true, captured_at: "2026-10-17T03:00:00Z", verified_at: "2026-10-18T15:00:00Z" }), "2026-10-17T03:00:00Z");
});

function queueFixture() {
  const job: Job = { id: 1, owner_id: "A", op_id: "stable-op", photo_path: null, stage: "pending", record_id: null, payload: "{}" };
  let owner: string | null = "A", remote: number | null = null, uploads = 0, inserts = 0, reconciles = 0, cleanups = 0;
  const io = {
    owner: async () => owner,
    save: async (patch: Partial<Job>) => { Object.assign(job, patch); },
    upload: async (_path: string) => { uploads++; },
    findRecord: async () => remote,
    insert: async () => { inserts++; remote = 42; return remote; },
    reconcileWish: async () => { reconciles++; },
    attribute: async () => true,
    cleanup: async () => { cleanups++; },
  };
  return { job, io, setOwner: (v: string | null) => { owner = v; }, counts: () => ({ uploads, inserts, reconciles, cleanups }) };
}
test("ambiguous committed insert is recovered after restart without another upload/insert", async () => {
  const f = queueFixture();
  const insert = f.io.insert;
  f.io.insert = async () => { await insert(); throw new Error("response lost"); };
  await assert.rejects(resumeJob(f.job, f.io));
  assert.equal(f.job.stage, "uploaded");
  assert.equal(await resumeJob({ ...f.job }, f.io), 42);
  assert.deepEqual(f.counts(), { uploads: 1, inserts: 1, reconciles: 1, cleanups: 1 });
});
test("wishlist reconciliation failure retries only reconciliation", async () => {
  const f = queueFixture();
  const reconcile = f.io.reconcileWish;
  let failed = false;
  f.io.reconcileWish = async () => { if (!failed) { failed = true; throw new Error("offline"); } await reconcile(); };
  await assert.rejects(resumeJob(f.job, f.io));
  assert.equal(f.job.stage, "inserted");
  assert.equal(await resumeJob(f.job, f.io), 42);
  assert.equal(f.counts().inserts, 1);
});
test("queue never uploads for a different owner and stops on account switch between stages", async () => {
  const f = queueFixture(); f.setOwner("B");
  await assert.rejects(resumeJob(f.job, f.io), SessionChanged);
  assert.equal(f.counts().uploads, 0);
  f.setOwner("A");
  const upload = f.io.upload;
  f.io.upload = async (path) => { await upload(path); f.setOwner("B"); };
  await assert.rejects(resumeJob(f.job, f.io), SessionChanged);
  assert.equal(f.counts().inserts, 0);
});
test("malformed legacy entries quarantine; transient/session errors do not consume data attempts", () => {
  assert.equal(legacyOwner("broken"), null);
  assert.equal(legacyOwner('{"user_id":"A"}'), "A");
  assert.equal(dataFailure(new Error("Network request failed")), false);
  assert.equal(dataFailure({ code: "42501" }), false);
  assert.equal(dataFailure({ code: "PGRST204" }), false);
  assert.equal(dataFailure({ code: "23514" }), true);
});
test("attribution must be handed off before local queue cleanup", async () => {
  const f = queueFixture(); f.io.attribute = async () => false;
  assert.equal(await resumeJob(f.job, f.io), null);
  assert.equal(f.counts().cleanups, 0);
  f.io.attribute = async () => true;
  assert.equal(await resumeJob(f.job, f.io), 42);
  assert.equal(f.counts().inserts, 1);
});

test("partial imports never close stores and complete imports require 90 percent coverage", () => {
  assert.equal(closureAllowed(100, 100, false, true), false);
  assert.equal(closureAllowed(89, 100, true, false), false);
  assert.equal(closureAllowed(90, 100, true, false), true);
  assert.equal(closureAllowed(1, 100, true, true), true);
  assert.equal(closureAllowed(0, 100, true, true), false);
  assert.throws(() => requireHeaders(["상호명"]));
});

test("full-history retrieval survives lower server caps and tied dates", async () => {
  const rows = Array.from({ length: 2301 }, (_, id) => ({ id, date: "2026-10-18" }));
  const result = await fetchAll(async (from) => ({ data: rows.slice(from, from + 300), error: null }));
  assert.deepEqual(result, rows);
  await assert.rejects(fetchAll(async () => ({ data: [{ id: 1 }], error: null })), /History changed/);
  await assert.rejects(fetchAll(async () => ({ data: null, error: { message: "offline" } })), /offline/);
});
test("a prolific contributor cannot inflate community popularity or rating confidence", () => {
  const one = { user_id: "A", rating: 5 };
  assert.deepEqual(communityEvidence(Array(100).fill(one)), communityEvidence([one]));
  assert.ok(communityEvidence([one]).average < 4);
  assert.equal(communityEvidence(Array.from({ length: 100 }, (_, i) => ({ user_id: String(i), rating: null }))).popularity, 2);
});

test("SQLite upgrade preserves legacy jobs, stable operation IDs and malformed quarantined rows", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE pending_records (id INTEGER PRIMARY KEY, payload TEXT, photo_uri TEXT, failed INTEGER DEFAULT 0)");
  db.prepare("INSERT INTO pending_records(id,payload,photo_uri) VALUES (?,?,?)").run(1, '{"user_id":"A"}', "file://a");
  db.prepare("INSERT INTO pending_records(id,payload,photo_uri) VALUES (?,?,?)").run(2, "invalid-json", "file://b");
  const adapter: QueueDatabase = {
    execAsync: async (sql) => { db.exec(sql); },
    getAllAsync: async <T>(sql: string) => db.prepare(sql).all() as T[],
    runAsync: async (sql, ...values) => db.prepare(sql).run(...values),
  };
  await migrateQueue(adapter);
  const first = db.prepare("SELECT * FROM pending_records WHERE id=1").get()!;
  assert.equal(first.owner_id, "A"); assert.equal(first.photo_uri, "file://a");
  assert.equal(first.stage, "pending"); assert.match(String(first.op_id), /^[0-9a-f-]{36}$/);
  assert.equal(db.prepare("SELECT failed FROM pending_records WHERE id=2").get()!.failed, 1);
  await migrateQueue(adapter);
  assert.equal(db.prepare("SELECT op_id FROM pending_records WHERE id=1").get()!.op_id, first.op_id);
  assert.equal(db.prepare("SELECT count(*) AS n FROM pending_records").get()!.n, 2);
  db.close();
});

test("boot minimum, slow, offline, failed and recovery transitions match the approved spec", () => {
  const input = { elapsed: 799, ready: true, resolved: true, offline: false, fetching: false, error: false };
  assert.equal(bootState(input), "loading");
  assert.equal(bootState({ ...input, elapsed: 800 }), "done");
  assert.equal(bootState({ ...input, resolved: false, offline: true }), "offline");
  assert.equal(bootState({ ...input, resolved: false, elapsed: 4000, fetching: true }), "slow");
  assert.equal(bootState({ ...input, resolved: false, error: true }), "failed");
  assert.equal(bootState({ ...input, resolved: false, error: true, fetching: true }), "loading");
});
test("recap excludes manual midnight entry and hides hour stats below five usable meal times", () => {
  const rows = Array.from({ length: MIN_TIME_RECORDS }, (_, i) => row({ name: `meal ${i}`, visited_at: "2026-09-01", created_at: "2026-09-01T15:00:00Z", verified: true, verified_at: "2026-09-02T15:00:00Z", captured_at: "2026-09-01T03:00:00Z" }));
  const manual = row({ name: "manual", visited_at: "2026-09-01", created_at: "2026-09-01T15:00:00Z" });
  const recap = computeRecap([...rows, manual], [], "2026-Q3")!;
  assert.equal(recap.count, 6);
  assert.equal(recap.timeStatsAvailable, true);
  assert.equal(recap.time.midnight, 0);
  assert.equal(recap.time.hist.reduce((a, b) => a + b, 0), 5);
  assert.equal(recap.time.peak, "12:00");
  assert.equal(computeRecap([...rows.slice(1), manual], [], "2026-Q3")!.timeStatsAvailable, false);
  assert.equal(computeRecap([manual], [], "2026-Q3")!.time.dayCount, 1);
});

test("visit delivery survives lost acknowledgement and restart with one stable event identity", async () => {
  let stored = [{ id: "event-1" }];
  const remote = new Set<string>();
  let fail = true, removedShown = false;
  const io = {
    read: async () => [...stored], write: async (rows: typeof stored) => { stored = rows; }, key: (r: { id: string }) => r.id,
    send: async (r: { id: string }) => { remote.add(r.id); if (fail) return false; return true; },
    delivered: async () => { removedShown = true; },
  };
  await deliverOutbox(io);
  assert.equal(stored.length, 1); assert.equal(removedShown, false);
  fail = false;
  await deliverOutbox({ ...io });
  assert.equal(remote.size, 1); assert.equal(stored.length, 0); assert.equal(removedShown, true);
});
test("outbox keeps concurrent additions and retries failed local acknowledgement", async () => {
  let stored = [{ id: "event-1" }], failCleanup = true;
  const io = {
    read: async () => [...stored], write: async (rows: typeof stored) => { stored = rows; }, key: (r: { id: string }) => r.id,
    send: async () => { if (!stored.some((r) => r.id === "event-2")) stored.push({ id: "event-2" }); return true; },
    delivered: async () => { if (failCleanup) throw new Error("disk unavailable"); },
  };
  await assert.rejects(deliverOutbox(io));
  assert.equal(stored.length, 2);
  failCleanup = false;
  await deliverOutbox(io);
  assert.deepEqual(stored, []);
  // An entry appended during delivery survives the initial snapshot.
  stored = [{ id: "event-1" }];
  await deliverOutbox(io);
  assert.deepEqual(stored, [{ id: "event-2" }]);
});
