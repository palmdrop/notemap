import { afterEach, expect, test, vi } from "vitest";

import { anItem } from "@notemap/client/testing";

import { commandsFor, type Surroundings } from "./item";

vi.mock("$lib/client", () => import("$testing/pool"));

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

/** What the browser hands a secure context, which jsdom has none of. */
function clipboard(): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(() => Promise.resolve()) },
  });
}

const at: Surroundings = {
  onprocess: () => undefined,
  onedit: () => undefined,
};

function ids(item = anItem("one"), extra: Partial<Surroundings> = {}) {
  return commandsFor(item, { ...at, ...extra }).map((command) => command.id);
}

test("offers process, manual and discard for an ordinary item, none refused", () => {
  const commands = commandsFor(anItem("one"), at);
  const byId = Object.fromEntries(commands.map((c) => [c.id, c]));

  expect(byId["process"]?.refusal).toBeUndefined();
  expect(byId["manual"]?.refusal).toBeUndefined();
  expect(byId["discard"]?.refusal).toBeUndefined();
});

test("refuses manual offline, and refuses nothing once it is reachable again", () => {
  const item = anItem("one");
  const offline = commandsFor(item, { ...at, offline: true });
  expect(offline.find((c) => c.id === "manual")?.refusal).toBe(
    "pool out of reach",
  );

  const online = commandsFor(item, { ...at, offline: false });
  expect(online.find((c) => c.id === "manual")?.refusal).toBeUndefined();
});

test("refuses discard on an item already discarded", () => {
  const archived = anItem("one", {
    archived: { archivedAt: "2026-09-04T10:00:00.000Z" },
  });

  expect(
    commandsFor(archived, at).find((c) => c.id === "discard")?.refusal,
  ).toBe("already discarded");
});

test("offers undiscard only on an archived item", () => {
  expect(ids()).not.toContain("undiscard");

  const archived = anItem("one", {
    archived: { archivedAt: "2026-09-04T10:00:00.000Z" },
  });
  expect(ids(archived)).toContain("undiscard");
});

test("offers edit on an unprocessed item and not on a processed one", () => {
  expect(ids()).toContain("edit");

  const processed = anItem("one", {
    routing: { records: 1, pending: 0, to: [] },
  });
  expect(ids(processed)).not.toContain("edit");
});

test("offers copy only with a clipboard and something for it to take", () => {
  expect(ids()).not.toContain("copy");

  clipboard();
  expect(ids()).toContain("copy");

  const bare = anItem("one", {
    payload: { type: "image", content: {}, metadata: {}, assets: [] },
  });
  expect(ids(bare)).not.toContain("copy");
});

test("goes to the address it is given, and to the log where it has none", () => {
  const item = anItem("one");

  const open = commandsFor(item, { ...at, address: "/items/one" }).find(
    (c) => c.id === "open",
  );
  expect(open?.label).toBe("open");
  expect(open !== undefined && "href" in open ? open.href : undefined).toBe(
    "/items/one",
  );

  const history = commandsFor(item, at).find((c) => c.id === "open");
  expect(history?.label).toBe("history");
  expect(
    history !== undefined && "href" in history ? history.href : undefined,
  ).toBe("/log?item=one");
});

test("publishes tag only where the surface hands one over", () => {
  expect(ids()).not.toContain("tag");
  expect(ids(anItem("one"), { tag: () => undefined })).toContain("tag");
});
