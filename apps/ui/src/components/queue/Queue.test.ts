import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { tick } from "svelte";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import { lingering } from "$lib/lingering.svelte";
import { notices } from "$lib/notices.svelte";
import { NO_MORE_OFFLINE } from "$lib/said";
import { briefly } from "$lib/stamp";
import { online } from "$testing/dom";
import { rail } from "$lib/rail.svelte";
import { remember } from "$lib/order";
import Queue from "./Queue.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

// Module-scoped reading preference, so a test that furls the rail unfurls it.
afterEach(() => {
  if (rail.furled) rail.toggle();
  notices.clear();
  lingering.clear();
});

function queued(...ids: string[]) {
  return (request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, { values: ids.map((id) => anItem(id)) })
      : json(200, { values: [] });
}

/** A row opens on its own stamp, which is the row's title. */
function open(at: number) {
  return fireEvent.click(
    screen.getAllByRole("button", { expanded: false })[at],
  );
}

/** Where the person had scrolled, as the browser would report it. */
function scrolledTo(at: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: at });
  return fireEvent.scroll(window);
}

test("puts the view back where the person left it, without asking the pool", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  await scrolledTo(240);

  cleanup();
  render(Queue);

  await vi.waitFor(() => {
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 240 });
  });
  expect(asked()).toEqual(["GET /v1/queue"]);
});

test("archives with the pool unreachable, and disables what it cannot queue", async () => {
  const transport = pool(queued("one"));
  online(false);

  render(Queue);
  await screen.findByText("one");
  transport.unreachable(true);

  // Processing happens in the row, so the actions are behind opening it.
  await fireEvent.click(screen.getByRole("button", { expanded: false }));

  const disabled = (name: string) =>
    (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

  expect(disabled("mark done")).toBe(true);
  expect(disabled("route")).toBe(true);
  expect(disabled("archive")).toBe(false);

  await fireEvent.click(screen.getByRole("button", { name: "archive" }));

  // The pool never answered it, and the item left the queue all the same.
  await screen.findByText("zero");
  expect(asked()).toContain("POST /v1/items/one/archive");
});

test("opens one row at a time, in place", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await open(0);
  expect(screen.getAllByRole("button", { name: "archive" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);

  await open(0);

  // The second row's stamp, the first one now being expanded.
  const stamps = screen.getAllByRole("button", { expanded: true });
  expect(stamps).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "archive" })).toHaveLength(1);
});

/** The queue holds unrouted items, so opening one has nothing to ask about. */
test("opens a row without asking where an item has never been", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  // The rail says so collapsed, which is what makes the read unnecessary.
  expect(screen.getByText("unrouted")).toBeDefined();

  await open(0);

  expect(await screen.findByText("payload")).toBeDefined();
  expect(asked()).not.toContain("GET /v1/items/one/routing");
});

test("draws the way to add to the queue even when the queue is empty", async () => {
  pool(queued());

  render(Queue);

  expect(await screen.findByText("zero")).toBeDefined();
  expect(screen.getByLabelText("What to capture")).toBeDefined();
});

test("reads the drained queue as the thing it was working toward", async () => {
  pool(queued());

  render(Queue);

  // The state word idiom, which is what the register says became of a thing.
  expect(await screen.findByText("zero")).toBeDefined();
  expect(screen.getByText(/The queue is empty/)).toBeDefined();
  expect(screen.queryByText(/Empty —/)).toBeNull();
});

test("offers the edit on an unprocessed row and not on a processed one", async () => {
  pool((request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, {
          values: [
            anItem("mine"),
            // Held from an earlier read: the pool would not answer it as work.
            anItem("gone", { revisedInto: ["later"] }),
          ],
        })
      : json(200, { values: [] }),
  );

  render(Queue);
  await screen.findByText("mine");

  await open(1);
  expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
  expect(screen.getByText("revised")).toBeDefined();

  await open(0);
  expect(screen.getAllByRole("button", { name: "edit" })).toHaveLength(1);
});

test("says on the row it opens when an item was last touched", async () => {
  const touchedAt = "2026-08-19T22:14:00.000Z";

  pool((request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, {
          values: [
            anItem("touched", {
              createdAt: "2026-08-01T09:00:00.000Z",
              contentUpdatedAt: touchedAt,
            }),
            anItem("fresh", { createdAt: "2026-08-02T09:00:00.000Z" }),
          ],
        })
      : json(200, { values: [] }),
  );

  render(Queue);
  await screen.findByText("touched");

  // A plain fact about the note rather than what orders it, so it waits for
  // the row to open along with everything else the rail knows.
  expect(screen.queryByText(briefly(touchedAt))).toBeNull();

  await open(0);
  expect(await screen.findByText(briefly(touchedAt))).toBeDefined();

  // The other row, which is now the only collapsed one left.
  await open(0);
  expect(await screen.findByText("not since capture")).toBeDefined();
});

/** Furling hides the rail, and the stamp is the only way into a row. */
test("keeps a way into a row with the rail furled", async () => {
  pool(queued("one"));
  rail.toggle();

  render(Queue);
  await screen.findByText("one");

  await open(0);
  expect(screen.getAllByRole("button", { name: "archive" })).toHaveLength(1);
});

test("reads from the end the reader last chose, not the one the queue defaults to", async () => {
  remember("queue", "newest-first");
  const transport = pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  const read = transport.sent.find(
    (request) => routeOf(request) === "GET /v1/queue",
  );
  expect(new URL(read!.url).searchParams.get("order")).toBe("newest-first");
});

function taken(request: Request) {
  return request.json().then((body) => {
    const envelope = body as { id: string; source: string; payload: unknown };
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id, {
        source: envelope.source,
        payload: envelope.payload as ReturnType<typeof anItem>["payload"],
      }),
      matchedOn: "id",
    });
  });
}

async function capture(said: string) {
  const written = screen.getByLabelText("What to capture");
  await fireEvent.input(written, { target: { value: said } });
  return fireEvent.click(screen.getByRole("button", { name: "capture" }));
}

test("says a capture is pending until the pool has taken it", async () => {
  const transport = pool((request) =>
    routeOf(request) === "POST /v1/captures"
      ? taken(request)
      : json(200, { values: [] }),
  );

  render(Queue);
  await screen.findByText("zero");
  transport.unreachable(true);

  await capture("made with the pool out of reach");
  await screen.findByText("made with the pool out of reach");
  expect(await screen.findByText("pending")).toBeDefined();

  transport.unreachable(false);
  await client.drain();

  await vi.waitFor(() => {
    expect(screen.queryByText("pending")).toBeNull();
  });
  expect(screen.getByText("made with the pool out of reach")).toBeDefined();
});

test("does not draw a refused operation as pending", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/items/one/archive"
      ? json(409, { error: { code: "already-archived" } })
      : queued("one")(request),
  );

  render(Queue);
  await screen.findByText("one");

  await fireEvent.click(screen.getByRole("button", { expanded: false }));
  await fireEvent.click(screen.getByRole("button", { name: "archive" }));

  // The pool put the row back, and the operation it refused is still held.
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/archive");
    expect(screen.queryByText("zero")).toBeNull();
  });
  expect(screen.queryByText("pending")).toBeNull();
});

test("says nothing in the register about a queue the pool has not answered for", async () => {
  const transport = pool(queued("one"));
  transport.unreachable(true);

  render(Queue);
  await screen.findByText(NO_MORE_OFFLINE);

  // The chrome carries the offline mark, the foot says what it costs; the
  // register repeats neither that nor what the surface is drawn from.
  expect(screen.queryByText("queue")).toBeNull();
  expect(screen.queryByText("the daemon is not reachable")).toBeNull();
  expect(screen.queryByText("zero")).toBeNull();
});

test("offers no page it cannot fetch while the pool is out of reach", async () => {
  const transport = pool(queued("one"));

  render(Queue);
  expect(
    await screen.findByRole("button", { name: "load more" }),
  ).toBeDefined();

  transport.unreachable(true);
  await client.loadQueue();

  expect(await screen.findByText(NO_MORE_OFFLINE)).toBeDefined();
  expect(screen.queryByRole("button", { name: "load more" })).toBeNull();
});

test("says nothing in the foot of a queue read to the end", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  expect(screen.queryByRole("button", { name: "load more" })).toBeNull();

  // There is no next page to be denied, so being out of reach costs nothing.
  online(false);
  await tick();
  expect(screen.queryByText(NO_MORE_OFFLINE)).toBeNull();
});

test("draws the read the pool refused", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(400, { error: { code: "bad-position" } })
      : json(200, { values: [] }),
  );

  render(Queue);

  expect(
    await screen.findByText("the app lost its place in the list; reload"),
  ).toBeDefined();
  expect(screen.getAllByText("queue")).toHaveLength(1);
});

test("draws a picture before it is sent, and the pool's copy after", async () => {
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route.startsWith("PUT /v1/assets/")) {
      return json(201, { id: route.slice("PUT /v1/assets/".length) });
    }
    return route === "POST /v1/captures"
      ? taken(request)
      : json(200, { values: [] });
  });

  render(Queue);
  await screen.findByText("zero");
  transport.unreachable(true);

  await fireEvent.change(screen.getByLabelText("A picture to capture"), {
    target: {
      files: [new File(["bytes"], "shot.png", { type: "image/png" })],
    },
  });
  await capture("a picture");

  const drawn = await vi.waitFor(() => {
    const image = document.querySelector("img");
    expect(image).not.toBeNull();
    return image as HTMLImageElement;
  });
  // Its own bytes: nothing has been uploaded, so the pool's URL would be broken.
  expect(drawn.getAttribute("src")).not.toContain("/v1/assets/");

  transport.unreachable(false);
  await client.drain();

  await vi.waitFor(() => {
    expect(document.querySelector("img")?.getAttribute("src")).toContain(
      "/v1/assets/",
    );
  });
});

test("offers the way to an item without taking the gesture that opens the row", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  // Triage is opening a row in place, and the address is behind that rather
  // than instead of it.
  expect(screen.queryByRole("link", { name: "open" })).toBeNull();

  await open(0);
  expect(screen.getByRole("link", { name: "open" }).getAttribute("href")).toBe(
    "/items/one",
  );
  expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
});

test("keeps a record to one line on the opened row, and makes it the way in", async () => {
  pool((request) => {
    switch (routeOf(request)) {
      case "GET /v1/queue":
        return json(200, {
          values: [
            anItem("one", {
              routing: {
                records: 1,
                pending: 0,
                to: [{ kind: "destination", destination: "vault" }],
              },
            }),
          ],
        });
      case "GET /v1/items/one/routing":
        return json(200, {
          values: [
            {
              id: "rec",
              item: "one",
              target: {
                kind: "destination",
                destination: "vault",
                capability: "create-note",
                arguments: { directory: "drafts" },
              },
              state: "delivered",
              at: "2026-08-19T22:14:00.000Z",
            },
          ],
        });
      default:
        return json(200, { values: [] });
    }
  });

  render(Queue);
  await screen.findByText("one");
  await open(0);

  // A summary and nothing more: what the record was given is read elsewhere.
  const line = await screen.findByRole("link", { name: /create-note/ });
  expect(line.getAttribute("href")).toBe("/items/one/records/rec");
  expect(screen.queryByText("drafts")).toBeNull();
});

test("a row that leaves the queue says where it went", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") {
      return json(200, { values: [anItem("one")] });
    }
    if (route === "POST /v1/items/one/mark-processed") {
      return json(200, {
        id: "r",
        item: "one",
        at: "2026-09-03T10:00:00.000Z",
        state: "delivered",
        target: { kind: "user" },
      });
    }
    return json(200, { values: [] });
  });

  render(Queue);
  await screen.findByText("one");
  await open(0);

  await fireEvent.click(screen.getByRole("button", { name: "mark done" }));

  await vi.waitFor(() => {
    expect(notices.shown.map((notice) => notice.what)).toContain("marked done");
  });
});

test("archiving says so, the row having gone with no other trace", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  await open(0);

  await fireEvent.click(screen.getByRole("button", { name: "archive" }));

  await vi.waitFor(() => {
    expect(notices.shown.map((notice) => notice.what)).toContain("archived");
  });
});

/** The row is still there to say it: a notice would be a second voice. */
test("tagging says nothing in the corner", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  await open(0);

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  const field = screen.getByLabelText("Add a tag");
  await fireEvent.input(field, { target: { value: "research" } });
  await fireEvent.submit(field.closest("form") as HTMLFormElement);

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(notices.shown).toHaveLength(0);
});

test("a row that has gone is watched out, wearing what became of it", async () => {
  let queued = [anItem("one"), anItem("two")];
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") return json(200, { values: queued });
    if (route === "POST /v1/items/one/archive") {
      queued = queued.filter((item) => item.id !== "one");
      return json(204, undefined);
    }
    return json(200, { values: [] });
  });

  render(Queue);
  await screen.findByText("one");
  await open(0);

  await fireEvent.click(screen.getByRole("button", { name: "archive" }));

  // Gone from the queue and still on the register, saying what became of it.
  await vi.waitFor(() => {
    expect(screen.getByText("archived")).toBeDefined();
  });
  expect(screen.getByText("one")).toBeDefined();
});

/** It is a row being watched out, not one to use: the pool no longer has it as work. */
test("a departing row cannot be opened or acted on", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  await open(0);
  await fireEvent.click(screen.getByRole("button", { name: "archive" }));

  await vi.waitFor(() => {
    expect(screen.queryByRole("button", { name: "archive" })).toBeNull();
  });
  expect(screen.queryByRole("button", { name: "route" })).toBeNull();
  expect(screen.getByText("one")).toBeDefined();
});

/**
 * The place and the path say where a copy went; only the excerpt says which
 * capture went, and the row it names has left the register by then.
 */
test("a routing says where it went, and which capture it was", async () => {
  const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";

  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") {
      return json(200, {
        values: [
          anItem("one", {
            payload: {
              type: "text",
              content: { text: "the picker needs a trail" },
              metadata: {},
              assets: [],
            },
          }),
        ],
      });
    }
    if (route === "GET /v1/destinations") {
      return json(200, {
        values: [
          {
            id: VAULT,
            name: "Vault",
            kind: "filesystem",
            settings: {},
            retired: false,
          },
        ],
      });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [{ name: "append", accepts: ["text"] }],
      });
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        at: "2026-09-03T10:00:00.000Z",
        state: "delivered",
        pointer: "notes/inbox/picker.md",
        target: {
          kind: "destination",
          destination: VAULT,
          capability: "append",
          arguments: {},
        },
      });
    }
    return json(200, { values: [] });
  });

  render(Queue);
  await screen.findByText("the picker needs a trail");
  await open(0);

  await fireEvent.click(screen.getByRole("button", { name: "route" }));
  await fireEvent.click(await screen.findByRole("button", { name: /Vault/ }));
  await fireEvent.click(await screen.findByRole("button", { name: /append/ }));

  // Two of them: the row's action, and the composer's commit over it.
  const commit = screen.getAllByRole("button", { name: "route" }).at(-1);
  await fireEvent.click(commit as HTMLElement);

  await vi.waitFor(() => {
    expect(notices.shown).toHaveLength(1);
  });

  const said = notices.shown[0];
  expect(said?.what).toBe("routed · Vault");
  expect(said?.why).toBe("notes/inbox/picker.md");
  expect(said?.about).toContain("the picker needs a trail");
  expect(said?.about).toMatch(/\d\d-\d\d \d\d:\d\d/);

  // And the row is watched out of the register rather than vanishing under it.
  expect(screen.getByText("routed")).toBeDefined();
});

/** Recorded and not delivered: it was tried, and it will be tried again. */
test("a routing the pool has not carried out says it is retrying", async () => {
  const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";

  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue")
      return json(200, { values: [anItem("one")] });
    if (route === "GET /v1/destinations") {
      return json(200, {
        values: [
          {
            id: VAULT,
            name: "Vault",
            kind: "filesystem",
            settings: {},
            retired: false,
          },
        ],
      });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [{ name: "append", accepts: ["text"] }],
      });
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        at: "2026-09-03T10:00:00.000Z",
        state: "pending",
        target: {
          kind: "destination",
          destination: VAULT,
          capability: "append",
          arguments: { path: "notes/daily.md" },
        },
      });
    }
    return json(200, { values: [] });
  });

  render(Queue);
  await screen.findByText("one");
  await open(0);

  await fireEvent.click(screen.getByRole("button", { name: "route" }));
  await fireEvent.click(await screen.findByRole("button", { name: /Vault/ }));
  await fireEvent.click(await screen.findByRole("button", { name: /append/ }));

  // Two of them: the row's action, and the composer's commit over it.
  const commit = screen.getAllByRole("button", { name: "route" }).at(-1);
  await fireEvent.click(commit as HTMLElement);

  await vi.waitFor(() => {
    expect(notices.shown[0]?.what).toBe("retrying · Vault");
  });
  expect(notices.shown[0]?.why).toBe("not delivered yet · notes/daily.md");
});

/**
 * Where it stood, not where the list starts. The item is out of the queue
 * before `route()` answers, so the neighbour is read while the row still has
 * one — a routed row rising to the top of the register is a row that vanished
 * and something else appearing, which is what the linger exists to prevent.
 */
test("a routed row is watched out from where it stood", async () => {
  const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";

  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") {
      return json(200, {
        values: ["one", "two", "three"].map((id) => anItem(id)),
      });
    }
    if (route === "GET /v1/destinations") {
      return json(200, {
        values: [
          {
            id: VAULT,
            name: "Vault",
            kind: "filesystem",
            settings: {},
            retired: false,
          },
        ],
      });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [{ name: "append", accepts: ["text"] }],
      });
    }
    if (route === "POST /v1/items/two/route") {
      return json(200, {
        id: "r",
        item: "two",
        at: "2026-09-03T10:00:00.000Z",
        state: "delivered",
        pointer: "notes/inbox/two.md",
        target: {
          kind: "destination",
          destination: VAULT,
          capability: "append",
          arguments: {},
        },
      });
    }
    return json(200, { values: [] });
  });

  render(Queue);
  await screen.findByText("two");

  // The middle row, so a departure from the foot and from the head both read
  // as wrong.
  await open(1);
  await fireEvent.click(screen.getByRole("button", { name: "route" }));
  await fireEvent.click(await screen.findByRole("button", { name: /Vault/ }));
  await fireEvent.click(await screen.findByRole("button", { name: /append/ }));
  await fireEvent.click(
    screen.getAllByRole("button", { name: "route" }).at(-1) as HTMLElement,
  );

  const word = await screen.findByText("routed");

  // DOCUMENT_POSITION_FOLLOWING is 4, PRECEDING is 2.
  const after = screen.getByText("one").compareDocumentPosition(word) & 4;
  const before = screen.getByText("three").compareDocumentPosition(word) & 2;

  expect(after).toBeTruthy();
  expect(before).toBeTruthy();
});
