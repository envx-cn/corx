import type { Child } from "hono/jsx";
import type { Env } from "../../../lib/types.js";
import type { KeyRow, KeyUpdate } from "../../../lib/admin.js";
import { effectiveOrigins } from "../../../proxy/cors.js";
import { num } from "../../../lib/utils.js";
import type { TFunc } from "../../../lib/i18n/locale.js";

/**
 * The policy half of a key, shared by the create page and the key page. Raw
 * strings only — the server reads the same shape off the request body and
 * echoes it back when a save fails, so a page re-renders with exactly what was
 * typed. Injection is its own form on its own endpoint (the key page), so
 * nothing here can clear it.
 */
export interface KeyFormValues {
  name: string;
  rateLimitPerMin: string;
  allowedOrigins: string;
  cacheTtl: string;
  noCache: boolean;
  ipCheck: boolean;
  dnsCheck: boolean;
  keyless: boolean;
  /** Public tier: the shared, limited key for the hosted instance. */
  tier: boolean;
  dailyLimitPerOrigin: string;
  dailyLimitPerHost: string;
  dailyLimitTotal: string;
}

/** An empty create form: the SSRF guards default on, like the fields render them. */
export function blankKeyForm(): KeyFormValues {
  return {
    name: "",
    rateLimitPerMin: "",
    allowedOrigins: "",
    cacheTtl: "",
    noCache: false,
    ipCheck: true,
    dnsCheck: true,
    keyless: false,
    tier: false,
    dailyLimitPerOrigin: "",
    dailyLimitPerHost: "",
    dailyLimitTotal: "",
  };
}

/**
 * Create-page presets (`?preset=`), as server-side pre-fills: the page opens
 * with them and nothing is saved until the operator creates the key. Only the
 * shapes this form can express — an upstream secret's hosts, variables and
 * rules live on the key's own page, once it exists.
 */
export function presetValues(name: string | undefined): KeyFormValues | undefined {
  const base = blankKeyForm();
  switch (name) {
    case "local":
      return { ...base, allowedOrigins: "http://localhost:*", keyless: true };
    case "public":
      return {
        ...base,
        tier: true,
        dailyLimitPerOrigin: "3000",
        dailyLimitPerHost: "5000",
        dailyLimitTotal: "15000",
      };
    default:
      return undefined;
  }
}

/** Read the create/edit key form. Values stay raw so the server can echo them back. */
export function readKeyForm(form: Record<string, unknown>): KeyFormValues {
  const on = (key: string) => String(form[key] ?? "") === "on";
  // The form sends a `checks` marker; posts without it (scripts, stale forms)
  // keep the guards on rather than silently turning them off.
  const panel = form["checks"] !== undefined;
  return {
    name: String(form["name"] ?? ""),
    rateLimitPerMin: String(form["rateLimitPerMin"] ?? ""),
    allowedOrigins: String(form["allowedOrigins"] ?? ""),
    cacheTtl: String(form["cacheTtl"] ?? ""),
    noCache: on("noCache"),
    ipCheck: panel ? on("ipCheck") : true,
    dnsCheck: panel ? on("dnsCheck") : true,
    keyless: on("keyless"),
    tier: on("tier"),
    dailyLimitPerOrigin: String(form["dailyLimitPerOrigin"] ?? ""),
    dailyLimitPerHost: String(form["dailyLimitPerHost"] ?? ""),
    dailyLimitTotal: String(form["dailyLimitTotal"] ?? ""),
  };
}

/** "120" → 120; blank → null (inherit the deployment default); junk → NaN.
 *
 * Junk must NOT collapse to null ("inherit"): a typo would silently switch
 * the key to the global default. NaN reaches the server-side validation
 * (admin.ts → parseRateLimit), which answers with a 400 and the form's error
 * box shows the reason.
 */
export function parseRate(raw: string): number | null {
  if (raw.trim() === "") return null;
  return Number(raw);
}

/** A stored key row as form values. */
export function valuesFromKeyRow(k: KeyRow): KeyFormValues {
  return {
    name: k.name,
    rateLimitPerMin: k.rate_limit_per_min != null ? String(k.rate_limit_per_min) : "",
    allowedOrigins: k.allowed_origins ?? "",
    cacheTtl: k.cache_ttl != null ? String(k.cache_ttl) : "",
    noCache: !!k.no_cache,
    ipCheck: !!k.ip_check,
    dnsCheck: !!k.dns_check,
    keyless: !!k.keyless,
    tier: k.tier === "public",
    dailyLimitPerOrigin: k.daily_limit_per_origin != null ? String(k.daily_limit_per_origin) : "",
    dailyLimitPerHost: k.daily_limit_per_host != null ? String(k.daily_limit_per_host) : "",
    dailyLimitTotal: k.daily_limit_total != null ? String(k.daily_limit_total) : "",
  };
}

/** The policy fields an update carries — never injection, so those stay untouched. */
export function policyUpdate(values: KeyFormValues): KeyUpdate {
  return {
    name: values.name,
    rateLimitPerMin: parseRate(values.rateLimitPerMin),
    allowedOrigins: values.allowedOrigins,
    cacheTtl: values.cacheTtl,
    noCache: values.noCache,
    ipCheck: values.ipCheck,
    dnsCheck: values.dnsCheck,
    keyless: values.keyless,
    tier: values.tier ? "public" : "standard",
    dailyLimitPerOrigin: values.dailyLimitPerOrigin,
    dailyLimitPerHost: values.dailyLimitPerHost,
    dailyLimitTotal: values.dailyLimitTotal,
  };
}

/**
 * The deployment defaults the form's "blank = …" lines report. Sourced from
 * the same env vars and helpers the proxy uses, so the two cannot drift.
 */
export function panelDefaults(env: Env): { rate: string; origins: string; ttl: string; publicTtl: string } {
  const origins = effectiveOrigins(env, null);
  return {
    rate: String(num(env.RATE_LIMIT_PER_MIN, 60)),
    origins: origins === "*" ? "*" : origins.join(", "),
    ttl: String(num(env.CACHE_TTL_SECONDS, 3600)),
    publicTtl: String(num(env.PUBLIC_CACHE_TTL_SECONDS, 300)),
  };
}

/** UI strings for the policy fields. */
export interface PolicyI18n {
  name: string;
  namePh: string;
  ratePerMin: string;
  ratePh: string;
  rateDefault: string;
  allowedOrigins: string;
  originsPh: string;
  originsDefault: string;
  keyless: string;
  keylessHint: string;
  cacheTtl: string;
  cacheTtlTitle: string;
  ttlPh: string;
  cacheDefault: string;
  noCache: string;
  noCacheShort: string;
  noCacheHint: string;
  checks: string;
  advanced: string;
  ipCheck: string;
  ipCheckHint: string;
  dnsCheck: string;
  dnsCheckHint: string;
  publicTier: string;
  publicTierHint: string;
  dailyLimits: string;
  dailyLimitPerOrigin: string;
  dailyLimitPerHost: string;
  dailyLimitTotal: string;
  dailyLimitPh: string;
}

export function policyLabels(
  t: TFunc,
  defaults: { rate: string; origins: string; ttl: string; publicTtl: string },
): PolicyI18n {
  return {
    name: t("console.keys.name"),
    namePh: t("console.keys.namePh"),
    ratePerMin: t("console.keys.ratePerMin"),
    ratePh: t("console.keys.ratePh"),
    rateDefault: t("console.keys.rateDefault", { value: defaults.rate }),
    allowedOrigins: t("console.keys.allowedOrigins"),
    originsPh: t("console.keys.originsPh"),
    originsDefault: t("console.keys.originsDefault", { value: defaults.origins }),
    keyless: t("console.keys.keyless"),
    keylessHint: t("console.keys.keylessHint"),
    cacheTtl: t("console.keys.cacheTtl"),
    cacheTtlTitle: t("console.keys.cacheTtlTitle"),
    ttlPh: t("console.keys.ttlPh"),
    cacheDefault: t("console.keys.cacheDefault", { ttl: defaults.ttl, publicTtl: defaults.publicTtl }),
    noCache: t("console.keys.noCache"),
    noCacheShort: t("console.keys.noCacheShort"),
    noCacheHint: t("console.keys.noCacheTitle"),
    checks: t("console.keys.checks"),
    advanced: t("console.keys.advanced"),
    ipCheck: t("console.keys.ipCheck"),
    ipCheckHint: t("console.keys.ipCheckHint"),
    dnsCheck: t("console.keys.dnsCheck"),
    dnsCheckHint: t("console.keys.dnsCheckHint"),
    publicTier: t("console.keys.publicTier"),
    publicTierHint: t("console.keys.publicTierHint"),
    dailyLimits: t("console.keys.dailyLimits"),
    dailyLimitPerOrigin: t("console.keys.dailyLimitPerOrigin"),
    dailyLimitPerHost: t("console.keys.dailyLimitPerHost"),
    dailyLimitTotal: t("console.keys.dailyLimitTotal"),
    dailyLimitPh: t("console.keys.dailyLimitPh"),
  };
}

function Field(props: { label: string; class?: string; children: Child }) {
  return (
    <label class={`form-control ${props.class ?? ""}`}>
      <div class="label pb-1">
        <span class="label-text">{props.label}</span>
      </div>
      {props.children}
    </label>
  );
}

/** One SSRF-guard switch: label + explanation on the left, toggle on the right. */
function Check(props: { name: string; label: string; hint: string; checked: boolean }) {
  return (
    <label class="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span class="block text-sm font-medium">{props.label}</span>
        <span class="block text-xs text-base-content/75">{props.hint}</span>
      </span>
      <input type="checkbox" name={props.name} value="on" class="toggle mt-0.5" checked={props.checked} />
    </label>
  );
}

/** The fast path: name, rate, who may call, keyless. */
export function PolicyBasics(props: { values: KeyFormValues; labels: PolicyI18n }) {
  const { values: v, labels } = props;
  return (
    <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      <Field label={labels.name}>
        <input
          name="name"
          value={v.name}
          placeholder={labels.namePh}
          class="input input-bordered w-full"
          required
          autofocus
        />
      </Field>
      <Field label={labels.ratePerMin}>
        <input
          name="rateLimitPerMin"
          value={v.rateLimitPerMin}
          placeholder={labels.ratePh}
          inputmode="numeric"
          class="input input-bordered w-full"
        />
        <p class="mt-1 text-xs text-base-content/75">{labels.rateDefault}</p>
      </Field>
      <Field label={labels.allowedOrigins} class="sm:col-span-2">
        <input
          name="allowedOrigins"
          value={v.allowedOrigins}
          placeholder={labels.originsPh}
          class="input input-bordered w-full"
        />
        <p class="mt-1 text-xs text-base-content/75">{labels.originsDefault}</p>
      </Field>
      <div class="sm:col-span-2 rounded-box border border-base-300 p-3">
        <Check name="keyless" label={labels.keyless} hint={labels.keylessHint} checked={v.keyless} />
      </div>
    </div>
  );
}

/** The rarely-touched half: cache, the SSRF checks and the public tier. */
export function PolicyAdvanced(props: { values: KeyFormValues; labels: PolicyI18n }) {
  const { values: v, labels } = props;
  return (
    <>
      <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label={labels.cacheTtl}>
          <input
            name="cacheTtl"
            value={v.cacheTtl}
            placeholder={labels.ttlPh}
            inputmode="numeric"
            title={labels.cacheTtlTitle}
            class="input input-bordered w-full"
          />
          <p class="mt-1 text-xs text-base-content/75">{labels.cacheDefault}</p>
        </Field>
        <Field label={labels.noCache}>
          <div class="flex h-10 items-center gap-2 text-sm text-base-content/75" title={labels.noCacheHint}>
            <input type="checkbox" name="noCache" value="on" class="checkbox" checked={v.noCache} />
            <span>{labels.noCacheShort}</span>
          </div>
        </Field>
        {/* Public tier: the shared key of a hosted instance. It ships with
            extra restrictions and daily quotas — see app/proxy/quota.ts. */}
        <div class="sm:col-span-2 rounded-box border border-base-300 p-3">
          <Check name="tier" label={labels.publicTier} hint={labels.publicTierHint} checked={v.tier} />
          <div class="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-3">
            <Field label={labels.dailyLimitPerOrigin}>
              <input
                name="dailyLimitPerOrigin"
                value={v.dailyLimitPerOrigin}
                placeholder={labels.dailyLimitPh}
                inputmode="numeric"
                class="input input-bordered w-full"
              />
            </Field>
            <Field label={labels.dailyLimitPerHost}>
              <input
                name="dailyLimitPerHost"
                value={v.dailyLimitPerHost}
                placeholder={labels.dailyLimitPh}
                inputmode="numeric"
                class="input input-bordered w-full"
              />
            </Field>
            <Field label={labels.dailyLimitTotal}>
              <input
                name="dailyLimitTotal"
                value={v.dailyLimitTotal}
                placeholder={labels.dailyLimitPh}
                inputmode="numeric"
                class="input input-bordered w-full"
              />
            </Field>
          </div>
          <p class="mt-2 text-xs text-base-content/75">{labels.dailyLimits}</p>
        </div>
      </div>
      <div class="mt-3 rounded-box border border-base-300 p-3">
        <div class="mb-2 text-xs font-medium uppercase tracking-wide text-base-content/75">{labels.checks}</div>
        <div class="space-y-3">
          <Check name="ipCheck" label={labels.ipCheck} hint={labels.ipCheckHint} checked={v.ipCheck} />
          <Check name="dnsCheck" label={labels.dnsCheck} hint={labels.dnsCheckHint} checked={v.dnsCheck} />
        </div>
      </div>
    </>
  );
}
