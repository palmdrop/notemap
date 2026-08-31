import { describe, expect, test } from "vitest";

import { isFamiliarRoot } from "./roots";

describe("a familiar root", () => {
  test("is one nothing known matches at all", () => {
    expect(isFamiliarRoot("/srv/vault", [])).toBe(false);
    expect(isFamiliarRoot("/srv/vault", ["/srv/elsewhere"])).toBe(false);
  });

  test("is one already known exactly", () => {
    expect(isFamiliarRoot("/srv/vault", ["/srv/vault"])).toBe(true);
  });

  test("is one nested under a known root", () => {
    expect(isFamiliarRoot("/srv/vault/inbox", ["/srv/vault"])).toBe(true);
  });

  test("is not one merely sharing a prefix as text", () => {
    expect(isFamiliarRoot("/srv/vault-2", ["/srv/vault"])).toBe(false);
  });

  test("ignores a trailing slash on either side", () => {
    expect(isFamiliarRoot("/srv/vault/", ["/srv/vault"])).toBe(true);
    expect(isFamiliarRoot("/srv/vault", ["/srv/vault/"])).toBe(true);
  });

  test("is nothing typed yet, which is not a mistake to catch", () => {
    expect(isFamiliarRoot("", ["/srv/vault"])).toBe(true);
    expect(isFamiliarRoot("   ", [])).toBe(true);
  });
});
