import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, refusal, routeOf } from "@notemap/client/testing";

import { client, pool } from "$testing/pool";
import { published } from "$lib/command/stack.svelte";
import { firings } from "$lib/firings.svelte";
import { notices } from "$lib/notices.svelte";
import StatusLine from "./StatusLine.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

function firstValueOf<T>(source: {
  subscribe(next: (value: T) => void): { unsubscribe(): void };
}): Promise<T> {
  return new Promise((resolve) => {
    const held = source.subscribe((value) => {
      resolve(value);
      queueMicrotask(() => held.unsubscribe());
    });
  });
}

afterEach(() => {
  notices.clear();
  firings.clear();
  vi.useRealTimers();
});

const quiet = () => json(200, { values: [] });

function anAction(id: string, kind: string, detail: Record<string, unknown>) {
  return {
    id,
    kind,
    subject: "one",
    by: { kind: "notemap" },
    at: `2026-09-03T10:0${id}:00.000Z`,
    detail,
  };
}

function command(id: string) {
  const found = published()
    .flatMap((get) => get())
    .findLast((one) => one.id === id);
  if (found === undefined || !("run" in found)) {
    throw new Error(`nothing publishes ${id}`);
  }
  return found;
}

async function opened() {
  await fireEvent.click(
    await screen.findByRole("button", { name: /^notices/ }),
  );
  return screen.getByRole("region", { name: "notices" });
}

test("says the newest live notice on the line", async () => {
  pool(quiet);
  render(StatusLine);

  notices.raise({ what: "routed · obsidian", why: "notes/inbox/picker.md" });
  const said = await screen.findByRole("status");
  expect(said.textContent).toContain("routed · obsidian");

  notices.raise({ what: "routing failed: taken.md", alarm: true });
  const wrong = await screen.findByRole("alert");
  expect(wrong.textContent).toContain("routing failed: taken.md");
});

/** The line has room for a few words; the rest of a notice is the panel's. */
test("the line says what happened, and leaves why to the panel", async () => {
  pool(quiet);
  render(StatusLine);

  notices.raise({ what: "routed · vault", why: "notes/inbox/picker.md" });

  const said = await screen.findByRole("status");
  expect(said.textContent).not.toContain("notes/inbox/picker.md");
  const panel = await opened();
  expect(panel.textContent).toContain("notes/inbox/picker.md");
});

test("what a notice offers is taken from the line", async () => {
  pool(quiet);
  render(StatusLine);
  const put = vi.fn();

  notices.raise({ what: "discarded", offer: { label: "undo", take: put } });
  await fireEvent.click(await screen.findByRole("button", { name: "undo" }));

  expect(put).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => {
    expect(screen.queryByText("discarded")).toBeNull();
  });
});

test("nothing leaves the line while the pointer is over it", async () => {
  pool(quiet);
  render(StatusLine);
  vi.useFakeTimers();

  notices.raise({ what: "discarded", offer: { label: "undo", take: vi.fn() } });
  await vi.advanceTimersByTimeAsync(0);
  const line = screen.getByRole("status").closest("[role=presentation]")!;

  await fireEvent.pointerEnter(line);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(screen.queryByRole("status")).not.toBeNull();

  await fireEvent.pointerLeave(line);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(screen.queryByRole("status")).toBeNull();
});

test("nothing leaves the line while focus is inside it", async () => {
  pool(quiet);
  render(StatusLine);
  vi.useFakeTimers();

  notices.raise({ what: "discarded", offer: { label: "undo", take: vi.fn() } });
  await vi.advanceTimersByTimeAsync(0);
  const undo = screen.getByRole("button", { name: "undo" });

  await fireEvent.focusIn(undo);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(screen.queryByRole("status")).not.toBeNull();

  await fireEvent.focusOut(undo, { relatedTarget: document.body });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(screen.queryByRole("status")).toBeNull();
});

/** The line lets go of a notice; the panel is where it can be read again. */
test("the panel reads back what the line has let go of", async () => {
  pool(quiet);
  render(StatusLine);
  vi.useFakeTimers();

  notices.raise({
    what: "routed · vault",
    why: "notes/a.md",
    about: "09-03 10:00 · a thought",
    href: "/items/one",
  });
  await vi.advanceTimersByTimeAsync(4_000);
  expect(screen.queryByRole("status")).toBeNull();

  const panel = await opened();
  const said = within(panel).getByRole("list", { name: "said" });
  expect(said.textContent).toContain("routed · vault");
  expect(said.textContent).toContain("a thought");
  expect(
    within(said).getByRole("link", { name: "look" }).getAttribute("href"),
  ).toBe("/items/one");
  // Nothing is ever dismissed: a notice goes on its own and is read here.
  expect(within(said).queryByRole("button", { name: "dismiss" })).toBeNull();
});

/** The panel is where notices are read back, so it is there to open before anything is said. */
/** Nothing has to be cleared, but what went wrong while nobody looked is not lost. */
test("what went wrong is counted on notices until the panel is opened", async () => {
  pool(quiet);
  render(StatusLine);
  vi.useFakeTimers();

  notices.raise({ what: "routing failed", alarm: true });
  notices.raise({ what: "copied" });
  await vi.advanceTimersByTimeAsync(60_000);

  const toggle = screen.getByRole("button", { name: "notices, 1 gone wrong" });
  expect(toggle.textContent).toContain("1");

  await fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "notices" })).toBeDefined();
});

test("notices opens the panel when nothing has been said", async () => {
  pool(quiet);
  render(StatusLine);

  const panel = await opened();

  expect(panel.textContent).toContain("Nothing has been said yet.");
  expect(
    screen
      .getByRole("button", { name: "notices" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
});

test("the panel opens and closes by command, and closes on a press outside", async () => {
  pool(quiet);
  render(StatusLine);
  notices.raise({ what: "copied" });

  command("notices").run();
  await screen.findByRole("region", { name: "notices" });

  // Over every surface while it is open, so `esc` is the panel's.
  command("close").run();
  await vi.waitFor(() => {
    expect(screen.queryByRole("region", { name: "notices" })).toBeNull();
  });

  command("notices").run();
  await screen.findByRole("region", { name: "notices" });
  await fireEvent.pointerDown(document.body);
  await vi.waitFor(() => {
    expect(screen.queryByRole("region", { name: "notices" })).toBeNull();
  });
});

/** Said once, kept in the panel, and the client lets go of what the pool never took. */
test("a refusal is said as a notice, and the outbox lets it go", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/captures"
      ? refusal(400, "payload-invalid")
      : quiet(),
  );
  render(StatusLine);

  await client.capture({ channel: "web-manual", text: "a thought" });
  await client.drain();

  const said = await screen.findByRole("alert");
  expect(said.textContent).toContain("capture refused");
  await vi.waitFor(async () => {
    expect(
      (await firstValueOf(client.outbox)).filter(
        (held) => held.state === "refused",
      ),
    ).toHaveLength(0);
  });

  const panel = await opened();
  expect(panel.textContent).toContain("capture · a thought");
});

test("counts the work this device holds, and lists it in the panel", async () => {
  const transport = pool(quiet);
  transport.unreachable(true);
  render(StatusLine);

  await client.tag("one", "kind/quote");

  await screen.findByRole("button", { name: "1 pending" });
  expect(screen.getByRole("img", { name: "unreachable" })).toBeDefined();

  command("notices").run();
  const flying = await screen.findByRole("list", { name: "in flight" });
  expect(flying.textContent).toContain("tag · kind/quote");
  expect(flying.textContent).toContain("pending");
});

test("says how many items the queue holds, once the pool has counted", async () => {
  const transport = pool(quiet);
  transport.counts = () => json(200, { queue: 14 });
  render(StatusLine);

  expect(screen.queryByText(/in queue/)).toBeNull();

  await client.counts.load();

  expect((await screen.findByText("14 in queue")).getAttribute("href")).toBe(
    "/",
  );
  expect(screen.getByRole("img", { name: "reachable" })).toBeDefined();
});

/** The log is the only place this is written, and nobody was reading it. */
test("says what logged while nobody was asking", async () => {
  vi.useFakeTimers();
  let logged = [anAction("1", "captured", {})];

  pool((request) => {
    const route = routeOf(request);
    if (route.startsWith("GET /v1/actions")) {
      return json(200, { values: logged });
    }
    if (route === "GET /v1/items/one") {
      return json(
        200,
        anItem("one", {
          payload: {
            type: "text",
            content: { text: "the picker needs a trail" },
            metadata: {},
            assets: [],
          },
        }),
      );
    }
    return quiet();
  });

  render(StatusLine);

  // The first read is the mark, and says nothing about what was already there.
  await vi.advanceTimersByTimeAsync(100);
  expect(screen.queryByRole("alert")).toBeNull();

  logged = [
    anAction("2", "delivery-failed", {
      record: "r1",
      attempt: 1,
      failure: {
        code: "rejected-by-destination",
        detail: "taken.md is already there",
      },
    }),
    ...logged,
  ];

  await vi.advanceTimersByTimeAsync(10_000);

  const said = await screen.findByRole("alert");
  expect(said.textContent).toContain(
    "routing failed: taken.md is already there",
  );

  // Which capture it was about, read in the panel: the log names an id.
  command("notices").run();
  await vi.waitFor(() => {
    const panel = screen.getByRole("list", { name: "said" });
    expect(panel.textContent).toContain("the picker needs a trail");
    expect(
      within(panel).getByRole("link", { name: "look" }).getAttribute("href"),
    ).toBe("/items/one");
  });
});

test("does not repeat a landing this shell has already reported", async () => {
  vi.useFakeTimers();
  let logged: ReturnType<typeof anAction>[] = [];

  pool((request) =>
    routeOf(request).startsWith("GET /v1/actions")
      ? json(200, { values: logged })
      : quiet(),
  );

  render(StatusLine);
  await vi.advanceTimersByTimeAsync(100);

  // What the composer said when the decision was made.
  notices.raise({ what: "routed · Vault", key: "record:r1" });
  await vi.advanceTimersByTimeAsync(4_000);
  logged = [anAction("2", "routed", { record: "r1", pointer: "a.md" })];

  await vi.advanceTimersByTimeAsync(10_000);

  expect(notices.shown).toHaveLength(0);
  expect(notices.said("record:r1")).toBe(true);
});

/**
 * A read that could not reach back to its mark is somebody who has been away.
 * A page of failures is not a report of what they missed.
 */
test("a catch-up too long to read out is counted, not enumerated", async () => {
  vi.useFakeTimers();
  let logged = [anAction("1", "captured", {})];
  const paged: { next?: string } = {};

  pool((request) => {
    const route = routeOf(request);
    if (route.startsWith("GET /v1/actions")) {
      return json(200, { values: logged, ...paged });
    }
    return quiet();
  });

  render(StatusLine);
  await vi.advanceTimersByTimeAsync(100);

  // Nothing on the page reaches the mark, and there is a page after it.
  logged = ["9", "8", "7"].map((id) =>
    anAction(id, "delivery-failed", { record: `r${id}`, failure: {} }),
  );
  paged.next = "/v1/actions?after=2026-09-03T00%3A00%3A00.000Z%2C6";

  await vi.advanceTimersByTimeAsync(10_000);

  const said = await screen.findByRole("alert");
  expect(said.textContent).toContain("3 or more things happened");
  expect(notices.shown).toHaveLength(1);
});

test("a second long absence replaces the mark left by the first", async () => {
  vi.useFakeTimers();
  let logged = [anAction("1", "captured", {})];
  const paged: { next?: string } = {};

  pool((request) => {
    const route = routeOf(request);
    if (route.startsWith("GET /v1/actions")) {
      return json(200, { values: logged, ...paged });
    }
    return quiet();
  });

  render(StatusLine);
  await vi.advanceTimersByTimeAsync(100);

  paged.next = "/v1/actions?after=2026-09-03T00%3A00%3A00.000Z%2C6";
  logged = [anAction("9", "delivery-failed", { record: "r9", failure: {} })];
  await vi.advanceTimersByTimeAsync(10_000);
  await screen.findByRole("alert");

  logged = [anAction("99", "delivery-failed", { record: "r99", failure: {} })];
  await vi.advanceTimersByTimeAsync(5_000);

  expect(
    notices.shown.filter((notice) => notice.what.includes("things happened")),
  ).toHaveLength(1);
});

/**
 * The window is the one thing between a mistyped tag and somebody's vault, so
 * the line says how long is left and offers the way out — and when it has
 * closed, that the delivery is under way rather than still waiting.
 */
test("a fired template counts down on the line, with its cancel", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-09-30T10:00:00.000Z"));
  const cancelled: string[] = [];

  pool((request) => {
    const route = routeOf(request);
    if (route === "POST /v1/routing/r1/cancel") {
      cancelled.push(route);
      return json(200, {});
    }
    return quiet();
  });
  render(StatusLine);

  firings.opened({
    record: "r1",
    item: "one",
    name: "Research",
    until: Date.parse("2026-09-30T10:00:15.000Z"),
  });
  await vi.advanceTimersByTimeAsync(0);

  expect(screen.getByText("routing · Research")).toBeDefined();
  expect(screen.getByText("15s")).toBeDefined();

  await vi.advanceTimersByTimeAsync(5_000);
  expect(screen.getByText("10s")).toBeDefined();

  await vi.advanceTimersByTimeAsync(10_000);
  expect(screen.queryByText(/^\d+s$/)).toBeNull();
  // Still in flight, and still able to be called off.
  expect(
    screen.getByRole("button", { name: "cancel routing · Research" }),
  ).toBeDefined();

  await fireEvent.click(
    screen.getByRole("button", { name: "cancel routing · Research" }),
  );
  await vi.waitFor(() => {
    expect(firings.open).toHaveLength(0);
  });
  expect(cancelled).toEqual(["POST /v1/routing/r1/cancel"]);
});

test("the log opens a firing and closes it with the landing", async () => {
  vi.useFakeTimers();
  let logged = [anAction("1", "captured", {})];

  pool((request) =>
    routeOf(request).startsWith("GET /v1/actions")
      ? json(200, { values: logged })
      : quiet(),
  );
  render(StatusLine);
  await vi.advanceTimersByTimeAsync(100);

  logged = [
    anAction("2", "template-fired", {
      record: "r1",
      template: "t1",
      name: "Research links",
      until: "2099-01-01T00:00:00.000Z",
    }),
    ...logged,
  ];
  await vi.advanceTimersByTimeAsync(10_000);
  await screen.findByText("routing · Research links");

  logged = [
    anAction("3", "routed", {
      record: "r1",
      template: "t1",
      firedByTag: true,
      destination: "vault",
      pointer: "research/a.md",
    }),
    ...logged,
  ];
  await vi.advanceTimersByTimeAsync(10_000);

  await vi.waitFor(() => {
    expect(screen.queryByText("routing · Research links")).toBeNull();
  });
  expect(notices.latest?.what).toMatch(/^routed · /);
});

test("more than one firing is counted, and each is cancelled in the panel", async () => {
  pool(quiet);
  render(StatusLine);

  firings.opened({ record: "r1", item: "one", name: "Research" });
  firings.opened({ record: "r2", item: "two", name: "Reading" });

  await fireEvent.click(
    await screen.findByRole("button", { name: /routing 2/ }),
  );

  const flying = screen.getByRole("list", { name: "in flight" });
  expect(
    within(flying).getAllByRole("button", { name: "cancel" }),
  ).toHaveLength(2);
});

test("signed out, it says only the work this device holds and whether the pool answers", async () => {
  pool(quiet);
  render(StatusLine, { shut: true });

  notices.raise({ what: "routed · vault" });

  expect(screen.queryByText("routed · vault")).toBeNull();
  expect(screen.getByRole("img", { name: "reachable" })).toBeDefined();
});
