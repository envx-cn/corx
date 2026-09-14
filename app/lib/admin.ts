import type { ApiKeyRow, Env } from "./types.js";
import { ProxyError } from "./types.js";
import { hashKey, newRawKey } from "./auth.js";
import { normalizeOriginsInput, parseOrigins } from "../proxy/cors.js";
import { normalizeCacheTtlInput } from "../proxy/cache.js";
import {
  assertInjectionParts,
  collectVarRefs,
  parseHostsInput,
  parseRulesInput,
  parseVarsInput,
  readStoredInjection,
  serializeInjection,
} from "../proxy/inject.js";
import type { InjectionParts } from "../proxy/inject.js";

// D1 query helpers shared by the /api/* file routes and the SSR console.
// (HTTP routes live in app/routes/api/; the proxy logger is lib/db.ts.)

// --- Shared D1 queries (also used by the SSR console) ---

export interface StatsTotals {
  requests: number;
  cached: number;
  avg_latency_ms: number;
  max_latency_ms: number;
  errors: number;
  req_bytes: number;
  res_bytes: number;
  /** Response bytes served from the R2 cache (= upstream bandwidth saved). */
  cached_bytes: number;
}

export interface Stats {
  totals: StatsTotals | null;
  byStatus: Array<{ status: number; n: number }>;
  topHosts: Array<{ target_host: string; n: number; bytes: number }>;
  topKeys: Array<{ id: string | null; name: string; n: number; bytes: number }>;
  byMethod: Array<{ method: string; n: number }>;
  byCountry: Array<{ country: string; n: number }>;
  hourly: HourlyPoint[];
  recentErrors: LogRow[];
}

export interface HourlyPoint {
  /** UTC hour bucket, "YYYY-MM-DDTHH" (matches substr(created_at,1,13)). */
  hour: string;
  requests: number;
  bytes: number;
}

/** Fill the last 24 hourly buckets (gaps → zeros). Exported for tests. */
export function fillHourly(
  rows: Array<{ hour: string; n: number; bytes: number | null }>,
  nowMs = Date.now(),
): HourlyPoint[] {
  const map = new Map(rows.map((r) => [r.hour, r]));
  const base = Math.floor(nowMs / 3_600_000) * 3_600_000;
  const out: HourlyPoint[] = [];
  for (let i = 23; i >= 0; i--) {
    const key = new Date(base - i * 3_600_000).toISOString().slice(0, 13);
    const r = map.get(key);
    out.push({ hour: key, requests: r?.n ?? 0, bytes: r?.bytes ?? 0 });
  }
  return out;
}

const SINCE_24H = `created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')`;

/**
 * Window boundary in the exact format rows are stored in
 * ("2026-09-11T07:03:27.562Z", see the migration's strftime default).
 *
 * Comparing against `datetime('now', …)` would be wrong: that returns
 * "2026-09-10 07:03:27" — a space instead of "T", no milliseconds — and
 * "…T…" sorts *after* "… …", so every row of the boundary's calendar day
 * would silently pass the filter (a 24h window counting up to 31h of rows).
 */
const ISO_SINCE = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`;

async function allOrEmpty<T>(db: D1Database, sql: string): Promise<T[]> {
  return db
    .prepare(sql)
    .all<T>()
    .then((r) => r.results)
    .catch(() => [] as T[]);
}

export async function queryStats(db: D1Database): Promise<Stats> {
  const [totals, byStatus, topHosts, topKeys, byMethod, byCountry, hourlyRows, recentErrors] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS requests,
                SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) AS cached,
                AVG(latency_ms) AS avg_latency_ms,
                MAX(latency_ms) AS max_latency_ms,
                SUM(CASE WHEN status >= 500 OR error != '' THEN 1 ELSE 0 END) AS errors,
                SUM(req_bytes) AS req_bytes,
                SUM(res_bytes) AS res_bytes,
                SUM(CASE WHEN cached = 1 THEN res_bytes ELSE 0 END) AS cached_bytes
         FROM request_logs WHERE ${SINCE_24H}`,
      )
      .first<StatsTotals>()
      .catch(() => null),
    allOrEmpty<{ status: number; n: number }>(
      db,
      `SELECT status, COUNT(*) AS n FROM request_logs WHERE ${SINCE_24H} GROUP BY status ORDER BY n DESC LIMIT 20`,
    ),
    allOrEmpty<{ target_host: string; n: number; bytes: number }>(
      db,
      `SELECT target_host, COUNT(*) AS n, SUM(res_bytes) AS bytes FROM request_logs
       WHERE ${SINCE_24H} AND target_host != '' GROUP BY target_host ORDER BY n DESC LIMIT 20`,
    ),
    allOrEmpty<{ id: string | null; name: string; n: number; bytes: number }>(
      db,
      `SELECT l.api_key_id AS id, COALESCE(k.name, '') AS name, COUNT(*) AS n, SUM(l.res_bytes) AS bytes
       FROM request_logs l LEFT JOIN api_keys k ON k.id = l.api_key_id
       WHERE l.${SINCE_24H} GROUP BY l.api_key_id ORDER BY bytes DESC LIMIT 10`,
    ),
    allOrEmpty<{ method: string; n: number }>(
      db,
      `SELECT method, COUNT(*) AS n FROM request_logs WHERE ${SINCE_24H} GROUP BY method ORDER BY n DESC`,
    ),
    allOrEmpty<{ country: string; n: number }>(
      db,
      `SELECT country, COUNT(*) AS n FROM request_logs WHERE ${SINCE_24H} GROUP BY country ORDER BY n DESC LIMIT 10`,
    ),
    allOrEmpty<{ hour: string; n: number; bytes: number }>(
      db,
      `SELECT substr(created_at, 1, 13) AS hour, COUNT(*) AS n, SUM(res_bytes) AS bytes
       FROM request_logs WHERE ${SINCE_24H} GROUP BY hour ORDER BY hour`,
    ),
    allOrEmpty<LogRow>(
      db,
      `SELECT id, created_at, method, target_host, status, latency_ms, country, cached, error, req_bytes, res_bytes
       FROM request_logs WHERE ${SINCE_24H} AND (status >= 500 OR error != '')
       ORDER BY created_at DESC, id DESC LIMIT 10`,
    ),
  ]);
  return {
    totals,
    byStatus,
    topHosts,
    topKeys,
    byMethod,
    byCountry,
    hourly: fillHourly(hourlyRows),
    recentErrors,
  };
}

export interface LogRow {
  id: number;
  created_at: string;
  method: string;
  target_host: string;
  status: number | null;
  latency_ms: number | null;
  country: string;
  cached: number;
  error: string;
  req_bytes: number;
  res_bytes: number | null;
}

export interface LogQuery {
  /** Row cap (default 50, max 200). */
  limit?: number;
  /** Only rows newer than N hours (1–168 = 7 days). Omit for no time filter. */
  hours?: number;
}

export async function queryLogs(db: D1Database, q: LogQuery = {}): Promise<LogRow[]> {
  const limit = Math.min(Math.max(Math.round(q.limit ?? 50) || 50, 1), 200);
  const hours =
    q.hours == null || !Number.isFinite(q.hours) ? null : Math.min(Math.max(Math.round(q.hours), 1), 168);
  const rows = await db
    .prepare(
      `SELECT id, created_at, method, target_host, status, latency_ms, country, cached, error, req_bytes, res_bytes
       FROM request_logs ${hours == null ? "" : `WHERE created_at > ${ISO_SINCE}`}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...(hours == null ? [limit] : [`-${hours} hours`, limit]))
    .all<LogRow>();
  return rows.results;
}

export interface KeyRow {
  id: string;
  name: string;
  rate_limit_per_min: number | null;
  allowed_origins: string | null;
  cache_ttl: number | null;
  no_cache: number;
  ip_check: number;
  dns_check: number;
  vars: string | null;
  header_rules: string | null;
  param_rules: string | null;
  allowed_hosts: string | null;
  keyless: number;
  tier: string;
  daily_limit_per_origin: number | null;
  daily_limit_per_host: number | null;
  daily_limit_total: number | null;
  created_at: string;
  revoked_at: string | null;
}

export async function queryKeys(db: D1Database): Promise<KeyRow[]> {
  const rows = await db
    .prepare(
      "SELECT id, name, rate_limit_per_min, allowed_origins, cache_ttl, no_cache, ip_check, dns_check, vars, header_rules, param_rules, allowed_hosts, keyless, tier, daily_limit_per_origin, daily_limit_per_host, daily_limit_total, created_at, revoked_at FROM api_keys ORDER BY created_at DESC",
    )
    .all<KeyRow>();
  return rows.results;
}

/** One key row by id (console playground selects a key without its raw value). */
export async function queryKeyById(db: D1Database, id: string): Promise<ApiKeyRow | null> {
  return db
    .prepare(
      "SELECT id, key_hash, name, rate_limit_per_min, allowed_origins, cache_ttl, no_cache, ip_check, dns_check, vars, header_rules, param_rules, allowed_hosts, keyless, tier, daily_limit_per_origin, daily_limit_per_host, daily_limit_total, created_at, revoked_at FROM api_keys WHERE id = ?",
    )
    .bind(id)
    .first<ApiKeyRow>();
}

/** Variable values never leave the server — mask them on every read path. */
export function redactKeyRow(k: KeyRow): KeyRow {
  return { ...k, vars: JSON.stringify(readStoredInjection(k).vars.map((v) => ({ name: v.name }))) };
}

/** Fields shared by key creation and updates (raw form/JSON values). */
export interface KeyInput {
  name: string;
  rateLimitPerMin?: number | null;
  /** Raw origins input ("" = inherit global). Validated + normalized. */
  allowedOrigins?: string;
  /** Raw TTL input ("" = inherit global, "0" = never store). Validated. */
  cacheTtl?: string;
  noCache?: boolean;
  /** Run the literal IP / internal-hostname guard (default true). */
  ipCheck?: boolean;
  /** Run the DoH resolve-and-classify check (default true). */
  dnsCheck?: boolean;
  /** Allowed origins may use this key without presenting it (keyless access). */
  keyless?: boolean;
  /** "standard" (default) or "public" — the shared, limited tier. */
  tier?: unknown;
  /** Public tier daily caps. "" / null = unlimited (except the total, required). */
  dailyLimitPerOrigin?: unknown;
  dailyLimitPerHost?: unknown;
  dailyLimitTotal?: unknown;
  /** Injection fields — raw textarea text or the array forms (see inject.ts). */
  vars?: unknown;
  headerRules?: unknown;
  paramRules?: unknown;
  allowedHosts?: unknown;
}

/** API keys need a name — it's the only human handle for the key. */
function normalizeName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (!name) throw new ProxyError(400, "Name is required");
  return name;
}

/** "standard" (default) or "public". */
function normalizeTier(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "" || raw === false) return "standard";
  if (raw === true) return "public";
  const tier = String(raw).trim().toLowerCase();
  if (tier === "standard" || tier === "public") return tier;
  throw new ProxyError(400, 'Tier must be "standard" or "public"');
}

/** Daily quota input: blank/null → null (no cap), a positive integer otherwise. */
function parseDailyLimit(raw: unknown, label: string): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 10_000_000) {
    throw new ProxyError(400, `Daily ${label} limit must be a positive integer (blank = unlimited)`);
  }
  return n;
}

/**
 * The public tier is deliberately a reduced product: no upstream injection, the
 * SSRF guards stay on, and it must carry a daily total cap — that cap is what
 * keeps the shared key's D1 writes under the platform budget (see quota.ts).
 */
function assertPublicPolicy(
  tier: string,
  injection: InjectionParts,
  ipCheck: number,
  dnsCheck: number,
  dailyLimitTotal: number | null,
): void {
  if (tier !== "public") return;
  if (injection.vars.length || injection.headers.length || injection.params.length || injection.hosts.length) {
    throw new ProxyError(400, "Public keys cannot inject upstream variables or rules");
  }
  if (ipCheck === 0 || dnsCheck === 0) {
    throw new ProxyError(400, "Public keys must keep the SSRF checks on");
  }
  if (!dailyLimitTotal) {
    throw new ProxyError(400, "Public keys need a daily total limit");
  }
}

/**
 * Merge the injection fields of an update with the stored parts. Untouched
 * fields keep their stored value, blank variable values keep the secret
 * (the console never renders values), and rules may not end up referencing a
 * variable that no longer exists.
 */
function buildInjection(
  input: Pick<KeyInput, "vars" | "headerRules" | "paramRules" | "allowedHosts">,
  previous: InjectionParts,
): InjectionParts {
  const vars = input.vars === undefined ? previous.vars : parseVarsInput(input.vars, previous.vars);
  const names = new Set(vars.map((v) => v.name));
  const headers =
    input.headerRules === undefined ? previous.headers : parseRulesInput(input.headerRules, "header", names);
  const params =
    input.paramRules === undefined ? previous.params : parseRulesInput(input.paramRules, "param", names);
  const hosts = input.allowedHosts === undefined ? previous.hosts : parseHostsInput(input.allowedHosts);

  for (const rule of [...headers, ...params]) {
    for (const ref of collectVarRefs(rule.value ?? "")) {
      if (!names.has(ref)) {
        throw new ProxyError(400, `Rule "${rule.name}" references \${${ref}}, which is not a configured variable`);
      }
    }
  }

  const parts = { vars, headers, params, hosts };
  assertInjectionParts(parts);
  return parts;
}

/**
 * Keyless access is a quota-binding convenience, not a credential: require
 * explicit origins (never "*") and keep the per-key SSRF opt-outs out of it.
 */
function keylessGrants(keyless: boolean, allowedOrigins: string, ipCheck: number, dnsCheck: number): string[] {
  if (!keyless) return [];
  const origins = parseOrigins(allowedOrigins);
  if (origins === null) {
    throw new ProxyError(400, "Keyless access requires explicit allowed origins (not blank)");
  }
  if (origins === "*") {
    throw new ProxyError(400, 'Keyless access requires explicit allowed origins — "*" would grant every site');
  }
  if (ipCheck === 0 || dnsCheck === 0) {
    throw new ProxyError(400, "Keyless access cannot disable the SSRF checks");
  }
  return origins;
}

interface GrantOwner {
  key_id: string;
  name: string | null;
}

/** An origin can be granted to exactly one key — say who holds it, don't steal it. */
async function assertOriginGrantsFree(db: D1Database, origins: string[], selfId: string): Promise<void> {
  for (const origin of origins) {
    const owner = await db
      .prepare(
        "SELECT o.key_id AS key_id, k.name AS name FROM keyless_origins o LEFT JOIN api_keys k ON k.id = o.key_id WHERE o.origin = ?",
      )
      .bind(origin)
      .first<GrantOwner>();
    if (owner && owner.key_id !== selfId) {
      throw new ProxyError(400, `Origin ${origin} is already granted to key "${owner.name ?? owner.key_id}"`);
    }
  }
}

/** Replace a key's grant rows ([] clears them, e.g. keyless turned off). */
async function writeOriginGrants(db: D1Database, keyId: string, origins: string[]): Promise<void> {
  await db.prepare("DELETE FROM keyless_origins WHERE key_id = ?").bind(keyId).run();
  for (const origin of origins) {
    await db.prepare("INSERT OR IGNORE INTO keyless_origins (origin, key_id) VALUES (?, ?)").bind(origin, keyId).run();
  }
}

export async function createApiKey(db: D1Database, input: KeyInput): Promise<{ id: string; key: string }> {
  const raw = newRawKey();
  const id = crypto.randomUUID();
  const allowedOrigins = normalizeOriginsInput(input.allowedOrigins ?? "");
  const ipCheck = input.ipCheck === false ? 0 : 1;
  const dnsCheck = input.dnsCheck === false ? 0 : 1;
  const keyless = input.keyless === true;
  const tier = normalizeTier(input.tier);
  const dailyLimitPerOrigin = parseDailyLimit(input.dailyLimitPerOrigin, "per-origin");
  const dailyLimitPerHost = parseDailyLimit(input.dailyLimitPerHost, "per-host");
  const dailyLimitTotal = parseDailyLimit(input.dailyLimitTotal, "total");
  const injection = buildInjection(input, { vars: [], headers: [], params: [], hosts: [] });
  const stored = serializeInjection(injection);
  const grants = keylessGrants(keyless, allowedOrigins ?? "", ipCheck, dnsCheck);
  assertPublicPolicy(tier, injection, ipCheck, dnsCheck, dailyLimitTotal);
  if (grants.length) await assertOriginGrantsFree(db, grants, id);

  await db
    .prepare(
      "INSERT INTO api_keys (id, key_hash, name, rate_limit_per_min, allowed_origins, cache_ttl, no_cache, ip_check, dns_check, vars, header_rules, param_rules, allowed_hosts, keyless, tier, daily_limit_per_origin, daily_limit_per_host, daily_limit_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      await hashKey(raw),
      normalizeName(input.name),
      input.rateLimitPerMin ?? null,
      allowedOrigins,
      normalizeCacheTtlInput(input.cacheTtl ?? ""),
      input.noCache ? 1 : 0,
      ipCheck,
      dnsCheck,
      stored.vars,
      stored.headerRules,
      stored.paramRules,
      stored.allowedHosts,
      keyless ? 1 : 0,
      tier,
      dailyLimitPerOrigin,
      dailyLimitPerHost,
      dailyLimitTotal,
    )
    .run();
  if (grants.length) await writeOriginGrants(db, id, grants);
  return { id, key: raw };
}

export interface KeyUpdate {
  name?: string;
  rateLimitPerMin?: number | null;
  /** Raw origins input ("" = inherit global). Validated + normalized. */
  allowedOrigins?: string;
  /** Raw TTL input ("" = inherit global, "0" = never store). Validated. */
  cacheTtl?: string;
  noCache?: boolean;
  ipCheck?: boolean;
  dnsCheck?: boolean;
  keyless?: boolean;
  /** "standard" | "public". */
  tier?: unknown;
  /** Public tier daily caps (undefined = leave unchanged). */
  dailyLimitPerOrigin?: unknown;
  dailyLimitPerHost?: unknown;
  dailyLimitTotal?: unknown;
  /** Injection fields — see KeyInput. */
  vars?: unknown;
  headerRules?: unknown;
  paramRules?: unknown;
  allowedHosts?: unknown;
}

/** The stored columns an update needs to merge against. */
interface CurrentKey {
  vars: string | null;
  header_rules: string | null;
  param_rules: string | null;
  allowed_hosts: string | null;
  keyless: number;
  allowed_origins: string | null;
  ip_check: number;
  dns_check: number;
  tier: string;
  daily_limit_per_origin: number | null;
  daily_limit_per_host: number | null;
  daily_limit_total: number | null;
}

export async function updateApiKey(db: D1Database, id: string, update: KeyUpdate): Promise<void> {
  const touchesInjection =
    update.vars !== undefined ||
    update.headerRules !== undefined ||
    update.paramRules !== undefined ||
    update.allowedHosts !== undefined;
  const touchesAuth =
    update.keyless !== undefined ||
    update.allowedOrigins !== undefined ||
    update.ipCheck !== undefined ||
    update.dnsCheck !== undefined;
  const touchesLimits =
    update.tier !== undefined ||
    update.dailyLimitPerOrigin !== undefined ||
    update.dailyLimitPerHost !== undefined ||
    update.dailyLimitTotal !== undefined;

  // Partial updates merge with the stored row: blank variable values keep the
  // secret, untouched injection fields stay, and keyless grants are re-derived.
  let current: CurrentKey | null = null;
  if (touchesInjection || touchesAuth || touchesLimits) {
    current = await db
      .prepare(
        "SELECT vars, header_rules, param_rules, allowed_hosts, keyless, allowed_origins, ip_check, dns_check, tier, daily_limit_per_origin, daily_limit_per_host, daily_limit_total FROM api_keys WHERE id = ?",
      )
      .bind(id)
      .first<CurrentKey>();
    if (!current) throw new ProxyError(404, "Key not found");
  }
  let parts: InjectionParts | null = current ? readStoredInjection(current) : null;

  const sets: string[] = [];
  const values: Array<string | number | null> = [];
  if (update.name !== undefined) {
    sets.push("name = ?");
    values.push(normalizeName(update.name));
  }
  if (update.rateLimitPerMin !== undefined) {
    sets.push("rate_limit_per_min = ?");
    values.push(update.rateLimitPerMin);
  }
  if (update.allowedOrigins !== undefined) {
    sets.push("allowed_origins = ?");
    values.push(normalizeOriginsInput(update.allowedOrigins));
  }
  if (update.cacheTtl !== undefined) {
    sets.push("cache_ttl = ?");
    values.push(normalizeCacheTtlInput(update.cacheTtl));
  }
  if (update.noCache !== undefined) {
    sets.push("no_cache = ?");
    values.push(update.noCache ? 1 : 0);
  }
  if (update.ipCheck !== undefined) {
    sets.push("ip_check = ?");
    values.push(update.ipCheck ? 1 : 0);
  }
  if (update.dnsCheck !== undefined) {
    sets.push("dns_check = ?");
    values.push(update.dnsCheck ? 1 : 0);
  }
  if (touchesInjection) {
    parts = buildInjection(update, readStoredInjection(current));
    const stored = serializeInjection(parts);
    sets.push("vars = ?", "header_rules = ?", "param_rules = ?", "allowed_hosts = ?");
    values.push(stored.vars, stored.headerRules, stored.paramRules, stored.allowedHosts);
  }
  if (update.tier !== undefined) {
    sets.push("tier = ?");
    values.push(normalizeTier(update.tier));
  }
  if (update.dailyLimitPerOrigin !== undefined) {
    sets.push("daily_limit_per_origin = ?");
    values.push(parseDailyLimit(update.dailyLimitPerOrigin, "per-origin"));
  }
  if (update.dailyLimitPerHost !== undefined) {
    sets.push("daily_limit_per_host = ?");
    values.push(parseDailyLimit(update.dailyLimitPerHost, "per-host"));
  }
  if (update.dailyLimitTotal !== undefined) {
    sets.push("daily_limit_total = ?");
    values.push(parseDailyLimit(update.dailyLimitTotal, "total"));
  }

  // Validate the keyless policy against the *effective* values (a guard toggle
  // alone can invalidate keyless), then sync the grant rows to match.
  let grants: string[] | null = null;
  if (touchesAuth && current) {
    const keyless = update.keyless !== undefined ? update.keyless === true : current.keyless === 1;
    const origins =
      update.allowedOrigins !== undefined
        ? normalizeOriginsInput(update.allowedOrigins) ?? ""
        : current.allowed_origins ?? "";
    const ipCheck = update.ipCheck !== undefined ? (update.ipCheck ? 1 : 0) : current.ip_check;
    const dnsCheck = update.dnsCheck !== undefined ? (update.dnsCheck ? 1 : 0) : current.dns_check;
    grants = keylessGrants(keyless, origins, ipCheck, dnsCheck);
    if (update.keyless !== undefined) {
      sets.push("keyless = ?");
      values.push(keyless ? 1 : 0);
    }
    if (grants.length) await assertOriginGrantsFree(db, grants, id);
  }

  // Public tier: validate against the *effective* values, so flipping a
  // standard key to public can't slip past with stored injection, the SSRF
  // guards off, or no total cap.
  if (current && (touchesInjection || touchesAuth || touchesLimits)) {
    const tier = update.tier !== undefined ? normalizeTier(update.tier) : current.tier;
    const ipCheck = update.ipCheck !== undefined ? (update.ipCheck ? 1 : 0) : current.ip_check;
    const dnsCheck = update.dnsCheck !== undefined ? (update.dnsCheck ? 1 : 0) : current.dns_check;
    const total =
      update.dailyLimitTotal !== undefined
        ? parseDailyLimit(update.dailyLimitTotal, "total")
        : current.daily_limit_total;
    assertPublicPolicy(tier, parts ?? readStoredInjection(current), ipCheck, dnsCheck, total);
  }

  if (sets.length === 0) return;
  const res = await db
    .prepare(`UPDATE api_keys SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();
  if ((res.meta?.changes ?? 0) === 0) throw new ProxyError(404, "Key not found");
  if (grants) await writeOriginGrants(db, id, grants);
}

export interface BlockedRow {
  hostname: string;
  reason: string;
  created_at: string;
}

export async function queryBlockedHosts(db: D1Database): Promise<BlockedRow[]> {
  const rows = await db
    .prepare("SELECT hostname, reason, created_at FROM blocked_hosts ORDER BY created_at DESC")
    .all<BlockedRow>();
  return rows.results;
}
