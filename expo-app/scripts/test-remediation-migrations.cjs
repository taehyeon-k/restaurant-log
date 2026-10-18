// Local-only PostgreSQL compatibility smoke test. No connection string or production access.
// Install the test engine outside the app, then pass that installation's directory:
// npm install --prefix /tmp/dinary-sql-check --no-audit --no-fund @electric-sql/pglite
// node scripts/test-remediation-migrations.cjs /tmp/dinary-sql-check
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [process.argv[2] || __dirname] }));
const migrations = [
  '20261018023738_restaurants_client_op_id.sql',
  '20261018023743_rec_events_client_event_id.sql',
  '20261018023747_restaurants_captured_at.sql',
];
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.restaurants (id bigint generated always as identity primary key, user_id uuid not null, source_record_id bigint);
      create table public.rec_events (id bigint generated always as identity primary key, user_id uuid not null);`);
    const sql = migrations.map((name) => readFileSync(resolve(__dirname, '../../supabase/migrations', name), 'utf8'));
    for (const source of sql) await db.exec(source);
    const a = '00000000-0000-4000-8000-000000000001';
    const b = '00000000-0000-4000-8000-000000000002';
    const op = '00000000-0000-4000-8000-000000000003';
    const other = '00000000-0000-4000-8000-000000000004';
    await db.query('insert into restaurants(user_id) values ($1),($1)', [a]);
    assert.equal((await db.query('select count(*)::int as n from restaurants where client_op_id is null')).rows[0].n, 2);
    const original = (await db.query('insert into restaurants(user_id,client_op_id,captured_at) values ($1,$2,$3) returning id', [a, op, '2026-10-18T03:00:00Z'])).rows[0].id;
    await assert.rejects(db.query('insert into restaurants(user_id,client_op_id) values ($1,$2)', [a, op]), (e) => e.code === '23505');
    await db.query('insert into restaurants(user_id,client_op_id) values ($1,$2)', [b, op]);
    const copy = (await db.query('insert into restaurants(user_id,source_record_id,client_op_id,captured_at) select user_id,id,client_op_id,captured_at from restaurants where id=$1 returning client_op_id,captured_at', [original])).rows[0];
    assert.equal(copy.client_op_id, null);
    assert.equal(new Date(copy.captured_at).toISOString(), '2026-10-18T03:00:00.000Z');
    await db.query('update restaurants set client_op_id=$1 where id=$2', [other, original]);
    assert.equal((await db.query('select client_op_id from restaurants where id=$1', [original])).rows[0].client_op_id, op);
    await db.query('insert into rec_events(user_id,client_event_id) values ($1,$2)', [a, op]);
    await assert.rejects(db.query('insert into rec_events(user_id,client_event_id) values ($1,$2)', [a, op]), (e) => e.code === '23505');
    await db.query('insert into rec_events(user_id,client_event_id) values ($1,$2)', [b, op]);
    for (const source of sql) await db.exec(source);
    console.log('PASS: all three migrations apply and reapply; nullable legacy writes, owner-scoped uniqueness, immutable operation IDs, personal-copy compatibility, and capture-time preservation verified locally.');
  } finally { await db.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
