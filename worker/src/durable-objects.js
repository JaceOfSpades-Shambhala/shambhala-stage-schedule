const TTL_SECONDS = 60 * 24 * 60 * 60;
const HANDOFF_TTL_SECONDS = 24 * 60 * 60;
const CLAIM_CONTENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function nowMs(env) {
  return Number.isSafeInteger(env?.NOW_MS) ? env.NOW_MS : Date.now();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function parseClaimRecord(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && typeof parsed.token === "string") return parsed;
  } catch {}
  return { token: value };
}

async function tokenHash(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function validList(value) {
  return value && typeof value === "object" && typeof value.name === "string" && Array.isArray(value.sets);
}

/**
 * One instance is addressed by Hexlace readId. All ownership, list mutations,
 * and handoff redemption for that Hexlace pass through this instance, making
 * competing requests serial and strongly consistent. KV remains the public,
 * read-optimized snapshot used by friends' phones.
 */
export class HexlaceCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.record = null;
    this.queue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => {
      this.record = (await ctx.storage.get("record")) || null;
    });
  }

  fetch(request) {
    const result = this.queue.then(() => this.handle(request));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async alarm() {
    return this.serial(async () => {
      if (!this.record) return;
      const now = nowMs(this.env);
      if (this.record.expiresAt <= now) {
        this.record = null;
        await this.ctx.storage.deleteAll();
        return;
      }
      if (this.record.snapshotDirty) {
        try {
          await this.syncKv();
          this.record.snapshotDirty = false;
          await this.ctx.storage.put("record", this.record);
        } catch (error) {
          console.error("Hexlace KV snapshot retry failed", error);
          await this.ctx.storage.setAlarm(Math.min(this.record.expiresAt, now + 60_000));
          return;
        }
      }
      await this.ctx.storage.setAlarm(this.record.expiresAt);
    });
  }

  serial(operation) {
    const result = this.queue.then(operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async handle(request) {
    const url = new URL(request.url);
    const body = await request.json().catch(() => null);
    const readId = body && typeof body.readId === "string" ? body.readId : "";
    if (!readId) return json({ error: "Missing Hexlace id." }, 400);

    await this.ensureRecord(readId);
    this.sweepExpiredHandoffs();

    if (url.pathname === "/initialize" && request.method === "POST") return this.initialize(readId, body);
    if (!this.record) return json({ error: "Not found." }, 404);
    if (url.pathname === "/claim" && request.method === "POST") return this.claim(body);
    if (url.pathname === "/update" && request.method === "POST") return this.update(body);
    if (url.pathname === "/handoff" && request.method === "POST") return this.createHandoff(body);
    if (url.pathname === "/redeem" && request.method === "POST") return this.redeemHandoff(body);
    if (url.pathname === "/owner" && request.method === "POST") return this.readOwner(body);
    if (url.pathname === "/read" && request.method === "POST") return json({ list: this.record.list });
    return json({ error: "Not found." }, 404);
  }

  async ensureRecord(readId) {
    const now = nowMs(this.env);
    if (this.record && this.record.expiresAt > now) return;
    if (this.record) {
      this.record = null;
      await this.ctx.storage.deleteAll();
    }

    const [storedList, auth, claimValue] = await Promise.all([
      this.env.LISTS.get(`list:${readId}`),
      this.env.LISTS.get(`auth:${readId}`),
      this.env.LISTS.get(`claim:${readId}`)
    ]);
    if (!storedList) return;
    let list;
    try {
      list = JSON.parse(storedList);
    } catch {
      return;
    }
    if (!validList(list)) return;
    this.record = {
      readId,
      list,
      auth: auth || null,
      claim: parseClaimRecord(claimValue),
      handoffs: {},
      expiresAt: now + TTL_SECONDS * 1000,
      snapshotDirty: false
    };
    await this.ctx.storage.put("record", this.record);
    await this.ctx.storage.setAlarm(this.record.expiresAt);
  }

  async initialize(readId, body) {
    if (this.record) return json({ error: "Already exists." }, 409);
    if (!validList(body.list)) return json({ error: "Invalid list." }, 400);
    const now = nowMs(this.env);
    this.record = {
      readId,
      list: body.list,
      auth: typeof body.writeKey === "string" ? body.writeKey : null,
      claim: typeof body.claimToken === "string" ? { token: body.claimToken } : null,
      handoffs: {},
      expiresAt: now + TTL_SECONDS * 1000,
      snapshotDirty: false
    };
    await this.commit();
    return json({ ok: true }, 201);
  }

  async claim(body) {
    const claim = this.record.claim;
    if (!claim) return json({ error: "Not claimable." }, 409);
    if (body.claimToken !== claim.token) return json({ error: "Invalid claim token." }, 403);
    if (typeof body.writeKey !== "string" || body.writeKey.length < 16) return json({ error: "A valid write key is required." }, 400);

    const now = nowMs(this.env);
    const scannedAt = Number.isFinite(Number(body.scannedAt)) && Number(body.scannedAt) > 0 ? Number(body.scannedAt) : now;
    const previousScannedAt = Number.isFinite(Number(claim.scannedAt)) ? Number(claim.scannedAt) : Infinity;
    const firstClaimedAt = Number.isFinite(Number(claim.claimedAt)) ? Number(claim.claimedAt) : null;
    const contentionOpen = firstClaimedAt === null || now - firstClaimedAt < CLAIM_CONTENTION_WINDOW_MS;
    const accepted = !claim.ownerSet || (contentionOpen && scannedAt <= previousScannedAt);
    if (accepted) {
      this.record.auth = body.writeKey;
      // A takeover invalidates tickets created by the temporary owner so an
      // old installed context can never redeem the rightful owner's new key.
      this.record.handoffs = {};
      this.record.claim = {
        token: claim.token,
        scannedAt,
        claimedAt: firstClaimedAt ?? now,
        ownerSet: true
      };
      await this.commit();
    }
    const revision = Number.isSafeInteger(this.record.list.revision) && this.record.list.revision > 0 ? this.record.list.revision : 1;
    return json({ ok: true, accepted, revision });
  }

  async update(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    if (body.writeKey !== this.record.auth) return json({ error: "Invalid write key." }, 403);
    if (!validList(body.list)) return json({ error: "Invalid list." }, 400);

    const currentRevision = Number.isSafeInteger(this.record.list.revision) && this.record.list.revision > 0 ? this.record.list.revision : 1;
    if (body.hasRevision && body.revision !== currentRevision && body.force !== true) {
      return json({ error: "This Hexlace changed in another app.", currentRevision }, 409);
    }
    this.record.list = {
      ...body.list,
      friends: Array.isArray(body.list.friends)
        ? body.list.friends
        : (Array.isArray(this.record.list.friends) ? this.record.list.friends : []),
      revision: currentRevision + 1
    };
    await this.commit();
    return json({ ok: true, updated: this.record.list.updated, revision: this.record.list.revision });
  }

  async createHandoff(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    if (body.writeKey !== this.record.auth) return json({ error: "Invalid write key." }, 403);
    if (typeof body.token !== "string" || body.token.length < 17) return json({ error: "Invalid handoff token." }, 400);
    const hash = await tokenHash(body.token);
    this.record.handoffs[hash] = { expiresAt: nowMs(this.env) + HANDOFF_TTL_SECONDS * 1000 };
    await this.saveRecord();
    return json({ ok: true }, 201);
  }

  readOwner(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    if (body.writeKey !== this.record.auth) return json({ error: "Invalid write key." }, 403);
    return json({ list: this.record.list });
  }

  async redeemHandoff(body) {
    if (typeof body.token !== "string" || typeof body.redemptionId !== "string" || body.redemptionId.length < 16) {
      return json({ error: "Invalid or expired handoff." }, 410);
    }
    const hash = await tokenHash(body.token);
    const handoff = this.record.handoffs[hash];
    if (!handoff || handoff.expiresAt <= nowMs(this.env)) return json({ error: "Invalid or expired handoff." }, 410);
    if (handoff.redemptionId && handoff.redemptionId !== body.redemptionId) return json({ error: "Invalid or expired handoff." }, 410);
    if (!this.record.auth) return json({ error: "Invalid or expired handoff." }, 410);
    if (!handoff.redemptionId) {
      handoff.redemptionId = body.redemptionId;
      await this.saveRecord();
    }
    return json({
      readId: this.record.readId,
      writeKey: this.record.auth,
      list: this.record.list
    });
  }

  sweepExpiredHandoffs() {
    if (!this.record?.handoffs) return;
    const now = nowMs(this.env);
    for (const [hash, handoff] of Object.entries(this.record.handoffs)) {
      if (!handoff || handoff.expiresAt <= now) delete this.record.handoffs[hash];
    }
  }

  async saveRecord() {
    await this.ctx.storage.put("record", this.record);
    await this.ctx.storage.setAlarm(this.record.expiresAt);
  }

  async commit() {
    this.record.expiresAt = nowMs(this.env) + TTL_SECONDS * 1000;
    this.record.snapshotDirty = true;
    await this.saveRecord();
    try {
      await this.syncKv();
      this.record.snapshotDirty = false;
      await this.saveRecord();
    } catch (error) {
      console.error("Hexlace KV snapshot write failed", error);
      await this.ctx.storage.setAlarm(Math.min(this.record.expiresAt, nowMs(this.env) + 60_000));
    }
  }

  async syncKv() {
    const options = { expirationTtl: TTL_SECONDS };
    const writes = [this.env.LISTS.put(`list:${this.record.readId}`, JSON.stringify(this.record.list), options)];
    if (this.record.auth) writes.push(this.env.LISTS.put(`auth:${this.record.readId}`, this.record.auth, options));
    else writes.push(this.env.LISTS.delete(`auth:${this.record.readId}`));
    if (this.record.claim) writes.push(this.env.LISTS.put(`claim:${this.record.readId}`, JSON.stringify(this.record.claim), options));
    else writes.push(this.env.LISTS.delete(`claim:${this.record.readId}`));
    await Promise.all(writes);
  }
}

/** Atomic fixed-window limiter. One instance is addressed by limit kind + id. */
export class RateLimitCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.bucket = null;
    this.queue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => {
      this.bucket = (await ctx.storage.get("bucket")) || null;
    });
  }

  fetch(request) {
    const result = this.queue.then(async () => {
      const body = await request.json().catch(() => null);
      if (!body || !Number.isSafeInteger(body.slot) || !Number.isSafeInteger(body.limit) || body.limit < 1) {
        return json({ error: "Invalid rate limit." }, 400);
      }
      if (!this.bucket || this.bucket.slot !== body.slot) this.bucket = { slot: body.slot, count: 0 };
      if (this.bucket.count >= body.limit) return json({ ok: false });
      this.bucket.count += 1;
      await this.ctx.storage.put("bucket", this.bucket);
      if (Number.isSafeInteger(body.expiresAt)) await this.ctx.storage.setAlarm(body.expiresAt);
      return json({ ok: true });
    });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async alarm() {
    this.bucket = null;
    await this.ctx.storage.deleteAll();
  }
}

export { CLAIM_CONTENTION_WINDOW_MS, HANDOFF_TTL_SECONDS };
