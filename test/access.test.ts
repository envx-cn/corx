import { describe, it, expect } from "vitest";
import { verifyAccessJwt, emailAllowed } from "../app/lib/access.js";
import { signSession, verifySession } from "../app/lib/session.js";
import type { Env } from "../app/lib/types.js";

function b64uJson(obj: unknown): string {
  const bin = Buffer.from(JSON.stringify(obj)).toString("base64");
  return bin.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function setup() {
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const pub = { ...jwk, kid: "test-kid" };
  const teamDomain = "https://myteam.cloudflareaccess.com";
  const aud = "abc123aud";
  const sign = async (payload: Record<string, unknown>, kid = "test-kid", key = kp.privateKey) => {
    const input = `${b64uJson({ alg: "RS256", kid, typ: "JWT" })}.${b64uJson(payload)}`;
    const sig = new Uint8Array(
      await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input)),
    );
    const b64 = Buffer.from(sig).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    return `${input}.${b64}`;
  };
  const nowSec = Math.floor(Date.now() / 1000);
  const goodPayload = { iss: teamDomain, aud: [aud], exp: nowSec + 300, email: "admin@example.com" };
  return { pub, teamDomain, aud, sign, goodPayload };
}

describe("verifyAccessJwt", () => {
  it("accepts a valid token", async () => {
    const { pub, teamDomain, aud, sign, goodPayload } = await setup();
    const user = await verifyAccessJwt(await sign(goodPayload), { jwks: [pub], teamDomain, aud });
    expect(user.email).toBe("admin@example.com");
  });
  it("rejects wrong audience", async () => {
    const { pub, teamDomain, sign, goodPayload } = await setup();
    await expect(verifyAccessJwt(await sign(goodPayload), { jwks: [pub], teamDomain, aud: "nope" })).rejects.toThrow();
  });
  it("rejects expired tokens", async () => {
    const { pub, teamDomain, aud, sign, goodPayload } = await setup();
    const token = await sign({ ...goodPayload, exp: Math.floor(Date.now() / 1000) - 500 });
    await expect(verifyAccessJwt(token, { jwks: [pub], teamDomain, aud })).rejects.toThrow(/expired/);
  });
  it("rejects tampered payloads", async () => {
    const { pub, teamDomain, aud, sign, goodPayload } = await setup();
    const token = await sign(goodPayload);
    const [h, , s] = token.split(".");
    const evil = `${h}.${b64uJson({ ...goodPayload, email: "evil@example.com" })}.${s}`;
    await expect(verifyAccessJwt(evil, { jwks: [pub], teamDomain, aud })).rejects.toThrow(/signature/);
  });
  it("rejects unknown kid", async () => {
    const { pub, teamDomain, aud, sign, goodPayload } = await setup();
    await expect(
      verifyAccessJwt(await sign(goodPayload, "other-kid"), { jwks: [pub], teamDomain, aud }),
    ).rejects.toThrow(/kid/);
  });
});

describe("emailAllowed", () => {
  it("open when unconfigured, enforced when set", () => {
    expect(emailAllowed({} as Env, "anyone@x.com")).toBe(true);
    const env = { ADMIN_EMAILS: "Boss@X.com, ops@y.com" } as Env;
    expect(emailAllowed(env, "boss@x.com")).toBe(true);
    expect(emailAllowed(env, "stranger@x.com")).toBe(false);
  });
});

describe("session cookie", () => {
  it("round-trips, rejects tampering and expiry", async () => {
    const secret = "s3cret";
    const token = await signSession("admin@example.com", secret);
    expect((await verifySession(token, secret))?.sub).toBe("admin@example.com");
    expect(await verifySession(token + "x", secret)).toBeNull();
    expect(await verifySession(token, "wrong")).toBeNull();
    const expired = await signSession("a@b.c", secret, -10);
    expect(await verifySession(expired, secret)).toBeNull();
  });

  it("preserves the issuing method (access vs token)", async () => {
    const secret = "s3cret";
    expect((await verifySession(await signSession("a@b.c", secret, undefined, "access"), secret))?.via).toBe(
      "access",
    );
    expect((await verifySession(await signSession("a@b.c", secret, undefined, "token"), secret))?.via).toBe(
      "token",
    );
    // Legacy cookies without `via` still verify (treated as token-issued).
    expect((await verifySession(await signSession("a@b.c", secret), secret))?.via).toBeUndefined();
  });
});
