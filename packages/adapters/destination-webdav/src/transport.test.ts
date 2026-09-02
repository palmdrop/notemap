import { describe, expect, it } from "vitest";

import { transportWarnings } from "./transport";

/**
 * Said, and not enforced: whether plain HTTP to an address that is not private
 * is acceptable is the operator's to know. What the daemon owes is that nobody
 * does it without being told.
 */
describe("warning about a password that crosses a network in the clear", () => {
  const warnings = (...urls: readonly string[]): readonly string[] =>
    transportWarnings(
      urls.map((baseUrl, index) => ({ name: `account-${index}`, baseUrl })),
    );

  it("names the account, the host, and what to do about it", () => {
    expect(warnings("http://cloud.example/dav")).toEqual([
      expect.stringMatching(/account-0 reaches cloud\.example over plain HTTP/),
    ]);
  });

  /**
   * The ordinary deployment: notemap and Nextcloud as siblings on one container
   * network, where the address is a service name and there is no loopback and
   * no certificate to be had.
   */
  it("says nothing about a single-label name, which is a container's", () => {
    expect(warnings("http://nextcloud:80/remote.php/dav/files/alice")).toEqual(
      [],
    );
  });

  it("says nothing about loopback or a private address", () => {
    expect(
      warnings(
        "http://localhost:8080/dav",
        "http://127.0.0.1:8080/dav",
        "http://127.1.2.3/dav",
        "http://10.1.2.3/dav",
        "http://172.20.0.4/dav",
        "http://192.168.1.5/dav",
        "http://[::1]/dav",
        "http://[fd00::1]/dav",
        "http://[fe80::1]/dav",
      ),
    ).toEqual([]);
  });

  it("warns about an address that only looks private", () => {
    expect(
      warnings(
        "http://172.15.0.1/dav",
        "http://172.32.0.1/dav",
        "http://192.169.1.1/dav",
        "http://11.0.0.1/dav",
        "http://[2001:db8::1]/dav",
      ),
    ).toHaveLength(5);
  });

  it("says nothing at all where the scheme is https", () => {
    expect(warnings("https://cloud.example/dav")).toEqual([]);
  });
});
