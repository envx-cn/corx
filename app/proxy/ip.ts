/**
 * IP classification for the SSRF guard.
 *
 * Pure, testable helpers. `isPublicIp` returns true only for clearly-public
 * unicast addresses; anything private, reserved, special, multicast or
 * unparseable is treated as non-public (blocked).
 */

/** 32-bit unsigned int for an IPv4 string, or null when not a plain IPv4. */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

/** IPv4 ranges that are never safe to fetch from a public proxy. */
const PRIVATE_V4: Array<[number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8 ("this network")
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0x64400000, 0x647fffff], // 100.64.0.0/10 (CGNAT)
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8 (loopback)
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 (link-local / cloud metadata)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24 (IETF protocol assignments)
  [0xc0000200, 0xc00002ff], // 192.0.2.0/24 (TEST-NET-1)
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15 (benchmarking)
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24 (TEST-NET-2)
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24 (TEST-NET-3)
  [0xe0000000, 0xefffffff], // 224.0.0.0/4 (multicast)
  [0xf0000000, 0xffffffff], // 240.0.0.0/4 (reserved, incl. broadcast)
];

function inV4Ranges(ip: number): boolean {
  return PRIVATE_V4.some(([lo, hi]) => ip >= lo && ip <= hi);
}

/** 128-bit unsigned int for an IPv6 string, or null when unparseable. */
export function ipv6ToBigInt(ip: string): bigint | null {
  // ::ffff:a.b.c.d (IPv4-mapped IPv6)
  const v4m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4m) {
    const v4 = ipv4ToInt(v4m[1] ?? "");
    if (v4 === null) return null;
    return (0xffffn << 32n) | BigInt(v4);
  }
  const z = ip.indexOf("%");
  const clean = z >= 0 ? ip.slice(0, z) : ip;
  // Expand any embedded IPv4 (a.b.c.d) into its two hextets.
  const norm = (g: string): string[] => {
    if (g.includes(".")) {
      const v4 = ipv4ToInt(g);
      if (v4 === null) return [];
      return [((v4 >> 16) & 0xffff).toString(16), (v4 & 0xffff).toString(16)];
    }
    return g === "" ? [] : g.split(":");
  };
  const parts = clean.split("::");
  if (parts.length > 2) return null;
  let groups: string[];
  if (parts.length === 2) {
    const l = norm(parts[0] ?? "");
    const r = norm(parts[1] ?? "");
    if ((parts[0] !== "" && l.length === 0) || (parts[1] !== "" && r.length === 0)) return null;
    const missing = 8 - l.length - r.length;
    if (missing < 1) return null;
    groups = [...l, ...Array.from({ length: missing }, () => "0"), ...r];
  } else {
    groups = norm(parts[0] ?? "");
    if (groups.length !== 8) return null;
  }
  let out = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    out = (out << 16n) | BigInt(parseInt(g, 16));
  }
  return out;
}

/** IPv6 ranges that are never safe to fetch (private/special/reserved). */
const PRIVATE_V6: Array<[bigint, bigint]> = [
  [0x0000_0000_0000_0000_0000_0000_0000_0000n, 0x0000_0000_0000_0000_0000_0000_0000_0001n], // ::/128 + ::1/128
  [0x0064_ff9b_0000_0000_0000_0000_0000_0000n, 0x0064_ff9b_0000_0000_0000_0000_ffff_ffffn], // 64:ff9b::/96 (NAT64)
  [0x0100_0000_0000_0000_0000_0000_0000_0000n, 0x0100_0000_0000_0000_0000_0000_ffff_ffffn], // 100::/64 (discard)
  [0x2001_0db8_0000_0000_0000_0000_0000_0000n, 0x2001_0db8_ffff_ffff_ffff_ffff_ffff_ffffn], // 2001:db8::/32
  [0x2001_0010_0000_0000_0000_0000_0000_0000n, 0x2001_001f_ffff_ffff_ffff_ffff_ffff_ffffn], // 2001:10::/28 (ORCHID)
  [0x3fff_0000_0000_0000_0000_0000_0000_0000n, 0x3fff_0fff_ffff_ffff_ffff_ffff_ffff_ffffn], // 3fff::/20 (RFC 9637)
  [0xfc00_0000_0000_0000_0000_0000_0000_0000n, 0xfdff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn], // fc00::/7 (ULA)
  [0xfe80_0000_0000_0000_0000_0000_0000_0000n, 0xfebf_ffff_ffff_ffff_ffff_ffff_ffff_ffffn], // fe80::/10 (link-local)
  [0xff00_0000_0000_0000_0000_0000_0000_0000n, 0xffff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn], // ff00::/8 (multicast)
];

/** IPv4 embedded in an IPv4-mapped / 6to4 address, or null. */
function embeddedV4(v6: bigint): number | null {
  // ::ffff:0:0/96 (IPv4-mapped) — ffff at bits 32–47, hextets 0–4 zero
  if (((v6 >> 32n) & 0xffffn) === 0xffffn && (v6 >> 48n) === 0n) {
    return Number(v6 & 0xffffffffn);
  }
  // 2002::/16 (6to4) — the v4 lives in bits 80..111
  if ((v6 >> 112n) === 0x2002n) {
    return Number((v6 >> 80n) & 0xffffffffn);
  }
  return null;
}

function inV6Ranges(v6: bigint): boolean {
  const mapped = embeddedV4(v6);
  if (mapped !== null && inV4Ranges(mapped)) return true;
  return PRIVATE_V6.some(([lo, hi]) => v6 >= lo && v6 <= hi);
}

/** True for clearly-public unicast addresses; false for private/special/unparseable. */
export function isPublicIp(ip: string): boolean {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return !inV4Ranges(v4);
  const v6 = ipv6ToBigInt(ip);
  if (v6 === null) return false;
  return !inV6Ranges(v6);
}
