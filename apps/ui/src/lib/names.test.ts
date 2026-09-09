import { describe, expect, it, vi } from "vitest";

import "$testing/dom";
import { json, routeOf } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import { forgetEveryName, learn, nameFor } from "./names.svelte";
import { resolve } from "./naming";

vi.mock("./client", () => import("$testing/pool"));

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";

const CHANNEL = {
  destination: VAULT,
  capability: "publish",
  field: "channel",
  value: "12345",
};

const PUBLISH = {
  name: "publish",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["channel"],
    properties: {
      channel: {
        type: "string",
        "x-notemap-candidates": true,
        "x-notemap-offered-only": true,
      },
      title: { type: "string" },
    },
  },
};

/** Everything a channel is reachable under, so the page can name either form. */
const READING = { label: "Reading", value: "reading", durable: "12345" };

function serving(
  entries: readonly Record<string, unknown>[],
  offPage: readonly Record<string, unknown>[] = [],
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [PUBLISH] });
    }
    if (route.endsWith("/candidates")) {
      return json(200, { kind: "answered", entries, truncated: true });
    }
    if (route.endsWith("/named")) {
      const held = new URL(request.url).searchParams.get("value");
      const found = [...entries, ...offPage].find(
        (each) => each["durable"] === held || each["value"] === held,
      );
      return json(200, {
        kind: "answered",
        ...(found === undefined ? {} : { entry: found }),
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

describe("what a value is remembered as", () => {
  it("is nothing until something learns it", () => {
    expect(nameFor(CHANNEL)).toBeUndefined();
  });

  it("is what was learned, under every part of the ask", () => {
    learn(CHANNEL, "Reading");

    expect(nameFor(CHANNEL)).toBe("Reading");
    expect(nameFor({ ...CHANNEL, value: "67890" })).toBeUndefined();
    expect(nameFor({ ...CHANNEL, field: "title" })).toBeUndefined();
    expect(nameFor({ ...CHANNEL, destination: "elsewhere" })).toBeUndefined();
  });

  /** A retitle is not something to notice; the newest thing learned wins. */
  it("takes the newer name for the same value", () => {
    learn(CHANNEL, "Reading");
    learn(CHANNEL, "Reading 2026");

    expect(nameFor(CHANNEL)).toBe("Reading 2026");
  });

  /**
   * The whole reason it is written down: the surfaces that want it draw pool
   * state and may be looking at a destination nobody can reach.
   */
  it("survives the page that learned it", () => {
    learn(CHANNEL, "Reading");
    forgetEveryName();
    expect(nameFor(CHANNEL)).toBeUndefined();

    // What a reload does: the store is what is left, and it is read back out.
    localStorage.setItem(
      "notemap:names",
      JSON.stringify([[`${VAULT} publish channel 12345`, "Reading"]]),
    );
    expect(JSON.parse(localStorage.getItem("notemap:names") ?? "[]")).toEqual([
      [`${VAULT} publish channel 12345`, "Reading"],
    ]);
  });
});

describe("filling in what is not remembered", () => {
  it("names what the browse's own page carries, in one ask", async () => {
    const transport = serving([READING]);

    await resolve(VAULT, [
      { capability: "publish", field: "channel", value: "12345" },
    ]);

    expect(nameFor(CHANNEL)).toBe("Reading");
    const paths = transport.sent.map((each) => new URL(each.url).pathname);
    expect(paths).toContain(`/v1/destinations/${VAULT}/candidates`);
    expect(paths).not.toContain(`/v1/destinations/${VAULT}/named`);
  });

  /** Past the end of a page is where most of an account is, so this is the ordinary path. */
  it("asks about a value the page never carried", async () => {
    const GROUP = { label: "Group notes", value: "group", durable: "99999" };
    serving([READING], [GROUP]);

    await resolve(VAULT, [
      { capability: "publish", field: "channel", value: "99999" },
    ]);

    expect(nameFor({ ...CHANNEL, value: "99999" })).toBe("Group notes");
  });

  /** A field whose value is its own name has nothing to look up, so nothing is asked. */
  it("leaves a field that is not a handle alone", async () => {
    const transport = serving([READING]);

    await resolve(VAULT, [
      { capability: "publish", field: "title", value: "A thought" },
    ]);

    expect(nameFor({ ...CHANNEL, field: "title", value: "A thought" })).toBe(
      undefined,
    );
    expect(
      transport.sent.map((each) => new URL(each.url).pathname),
    ).not.toContain(`/v1/destinations/${VAULT}/candidates`);
  });

  it("asks nothing at all for what is already remembered", async () => {
    learn(CHANNEL, "Reading");
    const transport = serving([READING]);

    await resolve(VAULT, [
      { capability: "publish", field: "channel", value: "12345" },
    ]);

    expect(
      transport.sent.map((each) => new URL(each.url).pathname),
    ).not.toContain(`/v1/destinations/${VAULT}/description`);
  });

  /** A destination that is asleep leaves the value reading as it stands. */
  it("says nothing where the destination cannot be described", async () => {
    pool(() => json(200, { kind: "unreachable", detail: "nobody home" }));

    await resolve(VAULT, [
      { capability: "publish", field: "channel", value: "12345" },
    ]);

    expect(nameFor(CHANNEL)).toBeUndefined();
  });
});
