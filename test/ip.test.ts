import { describe, expect, it } from "vitest";
import { ipv4ToInt, ipv6ToBigInt, isPublicIp } from "../app/proxy/ip.js";

describe("ipv4ToInt", () => {
  it("parses plain IPv4", () => {
    expect(ipv4ToInt("8.8.8.8")).toBe(0x08080808);
    expect(ipv4ToInt("10.0.0.1")).toBe(0x0a000001);
    expect(ipv4ToInt("255.255.255.255")).toBe(0xffffffff);
  });
  it("rejects non-IPv4", () => {
    for (const bad of ["example.com", "8.8.8", "8.8.8.8.8", "256.1.1.1", "8.8.8.8/24", ""]) {
      expect(ipv4ToInt(bad), bad).toBeNull();
    }
  });
});

describe("ipv6ToBigInt", () => {
  it("parses full + compressed forms", () => {
    expect(ipv6ToBigInt("::1")).toBe(1n);
    expect(ipv6ToBigInt("::")).toBe(0n);
    expect(ipv6ToBigInt("2001:db8::1")).toBe((0x2001_0db8n << 96n) | 1n);
    expect(ipv6ToBigInt("fe80::1")).toBe((0xfe80n << 112n) | 1n);
    expect(ipv6ToBigInt("2001:4860:4860::8888")).toBe((0x2001_4860_4860n << 80n) | 0x8888n);
  });
  it("parses IPv4-mapped form", () => {
    expect(ipv6ToBigInt("::ffff:8.8.8.8")).toBe((0xffffn << 32n) | 0x08080808n);
  });
  it("rejects garbage", () => {
    for (const bad of ["g", "1:2:3:4:5:6:7", "1::2::3", "2001:db8::zzzz"]) {
      expect(ipv6ToBigInt(bad), bad).toBeNull();
    }
  });
});

describe("isPublicIp — private/special blocked", () => {
  const privateIps = [
    // IPv4: private, link-local, CGNAT, metadata, loopback, multicast, reserved
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "192.0.0.10",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    // IPv6: loopback, unspecified, ULA, link-local, multicast, documentation, NAT64, discard
    "::",
    "::1",
    "fc00::1",
    "fdff::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "64:ff9b::10.0.0.1",
    "100::1",
    "::ffff:127.0.0.1",
    "::ffff:192.168.1.1",
  ];
  for (const ip of privateIps) {
    it(`blocks ${ip}`, () => {
      expect(isPublicIp(ip), ip).toBe(false);
    });
  }
});

describe("isPublicIp — public allowed", () => {
  const publicIps = [
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ];
  for (const ip of publicIps) {
    it(`allows ${ip}`, () => {
      expect(isPublicIp(ip), ip).toBe(true);
    });
  }
  it("unparseable → not public (blocked)", () => {
    expect(isPublicIp("example.com")).toBe(false);
    expect(isPublicIp("")).toBe(false);
  });
});
