import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import assert from "node:assert/strict";
// Supabase-owned schemas are represented by minimal test fixtures. Application SQL
// and pgcrypto are real PostgreSQL. This does not exercise a hosted Realtime server.
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage; create schema realtime; create schema extensions;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
create table realtime.messages(id uuid primary key default gen_random_uuid());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
grant usage on schema realtime to authenticated;
grant select,insert on realtime.messages to authenticated;
create publication supabase_realtime;
`);
await db.exec(
  fs.readFileSync(
    new URL("../migrations/202611030001_puzzle_together.sql", import.meta.url),
    "utf8",
  ),
);
let assertions = 0;
const u = Array.from(
  { length: 8 },
  (_, i) => `00000000-0000-0000-0000-00000000000${i + 1}`,
);
await db.exec(
  `insert into auth.users(id) values ${u.map((id) => `('${id}')`).join(",")}`,
);
async function as(id) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${id ?? ""}',false); set role authenticated;`,
  );
}
async function q(sql, args = []) {
  return (await db.query(sql, args)).rows;
}
async function val(sql, args = []) {
  return Object.values((await q(sql, args))[0])[0];
}
function ok(v, msg) {
  assert.ok(v, msg);
  assertions++;
}
async function rejects(sql, args, pattern) {
  let err;
  try {
    await q(sql, args);
  } catch (e) {
    err = e;
  }
  ok(
    err && pattern.test(err.message),
    `Expected ${pattern}, got ${err?.message}`,
  );
}
await as(null);
await rejects("select public.create_room($1)", ["Guest"], /Sign in/);
await as(u[0]);
await rejects("select public.create_room($1)", ["A"], /nickname/);
const code = await val("select public.create_room($1)", ["Curator"]);
ok(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code), "room code");
ok(
  (await val("select public.get_room_snapshot($1)", [code])) !== null,
  "member can get atomic snapshot",
);
const room = (await q("select * from rooms"))[0];
ok(room.host_user_id === u[0], "host identity");
await rejects(
  "update rooms set status=$1 where id=$2",
  ["completed", room.id],
  /permission denied/,
);
await as(u[1]);
ok((await q("select * from rooms")).length === 0, "outsider RLS rooms");
ok(
  (await val("select public.get_room_snapshot($1)", [code])) === null,
  "outsider snapshot has no data",
);
await rejects(
  "select public.claim_piece($1,0)",
  [crypto.randomUUID()],
  /Join this room/,
);
ok(
  (await val("select public.join_room($1,$2)", [code, "Mina"])) === code,
  "guest joins",
);
await rejects("select public.start_game($1)", [room.id], /Only this room/);
for (let i = 2; i < 6; i++) {
  await as(u[i]);
  await q("select public.join_room($1,$2)", [code, `Guest ${i + 1}`]);
}
await as(u[6]);
await rejects("select public.join_room($1,$2)", [code, "Extra guest"], /full/);
ok(
  (await q("select * from room_players")).length === 0,
  "outsider RLS players",
);
ok(
  (await val("select public.can_use_room_topic($1)", [
    `room:${room.id}:game`,
  ])) === false,
  "private realtime outsider",
);
await as(u[0]);
await rejects("select public.start_game($1)", [room.id], /ready/);
ok(
  (await val("select public.can_use_room_topic($1)", [
    `room:${room.id}:game`,
  ])) === true,
  "private realtime member",
);
await rejects(
  "select public.update_room_settings($1,$2,$3)",
  [room.id, "https://example.com/a.jpg", "easy"],
  /artwork/,
);
await rejects(
  "select public.update_room_settings($1,$2,$3)",
  [room.id, "/art/missing-image.jpg", "easy"],
  /artwork/,
);
await q("select public.update_room_settings($1,$2,$3)", [
  room.id,
  "/art/starry-night.jpg",
  "easy",
]);
for (let i = 1; i < 6; i++) {
  await as(u[i]);
  await q("select public.set_player_ready($1,true)", [room.id]);
}
await as(u[0]);
const game = await val("select public.start_game($1)", [room.id]);
ok(
  (await q("select * from puzzle_pieces")).length === 12,
  "easy has 12 pieces",
);
await rejects(
  "update puzzle_pieces set is_placed=true where game_id=$1",
  [game],
  /permission denied/,
);
await as(u[6]);
await rejects("select public.claim_piece($1,0)", [game], /Join this room/);
await as(u[0]);
await as(u[6]);
await rejects(
  "select public.join_room($1,$2)",
  [code, "Late visitor"],
  /already started/,
);
await as(u[0]);
ok(
  (await val("select public.claim_piece($1,1)", [game])) === true,
  "initial lease",
);
await db.exec(
  `reset role; update public.puzzle_pieces set lock_expires_at=now()-interval '1 second' where game_id='${game}' and piece_index=1;`,
);
await as(u[1]);
ok(
  (await val("select public.claim_piece($1,1)", [game])) === true,
  "expired lease can be reclaimed",
);
await as(u[1]);
ok(
  (await val("select public.claim_piece($1,0)", [game])) === true,
  "first lock succeeds",
);
await as(u[0]);
ok(
  (await val("select public.claim_piece($1,0)", [game])) === false,
  "second lock fails",
);
ok(
  (await val("select public.place_piece($1,0,0,0)", [game])) === false,
  "cannot place another player lock",
);
await as(u[1]);
ok(
  (await val("select public.place_piece($1,0,.5,.5)", [game])) === false,
  "reject distant placement",
);
ok(
  (await val("select public.place_piece($1,0,0,0)", [game])) === true,
  "valid placement succeeds",
);
ok(
  (await val("select public.place_piece($1,0,0,0)", [game])) === true,
  "idempotent retry succeeds",
);
ok(
  (await val("select completed_pieces from games where id=$1", [game])) === 1,
  "idempotent progress",
);
for (let i = 1; i < 12; i++) {
  await q("select public.claim_piece($1,$2)", [game, i]);
  ok(
    (await val("select public.place_piece($1,$2,$3,$4)", [
      game,
      i,
      (i % 4) / 4,
      Math.floor(i / 4) / 3,
    ])) === true,
    `place ${i}`,
  );
}
const result = (await q("select * from games where id=$1", [game]))[0];
ok(
  result.status === "completed" &&
    result.completed_pieces === 12 &&
    result.completed_at,
  "complete canonical game",
);
ok(
  (await val("select count(*)::int from puzzle_pieces where placed_by=$1", [
    u[1],
  ])) === 12,
  "actual contributions",
);
await as(u[0]);
await q("select public.start_new_round($1)", [room.id]);
ok(
  (await val("select status from rooms where id=$1", [room.id])) === "lobby",
  "new round returns lobby",
);
ok(
  (await val("select public.complete_game($1)", [game])) === false,
  "cannot complete old game after new round",
);
await q("select public.leave_room($1)", [room.id]);
await as(u[1]);
ok(
  (await val("select host_user_id from rooms where id=$1", [room.id])) === u[1],
  "host transferred on explicit leave",
);
await db.exec(
  `reset role; update public.room_players set last_seen_at=now()-interval '60 seconds' where room_id='${room.id}' and user_id='${u[1]}';`,
);
await as(u[2]);
await q("select public.heartbeat_room($1)", [room.id]);
ok(
  (await val("select host_user_id from rooms where id=$1", [room.id])) === u[1],
  "host grace period retained",
);
await db.exec(
  `reset role; update public.room_players set last_seen_at=now()-interval '91 seconds' where room_id='${room.id}' and user_id='${u[1]}';`,
);
await as(u[2]);
await q("select public.heartbeat_room($1)", [room.id]);
ok(
  (await val("select host_user_id from rooms where id=$1", [room.id])) === u[2],
  "host transfers after grace period",
);
await db.exec(
  `reset role; update public.rooms set expires_at=now()-interval '1 second' where id='${room.id}';`,
);
await as(u[1]);
ok((await q("select * from rooms")).length === 0, "expired room inaccessible");
for (const [difficulty, count] of [
  ["medium", 48],
  ["hard", 120],
]) {
  await as(u[0]);
  const c = await val("select public.create_room($1)", ["Host"]);
  const r = (await q("select * from rooms where code=$1", [c]))[0];
  await q("select public.update_room_settings($1,$2,$3)", [
    r.id,
    "/art/wave.jpg",
    difficulty,
  ]);
  await as(u[1]);
  await q("select public.join_room($1,$2)", [c, "Guest"]);
  await q("select public.set_player_ready($1,true)", [r.id]);
  await as(u[0]);
  const g = await val("select public.start_game($1)", [r.id]);
  ok(
    (await val("select count(*)::int from puzzle_pieces where game_id=$1", [
      g,
    ])) === count,
    `${difficulty} piece count`,
  );
}
console.log(
  `PASS: migration applied; ${assertions} PostgreSQL assertions (room membership, RLS, ready/start, capacity, locks, placement, idempotency, completion, host transfer, expiry).`,
);
await db.close();
