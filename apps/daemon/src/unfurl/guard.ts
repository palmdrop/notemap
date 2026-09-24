import { BlockList, isIP } from "node:net";

import { UNFURL_SCHEMES } from "./limits";

/**
 * Two lists rather than one: a single `BlockList` holding `::/8` also refuses
 * every IPv4 address, which it checks as its IPv4-mapped IPv6 form.
 */
const REFUSED_V4 = new BlockList();
const REFUSED_V6 = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  REFUSED_V4.addSubnet(network, prefix, "ipv4");
}

// `::/8` holds the unspecified address, loopback, and every IPv4-mapped and
// IPv4-compatible form, so a private IPv4 address cannot arrive dressed as v6.
// NAT64, 6to4 and Teredo embed an IPv4 address as well, and are refused whole.
for (const [network, prefix] of [
  ["::", 8],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  REFUSED_V6.addSubnet(network, prefix, "ipv6");
}

export function refusedAddress(address: string): boolean {
  switch (isIP(address)) {
    case 4:
      return REFUSED_V4.check(address, "ipv4");
    case 6:
      return REFUSED_V6.check(address, "ipv6");
    default:
      return true;
  }
}

/** An address the guard would let through at all, or `undefined`. */
export function unfurlable(url: string): URL | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!UNFURL_SCHEMES.includes(parsed.protocol)) return undefined;
  if (parsed.username !== "" || parsed.password !== "") return undefined;
  return parsed;
}

/** The host as `net` reads it: an IPv6 literal without its brackets. */
export function hostOf(url: URL): string {
  return url.hostname.replace(/^\[(.*)\]$/, "$1");
}
