const TTL_SECONDS = 60 * 24 * 60 * 60;
const HANDOFF_TTL_SECONDS = 24 * 60 * 60;
const CLAIM_CONTENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TRADE_TTL_MS = 15 * 60 * 1000;
const PROFILE_ID_LENGTH = 16;
const OWL_VERSION = 1;
const OWL_SEASON = 2026;
const HEXADEX_PAGE_SIZE = 24;

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

function namedStub(namespace, name) {
  if (typeof namespace.getByName === "function") return namespace.getByName(name);
  return namespace.get(namespace.idFromName(name));
}

function validList(value) {
  return value && typeof value === "object" && typeof value.name === "string" && Array.isArray(value.sets);
}

function validProfileCredentials(profileId, profileKey) {
  return typeof profileId === "string" && profileId.length === PROFILE_ID_LENGTH
    && typeof profileKey === "string" && profileKey.length >= 24;
}

function validOwl(value) {
  return value && typeof value === "object"
    && /^[0-9a-f]{32}$/i.test(value.seed || "")
    && Number.isSafeInteger(value.version) && value.version >= 1
    && Number.isSafeInteger(value.number) && value.number >= 1
    && Number.isSafeInteger(value.createdAt) && value.createdAt > 0
    && Number.isSafeInteger(value.season) && value.season >= 2026;
}

function randomHex(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function callProfile(env, profileId, path, body = {}) {
  if (!env?.HEX_OWL_PROFILES || !validProfileCredentials(profileId, body.profileKey)) return null;
  return namedStub(env.HEX_OWL_PROFILES, profileId).fetch(new Request(`https://profile.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, profileId })
  }));
}

async function adoptProfileOwl(env, profileId, profileKey, owl, claimedReadId, tradeId = "") {
  if (!validProfileCredentials(profileId, profileKey) || !validOwl(owl)) return false;
  const response = await callProfile(env, profileId, "/adopt", { profileKey, owl, claimedReadId, tradeId });
  return Boolean(response?.ok);
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
      if (Number.isFinite(this.record.expiresAt) && this.record.expiresAt <= now) {
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
          await this.ctx.storage.setAlarm(Number.isFinite(this.record.expiresAt)
            ? Math.min(this.record.expiresAt, now + 60_000)
            : now + 60_000);
          return;
        }
      }
      if (Number.isFinite(this.record.expiresAt)) await this.ctx.storage.setAlarm(this.record.expiresAt);
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
    if (this.record) {
      let upgradedLegacyRecord = false;
      this.record.handoffs ||= {};
      this.record.redirects ||= {};
      this.record.appliedTrades ||= {};
      this.record.profileId ||= null;
      this.record.profileKey ||= null;
      this.record.owl ||= null;
      this.record.tapToken ||= null;
      // Durable Object records created before virtual Hex Owl profiles existed
      // represented written NFC tags. A missing field must therefore stay
      // physical even when the tag was assigned directly rather than claimed.
      if (!Object.prototype.hasOwnProperty.call(this.record, "isPhysical")) {
        this.record.isPhysical = true;
        upgradedLegacyRecord = true;
      }
      if (!Object.prototype.hasOwnProperty.call(this.record, "trade")) this.record.trade = null;
      if (upgradedLegacyRecord) await this.ctx.storage.put("record", this.record);
    }
    this.sweepExpiredHandoffs();

    if (url.pathname === "/initialize" && request.method === "POST") return this.initialize(readId, body);
    if (!this.record) return json({ error: "Not found." }, 404);
    if (url.pathname === "/claim" && request.method === "POST") return this.claim(body);
    if (url.pathname === "/profile/link" && request.method === "POST") return this.linkProfile(body);
    if (url.pathname === "/physical" && request.method === "POST") return this.markPhysical(body);
    if (url.pathname === "/collect" && request.method === "POST") return this.readCollectible(body);
    if (url.pathname === "/update" && request.method === "POST") return this.update(body);
    if (url.pathname === "/handoff" && request.method === "POST") return this.createHandoff(body);
    if (url.pathname === "/redeem" && request.method === "POST") return this.redeemHandoff(body);
    if (url.pathname === "/release" && request.method === "POST") return this.release(body);
    if (url.pathname === "/trade" && request.method === "POST") return this.startTrade(body);
    if (url.pathname === "/trade/read" && request.method === "POST") return this.readTrade(body);
    if (url.pathname === "/trade/match" && request.method === "POST") return this.matchTrade(body);
    if (url.pathname === "/trade/confirm" && request.method === "POST") return this.confirmTrade(body);
    if (url.pathname === "/trade/settle" && request.method === "POST") return this.settleTrade(body);
    if (url.pathname === "/trade/apply" && request.method === "POST") return this.applyTrade(body);
    if (url.pathname === "/trade/cancel" && request.method === "POST") return this.cancelTrade(body);
    if (url.pathname === "/owner" && request.method === "POST") return this.readOwner(body);
    if (url.pathname === "/read" && request.method === "POST") return this.readPublic();
    return json({ error: "Not found." }, 404);
  }

  async ensureRecord(readId) {
    const now = nowMs(this.env);
    if (this.record && (!Number.isFinite(this.record.expiresAt) || this.record.expiresAt > now)) return;
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
      trade: null,
      redirects: {},
      appliedTrades: {},
      profileId: null,
      profileKey: null,
      owl: validOwl(list.owl) ? list.owl : null,
      tapToken: null,
      // Legacy lists did not distinguish a browser-only share identity from a
      // written NFC tag. Treat them as physical to preserve existing release
      // and trade behavior; the new client explicitly marks virtual records.
      isPhysical: true,
      expiresAt: null,
      snapshotDirty: false
    };
    await this.ctx.storage.put("record", this.record);
    if (Number.isFinite(this.record.expiresAt)) await this.ctx.storage.setAlarm(this.record.expiresAt);
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
      profileId: validProfileCredentials(body.profileId, body.profileKey) ? body.profileId : null,
      profileKey: validProfileCredentials(body.profileId, body.profileKey) ? body.profileKey : null,
      owl: validOwl(body.owl) ? body.owl : null,
      tapToken: typeof body.tapToken === "string" && body.tapToken.length >= 16 ? body.tapToken : null,
      isPhysical: typeof body.isPhysical === "boolean" ? body.isPhysical : true,
      handoffs: {},
      trade: null,
      redirects: {},
      appliedTrades: {},
      expiresAt: body.isPhysical === false ? now + TTL_SECONDS * 1000 : null,
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
    let replacedProfile = null;
    let previousOwl = null;
    if (accepted) {
      if (validProfileCredentials(this.record.profileId, this.record.profileKey)) {
        const sameProfile = body.profileId === this.record.profileId && body.profileKey === this.record.profileKey;
        if (!sameProfile) {
          replacedProfile = { profileId: this.record.profileId, profileKey: this.record.profileKey };
          previousOwl = validOwl(this.record.owl) ? this.record.owl : null;
          const detached = await callProfile(this.env, replacedProfile.profileId, "/release", {
            profileKey: replacedProfile.profileKey,
            readId: this.record.readId,
            owl: previousOwl
          });
          if (!detached?.ok) return json({ error: "The previous Hex Owl profile could not be safely detached. Try again." }, 503);
        }
      }
      this.record.auth = body.writeKey;
      this.record.profileId = validProfileCredentials(body.profileId, body.profileKey) ? body.profileId : null;
      this.record.profileKey = validProfileCredentials(body.profileId, body.profileKey) ? body.profileKey : null;
      this.record.owl = validOwl(body.owl) ? body.owl : null;
      this.record.isPhysical = true;
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
    const result = { ok: true, accepted, revision };
    if (validProfileCredentials(body.profileId, body.profileKey)) {
      Object.assign(result, { isPhysical: true, tapToken: this.record.tapToken, replacedProfile, previousOwl });
    }
    return json(result);
  }

  async linkProfile(body) {
    const redirect = await this.authRedirect(body.writeKey);
    if (redirect) return json({ transferredTo: redirect.readId, revision: redirect.revision }, 409);
    if (redirect === false) return json({ error: "Invalid write key." }, 403);
    if (!validProfileCredentials(this.record.profileId, this.record.profileKey)) {
      if (!validProfileCredentials(body.profileId, body.profileKey)) return json({ error: "Valid profile credentials are required." }, 400);
      this.record.profileId = body.profileId;
      this.record.profileKey = body.profileKey;
    }
    if (!this.record.tapToken) this.record.tapToken = randomHex(12);
    await this.saveRecord();
    return json({
      profileId: this.record.profileId,
      profileKey: this.record.profileKey,
      owl: validOwl(this.record.owl) ? this.record.owl : null,
      isPhysical: this.record.isPhysical === true,
      tapToken: this.record.tapToken || null
    });
  }

  async markPhysical(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    if (body.writeKey !== this.record.auth) return json({ error: "Invalid write key." }, 403);
    if (!this.record.tapToken) this.record.tapToken = randomHex(12);
    this.record.isPhysical = true;
    this.record.expiresAt = null;
    await this.commit();
    try {
      await adoptProfileOwl(this.env, this.record.profileId, this.record.profileKey, this.record.owl, this.record.readId);
    } catch (error) {
      console.error("Hex Owl profile reconciliation failed after writing a physical tag", error);
    }
    return json({ ok: true, isPhysical: true, tapToken: this.record.tapToken });
  }

  readCollectible(body) {
    if (!this.record.isPhysical || !this.record.tapToken || body.tapToken !== this.record.tapToken) {
      return json({ error: "A physical Hexlace tap is required." }, 403);
    }
    if (!this.record.auth || !validOwl(this.record.owl)) return json({ error: "This Hexlace does not have a Hex Owl yet." }, 409);
    return json({ readId: this.record.readId, name: this.record.list.name || "", owl: this.record.owl });
  }

  readPublic() {
    const releasedClaim = !this.record.auth && this.record.claim?.released === true && !this.record.claim.ownerSet
      ? this.record.claim.token
      : null;
    return json({ list: this.record.list, owl: validOwl(this.record.owl) ? this.record.owl : null, claimToken: releasedClaim });
  }

  async release(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    if (body.writeKey !== this.record.auth) return json({ error: "Invalid write key." }, 403);
    if (typeof body.claimToken !== "string" || body.claimToken.length < 12) return json({ error: "Invalid claim token." }, 400);
    if (validProfileCredentials(this.record.profileId, this.record.profileKey)) {
      const response = await callProfile(this.env, this.record.profileId, "/release", {
        profileKey: this.record.profileKey,
        readId: this.record.readId,
        owl: validOwl(this.record.owl) ? this.record.owl : null
      });
      if (!response?.ok) return json({ error: "The Hex Owl could not be safely detached. Try again." }, 503);
    }
    const revision = (Number.isSafeInteger(this.record.list.revision) ? this.record.list.revision : 1) + 1;
    this.record.list = { name: "Unclaimed Hexlace", sets: [], ping: null, friends: [], updated: nowMs(this.env), revision };
    this.record.auth = null;
    this.record.profileId = null;
    this.record.profileKey = null;
    this.record.owl = null;
    this.record.isPhysical = true;
    this.record.claim = { token: body.claimToken, released: true };
    this.record.handoffs = {};
    this.record.trade = null;
    await this.commit();
    return json({ ok: true, revision });
  }

  tradeActive() {
    return Boolean(this.record.trade && this.record.trade.expiresAt > nowMs(this.env));
  }

  async authRedirect(writeKey) {
    if (writeKey === this.record.auth) return null;
    if (typeof writeKey !== "string" || !writeKey) return false;
    const redirect = this.record.redirects?.[await tokenHash(writeKey)];
    return redirect || false;
  }

  async startTrade(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    if (body.writeKey !== this.record.auth) return json({ error: "Invalid write key." }, 403);
    if (!this.record.isPhysical) return json({ error: "Only physical Hexlaces can be traded." }, 409);
    if (typeof body.targetReadId !== "string" || body.targetReadId.length !== 8 || body.targetReadId === this.record.readId) {
      return json({ error: "Invalid trade target." }, 400);
    }
    this.record.trade = {
      targetReadId: body.targetReadId,
      startedAt: nowMs(this.env),
      expiresAt: nowMs(this.env) + TRADE_TTL_MS,
      matched: false,
      confirmed: false
    };
    await this.saveRecord();
    const response = await namedStub(this.env.HEXLACES, body.targetReadId).fetch(new Request("https://hexlace.internal/trade/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readId: body.targetReadId, requesterReadId: this.record.readId })
    }));
    const match = await response.json().catch(() => ({}));
    if (response.ok && match.matched) {
      this.record.trade.matched = true;
      await this.saveRecord();
    }
    return json({ matched: this.record.trade.matched, targetName: match.name || "" });
  }

  async matchTrade(body) {
    if (!this.record.isPhysical || !this.tradeActive() || this.record.trade.targetReadId !== body.requesterReadId) return json({ matched: false });
    this.record.trade.matched = true;
    await this.saveRecord();
    return json({ matched: true, name: this.record.list.name || "" });
  }

  async readTrade(body) {
    const redirect = await this.authRedirect(body.writeKey);
    if (redirect) return json({ transferredTo: redirect.readId, revision: redirect.revision }, 409);
    if (redirect === false) return json({ error: "Invalid write key." }, 403);
    if (!this.tradeActive()) return json({ active: false });
    return json({
      active: true,
      targetReadId: this.record.trade.targetReadId,
      matched: this.record.trade.matched,
      confirmed: this.record.trade.confirmed
    });
  }

  async confirmTrade(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    if (body.writeKey !== this.record.auth) return json({ error: "Invalid write key." }, 403);
    if (!this.tradeActive() || !this.record.trade.matched) return json({ error: "Trade is not matched." }, 409);
    this.record.trade.confirmed = true;
    await this.saveRecord();
    return json({ confirmed: true, targetReadId: this.record.trade.targetReadId });
  }

  async settleTrade() {
    if (!this.record.auth || !this.tradeActive() || !this.record.trade.matched || !this.record.trade.confirmed) {
      return json({ completed: false }, 202);
    }
    const targetReadId = this.record.trade.targetReadId;
    const tradeId = [this.record.readId, targetReadId].sort().join(":");
    if (this.record.readId !== tradeId.slice(0, tradeId.indexOf(":"))) return json({ error: "Wrong trade coordinator." }, 409);
    const selfRevision = Number.isSafeInteger(this.record.list.revision) ? this.record.list.revision : 1;
    const response = await namedStub(this.env.HEXLACES, targetReadId).fetch(new Request("https://hexlace.internal/trade/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        readId: targetReadId,
        requesterReadId: this.record.readId,
        requesterAuth: this.record.auth,
        requesterProfileId: this.record.profileId,
        requesterProfileKey: this.record.profileKey,
        tradeId
      })
    }));
    if (response.status === 202) return json({ completed: false }, 202);
    const applied = await response.json().catch(() => ({}));
    if (!response.ok || typeof applied.previousAuth !== "string") return json({ error: "Trade could not be completed." }, response.status || 409);
    const previousAuth = this.record.auth;
    this.record.auth = applied.previousAuth;
    this.record.profileId = applied.previousProfileId || null;
    this.record.profileKey = applied.previousProfileKey || null;
    this.record.redirects ||= {};
    this.record.redirects[await tokenHash(previousAuth)] = { readId: targetReadId, revision: applied.revision || 1 };
    this.record.trade = null;
    this.record.handoffs = {};
    await this.commit();
    try {
      await adoptProfileOwl(this.env, this.record.profileId, this.record.profileKey, this.record.owl, this.record.readId, tradeId);
    } catch (error) {
      console.error("Hex Owl profile reconciliation failed after trade", error);
    }
    return json({
      completed: true,
      coordinatorReadId: this.record.readId,
      targetReadId,
      selfRevision,
      targetRevision: applied.revision || 1,
      selfOwl: this.record.owl,
      targetOwl: applied.owl || null,
      selfTapToken: this.record.tapToken || null,
      targetTapToken: applied.tapToken || null
    });
  }

  async applyTrade(body) {
    this.record.appliedTrades ||= {};
    const prior = this.record.appliedTrades[body.tradeId];
    if (prior) return json(prior);
    if (!this.tradeActive() || !this.record.trade.matched || !this.record.trade.confirmed || this.record.trade.targetReadId !== body.requesterReadId) {
      return json({ pending: true }, 202);
    }
    if (typeof body.requesterAuth !== "string" || body.requesterAuth.length < 16) return json({ error: "Invalid trade owner." }, 400);
    const previousAuth = this.record.auth;
    const previousProfileId = this.record.profileId;
    const previousProfileKey = this.record.profileKey;
    const revision = Number.isSafeInteger(this.record.list.revision) ? this.record.list.revision : 1;
    this.record.auth = body.requesterAuth;
    this.record.profileId = validProfileCredentials(body.requesterProfileId, body.requesterProfileKey) ? body.requesterProfileId : null;
    this.record.profileKey = validProfileCredentials(body.requesterProfileId, body.requesterProfileKey) ? body.requesterProfileKey : null;
    this.record.redirects ||= {};
    this.record.redirects[await tokenHash(previousAuth)] = { readId: body.requesterReadId, revision };
    const result = { previousAuth, previousProfileId, previousProfileKey, revision, owl: this.record.owl, tapToken: this.record.tapToken || null };
    this.record.appliedTrades[body.tradeId] = result;
    this.record.trade = null;
    this.record.handoffs = {};
    await this.commit();
    try {
      await adoptProfileOwl(this.env, this.record.profileId, this.record.profileKey, this.record.owl, this.record.readId, body.tradeId);
    } catch (error) {
      console.error("Hex Owl profile reconciliation failed while applying trade", error);
    }
    return json(result);
  }

  async cancelTrade(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    if (body.writeKey !== this.record.auth) return json({ error: "Invalid write key." }, 403);
    this.record.trade = null;
    await this.saveRecord();
    return json({ ok: true });
  }

  async update(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    if (body.writeKey !== this.record.auth) return json({ error: "Invalid write key." }, 403);
    if (!validList(body.list)) return json({ error: "Invalid list." }, 400);

    const currentRevision = Number.isSafeInteger(this.record.list.revision) && this.record.list.revision > 0 ? this.record.list.revision : 1;
    if (body.hasRevision && body.revision !== currentRevision && body.force !== true) {
      return json({ error: "This Hexlace changed in another app.", currentRevision }, 409);
    }
    if (validProfileCredentials(body.profileId, body.profileKey)) {
      if (validProfileCredentials(this.record.profileId, this.record.profileKey)
        && (body.profileId !== this.record.profileId || body.profileKey !== this.record.profileKey)) {
        return json({ error: "This Hexlace is linked to another profile." }, 409);
      }
      this.record.profileId = body.profileId;
      this.record.profileKey = body.profileKey;
    }
    this.record.list = {
      ...body.list,
      friends: Array.isArray(body.list.friends)
        ? body.list.friends
        : (Array.isArray(this.record.list.friends) ? this.record.list.friends : []),
      revision: currentRevision + 1
    };
    if (validOwl(body.owl) && (!this.record.isPhysical || !validOwl(this.record.owl))) this.record.owl = body.owl;
    await this.commit();
    const result = { ok: true, updated: this.record.list.updated, revision: this.record.list.revision };
    if (validProfileCredentials(this.record.profileId, this.record.profileKey)) {
      Object.assign(result, { owl: this.record.owl, isPhysical: this.record.isPhysical, tapToken: this.record.tapToken });
    }
    return json(result);
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

  async readOwner(body) {
    if (!this.record.auth) return json({ error: "Not found." }, 404);
    const redirect = await this.authRedirect(body.writeKey);
    if (redirect) return json({ transferredTo: redirect.readId, revision: redirect.revision }, 409);
    if (redirect === false) return json({ error: "Invalid write key." }, 403);
    try {
      await adoptProfileOwl(this.env, this.record.profileId, this.record.profileKey, this.record.owl, this.record.readId);
    } catch (error) {
      console.error("Hex Owl profile reconciliation failed during owner sync", error);
    }
    return json({
      list: this.record.list,
      profileId: this.record.profileId,
      profileKey: this.record.profileKey,
      owl: validOwl(this.record.owl) ? this.record.owl : null,
      isPhysical: this.record.isPhysical === true,
      tapToken: this.record.tapToken || null
    });
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
      list: this.record.list,
      profileId: this.record.profileId,
      profileKey: this.record.profileKey,
      owl: validOwl(this.record.owl) ? this.record.owl : null,
      isPhysical: this.record.isPhysical === true,
      tapToken: this.record.tapToken || null
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
    if (Number.isFinite(this.record.expiresAt)) await this.ctx.storage.setAlarm(this.record.expiresAt);
  }

  async commit() {
    this.record.expiresAt = this.record.isPhysical ? null : nowMs(this.env) + TTL_SECONDS * 1000;
    this.record.snapshotDirty = true;
    await this.saveRecord();
    try {
      await this.syncKv();
      this.record.snapshotDirty = false;
      await this.saveRecord();
    } catch (error) {
      console.error("Hexlace KV snapshot write failed", error);
      await this.ctx.storage.setAlarm(Number.isFinite(this.record.expiresAt)
        ? Math.min(this.record.expiresAt, nowMs(this.env) + 60_000)
        : nowMs(this.env) + 60_000);
    }
  }

  async syncKv() {
    const options = { expirationTtl: TTL_SECONDS };
    const publicSnapshot = { ...this.record.list, ...(validOwl(this.record.owl) ? { owl: this.record.owl } : {}) };
    const writes = [this.env.LISTS.put(`list:${this.record.readId}`, JSON.stringify(publicSnapshot), options)];
    if (this.record.auth) writes.push(this.env.LISTS.put(`auth:${this.record.readId}`, this.record.auth, options));
    else writes.push(this.env.LISTS.delete(`auth:${this.record.readId}`));
    if (this.record.claim) writes.push(this.env.LISTS.put(`claim:${this.record.readId}`, JSON.stringify(this.record.claim), options));
    else writes.push(this.env.LISTS.delete(`claim:${this.record.readId}`));
    await Promise.all(writes);
  }
}

/**
 * One instance per user profile. Owl identity and Hexadex entries live here so
 * they survive a released physical tag, browser/app handoff, and future years.
 * Hexadex entries are stored separately and read in bounded pages.
 */
export class HexOwlProfile {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.record = null;
    this.queue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => {
      this.record = (await ctx.storage.get("profile")) || null;
    });
  }

  fetch(request) {
    const result = this.queue.then(() => this.handle(request));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async handle(request) {
    const url = new URL(request.url);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.profileId !== "string" || body.profileId.length !== PROFILE_ID_LENGTH) {
      return json({ error: "Invalid profile." }, 400);
    }
    if (url.pathname === "/initialize") return this.initialize(body);
    if (!this.record) return json({ error: "Profile not found." }, 404);
    if (!(await this.authorized(body.profileKey))) return json({ error: "Invalid profile key." }, 403);
    if (url.pathname === "/qualify") return this.qualify(body);
    if (url.pathname === "/adopt") return this.adopt(body);
    if (url.pathname === "/release") return this.release(body);
    if (url.pathname === "/read") return this.readProfile();
    if (url.pathname === "/hexadex/add") return this.addHexadex(body);
    if (url.pathname === "/hexadex/read") return this.readHexadex(body);
    return json({ error: "Not found." }, 404);
  }

  async authorized(profileKey) {
    if (typeof profileKey !== "string" || profileKey.length < 24) return false;
    return (await tokenHash(profileKey)) === this.record.authHash;
  }

  async initialize(body) {
    if (!validProfileCredentials(body.profileId, body.profileKey)) return json({ error: "Invalid profile credentials." }, 400);
    const authHash = await tokenHash(body.profileKey);
    if (this.record) return this.record.authHash === authHash ? json({ ok: true, owl: this.record.owl || null }) : json({ error: "Profile already exists." }, 409);
    this.record = {
      profileId: body.profileId,
      authHash,
      owl: null,
      claimedReadId: null,
      total: 0,
      createdAt: nowMs(this.env),
      updatedAt: nowMs(this.env),
      lastTradeId: ""
    };
    await this.ctx.storage.put("profile", this.record);
    return json({ ok: true, owl: null }, 201);
  }

  async qualify(body) {
    if (!this.record.owl && body.eligible === true) {
      if (!this.env?.OWL_NUMBERS) return json({ error: "Hex Owl numbering is unavailable." }, 503);
      const allocation = await namedStub(this.env.OWL_NUMBERS, "global").fetch(new Request("https://owl-number.internal/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: this.record.profileId })
      }));
      const allocated = await allocation.json().catch(() => ({}));
      if (!allocation.ok || !Number.isSafeInteger(allocated.number)) return json({ error: "Hex Owl numbering is unavailable." }, 503);
      this.record.owl = {
        seed: randomHex(16),
        version: OWL_VERSION,
        number: allocated.number,
        createdAt: nowMs(this.env),
        season: OWL_SEASON
      };
    }
    if (typeof body.claimedReadId === "string" && body.claimedReadId.length === 8) this.record.claimedReadId = body.claimedReadId;
    this.record.updatedAt = nowMs(this.env);
    await this.ctx.storage.put("profile", this.record);
    return json({ ok: true, owl: this.record.owl || null, claimedReadId: this.record.claimedReadId, total: this.record.total || 0 });
  }

  async adopt(body) {
    if (!validOwl(body.owl) || typeof body.claimedReadId !== "string" || body.claimedReadId.length !== 8) {
      return json({ error: "Invalid Hex Owl assignment." }, 400);
    }
    if (body.tradeId && body.tradeId === this.record.lastTradeId && this.record.claimedReadId === body.claimedReadId) {
      return json({ ok: true, owl: this.record.owl });
    }
    if (!body.tradeId && this.record.claimedReadId === body.claimedReadId
      && validOwl(this.record.owl) && this.record.owl.seed === body.owl.seed
      && this.record.owl.version === body.owl.version && this.record.owl.number === body.owl.number) {
      return json({ ok: true, owl: this.record.owl });
    }
    this.record.owl = body.owl;
    this.record.claimedReadId = body.claimedReadId;
    this.record.lastTradeId = typeof body.tradeId === "string" ? body.tradeId.slice(0, 80) : "";
    this.record.updatedAt = nowMs(this.env);
    await this.ctx.storage.put("profile", this.record);
    return json({ ok: true, owl: this.record.owl });
  }

  async release(body) {
    if (body.owl != null && !validOwl(body.owl)) return json({ error: "Invalid Hex Owl." }, 400);
    if (validOwl(body.owl)) this.record.owl = body.owl;
    if (!body.readId || this.record.claimedReadId === body.readId) this.record.claimedReadId = null;
    this.record.updatedAt = nowMs(this.env);
    await this.ctx.storage.put("profile", this.record);
    return json({ ok: true, owl: this.record.owl || null });
  }

  readProfile() {
    return json({ owl: this.record.owl || null, claimedReadId: this.record.claimedReadId, total: this.record.total || 0 });
  }

  async addHexadex(body) {
    const source = body.entry;
    if (!source || typeof source.readId !== "string" || source.readId.length !== 8 || !validOwl(source.owl)) {
      return json({ error: "Invalid Hexadex entry." }, 400);
    }
    // The collection is an Owl-dex, not a tag history. A released Hexlace may
    // later carry a different Owl, while the same Owl may later be reclaimed
    // onto another Hexlace; the globally unique Owl number is the stable key.
    const indexKey = `hexadex-owl:${source.owl.number}`;
    const priorKey = await this.ctx.storage.get(indexKey);
    const prior = priorKey ? await this.ctx.storage.get(priorKey) : null;
    const firstCollectedAt = prior?.firstCollectedAt || (Number.isSafeInteger(source.firstCollectedAt) && source.firstCollectedAt > 0 ? source.firstCollectedAt : nowMs(this.env));
    const entry = {
      readId: source.readId,
      name: typeof source.name === "string" ? source.name.trim().slice(0, 60) : "",
      owl: source.owl,
      firstCollectedAt,
      context: typeof source.context === "string" ? source.context.slice(0, 80) : `Shambhala ${source.owl.season}`,
      festivalYear: Number.isSafeInteger(source.festivalYear) ? source.festivalYear : source.owl.season,
      lastSyncedAt: nowMs(this.env)
    };
    const entryKey = priorKey || `hexadex:${String(Number.MAX_SAFE_INTEGER - Math.min(firstCollectedAt, Number.MAX_SAFE_INTEGER)).padStart(16, "0")}:${source.owl.number}`;
    const added = !priorKey;
    if (added) this.record.total = (this.record.total || 0) + 1;
    this.record.updatedAt = nowMs(this.env);
    await this.ctx.storage.put({ [entryKey]: entry, [indexKey]: entryKey, profile: this.record });
    return json({ added, entry, total: this.record.total || 0 });
  }

  async readHexadex(body) {
    const requested = Number(body.limit);
    const limit = Number.isSafeInteger(requested) ? Math.max(1, Math.min(48, requested)) : HEXADEX_PAGE_SIZE;
    const cursor = typeof body.cursor === "string" && body.cursor.startsWith("hexadex:") && body.cursor.length < 160 ? body.cursor : "";
    const records = await this.ctx.storage.list({ prefix: "hexadex:", ...(cursor ? { startAfter: cursor } : {}), limit: limit + 1 });
    const pairs = [...records.entries()];
    const visible = pairs.slice(0, limit);
    return json({
      entries: visible.map(([, entry]) => entry),
      total: this.record.total || 0,
      nextCursor: pairs.length > limit ? visible[visible.length - 1][0] : null,
      owl: this.record.owl || null
    });
  }
}

/** A single low-frequency allocator used only once per profile qualification. */
export class OwlNumberAllocator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = Promise.resolve();
  }

  fetch(request) {
    const result = this.queue.then(async () => {
      const body = await request.json().catch(() => null);
      const profileId = body && typeof body.profileId === "string" ? body.profileId : "";
      if (profileId.length !== PROFILE_ID_LENGTH) return json({ error: "Invalid profile." }, 400);
      const allocationKey = `allocation:${profileId}`;
      const existing = await this.ctx.storage.get(allocationKey);
      if (Number.isSafeInteger(existing) && existing > 0) return json({ number: existing });
      const next = (Number(await this.ctx.storage.get("counter")) || 0) + 1;
      await this.ctx.storage.put({ counter: next, [allocationKey]: next });
      return json({ number: next }, 201);
    });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
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
