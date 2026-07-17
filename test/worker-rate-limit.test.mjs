import assert from "node:assert/strict";
import test from "node:test";
import worker, { HexlaceCoordinator, HexOwlProfile, OwlNumberAllocator, RateLimitCoordinator } from "../worker/src/index.js";

class MemoryKv {
  constructor() {
    this.values = new Map();
    this.writes = [];
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value, options) {
    this.values.set(key, String(value));
    this.writes.push({ key, value: String(value), options });
  }

  async delete(key) {
    this.values.delete(key);
  }
}

class CollidingListKv extends MemoryKv {
  async get(key) {
    if (key.startsWith("list:")) return "occupied";
    return super.get(key);
  }
}

class FailingKv extends MemoryKv {
  async get() { throw new Error("private backend detail"); }
}

class MemoryDoStorage {
  constructor() {
    this.values = new Map();
    this.alarmAt = null;
  }

  async get(key) { return this.values.get(key); }
  async put(key, value) {
    if (key && typeof key === "object" && !Array.isArray(key)) {
      for (const [entryKey, entryValue] of Object.entries(key)) this.values.set(entryKey, structuredClone(entryValue));
      return;
    }
    this.values.set(key, structuredClone(value));
  }
  async delete(key) { this.values.delete(key); }
  async list(options = {}) {
    let entries = [...this.values.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (options.prefix) entries = entries.filter(([key]) => key.startsWith(options.prefix));
    if (options.startAfter) entries = entries.filter(([key]) => key > options.startAfter);
    if (options.start) entries = entries.filter(([key]) => key >= options.start);
    if (options.end) entries = entries.filter(([key]) => key < options.end);
    if (options.reverse) entries.reverse();
    if (Number.isSafeInteger(options.limit)) entries = entries.slice(0, options.limit);
    return new Map(entries.map(([key, value]) => [key, structuredClone(value)]));
  }
  async deleteAll() { this.values.clear(); }
  async setAlarm(timestamp) { this.alarmAt = timestamp; }
}

class MemoryDoNamespace {
  constructor(DoClass, env) {
    this.DoClass = DoClass;
    this.env = env;
    this.instances = new Map();
    this.fetchCount = 0;
  }

  idFromName(name) { return name; }
  getByName(name) { return this.get(name); }

  get(id) {
    if (!this.instances.has(id)) {
      const storage = new MemoryDoStorage();
      const ctx = {
        storage,
        ready: Promise.resolve(),
        blockConcurrencyWhile(callback) {
          this.ready = Promise.resolve().then(callback);
          return this.ready;
        }
      };
      const instance = new this.DoClass(ctx, this.env);
      this.instances.set(id, { instance, ctx, queue: Promise.resolve() });
    }
    const entry = this.instances.get(id);
    return {
      fetch: request => {
        this.fetchCount += 1;
        const response = entry.queue.then(async () => {
          await entry.ctx.ready;
          return entry.instance.fetch(request);
        });
        entry.queue = response.then(() => undefined, () => undefined);
        return response;
      }
    };
  }
}

function makeDurableEnv(now = 1_800_000_000_000) {
  const env = { LISTS: new MemoryKv(), NOW_MS: now };
  env.HEXLACES = new MemoryDoNamespace(HexlaceCoordinator, env);
  env.RATE_LIMITS = new MemoryDoNamespace(RateLimitCoordinator, env);
  return env;
}

function makeOwlEnv(now = 1_800_000_000_000) {
  const env = makeDurableEnv(now);
  env.HEX_OWL_PROFILES = new MemoryDoNamespace(HexOwlProfile, env);
  env.OWL_NUMBERS = new MemoryDoNamespace(OwlNumberAllocator, env);
  return env;
}

const QUALIFYING_SET = { day: "Friday", stageId: "village", time: "9:00 PM", artist: "Hex Owl Test" };

function makeRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("CF-Connecting-IP")) headers.set("CF-Connecting-IP", "203.0.113.10");
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Request(`https://api.example.test${path}`, { ...options, headers });
}

test("create endpoint returns 429 after its write limit", async () => {
  const env = { LISTS: new MemoryKv() };
  const body = JSON.stringify({ name: "Tester", sets: [] });

  for (let index = 0; index < 120; index += 1) {
    const response = await worker.fetch(makeRequest("/lists", { method: "POST", body }), env);
    assert.equal(response.status, 201);
  }

  const blocked = await worker.fetch(makeRequest("/lists", { method: "POST", body }), env);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "300");
  assert.match(await blocked.text(), /Too many requests/);
});

test("earlier local scan can claim after a later scan reached the server first", async () => {
  const env = { LISTS: new MemoryKv() };
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Unclaimed Hexlace", sets: [], claimable: true })
  }), env);
  assert.equal(created.status, 201);
  const { readId, claimToken } = await created.json();

  const laterClaim = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimToken, writeKey: "later-write-key-123", scannedAt: 2000 })
  }), env);
  assert.deepEqual(await laterClaim.json(), { ok: true, accepted: true });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "later-write-key-123");

  const earlierClaim = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.11" },
    body: JSON.stringify({ claimToken, writeKey: "earlier-write-key-123", scannedAt: 1000 })
  }), env);
  assert.deepEqual(await earlierClaim.json(), { ok: true, accepted: true });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "earlier-write-key-123");

  const tooLateClaim = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.12" },
    body: JSON.stringify({ claimToken, writeKey: "too-late-write-key", scannedAt: 3000 })
  }), env);
  assert.deepEqual(await tooLateClaim.json(), { ok: true, accepted: false });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "earlier-write-key-123");
});

test("ownership locks once the seven-day contention window closes", async () => {
  const env = { LISTS: new MemoryKv() };
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Unclaimed Hexlace", sets: [], claimable: true })
  }), env);
  const { readId, claimToken } = await created.json();

  const claim = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimToken, writeKey: "owner-write-key-1234", scannedAt: 2000 })
  }), env);
  assert.deepEqual(await claim.json(), { ok: true, accepted: true });

  // Age the first claim past the contention window, then try an
  // earlier-scan takeover - it must be refused and the key untouched.
  const record = JSON.parse(await env.LISTS.get(`claim:${readId}`));
  record.claimedAt = Date.now() - (7 * 24 * 60 * 60 * 1000 + 60000);
  await env.LISTS.put(`claim:${readId}`, JSON.stringify(record));

  const staleTakeover = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.13" },
    body: JSON.stringify({ claimToken, writeKey: "hijack-write-key-1234", scannedAt: 1 })
  }), env);
  assert.deepEqual(await staleTakeover.json(), { ok: true, accepted: false });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "owner-write-key-1234");
});

test("Durable Objects serialize claims and preserve the earliest scan for seven days", async () => {
  const env = makeDurableEnv();
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Unclaimed Hexlace", sets: [], claimable: true })
  }), env);
  assert.equal(created.status, 201);
  const { readId, claimToken } = await created.json();

  const later = worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimToken, writeKey: "later-write-key-123", scannedAt: 2000 })
  }), env);
  const earlier = worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.11" },
    body: JSON.stringify({ claimToken, writeKey: "earlier-write-key-123", scannedAt: 1000 })
  }), env);
  assert.deepEqual((await Promise.all([later, earlier])).map(response => response.status), [200, 200]);
  assert.equal(await env.LISTS.get(`auth:${readId}`), "earlier-write-key-123");

  env.NOW_MS += 7 * 24 * 60 * 60 * 1000 + 1;
  const expiredTakeover = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.12" },
    body: JSON.stringify({ claimToken, writeKey: "expired-write-key-123", scannedAt: 500 })
  }), env);
  assert.deepEqual(await expiredTakeover.json(), { ok: true, accepted: false, revision: 1 });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "earlier-write-key-123");
  assert.equal(env.LISTS.writes.some(write => write.key.startsWith("rate:")), false);
});

test("existing KV Hexlaces migrate lazily into their Durable Object on the first write", async () => {
  const env = makeDurableEnv();
  const readId = "23456789";
  await env.LISTS.put(`list:${readId}`, JSON.stringify({ name: "Legacy", sets: [], ping: null, updated: 1, revision: 1 }));
  await env.LISTS.put(`auth:${readId}`, "legacy-write-key-1234");

  const updated = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": "legacy-write-key-1234" },
    body: JSON.stringify({ name: "Migrated", sets: [], revision: 1 })
  }), env);
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).revision, 2);
  assert.equal(JSON.parse(await env.LISTS.get(`list:${readId}`)).name, "Migrated");
  assert.ok(env.HEXLACES.instances.get(readId).ctx.storage.values.get("record"));
});

test("pre-v55 Durable Object records without a claim remain physical Hexlaces", async () => {
  const env = makeOwlEnv();
  const readId = "3456789a";
  const writeKey = "legacy-physical-write-key";
  env.HEXLACES.getByName(readId);
  const entry = env.HEXLACES.instances.get(readId);
  await entry.ctx.ready;

  const legacyRecord = {
    readId,
    list: { name: "Jaceofspades", sets: [], ping: null, updated: 1, revision: 1 },
    auth: writeKey,
    claim: null,
    handoffs: {},
    redirects: {},
    appliedTrades: {},
    profileId: null,
    profileKey: null,
    owl: null,
    tapToken: null,
    trade: null,
    expiresAt: null,
    snapshotDirty: false
  };
  entry.instance.record = structuredClone(legacyRecord);
  await entry.ctx.storage.put("record", legacyRecord);

  const owner = await worker.fetch(makeRequest(`/lists/${readId}/owner`, {
    headers: { "X-Write-Key": writeKey }
  }), env);
  assert.equal(owner.status, 200, await owner.clone().text());
  assert.equal((await owner.json()).isPhysical, true);
  assert.equal(entry.ctx.storage.values.get("record").isPhysical, true);
});

test("an owner can release the existing physical tag for the next scanner", async () => {
  const env = makeDurableEnv();
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Original owner", sets: [] })
  }), env);
  const { readId, writeKey } = await created.json();

  const released = await worker.fetch(makeRequest(`/lists/${readId}/release`, {
    method: "POST",
    headers: { "X-Write-Key": writeKey }
  }), env);
  assert.equal(released.status, 200);
  assert.equal(await env.LISTS.get(`auth:${readId}`), null);

  const publicTag = await worker.fetch(makeRequest(`/lists/${readId}`), env);
  const publicBody = await publicTag.json();
  assert.equal(publicBody.name, "Unclaimed Hexlace");
  assert.equal(typeof publicBody.claimToken, "string");

  const claimed = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimToken: publicBody.claimToken, writeKey: "next-owner-write-key", scannedAt: 1000 })
  }), env);
  assert.deepEqual(await claimed.json(), { ok: true, accepted: true, revision: 2 });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "next-owner-write-key");
});

test("physical Hexlace trades require reciprocal taps and both confirmations", async () => {
  const env = makeDurableEnv();
  const first = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Alex", sets: [] })
  }), env).then(response => response.json());
  const second = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Blair", sets: [] })
  }), env).then(response => response.json());

  const firstTap = await worker.fetch(makeRequest(`/lists/${first.readId}/trade`, {
    method: "POST",
    headers: { "X-Write-Key": first.writeKey },
    body: JSON.stringify({ targetReadId: second.readId })
  }), env);
  assert.equal((await firstTap.json()).matched, false);

  const premature = await worker.fetch(makeRequest(`/lists/${first.readId}/trade/confirm`, {
    method: "POST",
    headers: { "X-Write-Key": first.writeKey }
  }), env);
  assert.equal(premature.status, 409);

  const reciprocalTap = await worker.fetch(makeRequest(`/lists/${second.readId}/trade`, {
    method: "POST",
    headers: { "X-Write-Key": second.writeKey },
    body: JSON.stringify({ targetReadId: first.readId })
  }), env);
  assert.equal((await reciprocalTap.json()).matched, true);

  const firstStatus = await worker.fetch(makeRequest(`/lists/${first.readId}/trade`, {
    headers: { "X-Write-Key": first.writeKey }
  }), env);
  assert.equal((await firstStatus.json()).matched, true);

  const firstConfirm = await worker.fetch(makeRequest(`/lists/${first.readId}/trade/confirm`, {
    method: "POST",
    headers: { "X-Write-Key": first.writeKey }
  }), env);
  assert.deepEqual(await firstConfirm.json(), { completed: false });

  const secondConfirm = await worker.fetch(makeRequest(`/lists/${second.readId}/trade/confirm`, {
    method: "POST",
    headers: { "X-Write-Key": second.writeKey }
  }), env);
  assert.deepEqual(await secondConfirm.json(), { completed: true, readId: first.readId, revision: 1 });

  const firstPhoneRedirect = await worker.fetch(makeRequest(`/lists/${first.readId}/owner`, {
    headers: { "X-Write-Key": first.writeKey }
  }), env);
  assert.equal(firstPhoneRedirect.status, 409);
  assert.equal((await firstPhoneRedirect.json()).transferredTo, second.readId);

  const firstPhoneNewTag = await worker.fetch(makeRequest(`/lists/${second.readId}/owner`, {
    headers: { "X-Write-Key": first.writeKey }
  }), env);
  assert.equal(firstPhoneNewTag.status, 200);
  const secondPhoneNewTag = await worker.fetch(makeRequest(`/lists/${first.readId}/owner`, {
    headers: { "X-Write-Key": second.writeKey }
  }), env);
  assert.equal(secondPhoneNewTag.status, 200);
});

test("simultaneous trade confirmations settle without cross-coordinator deadlock", async () => {
  const env = makeDurableEnv();
  const first = await worker.fetch(makeRequest("/lists", {
    method: "POST", body: JSON.stringify({ name: "A", sets: [] })
  }), env).then(response => response.json());
  const second = await worker.fetch(makeRequest("/lists", {
    method: "POST", body: JSON.stringify({ name: "B", sets: [] })
  }), env).then(response => response.json());
  await worker.fetch(makeRequest(`/lists/${first.readId}/trade`, {
    method: "POST", headers: { "X-Write-Key": first.writeKey }, body: JSON.stringify({ targetReadId: second.readId, targetTapToken: second.tapToken })
  }), env);
  await worker.fetch(makeRequest(`/lists/${second.readId}/trade`, {
    method: "POST", headers: { "X-Write-Key": second.writeKey }, body: JSON.stringify({ targetReadId: first.readId, targetTapToken: first.tapToken })
  }), env);

  const [firstConfirm, secondConfirm] = await Promise.all([
    worker.fetch(makeRequest(`/lists/${first.readId}/trade/confirm`, { method: "POST", headers: { "X-Write-Key": first.writeKey } }), env),
    worker.fetch(makeRequest(`/lists/${second.readId}/trade/confirm`, { method: "POST", headers: { "X-Write-Key": second.writeKey } }), env)
  ]);
  const confirmations = [await firstConfirm.json(), await secondConfirm.json()];
  assert.equal(confirmations.some(result => result.completed === true), true);

  const firstMoved = await worker.fetch(makeRequest(`/lists/${second.readId}/owner`, {
    headers: { "X-Write-Key": first.writeKey }
  }), env);
  const secondMoved = await worker.fetch(makeRequest(`/lists/${first.readId}/owner`, {
    headers: { "X-Write-Key": second.writeKey }
  }), env);
  assert.equal(firstMoved.status, 200);
  assert.equal(secondMoved.status, 200);
});

test("Durable Object revision checks allow exactly one concurrent owner update", async () => {
  const env = makeDurableEnv();
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Original", sets: [] })
  }), env);
  const { readId, writeKey } = await created.json();
  const responses = await Promise.all(["First", "Second"].map((name, index) =>
    worker.fetch(makeRequest(`/lists/${readId}`, {
      method: "PUT",
      headers: { "X-Write-Key": writeKey, "CF-Connecting-IP": `203.0.113.${50 + index}` },
      body: JSON.stringify({ name, sets: [], revision: 1 })
    }), env)
  ));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const saved = JSON.parse(await env.LISTS.get(`list:${readId}`));
  assert.equal(saved.revision, 2);
  assert.ok(["First", "Second"].includes(saved.name));
});

test("an earlier offline claimant receives the current revision after a temporary owner published", async () => {
  const env = makeDurableEnv();
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Unclaimed Hexlace", sets: [], claimable: true })
  }), env);
  const { readId, claimToken } = await created.json();
  const laterKey = "temporary-owner-key-123";
  await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimToken, writeKey: laterKey, scannedAt: 2000 })
  }), env);
  const temporaryHandoff = await worker.fetch(makeRequest(`/lists/${readId}/handoff`, {
    method: "POST",
    headers: { "X-Write-Key": laterKey }
  }), env);
  const { token: temporaryToken } = await temporaryHandoff.json();
  const temporaryUpdate = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": laterKey },
    body: JSON.stringify({ name: "Temporary owner", sets: [], revision: 1 })
  }), env);
  assert.equal((await temporaryUpdate.json()).revision, 2);

  const earlierKey = "earliest-owner-key-1234";
  const takeover = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.41" },
    body: JSON.stringify({ claimToken, writeKey: earlierKey, scannedAt: 1000 })
  }), env);
  assert.deepEqual(await takeover.json(), { ok: true, accepted: true, revision: 2 });

  const invalidatedHandoff = await worker.fetch(makeRequest("/handoffs/redeem", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.42" },
    body: JSON.stringify({ token: temporaryToken, redemptionId: "temporary-owner-redeem" })
  }), env);
  assert.equal(invalidatedHandoff.status, 410);

  const rightfulUpdate = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": earlierKey, "CF-Connecting-IP": "203.0.113.41" },
    body: JSON.stringify({ name: "Earliest scanner", sets: [], revision: 2 })
  }), env);
  assert.equal(rightfulUpdate.status, 200);
  assert.equal((await rightfulUpdate.json()).revision, 3);
});

test("list payloads are normalized and successful updates renew the write key TTL", async () => {
  const env = { LISTS: new MemoryKv() };
  const set = { day: "Friday", stageId: "amp", time: "11:00 PM", artist: "PEEKABOO", ignored: "not stored" };
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "  Tester  ", sets: [set] })
  }), env);
  assert.equal(created.status, 201);
  const { readId, writeKey } = await created.json();

  const updated = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Tester", sets: [set] })
  }), env);
  assert.equal(updated.status, 200);
  const authWrites = env.LISTS.writes.filter(write => write.key === `auth:${readId}`);
  assert.equal(authWrites.at(-1).options.expirationTtl, 60 * 24 * 60 * 60);

  const read = await worker.fetch(makeRequest(`/lists/${readId}`), env);
  assert.equal(read.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await read.json()).sets, [{ day: "Friday", stageId: "amp", time: "11:00 PM", artist: "PEEKABOO" }]);
});

test("request bodies are rejected before more than 20KB is buffered", async () => {
  const env = { LISTS: new MemoryKv() };
  const response = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "x".repeat(21000), sets: [] })
  }), env);
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Request body is too large." });
  assert.equal(env.LISTS.writes.length, 1, "Only the rate-limit bookkeeping write is allowed.");
});

test("expired remote pings are hidden without an extra KV cleanup write", async () => {
  const env = { LISTS: new MemoryKv() };
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets: [], ping: { type: "camp", startKey: 1, endKey: 31 } })
  }), env);
  const { readId } = await created.json();
  const writesBeforeRead = env.LISTS.writes.length;
  const read = await worker.fetch(makeRequest(`/lists/${readId}`), env);
  assert.equal((await read.json()).ping, null);
  assert.equal(env.LISTS.writes.length, writesBeforeRead);
});

test("unexpected backend errors return a generic 500", async context => {
  context.mock.method(console, "error", () => {});
  const response = await worker.fetch(makeRequest("/lists/23456789"), { LISTS: new FailingKv() });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
});

test("health endpoint reports the Worker build revision without exposing credentials", async () => {
  const response = await worker.fetch(makeRequest("/health"), { LISTS: new MemoryKv(), BUILD_SHA: "abc123" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, build: "abc123" });
});

test("owner writes require the current revision unless the owner explicitly replaces it", async () => {
  const env = { LISTS: new MemoryKv() };
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets: [] })
  }), env);
  const { readId, writeKey, revision } = await created.json();
  assert.equal(revision, 1);

  const first = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "First device", sets: [], revision })
  }), env);
  assert.deepEqual(await first.json(), { ok: true, updated: JSON.parse(await env.LISTS.get(`list:${readId}`)).updated, revision: 2 });

  const stale = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Second device", sets: [], revision: 1 })
  }), env);
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: "This Hexlace changed in another app.", currentRevision: 2 });

  const replace = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Second device", sets: [], revision: 1, force: true })
  }), env);
  assert.equal(replace.status, 200);
  assert.equal((await replace.json()).revision, 3);
  const saved = await worker.fetch(makeRequest(`/lists/${readId}`), env);
  assert.equal((await saved.json()).name, "Second device");
});

test("fixed-location and saved-set pings are normalized while malformed pings are rejected", async () => {
  const env = { LISTS: new MemoryKv(), NOW_MINUTE_KEY: 29748000 };
  const set = { day: "Friday", stageId: "pagoda", time: "2:00 PM", artist: "TEST ARTIST" };
  const startKey = 29748000;
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({
      name: "Tester",
      sets: [set],
      ping: { type: "set", ...set, startKey, endKey: startKey + 60, ignored: "not stored" }
    })
  }), env);
  assert.equal(created.status, 201);
  const { readId, writeKey } = await created.json();

  const read = await worker.fetch(makeRequest(`/lists/${readId}`), env);
  assert.deepEqual((await read.json()).ping, { type: "set", ...set, startKey, endKey: startKey + 60 });

  const camp = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Tester", sets: [set], ping: { type: "camp", startKey, endKey: startKey + 90 } })
  }), env);
  assert.equal(camp.status, 200);

  for (const location of ["river", "vendors"]) {
    const locationUpdate = await worker.fetch(makeRequest(`/lists/${readId}`, {
      method: "PUT",
      headers: { "X-Write-Key": writeKey },
      body: JSON.stringify({ name: "Tester", sets: [set], ping: { type: location, startKey, endKey: startKey + 30 } })
    }), env);
    assert.equal(locationUpdate.status, 200);
    const locationRead = await worker.fetch(makeRequest(`/lists/${readId}`), env);
    assert.deepEqual((await locationRead.json()).ping, { type: location, startKey, endKey: startKey + 30 });
  }

  const invalidDuration = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Tester", sets: [set], ping: { type: "camp", startKey, endKey: startKey + 45 } })
  }), env);
  assert.equal(invalidDuration.status, 400);

  const unsavedSet = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Tester", sets: [], ping: { type: "set", ...set, startKey, endKey: startKey + 60 } })
  }), env);
  assert.equal(unsavedSet.status, 400);
});

test("malformed set data and exhausted generated IDs never create or overwrite a list", async () => {
  const malformedEnv = { LISTS: new MemoryKv() };
  const malformed = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets: [{ day: "Monday", stageId: "amp", time: "25:00 PM", artist: "" }] })
  }), malformedEnv);
  assert.equal(malformed.status, 400);
  assert.match(await malformed.text(), /Each set needs a valid day/);

  const collisionEnv = { LISTS: new CollidingListKv() };
  const collision = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets: [] })
  }), collisionEnv);
  assert.equal(collision.status, 503);
  assert.equal(collisionEnv.LISTS.writes.some(write => write.key.startsWith("list:")), false);
});

test("24-hour handoff tokens transfer ownership once without storing the raw write key", async () => {
  const env = { LISTS: new MemoryKv() };
  const sets = [{ day: "Friday", stageId: "amp", time: "11:00 PM", artist: "PEEKABOO" }];
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets })
  }), env);
  const { readId, writeKey } = await created.json();

  const forbidden = await worker.fetch(makeRequest(`/lists/${readId}/handoff`, {
    method: "POST",
    headers: { "X-Write-Key": "wrong-write-key-1234" }
  }), env);
  assert.equal(forbidden.status, 403);

  const handoff = await worker.fetch(makeRequest(`/lists/${readId}/handoff`, {
    method: "POST",
    headers: { "X-Write-Key": writeKey }
  }), env);
  assert.equal(handoff.status, 201);
  const { token, expiresIn } = await handoff.json();
  assert.equal(expiresIn, 24 * 60 * 60);
  assert.equal(typeof token, "string");
  assert.ok(token.length >= 24);

  const transferWrite = env.LISTS.writes.find(write => write.key.startsWith("handoff:"));
  assert.ok(transferWrite);
  assert.equal(transferWrite.options.expirationTtl, 24 * 60 * 60);
  assert.equal(transferWrite.key.includes(token), false);
  assert.equal(transferWrite.value, readId);
  assert.equal(transferWrite.value.includes(writeKey), false);

  const redeemed = await worker.fetch(makeRequest("/handoffs/redeem", {
    method: "POST",
    body: JSON.stringify({ token })
  }), env);
  assert.equal(redeemed.status, 200);
  assert.deepEqual(await redeemed.json(), { readId, writeKey, name: "Tester", sets, ping: null, friends: [], revision: 1 });

  const replayed = await worker.fetch(makeRequest("/handoffs/redeem", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.20" },
    body: JSON.stringify({ token })
  }), env);
  assert.equal(replayed.status, 410);
});

test("Durable Object handoff redemption is retry-safe after a dropped response", async () => {
  const env = makeDurableEnv();
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets: [] })
  }), env);
  const { readId, writeKey } = await created.json();
  const handoff = await worker.fetch(makeRequest(`/lists/${readId}/handoff`, {
    method: "POST",
    headers: { "X-Write-Key": writeKey }
  }), env);
  assert.equal(handoff.status, 201);
  const { token } = await handoff.json();
  assert.ok(token.startsWith(`${readId}.`));
  assert.equal(env.LISTS.writes.some(write => write.key.startsWith("handoff:")), false);

  const redemptionId = "redemption-attempt-123456";
  const first = await worker.fetch(makeRequest("/handoffs/redeem", {
    method: "POST",
    body: JSON.stringify({ token, redemptionId })
  }), env);
  assert.equal(first.status, 200);
  const firstBody = await first.json();

  const retry = await worker.fetch(makeRequest("/handoffs/redeem", {
    method: "POST",
    body: JSON.stringify({ token, redemptionId })
  }), env);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), firstBody);

  const differentConsumer = await worker.fetch(makeRequest("/handoffs/redeem", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.31" },
    body: JSON.stringify({ token, redemptionId: "different-attempt-123456" })
  }), env);
  assert.equal(differentConsumer.status, 410);
});

test("connection codes copy ownership and privately sync friend ids across browser and app", async () => {
  const env = makeDurableEnv();
  const friendId = "abcd2345";
  const sets = [{ day: "Friday", stageId: "amp", time: "11:00 PM", artist: "PEEKABOO" }];
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets, friends: [friendId] })
  }), env);
  assert.equal(created.status, 201, await created.clone().text());
  const { readId, writeKey } = await created.json();

  const codeResponse = await worker.fetch(makeRequest(`/lists/${readId}/connect-code`, {
    method: "POST",
    headers: { "X-Write-Key": writeKey }
  }), env);
  assert.equal(codeResponse.status, 201);
  const { code, expiresIn } = await codeResponse.json();
  assert.match(code, /^[23456789A-HJ-NP-Za-km-z]{4}(?:-[23456789A-HJ-NP-Za-km-z]{4}){3}$/);
  assert.equal(expiresIn, 24 * 60 * 60);

  const redeemed = await worker.fetch(makeRequest("/handoffs/redeem", {
    method: "POST",
    body: JSON.stringify({ code, redemptionId: "installed-app-redemption" })
  }), env);
  assert.equal(redeemed.status, 200);
  assert.deepEqual(await redeemed.json(), { readId, writeKey, name: "Tester", sets, ping: null, friends: [friendId], revision: 1 });

  const publicRead = await worker.fetch(makeRequest(`/lists/${readId}`), env);
  const publicBody = await publicRead.json();
  assert.equal(Object.hasOwn(publicBody, "friends"), false);

  const appUpdate = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Tester", sets: [], ping: null, friends: [friendId], revision: 1 })
  }), env);
  assert.equal(appUpdate.status, 200);

  const browserPull = await worker.fetch(makeRequest(`/lists/${readId}/owner`, {
    headers: { "X-Write-Key": writeKey }
  }), env);
  assert.equal(browserPull.status, 200);
  assert.deepEqual(await browserPull.json(), {
    name: "Tester",
    sets: [],
    ping: null,
    updated: env.NOW_MS,
    revision: 2,
    friends: [friendId]
  });

  const wrongOwner = await worker.fetch(makeRequest(`/lists/${readId}/owner`, {
    headers: { "X-Write-Key": "wrong-write-key-1234" }
  }), env);
  assert.equal(wrongOwner.status, 403);
});

test("a Hex Owl is assigned once only after a named profile saves a set", async () => {
  const env = makeOwlEnv();
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Night Owl", sets: [], physical: false })
  }), env);
  assert.equal(created.status, 201, await created.clone().text());
  const identity = await created.json();
  assert.equal(identity.owl, undefined);
  assert.equal(identity.isPhysical, false);

  const qualified = await worker.fetch(makeRequest(`/lists/${identity.readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": identity.writeKey },
    body: JSON.stringify({
      name: "Night Owl",
      sets: [QUALIFYING_SET],
      revision: 1,
      profileId: identity.profileId,
      profileKey: identity.profileKey
    })
  }), env);
  assert.equal(qualified.status, 200, await qualified.clone().text());
  const qualifiedBody = await qualified.json();
  assert.match(qualifiedBody.owl.seed, /^[0-9a-f]{32}$/);
  assert.equal(qualifiedBody.owl.version, 2);
  assert.equal(qualifiedBody.owl.number, 1);

  const renamed = await worker.fetch(makeRequest(`/lists/${identity.readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": identity.writeKey },
    body: JSON.stringify({
      name: "Renamed Owl",
      sets: [QUALIFYING_SET],
      revision: 2,
      profileId: identity.profileId,
      profileKey: identity.profileKey
    })
  }), env).then(response => response.json());
  assert.deepEqual(renamed.owl, qualifiedBody.owl);

  const publicBody = await worker.fetch(makeRequest(`/lists/${identity.readId}`), env).then(response => response.json());
  assert.deepEqual(publicBody.owl, qualifiedBody.owl);
  assert.equal(Object.hasOwn(publicBody, "profileId"), false);
  assert.equal(Object.hasOwn(publicBody, "profileKey"), false);
  assert.equal(Object.hasOwn(publicBody, "hexadex"), false);
});

test("V1 Owls regenerate as V2 across profile, Hexadex, physical tag, and public reads", async () => {
  const env = makeOwlEnv();
  const identity = await worker.fetch(makeRequest("/lists", {
    method: "POST", body: JSON.stringify({ name: "Migration Owl", sets: [QUALIFYING_SET], physical: true })
  }), env).then(response => response.json());
  const v1Owl = { ...identity.owl, version: 1 };

  const profileStorage = env.HEX_OWL_PROFILES.instances.get(identity.profileId).ctx.storage;
  const profile = await profileStorage.get("profile");
  profile.owl = v1Owl;
  await profileStorage.put("profile", profile);
  env.HEX_OWL_PROFILES.instances.get(identity.profileId).instance.record = structuredClone(profile);
  await profileStorage.put("hexadex:legacy", {
    readId: "ABCDEFGH",
    name: "Legacy friend",
    owl: v1Owl,
    firstCollectedAt: env.NOW_MS - 1,
    context: "Shambhala 2026",
    festivalYear: 2026,
    lastSyncedAt: env.NOW_MS - 1
  });

  const tagStorage = env.HEXLACES.instances.get(identity.readId).ctx.storage;
  const tag = await tagStorage.get("record");
  tag.owl = v1Owl;
  tag.list.owl = v1Owl;
  await tagStorage.put("record", tag);
  env.HEXLACES.instances.get(identity.readId).instance.record = structuredClone(tag);
  await env.LISTS.put(`list:${identity.readId}`, JSON.stringify({ ...tag.list, owl: v1Owl }));

  const publicOwl = await worker.fetch(makeRequest(`/lists/${identity.readId}`), env).then(response => response.json()).then(body => body.owl);
  assert.equal(publicOwl.version, 2);
  assert.equal(publicOwl.seed, v1Owl.seed);
  assert.equal(publicOwl.number, v1Owl.number);

  await worker.fetch(makeRequest(`/lists/${identity.readId}/owner`, {
    headers: { "X-Write-Key": identity.writeKey }
  }), env);

  const page = await worker.fetch(makeRequest(`/profiles/${identity.profileId}/hexadex`, {
    headers: { "X-Profile-Key": identity.profileKey }
  }), env).then(response => response.json());
  assert.equal(page.owl.version, 2);
  assert.equal(page.entries[0].owl.version, 2);
  assert.equal((await profileStorage.get("profile")).owl.version, 2);
  assert.equal((await profileStorage.get("hexadex:legacy")).owl.version, 2);
  assert.equal((await tagStorage.get("record")).owl.version, 2);
});

test("concurrent qualification allocates one stable Owl number and seed", async () => {
  const env = makeOwlEnv();
  const identity = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Concurrent Owl", sets: [], physical: false })
  }), env).then(response => response.json());
  const update = index => worker.fetch(makeRequest(`/lists/${identity.readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": identity.writeKey, "CF-Connecting-IP": `203.0.113.${70 + index}` },
    body: JSON.stringify({
      name: "Concurrent Owl",
      sets: [QUALIFYING_SET],
      revision: 1,
      profileId: identity.profileId,
      profileKey: identity.profileKey
    })
  }), env);
  const responses = await Promise.all([update(0), update(1)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const owner = await worker.fetch(makeRequest(`/lists/${identity.readId}/owner`, {
    headers: { "X-Write-Key": identity.writeKey }
  }), env).then(response => response.json());
  assert.equal(owner.owl.number, 1);
  const allocator = env.OWL_NUMBERS.instances.get("global").ctx.storage;
  assert.equal(await allocator.get("counter"), 1);
});

test("release keeps the user's Owl and reclaiming the Hexlace restores that same Owl", async () => {
  const env = makeOwlEnv();
  const original = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Returning Owl", sets: [QUALIFYING_SET], physical: true })
  }), env).then(response => response.json());
  assert.ok(original.owl);

  const released = await worker.fetch(makeRequest(`/lists/${original.readId}/release`, {
    method: "POST",
    headers: { "X-Write-Key": original.writeKey }
  }), env);
  assert.equal(released.status, 200, await released.clone().text());
  const publicReleased = await worker.fetch(makeRequest(`/lists/${original.readId}`), env).then(response => response.json());
  assert.equal(publicReleased.owl, undefined);
  assert.ok(publicReleased.claimToken);

  const reclaimed = await worker.fetch(makeRequest(`/lists/${original.readId}/claim`, {
    method: "POST",
    body: JSON.stringify({
      claimToken: publicReleased.claimToken,
      writeKey: "reclaimed-write-key-12345",
      scannedAt: env.NOW_MS,
      profileId: original.profileId,
      profileKey: original.profileKey
    })
  }), env);
  assert.equal(reclaimed.status, 200, await reclaimed.clone().text());
  assert.deepEqual((await reclaimed.json()).owl, original.owl);
  assert.equal(await env.OWL_NUMBERS.instances.get("global").ctx.storage.get("counter"), 1);
});

test("trading physical Hexlaces always trades their attached Hex Owls", async () => {
  const env = makeOwlEnv();
  const first = await worker.fetch(makeRequest("/lists", {
    method: "POST", body: JSON.stringify({ name: "Alex", sets: [QUALIFYING_SET], physical: true })
  }), env).then(response => response.json());
  const second = await worker.fetch(makeRequest("/lists", {
    method: "POST", body: JSON.stringify({ name: "Blair", sets: [QUALIFYING_SET], physical: true })
  }), env).then(response => response.json());
  assert.notEqual(first.owl.seed, second.owl.seed);

  const sharedLinkIsNotATap = await worker.fetch(makeRequest(`/lists/${first.readId}/trade`, {
    method: "POST", headers: { "X-Write-Key": first.writeKey }, body: JSON.stringify({ targetReadId: second.readId })
  }), env);
  assert.equal(sharedLinkIsNotATap.status, 403);

  await worker.fetch(makeRequest(`/lists/${first.readId}/trade`, {
    method: "POST", headers: { "X-Write-Key": first.writeKey }, body: JSON.stringify({ targetReadId: second.readId, targetTapToken: second.tapToken })
  }), env);
  await worker.fetch(makeRequest(`/lists/${second.readId}/trade`, {
    method: "POST", headers: { "X-Write-Key": second.writeKey }, body: JSON.stringify({ targetReadId: first.readId, targetTapToken: first.tapToken })
  }), env);
  await worker.fetch(makeRequest(`/lists/${first.readId}/trade/confirm`, {
    method: "POST", headers: { "X-Write-Key": first.writeKey }
  }), env);
  const finished = await worker.fetch(makeRequest(`/lists/${second.readId}/trade/confirm`, {
    method: "POST", headers: { "X-Write-Key": second.writeKey }
  }), env).then(response => response.json());
  assert.equal(finished.completed, true);
  assert.deepEqual(finished.owl, first.owl);

  const firstOwner = await worker.fetch(makeRequest(`/lists/${second.readId}/owner`, {
    headers: { "X-Write-Key": first.writeKey }
  }), env).then(response => response.json());
  const secondOwner = await worker.fetch(makeRequest(`/lists/${first.readId}/owner`, {
    headers: { "X-Write-Key": second.writeKey }
  }), env).then(response => response.json());
  assert.deepEqual(firstOwner.owl, second.owl);
  assert.deepEqual(secondOwner.owl, first.owl);
  const firstPhysicalTag = await worker.fetch(makeRequest(`/lists/${first.readId}`), env).then(response => response.json());
  const secondPhysicalTag = await worker.fetch(makeRequest(`/lists/${second.readId}`), env).then(response => response.json());
  assert.deepEqual(firstPhysicalTag.owl, first.owl);
  assert.deepEqual(secondPhysicalTag.owl, second.owl);
});

test("Hexadex collection requires a physical tap and preserves first-collected metadata", async () => {
  const env = makeOwlEnv();
  const collector = await worker.fetch(makeRequest("/lists", {
    method: "POST", body: JSON.stringify({ name: "Collector", sets: [QUALIFYING_SET], physical: false })
  }), env).then(response => response.json());
  const source = await worker.fetch(makeRequest("/lists", {
    method: "POST", body: JSON.stringify({ name: "Friend", sets: [QUALIFYING_SET], physical: true })
  }), env).then(response => response.json());

  const withoutTap = await worker.fetch(makeRequest(`/profiles/${collector.profileId}/hexadex`, {
    method: "POST",
    headers: { "X-Profile-Key": collector.profileKey },
    body: JSON.stringify({ readId: source.readId })
  }), env);
  assert.equal(withoutTap.status, 400);

  const firstCollectedAt = env.NOW_MS - 5000;
  const collected = await worker.fetch(makeRequest(`/profiles/${collector.profileId}/hexadex`, {
    method: "POST",
    headers: { "X-Profile-Key": collector.profileKey },
    body: JSON.stringify({ readId: source.readId, tapToken: source.tapToken, firstCollectedAt })
  }), env).then(response => response.json());
  assert.equal(collected.added, true);
  assert.equal(collected.entry.firstCollectedAt, firstCollectedAt);
  assert.equal(collected.entry.context, "Shambhala 2026");

  env.NOW_MS += 60_000;
  const duplicate = await worker.fetch(makeRequest(`/profiles/${collector.profileId}/hexadex`, {
    method: "POST",
    headers: { "X-Profile-Key": collector.profileKey },
    body: JSON.stringify({ readId: source.readId, tapToken: source.tapToken, firstCollectedAt: env.NOW_MS })
  }), env).then(response => response.json());
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.entry.firstCollectedAt, firstCollectedAt);

  const page = await worker.fetch(makeRequest(`/profiles/${collector.profileId}/hexadex?limit=24`, {
    headers: { "X-Profile-Key": collector.profileKey }
  }), env).then(response => response.json());
  assert.equal(page.total, 1);
  assert.equal(page.entries.length, 1);
  assert.deepEqual(page.entries[0].owl, source.owl);
});
