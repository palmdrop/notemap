import { describe, expect, it } from "vitest";

import { answered, answerFor, type Asked } from "./answer";

const ORIGIN = "https://notes.example";
const KEPT = new Set([
  "/",
  "/_app/immutable/entry/start.js",
  "/icons/icon.svg",
]);

const asked = (overrides: Partial<Asked> & { path: string }): Asked => ({
  method: overrides.method ?? "GET",
  url: overrides.path.startsWith("http")
    ? overrides.path
    : `${ORIGIN}${overrides.path}`,
  mode: overrides.mode ?? "cors",
});

describe("what the worker answers", () => {
  it("leaves the pool to the network, reads and writes alike", () => {
    for (const path of ["/v1", "/v1/items", "/v1/assets/a/content"]) {
      expect(answerFor(asked({ path }), ORIGIN, KEPT)).toBe("network");
      expect(answerFor(asked({ path, method: "POST" }), ORIGIN, KEPT)).toBe(
        "network",
      );
    }
  });

  it("leaves the pool to the network even when it is navigated to", () => {
    expect(
      answerFor(asked({ path: "/docs", mode: "navigate" }), ORIGIN, KEPT),
    ).toBe("network");
    expect(
      answerFor(
        asked({ path: "/v1/openapi.json", mode: "navigate" }),
        ORIGIN,
        KEPT,
      ),
    ).toBe("network");
  });

  it("does not take a path that only begins like the pool's", () => {
    expect(
      answerFor(asked({ path: "/v1ish", mode: "navigate" }), ORIGIN, KEPT),
    ).toBe("shell");
  });

  it("leaves another origin to the network", () => {
    expect(
      answerFor(asked({ path: "https://elsewhere.example/" }), ORIGIN, KEPT),
    ).toBe("network");
  });

  it("answers a file it keeps from what it keeps", () => {
    expect(
      answerFor(
        asked({ path: "/_app/immutable/entry/start.js" }),
        ORIGIN,
        KEPT,
      ),
    ).toBe("kept");
  });

  it("asks the daemon for a page first, even one it keeps", () => {
    for (const path of ["/", "/feed", "/items/abc", "/settings/server"]) {
      expect(answerFor(asked({ path, mode: "navigate" }), ORIGIN, KEPT)).toBe(
        "shell",
      );
    }
  });

  it("holds a share posted to the capture page", () => {
    expect(
      answerFor(
        asked({ path: "/capture", method: "POST", mode: "navigate" }),
        ORIGIN,
        KEPT,
      ),
    ).toBe("share");
  });

  it("looks for a file of an earlier build among what earlier builds kept", () => {
    expect(
      answerFor(
        asked({ path: "/_app/immutable/nodes/2.old.js" }),
        ORIGIN,
        KEPT,
      ),
    ).toBe("older");
  });

  it("leaves anything else to the network", () => {
    expect(answerFor(asked({ path: "/_app/version.json" }), ORIGIN, KEPT)).toBe(
      "network",
    );
    expect(
      answerFor(asked({ path: "/feed", method: "POST" }), ORIGIN, KEPT),
    ).toBe("network");
  });
});

describe("whether the daemon answered", () => {
  it("takes a gateway error as no answer", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(answered(new Response(null, { status }))).toBe(false);
    }
  });

  it("takes anything short of that as an answer", () => {
    for (const status of [200, 304, 401, 404]) {
      expect(answered(new Response(null, { status }))).toBe(true);
    }
  });
});
