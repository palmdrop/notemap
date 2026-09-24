import { describe, expect, it } from "vitest";

import { refusedAddress, unfurlable } from "./guard";

describe("refusedAddress", () => {
  it.each([
    ["0.0.0.0", "unspecified"],
    ["10.1.2.3", "private"],
    ["100.64.0.1", "shared address space"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["169.254.169.254", "link-local, where cloud metadata lives"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.0.0.8", "IETF protocol assignments"],
    ["192.0.2.1", "documentation"],
    ["192.168.1.1", "private"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.1", "multicast"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.255", "broadcast"],
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
    ["64:ff9b::a00:1", "NAT64"],
    ["2002:7f00:1::", "6to4"],
    ["2001::1", "Teredo"],
    ["2001:db8::1", "documentation"],
    ["fc00::1", "unique-local"],
    ["fd12:3456::1", "unique-local"],
    ["fe80::1", "link-local"],
    ["ff02::1", "multicast"],
    ["not-an-address", "not an address at all"],
  ])("refuses %s (%s)", (address) => {
    expect(refusedAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.32.0.1",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001::1",
  ])("lets %s through", (address) => {
    expect(refusedAddress(address)).toBe(false);
  });
});

describe("unfurlable", () => {
  it("keeps http and https", () => {
    expect(unfurlable("https://example.org/a")?.href).toBe(
      "https://example.org/a",
    );
    expect(unfurlable("http://example.org/")?.href).toBe("http://example.org/");
  });

  it.each([
    "",
    "not a url",
    "ftp://example.org/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://user:secret@example.org/",
  ])("refuses %j", (url) => {
    expect(unfurlable(url)).toBeUndefined();
  });
});
