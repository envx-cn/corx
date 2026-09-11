/**
 * corx i18n dictionaries (en / zh).
 *
 * Nested objects, looked up by dot-path keys via t() in locale.ts. The `en`
 * dictionary is the source of truth for the key shape: `zh` must mirror it
 * exactly (type-checked by LocaleMessage/MessageKey).
 *
 * API error messages (app/proxy/*, app/lib/*) are intentionally NOT
 * internationalized — they're developer-facing wire formats.
 */

const en = {
  lang: {
    zh: "中文",
    en: "EN",
  },
  site: {
    openConsole: "Open console",
    tryIt: "Try it",
    features: "Features",
    tagline: "CORS proxy, served from the edge",
    console: "Console",
    copyright: "© {year} corx",
  },
  landing: {
    title: "corx — CORS proxy on Cloudflare",
    hero: {
      h1a: "Fetch any URL,",
      h1b: "without CORS.",
      sub: "corx is an edge CORS proxy. Prefix any URL and fetch it cross-origin — responses are cached at the edge, rate-limited, and guarded against SSRF.",
      tryLive: "Try it live",
      openConsole: "Open console",
    },
    tryit: {
      title: "Try it live",
      sub: "Examples rotate every 10s and load straight through the proxy. Type any URL to take over.",
      hint: "Same as GET {origin}/fetch?url=…. Every request goes through the edge proxy — watch the status, latency, size and cache HIT/MISS badges update as examples rotate.",
    },
    features: {
      title: "Everything you need at the edge",
      simple: {
        title: "Simple by design",
        desc: "One URL prefix works from any origin — no SDK, no config, no special headers.",
      },
      cached: {
        title: "Edge-cached",
        desc: "Responses are cached in R2 and served from the edge, with TTL control and a no-cache escape hatch.",
      },
      ssrf: {
        title: "SSRF-safe",
        desc: "Private ranges are blocked by default, and you can blocklist hosts from the console.",
      },
      keys: {
        title: "API keys",
        desc: "Per-key origins, rate limits and cache policy — revoke any key in one click.",
      },
      analytics: {
        title: "Usage analytics",
        desc: "Requests, traffic, latency and error rates, charted per hour inside the console.",
      },
      subdomain: {
        title: "Subdomain mode",
        desc: "Give every target its own host: example.com becomes example-com.your.host.",
      },
    },
    cta: {
      title: "Ship your first proxy call in 60 seconds",
      sub: "Head to the console, grab an API key, and start fetching.",
      btn: "Open console",
    },
  },
  notfound: {
    title: "404 — Not found · corx",
    h1: "404 — Page not found",
    sub: "We can't find the page you were looking for. It may have been moved, renamed, or never existed.",
    takeHome: "Take me home",
    openConsole: "Open console",
    noMatch: "No corx route matches {path}",
  },
  console: {
    nav: {
      overview: "Overview",
      keys: "API keys",
      logs: "Logs",
      blocked: "Blocklist",
    },
    title: {
      overview: "Overview",
      keys: "API keys",
      logs: "Logs",
      blocked: "Blocklist",
      profile: "Profile",
      billing: "Billing",
      login: "Sign in",
    },
    sidebar: {
      collapse: "Collapse sidebar",
    },
    topbar: {
      openSidebar: "Open sidebar",
      profile: "Profile",
      billing: "Billing",
      logout: "Log out",
      account: "Account",
      session: "Session",
    },
    overview: {
      last24h: "· last 24h",
      requests: "requests",
      trafficOut: "traffic out",
      servedFromCache: "served from cache ({hits} hits)",
      trafficIn: "traffic in",
      avgLatency: "avg latency (max {max} ms)",
      errorRate: "error rate ({n})",
      apiKeys: "API keys",
      blockedHosts: "blocked hosts",
      perHour: "Requests per hour",
      topHosts: "Top hosts",
      topKeys: "Top API keys by traffic",
      breakdown: "Breakdown",
      recentErrors: "Recent errors",
      host: "Host",
      key: "Key",
      requestsRight: "Requests",
      traffic: "Traffic",
      time: "Time",
      method: "Method",
      status: "Status",
      error: "Error",
      noData: "no data",
      none: "none 🎉",
      anonymous: "anonymous",
    },
    keys: {
      newKey: "New key created — copy it now, it won't be shown again.",
      createFailed: "Failed to create key",
      saveOriginsFailed: "Failed to save origins",
      saveCacheFailed: "Failed to save cache policy",
      name: "Name",
      ratePerMin: "Rate / min",
      allowedOrigins: "Allowed origins",
      cacheTtl: "Cache TTL (s)",
      noCache: "No-cache",
      create: "Create key",
      save: "Save",
      namePh: "my-app",
      ratePh: "120 (blank = default)",
      originsPh: "* or https://app.example (blank = global)",
      ttlPh: "blank = global",
      originsPhShort: "blank = global",
      cacheTtlTitle: "TTL seconds (blank = global, 0 = never store)",
      noCacheTitle: "Skip the R2 cache entirely for this key",
      noCacheValue: "no-cache",
      ttlValue: "TTL {ttl}s",
      global: "global",
      default: "default",
      headName: "Name",
      headRate: "Rate/min",
      headOrigins: "Allowed origins",
      headCache: "Cache",
      headCreated: "Created",
      headStatus: "Status",
      statusRevoked: "revoked",
      statusActive: "active",
      revoke: "Revoke",
      empty: "no keys yet",
      hint: "Per-key origins override the global {code} for requests using that key. Browsers don't send API keys on {opt} preflights — pass the key via {query} if preflights must be per-key.",
    },
    logs: {
      title: "Request logs",
      limit: "Limit",
      refresh: "Refresh",
      headTime: "Time",
      headMethod: "Method",
      headHost: "Host",
      headStatus: "Status",
      headLatency: "Latency",
      headCc: "CC",
      headCache: "Cache",
      headSize: "Size",
      headError: "Error",
      empty: "no logs",
      hit: "HIT",
      miss: "MISS",
    },
    blocked: {
      title: "Host blocklist",
      sub: "Extra SSRF blocks on top of the built-in private-range protection.",
      hostname: "Hostname",
      reason: "Reason",
      hostnamePh: "evil.example",
      reasonPh: "abuse",
      block: "Block host",
      remove: "Remove",
      headHostname: "Hostname",
      headReason: "Reason",
      headAdded: "Added",
      empty: "empty",
    },
    profile: {
      viaAccess: "Signed in via Cloudflare Access",
      viaToken: "Signed in via admin token",
      email: "Email",
      authMethod: "Auth method",
      hint: "Console access is controlled by your deployment's Access policy or {code}. Changes to the account (email, permissions) happen on the upstream identity provider, not here.",
    },
    billing: {
      body: "corx is self-hosted on your own Cloudflare account, so there is nothing to bill here. Usage of the proxy (requests, cache, storage) is charged by Cloudflare against the plan of the account this worker runs on.",
      active: "active",
      noBill: "No plan, no seat, no invoice.",
    },
    login: {
      consoleTitle: "corx console",
      detected: "Detected Access identity:",
      unknown: "unknown",
      continueAccess: "Continue with Cloudflare",
      noAccess: "No Cloudflare Access session detected on this request. In production, put an Access application in front of the admin host — then this button signs you in.",
      accessTitle: "Available behind Cloudflare Access",
      or: "or",
      tokenHint: "Local development without Access: paste {code}.",
      adminToken: "Admin token",
      signIn: "Sign in",
      errAccess: "No valid Cloudflare Access identity on this request.",
      errToken: "Invalid token.",
      errMisconfig: "Server misconfigured: SESSION_SECRET (or ADMIN_TOKEN) is not set.",
      verifying: "verifying on sign-in",
    },
  },
  corsDemo: {
    urlAria: "URL to proxy",
    urlPh: "https://api.example.com/…",
    go: "Go",
    error: "error",
    cache: "cache {value}",
    truncated: "… (truncated)",
    requestFailed: "Request failed: {err}",
    waiting: "Waiting for the first request…",
    autoRotating: "Auto-rotating examples every 10s",
    manualMode: "Manual mode — type a URL and press Go",
    pause: "Pause",
    resume: "Resume",
  },
  statsTabs: {
    aria: "Breakdown",
    byStatus: "By status",
    byMethod: "By method",
    byCountry: "By country",
    noData: "no data",
  },
  copy: {
    copy: "Copy",
    copied: "Copied",
  },
} as const;

export type Locale = "en" | "zh";
export const LOCALES: Locale[] = ["en", "zh"];
export const DEFAULT_LOCALE: Locale = "en";

/** Structure of the en dictionary, with values widened to string (so `zh`
    can hold any translation while still mirroring the en key shape). */
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type Messages = DeepStrings<typeof en>;
export type MessagesOf<L extends Locale> = L extends "en" ? typeof en : typeof zh;

type FlattenKeys<T, P extends string = ""> = {
  [K in keyof T]: T[K] extends string
    ? P extends ""
      ? K & string
      : `${P}.${K & string}`
    : FlattenKeys<T[K], P extends "" ? (K & string) : `${P}.${K & string}`>;
}[keyof T];

export type MessageKey = FlattenKeys<Messages>;

const zh: Messages = {
  lang: {
    zh: "中文",
    en: "EN",
  },
  site: {
    openConsole: "打开控制台",
    tryIt: "体验一下",
    features: "功能特性",
    tagline: "边缘 CORS 代理",
    console: "控制台",
    copyright: "© {year} corx",
  },
  landing: {
    title: "corx — Cloudflare 上的 CORS 代理",
    hero: {
      h1a: "抓取任意 URL，",
      h1b: "告别 CORS。",
      sub: "corx 是一个边缘 CORS 代理。给任意 URL 加个前缀即可跨域抓取——响应缓存在边缘、有限流保护、内置 SSRF 防护。",
      tryLive: "在线体验",
      openConsole: "打开控制台",
    },
    tryit: {
      title: "在线体验",
      sub: "示例每 10 秒轮换，直接通过代理加载。输入任意 URL 即可接管。",
      hint: "等价于 GET {origin}/fetch?url=…。每个请求都经过边缘代理——观察状态码、延迟、体积和缓存 HIT/MISS 徽标随示例实时更新。",
    },
    features: {
      title: "边缘所需，一应俱全",
      simple: {
        title: "设计简洁",
        desc: "一个 URL 前缀即可从任意源站使用——无需 SDK、无需配置、无需特殊请求头。",
      },
      cached: {
        title: "边缘缓存",
        desc: "响应缓存在 R2 并从边缘返回，支持 TTL 控制和无缓存逃生通道。",
      },
      ssrf: {
        title: "SSRF 防护",
        desc: "默认拦截私有网段，还可以在控制台添加主机黑名单。",
      },
      keys: {
        title: "API 密钥",
        desc: "每个密钥独立配置允许来源、频率限制和缓存策略——一键吊销。",
      },
      analytics: {
        title: "用量分析",
        desc: "在控制台内按小时查看请求数、流量、延迟与错误率图表。",
      },
      subdomain: {
        title: "子域名模式",
        desc: "让每个目标拥有独立域名：example.com 变成 example-com.your.host。",
      },
    },
    cta: {
      title: "60 秒发出你的第一个代理请求",
      sub: "进入控制台，拿到 API 密钥，开始抓取。",
      btn: "打开控制台",
    },
  },
  notfound: {
    title: "404 — 页面不存在 · corx",
    h1: "404 — 页面不存在",
    sub: "找不到你要访问的页面。它可能已被移动、重命名，或从未存在过。",
    takeHome: "返回首页",
    openConsole: "打开控制台",
    noMatch: "corx 没有匹配 {path} 的路由",
  },
  console: {
    nav: {
      overview: "概览",
      keys: "API 密钥",
      logs: "日志",
      blocked: "黑名单",
    },
    title: {
      overview: "概览",
      keys: "API 密钥",
      logs: "日志",
      blocked: "黑名单",
      profile: "个人资料",
      billing: "账单",
      login: "登录",
    },
    sidebar: {
      collapse: "收起侧边栏",
    },
    topbar: {
      openSidebar: "打开侧边栏",
      profile: "个人资料",
      billing: "账单",
      logout: "退出登录",
      account: "账户",
      session: "会话",
    },
    overview: {
      last24h: "· 最近 24 小时",
      requests: "请求数",
      trafficOut: "出站流量",
      servedFromCache: "缓存命中（{hits}）",
      trafficIn: "入站流量",
      avgLatency: "平均延迟（最大 {max} ms）",
      errorRate: "错误率（{n}）",
      apiKeys: "API 密钥",
      blockedHosts: "拦截主机",
      perHour: "每小时请求数",
      topHosts: "热门主机",
      topKeys: "按流量排名的 API 密钥",
      breakdown: "分布明细",
      recentErrors: "最近错误",
      host: "主机",
      key: "密钥",
      requestsRight: "请求数",
      traffic: "流量",
      time: "时间",
      method: "方法",
      status: "状态",
      error: "错误",
      noData: "暂无数据",
      none: "没有 🎉",
      anonymous: "匿名",
    },
    keys: {
      newKey: "新密钥已创建——请立即复制，之后不再显示。",
      createFailed: "创建密钥失败",
      saveOriginsFailed: "保存允许来源失败",
      saveCacheFailed: "保存缓存策略失败",
      name: "名称",
      ratePerMin: "频率 / 分钟",
      allowedOrigins: "允许来源",
      cacheTtl: "缓存 TTL（秒）",
      noCache: "无缓存",
      create: "创建密钥",
      save: "保存",
      namePh: "my-app",
      ratePh: "120（留空 = 默认）",
      originsPh: "* 或 https://app.example（留空 = 全局）",
      ttlPh: "留空 = 全局",
      originsPhShort: "留空 = 全局",
      cacheTtlTitle: "TTL 秒数（留空 = 全局，0 = 从不存储）",
      noCacheTitle: "该密钥完全跳过 R2 缓存",
      noCacheValue: "no-cache",
      ttlValue: "TTL {ttl}s",
      global: "全局",
      default: "默认",
      headName: "名称",
      headRate: "频率/分钟",
      headOrigins: "允许来源",
      headCache: "缓存",
      headCreated: "创建时间",
      headStatus: "状态",
      statusRevoked: "已吊销",
      statusActive: "活跃",
      revoke: "吊销",
      empty: "还没有密钥",
      hint: "使用该密钥的请求，其允许来源会覆盖全局的 {code}。浏览器在 {opt} 预检中不会发送 API 密钥——如需按密钥预检，请通过 {query} 传递密钥。",
    },
    logs: {
      title: "请求日志",
      limit: "数量",
      refresh: "刷新",
      headTime: "时间",
      headMethod: "方法",
      headHost: "主机",
      headStatus: "状态",
      headLatency: "延迟",
      headCc: "CC",
      headCache: "缓存",
      headSize: "体积",
      headError: "错误",
      empty: "暂无日志",
      hit: "命中",
      miss: "未命中",
    },
    blocked: {
      title: "主机黑名单",
      sub: "在内置私网段防护之上，额外添加的 SSRF 拦截规则。",
      hostname: "主机名",
      reason: "原因",
      hostnamePh: "evil.example",
      reasonPh: "滥用",
      block: "加入黑名单",
      remove: "移除",
      headHostname: "主机名",
      headReason: "原因",
      headAdded: "添加时间",
      empty: "空",
    },
    profile: {
      viaAccess: "通过 Cloudflare Access 登录",
      viaToken: "通过管理员令牌登录",
      email: "邮箱",
      authMethod: "认证方式",
      hint: "控制台访问由部署时的 Access 策略或 {code} 控制。账号相关修改（邮箱、权限）发生在上游身份提供商，而不是这里。",
    },
    billing: {
      body: "corx 自托管在你自己的 Cloudflare 账户上，因此这里没有任何账单。代理的使用量（请求、缓存、存储）由 Cloudflare 按该 Worker 所在账户的套餐计费。",
      active: "活跃",
      noBill: "没有套餐、没有席位、没有账单。",
    },
    login: {
      consoleTitle: "corx 控制台",
      detected: "检测到 Access 身份：",
      unknown: "未知",
      continueAccess: "使用 Cloudflare 继续",
      noAccess: "此请求未检测到 Cloudflare Access 会话。生产环境中，请在管理主机前配置 Access 应用——届时此按钮即可登录。",
      accessTitle: "需在 Cloudflare Access 之后使用",
      or: "或",
      tokenHint: "无 Access 的本地开发：粘贴 {code}。",
      adminToken: "管理员令牌",
      signIn: "登录",
      errAccess: "该请求没有有效的 Cloudflare Access 身份。",
      errToken: "令牌无效。",
      errMisconfig: "服务器配置错误：未设置 SESSION_SECRET（或 ADMIN_TOKEN）。",
      verifying: "登录时验证中",
    },
  },
  corsDemo: {
    urlAria: "要代理的 URL",
    urlPh: "https://api.example.com/…",
    go: "Go",
    error: "错误",
    cache: "缓存 {value}",
    truncated: "…（已截断）",
    requestFailed: "请求失败：{err}",
    waiting: "等待第一个请求……",
    autoRotating: "示例每 10 秒自动轮换",
    manualMode: "手动模式——输入 URL 并按 Go",
    pause: "暂停",
    resume: "继续",
  },
  statsTabs: {
    aria: "分布明细",
    byStatus: "按状态",
    byMethod: "按方法",
    byCountry: "按国家",
    noData: "暂无数据",
  },
  copy: {
    copy: "复制",
    copied: "已复制",
  },
};

/** Walk a dot-path through a dictionary, returning undefined on any miss. */
function getPath(dict: object, key: string): unknown {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Lookup a message (with optional {var} interpolation), en as fallback. */
export function lookup<L extends Locale>(locale: L, key: MessageKey, vars?: Record<string, string | number>): string {
  const found = getPath(locale === "zh" ? zh : en, key);
  const fallback = getPath(en, key);
  const raw = typeof found === "string" ? found : typeof fallback === "string" ? fallback : key; // never throw
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m: string, k: string) => (k in vars ? String(vars[k]) : m));
}
