/**
 * State store abstraction used by matchmaking.
 *
 *  - RedisStore: production. Queues are Redis lists (LPOP/RPUSH are atomic,
 *    so concurrent instances can never pop the same waiter). Session state
 *    lives in hashes with TTL. This is what makes multi-instance deployments
 *    consistent.
 *  - MemoryStore: local development and automated tests (identical API).
 */
import Redis from "ioredis";

function roomDataFromRedis(raw) {
  if (!raw) return null;
  const data = JSON.parse(raw);
  const entries = (value) => Array.isArray(value) ? value : Object.entries(value || {});
  return {
    ...data,
    members: new Map(entries(data.members)),
    pending: new Map(entries(data.pending)),
  };
}

function roomDataToRedis(data) {
  return JSON.stringify({
    ...data,
    members: [...data.members.entries()],
    pending: [...data.pending.entries()],
  });
}

export class MemoryStore {
  constructor() {
    this.mode = "memory";
    this.queues = { video: new Map(), text: new Map() }; // id -> ts, insertion order = FIFO
    this.queuesTs = { video: new Map(), text: new Map() };
    this.matches = new Map(); // matchId -> { a, b, mode, ts }
    this.matchBySocket = new Map(); // socketId -> matchId
    this.counters = new Map();
    this.prefs = new Map(); // socketId -> { prefs, expanded, expiresAt }
    // Private-room state (mirrors Redis: roomMeta + roomMembers + token table).
    this.rooms = new Map(); // roomId -> meta
    this.roomMembers = new Map(); // roomId -> { host, members: Set, pending: Map, locked: bool, ts }
    this.usernameIndex = new Map(); // lowercased username -> { username, socketId, expiresAt }
    this.codeAttempts = new Map(); // ipKey -> { count, resetAt }
  }
  async init() {}
  async close() {}

  async queuePush(mode, id, ts) {
    this.queues[mode].set(id, ts);
  }
  async queuePop(mode) {
    const q = this.queues[mode];
    for (const [id, ts] of q) {
      q.delete(id);
      return { id, ts };
    }
    return null;
  }
  async queueRemove(mode, id) {
    this.queues[mode].delete(id);
  }
  async queueLength(mode) {
    return this.queues[mode].size;
  }
  /** Read the queue (oldest first) without removing — used by the preference-aware pairing scan. */
  async queuePeek(mode, limit = 200) {
    return [...this.queues[mode].keys()].slice(0, Math.max(1, limit));
  }
  /** Atomically claim one specific waiter (synchronous here → race-free within the process). */
  async queueClaim(mode, id) {
    const q = this.queues[mode];
    if (!q.has(id)) return null;
    const ts = q.get(id);
    q.delete(id);
    return { id, ts };
  }
  async queuePrune(mode, maxAgeMs) {
    const now = Date.now();
    let removed = 0;
    for (const [id, ts] of this.queues[mode]) {
      if (now - ts > maxAgeMs) {
        this.queues[mode].delete(id);
        removed++;
      }
    }
    return removed;
  }

  async matchSet(matchId, data, ttlMs) {
    this.matches.set(matchId, { ...data, expiresAt: Date.now() + ttlMs });
    this.matchBySocket.set(data.a, matchId);
    this.matchBySocket.set(data.b, matchId);
  }
  async matchGet(matchId) {
    const m = this.matches.get(matchId);
    if (!m) return null;
    if (m.expiresAt && m.expiresAt < Date.now()) {
      this.matches.delete(matchId);
      if (this.matchBySocket.get(m.a) === matchId) this.matchBySocket.delete(m.a);
      if (this.matchBySocket.get(m.b) === matchId) this.matchBySocket.delete(m.b);
      return null;
    }
    return m;
  }
  async matchDel(matchId) {
    const m = this.matches.get(matchId);
    this.matches.delete(matchId);
    if (m && this.matchBySocket.get(m.a) === matchId) this.matchBySocket.delete(m.a);
    if (m && this.matchBySocket.get(m.b) === matchId) this.matchBySocket.delete(m.b);
  }
  async matchForSocket(socketId) {
    const matchId = this.matchBySocket.get(socketId);
    if (!matchId) return null;
    return await this.matchGet(matchId) ? matchId : null;
  }
  async matchCount() {
    const now = Date.now();
    let n = 0;
    for (const m of this.matches.values()) if (!m.expiresAt || m.expiresAt > now) n++;
    return n;
  }
  async matchPrune(maxAgeMs) {
    const now = Date.now();
    let removed = 0;
    for (const [id, m] of this.matches) {
      if (now - (m.ts || 0) > maxAgeMs) {
        this.matches.delete(id);
        if (this.matchBySocket.get(m.a) === id) this.matchBySocket.delete(m.a);
        if (this.matchBySocket.get(m.b) === id) this.matchBySocket.delete(m.b);
        removed++;
      }
    }
    return removed;
  }

  async counterAdd(key, delta) {
    this.counters.set(key, (this.counters.get(key) || 0) + delta);
    return this.counters.get(key);
  }
  async counterGet(key) {
    return this.counters.get(key) || 0;
  }

  async prefsSet(id, data, ttlMs) {
    this.prefs.set(id, {
      prefs: data.prefs,
      expanded: !!data.expanded,
      generation: data.generation || null,
      expiresAt: Date.now() + ttlMs,
    });
  }
  async prefsGet(id) {
    const p = this.prefs.get(id);
    if (!p) return null;
    if (p.expiresAt < Date.now()) {
      this.prefs.delete(id);
      return null;
    }
    return { prefs: p.prefs, expanded: p.expanded, generation: p.generation || null };
  }
  async prefsDel(id) {
    this.prefs.delete(id);
  }

  async roomSetMeta(id, meta, ttlMs) {
    this.rooms.set(id, { ...meta, expiresAt: Date.now() + ttlMs });
  }
  async roomGetMeta(id) {
    const meta = this.rooms.get(id);
    if (!meta) return null;
    if (meta.expiresAt && meta.expiresAt < Date.now()) {
      this.rooms.delete(id);
      this.roomMembers.delete(id);
      return null;
    }
    return meta;
  }
  async roomDelMeta(id) {
    this.rooms.delete(id);
    this.roomMembers.delete(id);
  }
  async roomCreate(id, hostSocketId, ttlMs) {
    this.roomMembers.set(id, {
      host: hostSocketId,
      members: new Map([[hostSocketId, { username: null, isHost: true, joinedAt: Date.now() }]]),
      pending: new Map(),
      locked: false,
      ts: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  }
  async roomGetMembers(id) {
    const members = this.roomMembers.get(id);
    if (!members) return null;
    if (members.expiresAt && members.expiresAt < Date.now()) {
      this.roomMembers.delete(id);
      this.rooms.delete(id);
      return null;
    }
    return members;
  }
  async roomAddMemberIfRoom(id, socketId, entry, max = 5) {
    const members = await this.roomGetMembers(id);
    if (!members) return null;
    if (members.members.has(socketId)) return members;
    if (members.members.size >= max) return null;
    members.members.set(socketId, entry);
    return members;
  }
  async roomRemoveMember(id, socketId) {
    const members = await this.roomGetMembers(id);
    if (!members) return null;
    members.members.delete(socketId);
    if (members.members.size === 0) {
      this.roomMembers.delete(id);
      this.rooms.delete(id);
      return { empty: true, m: null };
    }
    return { empty: false, m: members };
  }
  async roomSetLocked(id, locked) {
    const members = await this.roomGetMembers(id);
    if (!members) return null;
    members.locked = !!locked;
    return members;
  }
  async roomAddPending(id, requestId, info) {
    const members = await this.roomGetMembers(id);
    if (!members) return null;
    members.pending.set(requestId, info);
    return members;
  }
  async roomRemovePending(id, requestId) {
    const members = await this.roomGetMembers(id);
    if (!members) return null;
    return members.pending.delete(requestId);
  }
  async roomPendingGet(id, requestId) {
    const members = await this.roomGetMembers(id);
    return members?.pending.get(requestId) || null;
  }

  // ----- Username reservation (MemoryStore) -----
  async usernameReserve(lower, username, socketId, ttlMs) {
    const existing = this.usernameIndex.get(lower);
    if (existing && existing.expiresAt > Date.now() && existing.socketId !== socketId) return false;
    this.usernameIndex.set(lower, { username, socketId, expiresAt: Date.now() + ttlMs });
    return true;
  }
  async usernameGet(lower) {
    const r = this.usernameIndex.get(lower);
    if (!r) return null;
    if (r.expiresAt < Date.now()) {
      this.usernameIndex.delete(lower);
      return null;
    }
    return r;
  }
  async usernameRelease(socketId) {
    for (const [k, v] of this.usernameIndex) {
      if (v.socketId === socketId) this.usernameIndex.delete(k);
    }
  }

  // ----- Code-attempt rate limit (MemoryStore) -----
  async codeAttemptHit(ipKey, windowMs, max) {
    const now = Date.now();
    const e = this.codeAttempts.get(ipKey);
    if (!e || e.resetAt < now) {
      this.codeAttempts.set(ipKey, { count: 1, resetAt: now + windowMs });
      return { count: 1, limited: false, ttlMs: windowMs };
    }
    e.count += 1;
    return { count: e.count, limited: e.count > max, ttlMs: e.resetAt - now };
  }
}

export class RedisStore {
  constructor(url) {
    this.mode = "redis";
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    this.redis.on("error", (e) => console.error("[redis] error", e.message));
  }
  async init() {
    // wait for first ready
    if (this.redis.status !== "ready") {
      await new Promise((res, rej) => {
        this.redis.once("ready", res);
        this.redis.once("error", (e) => rej(e));
        setTimeout(() => rej(new Error("redis connect timeout")), 10000).unref?.();
      });
    }
  }
  async close() {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  async queuePush(mode, id, ts) {
    const pipe = this.redis.pipeline();
    pipe.rpush(`queue:${mode}`, id);
    pipe.hset(`queue-ts:${mode}`, id, String(ts));
    pipe.pexpire(`queue-ts:${mode}`, 3600e3);
    await pipe.exec();
  }
  async queuePop(mode) {
    // LPOP is atomic — exactly one instance ever receives a given waiter.
    const id = await this.redis.lpop(`queue:${mode}`);
    if (!id) return null;
    const tsRaw = await this.redis.hget(`queue-ts:${mode}`, id);
    await this.redis.hdel(`queue-ts:${mode}`, id);
    return { id, ts: tsRaw ? parseInt(tsRaw, 10) : Date.now() };
  }
  async queueRemove(mode, id) {
    const pipe = this.redis.pipeline();
    pipe.lrem(`queue:${mode}`, 0, id);
    pipe.hdel(`queue-ts:${mode}`, id);
    await pipe.exec();
  }
  async queueLength(mode) {
    return this.redis.llen(`queue:${mode}`);
  }
  async queuePeek(mode, limit = 200) {
    return this.redis.lrange(`queue:${mode}`, 0, Math.max(1, limit) - 1);
  }
  /**
   * Atomically claim a specific waiter: LPOP entries until `id` is found
   * (re-pushing the non-matching ones), all inside one Lua script, so two
   * backend instances can never claim the same waiter.
   */
  async queueClaim(mode, id) {
    const res = await this.redis.eval(
      `
      local len = tonumber(redis.call('LLEN', KEYS[1]))
      local i = 0
      while i < len do
        i = i + 1
        local v = redis.call('LPOP', KEYS[1])
        if v == ARGV[1] then
          local ts = redis.call('HGET', KEYS[2], ARGV[1])
          redis.call('HDEL', KEYS[2], ARGV[1])
          return { ARGV[1], ts or '0' }
        end
        redis.call('RPUSH', KEYS[1], v)
      end
      return nil`,
      2,
      `queue:${mode}`,
      `queue-ts:${mode}`,
      id
    );
    if (!res) return null;
    return { id: res[0], ts: parseInt(res[1], 10) || Date.now() };
  }
  async queuePrune(mode, maxAgeMs) {
    const now = Date.now();
    const ids = await this.redis.lrange(`queue:${mode}`, 0, -1);
    let removed = 0;
    for (const id of ids) {
      const tsRaw = await this.redis.hget(`queue-ts:${mode}`, id);
      if (!tsRaw || now - parseInt(tsRaw, 10) > maxAgeMs) {
        await this.redis.lrem(`queue:${mode}`, 0, id);
        await this.redis.hdel(`queue-ts:${mode}`, id);
        removed++;
      }
    }
    return removed;
  }

  async matchSet(matchId, data, ttlMs) {
    const pipe = this.redis.pipeline();
    pipe.hset(
      `match:${matchId}`,
      "a",
      data.a,
      "b",
      data.b,
      "mode",
      data.mode,
      "ts",
      String(data.ts || Date.now()),
      "aGeneration",
      String(data.aGeneration || ""),
      "bGeneration",
      String(data.bGeneration || "")
    );
    pipe.pexpire(`match:${matchId}`, ttlMs);
    pipe.set(`match:user:${data.a}`, matchId, "PX", ttlMs);
    pipe.set(`match:user:${data.b}`, matchId, "PX", ttlMs);
    pipe.incr("matchcount");
    await pipe.exec();
  }
  async matchGet(matchId) {
    const h = await this.redis.hgetall(`match:${matchId}`);
    if (!h || !h.a || !h.b) return null;
    return {
      a: h.a,
      b: h.b,
      mode: h.mode,
      ts: h.ts ? parseInt(h.ts, 10) : 0,
      aGeneration: h.aGeneration || null,
      bGeneration: h.bGeneration || null,
    };
  }
  async matchDel(matchId) {
    await this.redis.eval(
      `
      local a = redis.call('HGET', KEYS[1], 'a')
      local b = redis.call('HGET', KEYS[1], 'b')
      if not a then return 0 end
      redis.call('DEL', KEYS[1])
      if redis.call('GET', 'match:user:' .. a) == ARGV[1] then redis.call('DEL', 'match:user:' .. a) end
      if redis.call('GET', 'match:user:' .. b) == ARGV[1] then redis.call('DEL', 'match:user:' .. b) end
      redis.call('DECR', 'matchcount')
      return 1`,
      1,
      `match:${matchId}`,
      matchId
    );
  }
  async matchForSocket(socketId) {
    const matchId = await this.redis.get(`match:user:${socketId}`);
    if (!matchId || !await this.matchGet(matchId)) return null;
    return matchId;
  }
  async matchCount() {
    const n = await this.redis.get("matchcount");
    return Math.max(0, n ? parseInt(n, 10) : 0);
  }
  async matchPrune(maxAgeMs) {
    // Matches carry a TTL anyway; the prune is a safety net for the counter.
    void maxAgeMs;
    return 0;
  }

  async counterAdd(key, delta) {
    return this.redis.incrby(key, delta);
  }
  async counterGet(key) {
    const n = await this.redis.get(key);
    return n ? parseInt(n, 10) : 0;
  }

  async prefsSet(id, data, ttlMs) {
    await this.redis.set(`prefs:${id}`, JSON.stringify({
      prefs: data.prefs,
      expanded: !!data.expanded,
      generation: data.generation || null,
    }), "PX", ttlMs);
  }
  async prefsGet(id) {
    const raw = await this.redis.get(`prefs:${id}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  async prefsDel(id) {
    await this.redis.del(`prefs:${id}`);
  }

  // ----- Code-attempt rate limit (atomic, Redis) -----
  async codeAttemptHit(ipKey, windowMs, max) {
    const lua = [
      "local n = redis.call('INCR', KEYS[1])",
      "if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
      "local ttl = redis.call('PTTL', KEYS[1])",
      "if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end",
      "if n > tonumber(ARGV[2]) then return { n, 1, ttl } end",
      "return { n, 0, ttl }"
    ].join("\n");
    const [count, limited, ttlMs] = await this.redis.eval(
      lua, 1, `code-attempt:${ipKey}`, windowMs, max
    );
    return { count: Number(count), limited: Number(limited) === 1, ttlMs: Number(ttlMs) };
  }

  // ---------------------------------------------------------------------
  // Private room primitives
  // ---------------------------------------------------------------------

  async roomSetMeta(id, meta, ttlMs) {
    const key = `room:${id}:meta`;
    const existing = await this.roomGetMeta(id);
    const { expiresAt, ...metadata } = existing || {};
    const merged = { ...metadata };
    for (const [name, value] of Object.entries(meta)) {
      if (value !== undefined) merged[name] = value;
    }
    await this.redis.set(key, JSON.stringify(merged), "PX", ttlMs);
    return { ...merged, expiresAt: Date.now() + ttlMs };
  }
  async roomGetMeta(id) {
    const [raw, ttlMs] = await Promise.all([
      this.redis.get(`room:${id}:meta`),
      this.redis.pttl(`room:${id}:meta`),
    ]);
    if (!raw) return null;
    return { ...JSON.parse(raw), expiresAt: ttlMs > 0 ? Date.now() + ttlMs : undefined };
  }
  async roomDelMeta(id) {
    await this.redis.del(`room:${id}:meta`, `room:${id}:members`);
  }

  async roomCreate(id, hostSocketId, ttlMs) {
    const members = {
      host: hostSocketId,
      members: new Map([[hostSocketId, { username: null, isHost: true, joinedAt: Date.now() }]]),
      pending: new Map(),
      locked: false,
      ts: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    await this.redis.set(`room:${id}:members`, roomDataToRedis(members), "PX", ttlMs);
  }
  async roomGetMembers(id) {
    const key = `room:${id}:members`;
    const [raw, ttlMs] = await Promise.all([this.redis.get(key), this.redis.pttl(key)]);
    const m = roomDataFromRedis(raw);
    if (!m) return null;
    m.expiresAt = ttlMs > 0 ? Date.now() + ttlMs : undefined;
    return m;
  }
  async roomAddMemberIfRoom(id, socketId, entry, max = 5) {
    const key = `room:${id}:members`;
    const result = await this.redis.eval(
      `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return false end
      local data = cjson.decode(raw)
      for _, member in ipairs(data.members) do
        if member[1] == ARGV[1] then return raw end
      end
      if #data.members >= tonumber(ARGV[3]) then return false end
      table.insert(data.members, { ARGV[1], cjson.decode(ARGV[2]) })
      redis.call('SET', KEYS[1], cjson.encode(data), 'PX', redis.call('PTTL', KEYS[1]))
      return cjson.encode(data)`,
      1,
      key,
      socketId,
      JSON.stringify(entry),
      max
    );
    return roomDataFromRedis(result);
  }
  async roomRemoveMember(id, socketId) {
    const result = await this.redis.eval(
      `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return false end
      local data = cjson.decode(raw)
      local members = {}
      for _, member in ipairs(data.members) do
        if member[1] ~= ARGV[1] then table.insert(members, member) end
      end
      data.members = members
      if #members == 0 then
        redis.call('DEL', KEYS[1], KEYS[2])
        return cjson.encode({ empty = true })
      end
      redis.call('SET', KEYS[1], cjson.encode(data), 'PX', redis.call('PTTL', KEYS[1]))
      return cjson.encode({ empty = false, data = data })`,
      2,
      `room:${id}:members`,
      `room:${id}:meta`,
      socketId
    );
    if (!result) return null;
    const parsed = JSON.parse(result);
    return { empty: parsed.empty, m: parsed.data ? roomDataFromRedis(JSON.stringify(parsed.data)) : null };
  }
  async roomSetLocked(id, locked) {
    const result = await this.redis.eval(
      `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return false end
      local data = cjson.decode(raw)
      data.locked = ARGV[1] == '1'
      redis.call('SET', KEYS[1], cjson.encode(data), 'PX', redis.call('PTTL', KEYS[1]))
      return cjson.encode(data)`,
      1,
      `room:${id}:members`,
      locked ? "1" : "0"
    );
    return roomDataFromRedis(result);
  }

  async roomAddPending(id, requestId, info) {
    const result = await this.redis.eval(
      `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return false end
      local data = cjson.decode(raw)
      data.pending = data.pending or {}
      table.insert(data.pending, { ARGV[1], cjson.decode(ARGV[2]) })
      redis.call('SET', KEYS[1], cjson.encode(data), 'PX', redis.call('PTTL', KEYS[1]))
      return cjson.encode(data)`,
      1,
      `room:${id}:members`,
      requestId,
      JSON.stringify(info)
    );
    return roomDataFromRedis(result);
  }
  async roomRemovePending(id, requestId) {
    return (await this.redis.eval(
      `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return 0 end
      local data = cjson.decode(raw)
      local pending = {}
      local removed = 0
      for _, item in ipairs(data.pending or {}) do
        if item[1] == ARGV[1] then removed = 1 else table.insert(pending, item) end
      end
      if removed == 1 then
        data.pending = pending
        redis.call('SET', KEYS[1], cjson.encode(data), 'PX', redis.call('PTTL', KEYS[1]))
      end
      return removed`,
      1,
      `room:${id}:members`,
      requestId
    )) === 1;
  }
  async roomPendingGet(id, requestId) {
    const m = await this.roomGetMembers(id);
    return m?.pending.get(requestId) || null;
  }

  // ----- Username reservation (case-insensitive, TTL'd) -----
  async usernameReserve(lower, username, socketId, ttlMs) {
    const key = `username:${lower}`;
    const value = JSON.stringify({ username, socketId });
    if (await this.redis.set(key, value, "NX", "PX", ttlMs) === "OK") return true;
    const existing = await this.redis.get(key);
    if (!existing) return this.redis.set(key, value, "NX", "PX", ttlMs).then((result) => result === "OK");
    if (JSON.parse(existing).socketId !== socketId) return false;
    await this.redis.set(key, value, "PX", ttlMs);
    return true;
  }
  async usernameGet(lower) {
    const raw = await this.redis.get(`username:${lower}`);
    return raw ? JSON.parse(raw) : null;
  }
  async usernameRelease(socketId) {
    const stream = this.redis.scanStream({ match: "username:*", count: 100 });
    for await (const keys of stream) {
      for (const key of keys) {
        const raw = await this.redis.get(key);
        if (raw && JSON.parse(raw).socketId === socketId) await this.redis.del(key);
      }
    }
  }

}


export function createStore({ redisUrl, log }) {
  if (redisUrl) {
    log.info("Using Redis-backed state store (distributed matchmaking enabled)", { redisUrl: "[hidden]" });
    return new RedisStore(redisUrl);
  }
  log.warn("REDIS_URL not set — using in-memory state store (single instance, state lost on restart). Fine for local dev, NOT for production.");
  return new MemoryStore();
}
