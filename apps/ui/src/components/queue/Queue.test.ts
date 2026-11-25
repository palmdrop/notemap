import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { tick } from "svelte";

import { anItem, json, read, routeOf } from "@notemap/client/testing";

import { asked, client, pool, sent } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import { quick } from "$lib/quicking.svelte";
import { NO_MORE_OFFLINE } from "$lib/said";
import { keyboard, online, viewport } from "$testing/dom";
import { registering, said } from "$testing/highlights";
import { remember } from "$lib/order";
import { remember as rememberView } from "$lib/view";
import { firings } from "$lib/firings.svelte";
import { commandOf } from "$lib/command/stack.svelte";
import Queue from "./Queue.svelte";
import Listed from "./Queue.fixture.svelte";

keyboard();

/** Every slide and every leaving asked for, to tell a row that moved from one drawn still or not at all. */
const slid = vi.hoisted(() => ({
  calls: [] as { node: Element; still: boolean | undefined }[],
}));
vi.mock("$lib/motion", async (actual) => {
  const motion = await actual<typeof import("$lib/motion")>();
  return {
    ...motion,
    slide: (node: Element, params?: Parameters<typeof motion.slide>[1]) => {
      slid.calls.push({ node, still: params?.still });
      return motion.slide(node, params);
    },
    leave: (node: Element, params?: Parameters<typeof motion.leave>[1]) => {
      slid.calls.push({ node, still: params?.still });
      return motion.leave(node, params);
    },
  };
});

/** Whether a row holding these words slid, rather than being drawn still. */
const moved = (said: string) =>
  slid.calls.some(
    (call) => call.still === false && call.node.textContent?.includes(said),
  );

/** Leaving the surface needs a router, and there is none outside the app. */
const went = vi.hoisted(() => ({ to: [] as string[] }));

/** Shallow routing needs a router, and there is none outside the app. */
const replaced = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("$app/navigation", () => ({
  goto: (url: string) => void went.to.push(url),
  replaceState: (url: string | URL) => replaced.urls.push(String(url)),
}));

const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("$app/state", () => ({
  get page() {
    return { url: new URL(`http://localhost${at.path}`), route: { id: "/" } };
  },
}));

// Before rather than after: the unmount that ends a test slides its rows out
// after this file's own cleanup has run.
beforeEach(() => {
  slid.calls = [];
});

afterEach(() => {
  quick.close();
  notices.clear();
  went.to = [];
  replaced.urls = [];
  at.path = "/";
  localStorage.clear();
});

function queued(...ids: string[]) {
  return (request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, { values: ids.map((id) => anItem(id)) })
      : json(200, { values: [] });
}

/** A row is selected on its own stamp, which is the row's title. */
function open(at: number) {
  return fireEvent.click(stamps(false)[at]!);
}

/** The rows' own buttons: the order chooser answers `expanded` too. */
function stamps(expanded: boolean) {
  return screen.queryAllByRole("button", {
    expanded,
    name: /^\d{4}-\d{2}-\d{2}/,
  });
}

/** What the selected row offers: the keys' commands, there being no strip. */
const offered = (id: string) => commandOf(id);
const refused = (id: string) => offered(id)?.refusal !== undefined;

async function run(id: string) {
  const command = offered(id);
  if (command !== undefined && "run" in command) await command.run();
  await tick();
}

/** Discarding is the quick tier: it acts from the row, at once. */
async function discard() {
  await run("discard");
}

/** Where the person had scrolled, as the browser would report it. */
function scrolledTo(at: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: at });
  return fireEvent.scroll(window);
}

test("puts the view back where the person left it, and reads the queue again", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  await scrolledTo(240);

  cleanup();
  render(Queue);

  await vi.waitFor(() => {
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 240 });
  });
  // The place is the shell's own and costs nothing. The rows are not: what the
  // queue holds changes while the reader is elsewhere, so arriving is a read.
  expect(asked()).toEqual(["GET /v1/queue", "GET /v1/queue"]);
});

test("discards with the pool unreachable, and says what it cannot queue", async () => {
  const transport = pool(queued("one"));
  online(false);

  render(Queue);
  await screen.findByText("one");
  transport.unreachable(true);

  // Processing happens in the row, so the actions are behind opening it.
  await fireEvent.click(stamps(false)[0]!);

  // The door itself never closes: what a decision needs of the pool is said
  // by the surface behind it. On the row, discarding is the one decision that
  // needs nothing of the pool.
  expect(refused("process")).toBe(false);
  expect(refused("manual")).toBe(true);
  expect(refused("discard")).toBe(false);

  await discard();

  // The pool never answered it, and the decision was made all the same.
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/archive");
  });
  expect(notices.shown.at(-1)?.what).toBe("discarded");
});

test("opens one row at a time, in place", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await open(0);
  expect(stamps(true)).toHaveLength(1);

  await open(0);

  // The second row's stamp, the first one now being expanded.
  expect(stamps(true)).toHaveLength(1);
});

/** The queue holds unrouted items, so opening one has nothing to ask about. */
test("opens a row without asking where an item has never been, and without saying so", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  // Every row on the queue is unrouted, so a word saying so says nothing.
  expect(screen.queryByText("unrouted")).toBeNull();

  await open(0);

  expect(offered("process")).toBeDefined();
  expect(asked()).not.toContain("GET /v1/items/one/routing");
});

test("draws the way to add to the queue even when the queue is empty", async () => {
  pool(queued());

  render(Queue);

  expect(await screen.findByText("Queue is empty.")).toBeDefined();
  expect(screen.getByLabelText("What to capture")).toBeDefined();
});

test("reads the drained queue as the thing it was working toward", async () => {
  pool(queued());

  const { container } = render(Queue);

  // One line where the rows were, and no row drawn beside it: the register
  // stays, empty, for the first capture to slide into.
  expect(await screen.findByText("Queue is empty.")).toBeDefined();
  expect(screen.queryByText("zero")).toBeNull();
  expect(container.querySelector("[data-row]")).toBeNull();
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
  expect(offered("edit")).toBeUndefined();
  expect(screen.getByText("Revised")).toBeDefined();

  await open(0);
  expect(offered("edit")).toBeDefined();
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
    const envelope = body as {
      id: string;
      source: string;
      payload: { assets: { slot: string; asset: string }[] };
    };
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id, {
        source: envelope.source,
        payload: envelope.payload as ReturnType<typeof anItem>["payload"],
        // Resolved, as every read that answers an item does: what an
        // attachment is, is the pool's answer and not the envelope's.
        ...(envelope.payload.assets.length === 0
          ? {}
          : {
              assets: envelope.payload.assets.map((reference) => ({
                id: reference.asset,
                filename: "shot.png",
                mime: "image/png",
                blob: "sha-256:whatever",
                bytes: 5,
              })),
            }),
      }),
      matchedOn: "id",
    });
  });
}

async function capture(said: string) {
  const written = screen.getByLabelText("What to capture");
  await fireEvent.input(written, { target: { value: said } });
  return fireEvent.click(screen.getByRole("button", { name: "Capture" }));
}

/** A row comes and goes by sliding, by day or not: a read is what draws still. */
test.each(["by day"] as const)(
  "a captured row slides in and a released one slides out, read %s",
  async () => {
    let queued = [anItem("one")];
    pool((request) => {
      const route = routeOf(request);
      if (route === "GET /v1/queue") return json(200, { values: queued });
      if (route === "POST /v1/items/one/archive") {
        queued = [];
        return json(204, undefined);
      }
      if (route === "POST /v1/captures") return taken(request);
      return json(200, { values: [] });
    });

    render(Queue);
    await screen.findByText("one");
    expect(moved("one")).toBe(false);

    await capture("just written");
    await screen.findByText("just written");
    expect(moved("just written")).toBe(true);

    const row = screen.getByText("one").closest<HTMLElement>("[data-row]")!;
    await fireEvent.click(
      within(row).getByRole("button", { name: /^\d{4}-\d{2}-\d{2}/ }),
    );
    await discard();
    await fireEvent.keyDown(window, { key: "Escape" });
    await vi.waitFor(() => {
      expect(screen.queryByText("one")).toBeNull();
    });
    expect(moved("one")).toBe(true);
  },
);

/** A drained queue is still a list: the first row into it and the last out of it move. */
test.each(["timeline", "index"] as const)(
  "the first row into a drained queue slides in, and the last one out slides out, in the %s",
  async (view) => {
    rememberView(view);
    pool((request) =>
      routeOf(request) === "POST /v1/captures"
        ? taken(request)
        : json(200, { values: [] }),
    );

    render(Queue);
    await screen.findByText("Queue is empty.");

    await capture("into the empty queue");
    await screen.findByText("into the empty queue");
    expect(screen.queryByText("Queue is empty.")).toBeNull();
    expect(moved("into the empty queue")).toBe(true);

    await fireEvent.keyDown(window, { key: "Escape" });
    await fireEvent.keyDown(window, { key: "j" });
    await fireEvent.keyDown(window, { key: "D" });
    await fireEvent.keyDown(window, { key: "Escape" });
    await screen.findByText("Queue is empty.");
    // Once in, once out.
    expect(
      slid.calls.filter(
        (call) =>
          call.still === false &&
          call.node.textContent?.includes("into the empty queue"),
      ),
    ).toHaveLength(2);
  },
);

test("says a capture is pending until the pool has taken it", async () => {
  const transport = pool((request) =>
    routeOf(request) === "POST /v1/captures"
      ? taken(request)
      : json(200, { values: [] }),
  );

  render(Queue);
  await screen.findByText("Queue is empty.");
  transport.unreachable(true);

  await capture("made with the pool out of reach");
  await screen.findByText("made with the pool out of reach");
  expect(
    await screen.findByRole("img", { name: "waiting to send" }),
  ).toBeDefined();

  transport.unreachable(false);
  await client.drain();

  await vi.waitFor(() => {
    expect(screen.queryByRole("img", { name: "waiting to send" })).toBeNull();
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

  await fireEvent.click(stamps(false)[0]!);
  await discard();

  // The pool put the row back, and the operation it refused is still held.
  // The mark is drawn while the operation is in flight, so this waits for the
  // refusal rather than reading the row in the window before it lands.
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/archive");
    expect(screen.queryByText("Queue is empty.")).toBeNull();
    expect(screen.queryByRole("img", { name: "waiting to send" })).toBeNull();
  });
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
  expect(screen.queryByText("Queue is empty.")).toBeNull();
});

test("offers no page it cannot fetch while the pool is out of reach", async () => {
  const transport = pool(queued("one"));

  render(Queue);
  expect(
    await screen.findByRole("button", { name: "Load more" }),
  ).toBeDefined();

  transport.unreachable(true);
  await client.loadQueue();

  expect(await screen.findByText(NO_MORE_OFFLINE)).toBeDefined();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

test("says nothing in the foot of a queue read to the end", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();

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
  await screen.findByText("Queue is empty.");
  transport.unreachable(true);

  await fireEvent.change(screen.getByLabelText("Files to capture"), {
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
  expect(offered("open")).toBeUndefined();

  await open(0);
  const open_ = offered("open");
  expect(open_ !== undefined && "href" in open_ ? open_.href : "").toBe(
    "/items/one",
  );
  expect(stamps(true)).toHaveLength(1);
});

test("a route takes no room on a queue row: the feed keeps its record line", async () => {
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
                templates: [],
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

  await tick();
  expect(screen.queryByRole("link", { name: /drafts/ })).toBeNull();
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

  await run("manual");

  await vi.waitFor(() => {
    expect(notices.shown.map((notice) => notice.what)).toContain("manual");
  });
  expect(notices.shown.at(-1)?.offer?.label).toBe("undo");
});

test("discarding says so, and offers the row back", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  await open(0);

  await discard();

  await vi.waitFor(() => {
    expect(notices.shown.map((notice) => notice.what)).toContain("discarded");
  });
  const said = notices.shown.at(-1);
  expect(said?.alarm).toBeUndefined();
  expect(said?.offer?.label).toBe("undo");
  // The row it was made on is one look away from being gone.
  expect(said?.href).toBe("/items/one");
});

test("one discard's offer stands at a time, however many rows go", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await open(0);
  await discard();
  await vi.waitFor(() => {
    expect(notices.shown).toHaveLength(1);
  });

  // The selection has moved to the row that took the first one's place.
  await discard();

  await vi.waitFor(() => {
    expect(
      notices.shown.filter((notice) => notice.what === "discarded"),
    ).toHaveLength(1);
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
  await fireEvent.keyDown(field, { key: "Enter" });

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(notices.shown).toHaveLength(0);
});

/** The offer's rows are the chooser's, and a click on one is not a click on the row. */
test("a tag taken from the offer with the mouse leaves the row selected", async () => {
  pool(queued("one"));

  const { container } = render(Queue);
  await screen.findByText("one");
  await open(0);

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  await fireEvent.input(screen.getByLabelText("Add a tag"), {
    target: { value: "research" },
  });
  // Gone with the take, as it is under reduced motion or a long press, so the
  // click the press ends in lands on the row beneath.
  await fireEvent.mouseDown(screen.getByRole("option", { name: /research/ }));
  const beneath = container.querySelector("[data-body]")!;
  await fireEvent.mouseUp(beneath);
  await fireEvent.click(beneath, { detail: 1 });

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(container.querySelectorAll("[data-selected]")).toHaveLength(2);
});

/** A processed item is seen on the feed; the corner holds the way back. */
/** The decision can be looked at, and taken back from the row, after it is made. */
test("a discarded row stays where it stood while it is selected, and leaves when the selection does", async () => {
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

  const { container } = render(Queue);
  await screen.findByText("one");
  await open(0);

  await discard();

  await vi.waitFor(() => {
    expect(screen.getByText("Discarded")).toBeDefined();
  });
  expect(screen.getByText("one")).toBeDefined();
  expect(offered("undiscard")).toBeDefined();
  expect(container.querySelectorAll("[data-selected]")).toHaveLength(2);
  expect(notices.shown.at(-1)?.offer?.label).toBe("undo");

  await fireEvent.keyDown(window, { key: "Escape" });
  await vi.waitFor(() => {
    expect(screen.queryByText("one")).toBeNull();
  });
  expect(screen.getByText("two")).toBeDefined();
});

test("the queue is not empty while its last row is held", async () => {
  let queued = [anItem("one")];
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") return json(200, { values: queued });
    if (route === "POST /v1/items/one/archive") {
      queued = [];
      return json(204, undefined);
    }
    return json(200, { values: [] });
  });

  render(Queue);
  await screen.findByText("one");
  await open(0);
  await discard();
  await screen.findByText("Discarded");

  expect(screen.queryByText("Queue is empty.")).toBeNull();

  await fireEvent.keyDown(window, { key: "Escape" });
  await screen.findByText("Queue is empty.");
});

test("walking off a held row leaves it behind", async () => {
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

  const { container } = render(Queue);
  await screen.findByText("one");
  await open(0);
  await discard();
  await screen.findByText("Discarded");

  await fireEvent.keyDown(window, { key: "j" });
  await vi.waitFor(() => {
    expect(screen.queryByText("one")).toBeNull();
  });
  const boxed = container.querySelectorAll("[data-selected]");
  expect(boxed).toHaveLength(2);
  expect(boxed[1]?.textContent).toContain("two");
});

test("goes to process on a double click, and leaves the row selected", async () => {
  pool(queued("one"));

  render(Queue);
  const body = await screen.findByText("one");

  await fireEvent.click(body, { detail: 1 });
  await fireEvent.click(body, { detail: 2 });
  await fireEvent.dblClick(body);

  expect(quick.item).toBe("one");
  // When wide a click opens the item beside the list; the second click of a
  // double is not a second opening.
  expect(went.to).toEqual(["/items/one"]);
});

/** The box is the selection, and the actions are its foot. */
test("draws the box around the selected row and nowhere else", async () => {
  pool(queued("one", "two"));

  const { container } = render(Queue);
  await screen.findByText("one");
  // The capture box answers `data-selected` too, and has its own test.
  const boxed = () => container.querySelectorAll("[data-selected]:not(form)");

  expect(boxed()).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Add a tag" })).toBeNull();

  await open(0);
  expect(boxed()).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Add a tag" })).toHaveLength(1);
  expect(offered("discard")).toBeDefined();
});

/** A selected row's actions are the keys' and the hover's Route: no strip under it. */
test("draws no strip of actions under the selected row", async () => {
  pool(queued("one", "two"));

  const { container } = render(Queue);
  await screen.findByText("one");

  await open(0);
  expect(container.querySelectorAll("[data-foot]")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
  expect(offered("discard")).toBeDefined();
});

const LATER = "2026-08-19T10:00:00.000Z";

test("j past the last row held reads the next page and steps into it", async () => {
  pool((request) => {
    if (routeOf(request) !== "GET /v1/queue") return json(200, { values: [] });
    return new URL(request.url).searchParams.has("after")
      ? json(200, { values: [anItem("two", { createdAt: LATER })] })
      : json(200, { values: [anItem("one")], next: "/v1/queue?after=one" });
  });

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "j" });
  await screen.findByText("two");

  await vi.waitFor(() => {
    expect(stamps(true)[0]?.textContent).toContain(LATER.slice(0, 10));
  });
});

test("brings the whole row walked to into view, its foot and all", async () => {
  pool(queued("one", "two"));
  const scrolled = vi.mocked(Element.prototype.scrollIntoView);
  scrolled.mockClear();

  render(Queue);
  await screen.findByText("one");
  await fireEvent.keyDown(window, { key: "j" });

  await vi.waitFor(() => {
    expect(scrolled.mock.contexts.at(-1)).toHaveProperty("dataset.row", "one");
  });
});

test("walks the rows with j and k, and acts on the one selected", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  const selected = () => stamps(true).length;

  await fireEvent.keyDown(window, { key: "j" });
  expect(selected()).toBe(1);
  expect(stamps(true)[0]?.textContent).toContain(
    anItem("one").createdAt.slice(0, 10),
  );

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "k" });
  expect(selected()).toBe(1);

  await fireEvent.keyDown(window, { key: "t" });
  expect(screen.getByLabelText("Add a tag")).toBeDefined();

  // A key pressed while writing is the field's.
  await fireEvent.keyDown(screen.getByLabelText("Add a tag"), { key: "D" });
  expect(asked()).not.toContain("POST /v1/items/one/archive");

  await fireEvent.keyDown(window, { key: "Escape" });
  expect(selected()).toBe(0);

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "D" });
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/archive");
  });
});

test("enter selects, and enter on a selected row opens process", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  // Out of the capture box, which is selected when the queue is drawn.
  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "Enter" });
  expect(stamps(true)).toHaveLength(1);
  expect(went.to).toEqual([]);

  await fireEvent.keyDown(window, { key: "Enter" });
  expect(quick.item).toBe("one");
});

/** A decision takes the row away; the selection stays where the hand is. */
test("a decision, then j, then the same decision walks the list", async () => {
  let queued = [anItem("one"), anItem("two"), anItem("three")];
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") return json(200, { values: queued });
    if (route === "POST /v1/items/two/archive") {
      queued = queued.filter((item) => item.id !== "two");
      return json(204, undefined);
    }
    return json(200, { values: [] });
  });

  const { container } = render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "D" });
  await screen.findByText("Discarded");

  await fireEvent.keyDown(window, { key: "j" });
  await vi.waitFor(() => {
    expect(screen.queryByText("two")).toBeNull();
  });
  const boxed = container.querySelectorAll("[data-selected]");
  expect(boxed).toHaveLength(2);
  expect(boxed[1]?.textContent).toContain("three");

  await fireEvent.keyDown(window, { key: "D" });
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/three/archive");
  });
});

/** Back from the process surface, the row it was about is still the one selected. */
test("arrives with the row named on its address selected, and takes the name off again", async () => {
  pool(queued("one", "two"));
  at.path = "/?selected=two";

  render(Queue);
  await screen.findByText("two");

  await vi.waitFor(() => {
    expect(stamps(true)).toHaveLength(1);
  });
  expect(offered("discard")).toBeDefined();
  expect(replaced.urls).toEqual(["http://localhost/"]);

  // The keys are the row's: the capture field did not take the caret.
  expect(document.activeElement).not.toBe(
    screen.getByLabelText("What to capture"),
  );
  await fireEvent.keyDown(window, { key: "D" });
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/two/archive");
  });
});

test("back from processing, a row the queue no longer holds is drawn where its order puts it", async () => {
  const one = anItem("one", { createdAt: "2026-09-12T08:00:00.000Z" });
  const two = anItem("two", {
    createdAt: "2026-09-12T09:00:00.000Z",
    routing: { records: 1, pending: 0, to: [], templates: [] },
  });
  const three = anItem("three", { createdAt: "2026-09-12T10:00:00.000Z" });
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") return json(200, { values: [one, three] });
    if (route === "GET /v1/items/two") return json(200, two);
    return json(200, { values: [] });
  });
  await client.item("two");
  at.path = "/?selected=two";

  render(Queue);
  await screen.findByText("two");
  await screen.findByText("three");

  const [first, second, third] = ["one", "two", "three"].map((id) =>
    screen.getByText(id),
  );
  expect(
    first!.compareDocumentPosition(second!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    second!.compareDocumentPosition(third!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("leaves the caret out of the capture field on arrival, so the keys are the queue's", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  const field = screen.getByLabelText("What to capture");
  expect(document.activeElement).not.toBe(field);
  await fireEvent.keyDown(window, { key: "f" });
  expect((field as HTMLTextAreaElement).value).toBe("");
});

/** The index is one line per item, for scanning; the timeline is for reading. */
test("draws the index on request, keeps it on the URL, and reads it back on arrival", async () => {
  pool((request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, {
          values: [
            anItem("one", { createdAt: "2026-09-12T08:14:00.000Z" }),
            anItem("two", { createdAt: "2026-09-12T11:40:00.000Z" }),
            anItem("three", { createdAt: "2026-09-13T07:02:00.000Z" }),
          ],
        })
      : json(200, { values: [] }),
  );

  const { container } = render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "f" });
  await fireEvent.click(await screen.findByRole("radio", { name: "Index" }));
  await fireEvent.click(screen.getByRole("button", { name: /^Show/ }));

  expect(replaced.urls).toEqual(["http://localhost/?view=index"]);
  expect(localStorage.getItem("notemap:view")).toBe("index");

  // Read by day, as the rows are: a heading for each day and no gaps.
  expect(container.querySelectorAll("[data-gap]")).toHaveLength(0);
  expect(container.querySelectorAll("[data-day]").length).toBeGreaterThan(0);

  cleanup();
  rememberView("index");
  render(Queue);
  await screen.findByText("one");
  await fireEvent.keyDown(window, { key: "f" });
  expect(
    (await screen.findByRole("radio", { name: "Index" })).getAttribute(
      "aria-checked",
    ),
  ).toBe("true");
});

test("v turns the list to the other view, and back", async () => {
  pool(queued("one"));

  const { container } = render(Queue);
  await screen.findByText("one");
  await fireEvent.keyDown(window, { key: "Escape" });

  await fireEvent.keyDown(window, { key: "v" });
  expect(replaced.urls.at(-1)).toBe("http://localhost/?view=index");
  expect(container.querySelector("[data-rail]")).toBeNull();

  await fireEvent.keyDown(window, { key: "v" });
  expect(replaced.urls.at(-1)).toBe("http://localhost/");
  expect(container.querySelector("[data-rail]")).not.toBeNull();
});

/** The stamp is a button of its own, and a click on it must not reach the line as a second one. */
test("an index line is selected from its stamp as from anywhere else on it", async () => {
  pool(queued("one"));
  rememberView("index");

  const { container } = render(Queue);
  await screen.findByText("one");

  await fireEvent.click(stamps(false)[0]!);
  expect(container.querySelector("[data-rail][data-selected]")).not.toBeNull();

  // Selected, the line is the whole row, and a click on it opens the item beside.
  await fireEvent.click(container.querySelector("[data-row] [data-body]")!);
  expect(went.to).toEqual(["/items/one"]);
});

/** Selected, an index line is the row the timeline draws, and does what it does. */
test("the selected index line opens into the whole row, actions and all", async () => {
  pool(queued("one", "two"));
  rememberView("index");

  const { container } = render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  expect(container.querySelectorAll("[data-row]")).toHaveLength(1);
  expect(container.querySelector("[data-row]")?.textContent).toContain("one");
  expect(offered("discard")).toBeDefined();

  await fireEvent.keyDown(window, { key: "e" });
  expect(await screen.findByLabelText("What it says")).toBeTruthy();
  await fireEvent.keyDown(window, { key: "Escape" });

  await fireEvent.keyDown(window, { key: "j" });
  expect(container.querySelector("[data-row]")?.textContent).toContain("two");
  expect(screen.getByText("one").closest("[data-row]")).toBeNull();

  await fireEvent.keyDown(window, { key: "Enter" });
  expect(quick.item).toBe("two");
});

/** Shift is the guard on the one decision that sends an item away. */
test("a bare d discards nothing, and e opens the row for editing", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "d" });
  await tick();
  expect(asked()).not.toContain("POST /v1/items/one/archive");

  await fireEvent.keyDown(window, { key: "e" });
  expect(await screen.findByLabelText("What it says")).toBeTruthy();
});

/**
 * `Capture` is autofocused on arrival, so the first `esc` is what takes the
 * caret out of it and makes every other key on the surface reachable.
 */
test("the first esc leaves the capture box, and the next one deselects", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  const box = screen.getByLabelText("What to capture");
  box.focus();
  expect(document.activeElement).toBe(box);

  await fireEvent.keyDown(box, { key: "Escape" });
  expect(document.activeElement).not.toBe(box);

  await fireEvent.keyDown(window, { key: "j" });
  expect(stamps(true)).toHaveLength(1);

  await fireEvent.keyDown(window, { key: "Escape" });
  expect(stamps(true)).toHaveLength(0);
});

/** The box is the head of the queue, and selected as a row is. */
test("focusing the capture box selects it, and lets go of the selected row", async () => {
  pool(queued("one"));

  const { container } = render(Queue);
  await screen.findByText("one");
  const form = () => container.querySelector("form")!;
  const box = screen.getByLabelText("What to capture");

  box.focus();
  await fireEvent.keyDown(box, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  expect(stamps(true)).toHaveLength(1);
  expect(form().hasAttribute("data-selected")).toBe(false);

  box.focus();
  await tick();
  expect(stamps(true)).toHaveLength(0);
  expect(form().hasAttribute("data-selected")).toBe(true);
});

/**
 * `esc` in the box leaves the field and keeps the box: `t` tags the capture,
 * `enter` goes back in, `j` goes down to the first row, and `k` from there
 * comes back up into the field.
 */
test("the capture box is walked as the row above the first", async () => {
  pool(queued("one", "two"));

  const { container } = render(Queue);
  await screen.findByText("one");
  const box = screen.getByLabelText("What to capture");
  box.focus();

  await fireEvent.keyDown(box, { key: "Escape" });
  expect(document.activeElement).not.toBe(box);
  expect(container.querySelector("form")!.hasAttribute("data-selected")).toBe(
    true,
  );

  await fireEvent.keyDown(window, { key: "t" });
  const line = await screen.findByRole("combobox", { name: "Tag the capture" });
  await fireEvent.keyDown(line, { key: "Escape" });
  line.blur();

  await fireEvent.keyDown(window, { key: "j" });
  expect(stamps(true)).toHaveLength(1);
  expect(container.querySelector("form")!.hasAttribute("data-selected")).toBe(
    false,
  );

  await fireEvent.keyDown(window, { key: "k" });
  await tick();
  expect(stamps(true)).toHaveLength(0);
  expect(document.activeElement).toBe(box);

  await fireEvent.keyDown(box, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "Enter" });
  expect(document.activeElement).toBe(box);
});

test("with the capture box selected, e goes back into the field and mod-enter commits it", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") {
      return json(200, { values: [anItem("one")] });
    }
    if (route === "POST /v1/items") return json(201, anItem("fresh"));
    return json(200, { values: [] });
  });

  render(Queue);
  await screen.findByText("one");
  const box = screen.getByLabelText("What to capture") as HTMLTextAreaElement;
  box.focus();
  await fireEvent.input(box, { target: { value: "a thought" } });

  await fireEvent.keyDown(box, { key: "Escape" });
  expect(document.activeElement).not.toBe(box);

  await fireEvent.keyDown(window, { key: "e" });
  expect(document.activeElement).toBe(box);

  await fireEvent.keyDown(box, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "Enter", metaKey: true });
  await vi.waitFor(() => {
    expect(box.value).toBe("");
  });
});

/** The editable shape publishes its own `close`, so `esc` leaves it before it leaves the selection. */
test("esc leaves the row's editable shape before it leaves the row", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");

  // The caret is in the field it just opened: the first press only leaves it.
  field.focus();
  await fireEvent.keyDown(field, { key: "Escape" });
  expect(document.activeElement).not.toBe(field);
  expect(screen.queryByLabelText("What it says")).not.toBeNull();
  expect(stamps(true)).toHaveLength(1);

  await fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByLabelText("What it says")).toBeNull();
  expect(stamps(true)).toHaveLength(1);

  await fireEvent.keyDown(window, { key: "Escape" });
  expect(stamps(true)).toHaveLength(0);
});

/** `⏎` in the box is a new line; `mod+⏎` is the same press as `save`. */
test("mod-enter in the editable shape saves it", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");
  await fireEvent.input(field, { target: { value: "rewritten" } });

  await fireEvent.keyDown(field, { key: "Enter" });
  await fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
  await tick();
  expect(asked()).not.toContain("POST /v1/items/one/edit");
  expect(screen.queryByLabelText("What it says")).not.toBeNull();

  await fireEvent.keyDown(field, { key: "Enter", metaKey: true });
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/edit");
  });
  expect(screen.queryByLabelText("What it says")).toBeNull();
});

const dialog = () =>
  screen.queryByRole("dialog", { name: "lose your changes?" });

/** Leaving an edit with changes asks first, wherever the row has scrolled to. */
test("leaving a row edited with changes asks, and staying goes back into the field", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");
  await fireEvent.input(field, { target: { value: "rewritten" } });
  field.blur();

  await fireEvent.keyDown(window, { key: "j" });
  await tick();
  expect(dialog()).not.toBeNull();
  expect(dialog()!.textContent).toContain("one");
  expect(stamps(true)).toHaveLength(1);

  await fireEvent(dialog()!, new Event("cancel", { cancelable: true }));
  await tick();
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(field);
  expect((field as HTMLTextAreaElement).value).toBe("rewritten");
});

test("save in the question saves and goes on; revert lets the changes go and goes on", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  let field = await screen.findByLabelText("What it says");
  await fireEvent.input(field, { target: { value: "rewritten" } });
  field.blur();

  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await tick();
  await fireEvent.click(
    within(dialog()!).getByRole("button", { name: "Lose changes" }),
  );
  await tick();
  expect(screen.queryByLabelText("What it says")).toBeNull();
  expect(asked()).not.toContain("POST /v1/items/one/edit");

  await fireEvent.keyDown(window, { key: "e" });
  field = await screen.findByLabelText("What it says");
  expect((field as HTMLTextAreaElement).value).toBe("one");
  await fireEvent.input(field, { target: { value: "rewritten" } });
  field.blur();

  await fireEvent.keyDown(window, { key: "j" });
  await tick();
  await fireEvent.click(
    within(dialog()!).getByRole("button", { name: "Save" }),
  );
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/edit");
  });
  expect(screen.queryByLabelText("What it says")).toBeNull();
  expect(stamps(true)).toHaveLength(1);
});

/**
 * Closing the dialog hands the focus back to the capture box it was asked
 * from, which is not somebody leaving the edit a second time.
 */
test("staying, asked from the capture box, goes back into the field and asks nothing more", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  const box = screen.getByLabelText("What to capture");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");
  await fireEvent.input(field, { target: { value: "rewritten" } });
  field.focus();

  box.focus();
  await tick();
  expect(dialog()).not.toBeNull();

  await fireEvent.click(
    within(dialog()!).getByRole("button", { name: "Keep editing" }),
  );
  await vi.waitFor(() => {
    expect(document.activeElement).toBe(field);
  });
  expect(dialog()).toBeNull();
  expect(stamps(true)).toHaveLength(1);
});

test("saving, asked from the capture box, lands the caret in the box", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  const box = screen.getByLabelText("What to capture");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");
  await fireEvent.input(field, { target: { value: "rewritten" } });
  field.focus();

  box.focus();
  await tick();
  await fireEvent.click(
    within(dialog()!).getByRole("button", { name: "Save" }),
  );

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/edit");
  });
  await vi.waitFor(() => {
    expect(document.activeElement).toBe(box);
  });
  expect(stamps(true)).toHaveLength(0);
});

/** A capture processed while its edit was open closes the edit, and nothing is said: the person processed it. */
test("an edit whose capture is processed closes quietly", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");
  await fireEvent.input(field, { target: { value: "rewritten" } });

  void client.archive("one");

  await vi.waitFor(() => {
    expect(screen.queryByLabelText("What it says")).toBeNull();
  });
  expect(notices.shown).toHaveLength(0);
  expect(dialog()).toBeNull();
});

/** `enter` opens process on a selected row, and a row being edited is not one to leave that way. */
test("enter does not open process on a row being edited", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");
  field.blur();

  await fireEvent.keyDown(window, { key: "Enter" });
  expect(went.to).toEqual([]);
});

test("an edit left unchanged closes without asking", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");
  await fireEvent.input(field, { target: { value: "rewritten" } });
  await fireEvent.input(field, { target: { value: "one" } });
  field.blur();

  await fireEvent.keyDown(window, { key: "j" });
  await tick();
  expect(dialog()).toBeNull();
  expect(screen.queryByLabelText("What it says")).toBeNull();
});

/** An edit offers the row's tags and nothing that decides it. */
test("while a row is edited only its tags are reached", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");
  expect(screen.queryByRole("button", { name: "Route" })).toBeNull();

  field.blur();
  await fireEvent.keyDown(window, { key: "D" });
  await tick();
  expect(asked()).not.toContain("POST /v1/items/one/archive");

  await fireEvent.keyDown(window, { key: "t" });
  expect(
    await screen.findByRole("combobox", { name: "Add a tag" }),
  ).toBeDefined();
});

const waitingTag = () =>
  screen.queryByTitle("files the item once the edit is saved");

/** Takes a tag through the chooser, the way a person types one. */
async function tagWith(name: string) {
  await fireEvent.keyDown(window, { key: "t" });
  const line = await screen.findByRole("combobox", { name: "Add a tag" });
  await fireEvent.input(line, { target: { value: name } });
  await fireEvent.keyDown(line, { key: "Enter" });
}

/** Opens the first row's edit, rewrites it, and leaves the field for the row's keys. */
async function editing(text: string) {
  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  const field = await screen.findByLabelText("What it says");
  await fireEvent.input(field, { target: { value: text } });
  field.blur();
  return field;
}

/** Sent at once, a trigger tag would file the words from before the edit. */
/** The queue holding `one`, answering its edit as the pool amending it. */
function amending(request: Request) {
  return routeOf(request) === "POST /v1/items/one/edit"
    ? json(200, { kind: "amended", item: anItem("one") })
    : queued("one")(request);
}

test("a trigger tag taken while a row is edited waits, and goes after the save", async () => {
  pool(amending);

  render(Queue);
  await screen.findByText("one");

  const field = await editing("as I meant it");
  await tagWith("route/research");
  await tick();

  expect(waitingTag()).not.toBeNull();
  expect(asked()).not.toContain("POST /v1/items/one/tag");

  await fireEvent.keyDown(field, { key: "Enter", metaKey: true });
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  const sent = asked();
  expect(sent.indexOf("POST /v1/items/one/edit")).toBeLessThan(
    sent.indexOf("POST /v1/items/one/tag"),
  );
});

test("a waiting trigger tag goes after the save with what its template asked", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/templates") {
      return json(200, {
        values: [
          {
            id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a90",
            name: "todo",
            destination: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
            capability: "append",
            arguments: { path: "todo.md" },
            asked: { heading: { label: "list" } },
            folder: "create",
            triggerTag: "route/todo",
            fired: { records: 0 },
          },
        ],
      });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [] });
    }
    return amending(request);
  });
  await client.templates.load();

  render(Queue);
  await screen.findByText("one");

  const field = await editing("as I meant it");
  await tagWith("route/todo");
  const line = await screen.findByRole("combobox", { name: "list" });
  await fireEvent.input(line, { target: { value: "Next" } });
  await fireEvent.keyDown(line, { key: "Enter" });
  await tick();
  expect(waitingTag()).not.toBeNull();

  await fireEvent.keyDown(field, { key: "Enter", metaKey: true });
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(await sent()).toContainEqual({
    tag: "route/todo",
    arguments: { heading: "Next" },
  });
});

test("an edit let go takes a waiting trigger tag with it, and not an ordinary one", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  await editing("never mind");
  await tagWith("reading");
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  await tagWith("route/research");
  await tick();
  expect(waitingTag()).not.toBeNull();

  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await tick();
  await fireEvent.click(
    within(dialog()!).getByRole("button", { name: "Lose changes" }),
  );
  await tick();

  expect(waitingTag()).toBeNull();
  expect(screen.getByRole("button", { name: "remove reading" })).toBeDefined();
  expect(
    asked().filter((request) => request === "POST /v1/items/one/tag"),
  ).toHaveLength(1);
});

/** Opens the first row's edit and leaves the field as it was. */
async function editingUnchanged() {
  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  (await screen.findByLabelText("What it says")).blur();
}

test("a waiting trigger tag alone asks before the edit is left, and saving it sends no edit", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  await editingUnchanged();
  await tagWith("route/research");
  await tick();

  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await tick();
  expect(dialog()).not.toBeNull();

  await fireEvent.click(
    within(dialog()!).getByRole("button", { name: "Save" }),
  );
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(asked()).not.toContain("POST /v1/items/one/edit");
});

test("a waiting trigger tag comes off unsent, and the edit's own revert takes the rest", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  await editingUnchanged();
  await tagWith("route/one");
  await tagWith("route/two");
  await tick();
  expect(
    screen.getAllByTitle("files the item once the edit is saved"),
  ).toHaveLength(2);

  await fireEvent.click(
    screen.getByRole("button", { name: "remove route/one" }),
  );
  await tick();
  expect(
    screen.getAllByTitle("files the item once the edit is saved"),
  ).toHaveLength(1);

  await fireEvent.click(
    screen.getByRole("button", { name: "remove route/two" }),
  );
  await tick();
  expect(waitingTag()).toBeNull();
  expect(screen.queryByLabelText("What it says")).not.toBeNull();
  expect(asked()).not.toContain("POST /v1/items/one/tag");
});

/** Local, so the day each capture falls on is the day the shell draws it under. */
const on = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).toISOString();

function overDays() {
  return holding(
    anItem("one", { createdAt: on(12, 8, 14) }),
    anItem("two", {
      createdAt: on(12, 11, 40),
      tags: [
        { name: "design", by: { kind: "person" }, addedAt: on(12, 11, 40) },
      ],
    }),
    anItem("three", { createdAt: on(13, 7, 2) }),
  );
}

function holding(...items: ReturnType<typeof anItem>[]) {
  return (request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, { values: items })
      : json(200, { values: [] });
}

/** The row's own tracks, which the first row of a day lifts onto the heading's rule. */
const rowOf = (words: string) => screen.getByText(words).closest("[data-row]")!;

test("reads by day on a narrow screen: a heading per day, the time alone on the row", async () => {
  viewport(390);
  pool(overDays());

  const { container } = render(Queue);
  await screen.findByText("three");

  const days = [...container.querySelectorAll("[data-day]")];
  expect(
    days.map((day) => day.textContent?.replace(/\s+/g, " ").trim()),
  ).toEqual(["saturday 2026-09-12 2", "sunday 2026-09-13 1"]);
  expect(screen.getByText("08:14")).toBeDefined();
  expect(
    screen.queryByText("2026-09-12", { selector: "button *:not(.sr-only)" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "2026-09-12 08:14" }),
  ).toBeDefined();

  expect(rowOf("one").hasAttribute("data-opens")).toBe(true);
  expect(rowOf("two").hasAttribute("data-opens")).toBe(false);
  expect(rowOf("three").hasAttribute("data-opens")).toBe(true);

  // A row walked to clears the heading held over it.
  expect(screen.getByText("08:14").closest("[data-headed]")).not.toBeNull();

  // The rail holds the time alone; the tags follow the capture in the body.
  const tag = screen.getByText("design");
  expect(tag.closest("[data-body]")).not.toBeNull();
  expect(
    screen.getByText("two").compareDocumentPosition(tag) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test.each(["timeline", "index"] as const)(
  "by day, the %s's first heading shares the list head's line, and no other does",
  async (view) => {
    viewport(390);
    rememberView(view);
    pool(overDays());

    const { container } = render(Queue);
    await screen.findByText("three");

    const days = [...container.querySelectorAll("[data-day]")];
    expect(days.map((day) => day.hasAttribute("data-leads"))).toEqual([
      true,
      false,
    ]);
  },
);

test("reads by day at every width, the tags with the words", async () => {
  pool(overDays());

  const { container } = render(Queue);
  await screen.findByText("three");
  expect(container.querySelectorAll("[data-day]")).toHaveLength(2);
  expect(screen.getByText("design").closest("[data-body]")).not.toBeNull();
  const counts = [...container.querySelectorAll("[data-day]")].map(
    (day) => day.lastElementChild?.textContent,
  );
  expect(counts).toEqual(["2", "1"]);
});

test("walks across a heading, and a day's heading leaves with its last row", async () => {
  viewport(390);
  let items = [
    anItem("one", { createdAt: on(12, 8, 14) }),
    anItem("three", { createdAt: on(13, 7, 2) }),
  ];
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") return json(200, { values: items });
    if (route === "POST /v1/items/one/archive") {
      const [one] = items;
      items = items.filter((item) => item.id !== "one");
      return json(200, { ...one, archived: { archivedAt: on(13, 9) } });
    }
    return json(200, { values: [] });
  });

  const { container } = render(Queue);
  await screen.findByText("three");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "j" });
  expect(
    screen.getByRole("button", { name: "2026-09-13 07:02", expanded: true }),
  ).toBeDefined();

  await fireEvent.keyDown(window, { key: "k" });
  await fireEvent.keyDown(window, { key: "D" });
  await screen.findByText("Discarded");
  // Held where it stood, its heading with it, until the selection leaves.
  expect(container.querySelectorAll("[data-day]")).toHaveLength(2);

  await fireEvent.keyDown(window, { key: "Escape" });
  await vi.waitFor(() => {
    expect(container.querySelectorAll("[data-day]")).toHaveLength(1);
  });
});

test("the index reads by day too: headings, the time alone, and no gap", async () => {
  viewport(390);
  rememberView("index");
  pool(overDays());

  const { container } = render(Queue);
  await screen.findByText("three");

  expect(container.querySelectorAll("[data-day]")).toHaveLength(2);
  expect(container.querySelectorAll("[data-gap]")).toHaveLength(0);
  expect(
    screen
      .getByRole("button", { name: "2026-09-13 07:02" })
      .querySelector("time")?.textContent,
  ).toBe("07:02");
});

test("a trigger tag on a row asks what its template asks, and sends it with the tag", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/templates") {
      return json(200, {
        values: [
          {
            id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a90",
            name: "todo",
            destination: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
            capability: "append",
            arguments: { path: "todo.md" },
            asked: { heading: { label: "list" } },
            folder: "create",
            triggerTag: "route/todo",
            fired: { records: 0 },
          },
        ],
      });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [] });
    }
    return queued("one")(request);
  });
  await client.templates.load();

  render(Queue);
  await screen.findByText("one");
  await fireEvent.keyDown(window, { key: "j" });
  await tagWith("route/todo");

  const line = await screen.findByRole("combobox", { name: "list" });
  expect(asked()).not.toContain("POST /v1/items/one/tag");
  await fireEvent.input(line, { target: { value: "Next" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(await sent()).toContainEqual({
    tag: "route/todo",
    arguments: { heading: "Next" },
  });
});

test("a trigger tag whose last asked field is left to its default sends what was given", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/templates") {
      return json(200, {
        values: [
          {
            id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a90",
            name: "todo",
            destination: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
            capability: "append",
            arguments: { heading: "Inbox" },
            asked: { path: { label: "note" }, heading: { label: "list" } },
            folder: "create",
            triggerTag: "route/todo",
            fired: { records: 0 },
          },
        ],
      });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [] });
    }
    return queued("one")(request);
  });
  await client.templates.load();

  render(Queue);
  await screen.findByText("one");
  await fireEvent.keyDown(window, { key: "j" });
  await tagWith("route/todo");

  const note = await screen.findByRole("combobox", { name: "note" });
  await fireEvent.input(note, { target: { value: "todo.md" } });
  await fireEvent.keyDown(note, { key: "Enter" });
  const list = await screen.findByRole("combobox", { name: "list" });
  await fireEvent.keyDown(list, { key: "Enter" });

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(await sent()).toContainEqual({
    tag: "route/todo",
    arguments: { path: "todo.md" },
  });
});

/** A row's own stamp, found by the words it holds. */
function stampOf(said: string) {
  const row = screen.getByText(said).closest("[data-row]") as HTMLElement;
  return within(row).getByRole("button", { name: /^\d{4}-\d{2}-\d{2}/ });
}

/** The list head, drawn only while rows are selected; the page stands in for it otherwise. */
const head = () =>
  (document.querySelector("[data-head]") as HTMLElement | null) ??
  document.body;

test("a click with mod held marks rows, and esc lets go of them all", async () => {
  pool(queued("one", "two", "three"));

  render(Listed);
  await screen.findByText("one");

  await fireEvent.click(stampOf("one"), { metaKey: true });
  await fireEvent.click(stampOf("three"), { metaKey: true });

  expect(within(head()).getByText("2 selected")).toBeDefined();
  expect(document.querySelectorAll("[data-marked]")).toHaveLength(2);

  // In the mode a plain click marks too, rather than starting over.
  await fireEvent.click(stampOf("two"));
  expect(within(head()).getByText("3 selected")).toBeDefined();

  await fireEvent.keyDown(window, { key: "Escape" });
  expect(within(head()).queryByText(/selected/)).toBeNull();
  expect(document.querySelectorAll("[data-marked]")).toHaveLength(0);
});

test("space marks the selected row, and J marks on down the list", async () => {
  pool(queued("one", "two", "three"));

  render(Listed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: " " });
  expect(within(head()).getByText("1 selected")).toBeDefined();

  await fireEvent.keyDown(window, { key: "J" });
  await vi.waitFor(() => {
    expect(within(head()).getByText("2 selected")).toBeDefined();
  });
});

test("a discard of the marked rows is asked first, then sent as one batch", async () => {
  pool(queued("one", "two", "three"));

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });
  await fireEvent.click(stampOf("two"), { metaKey: true });

  await fireEvent.click(
    within(head()).getByRole("button", { name: "Discard" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Discard 2 items?")).toBeDefined();
  expect(asked()).not.toContain("POST /v1/batches");

  await fireEvent.click(
    within(dialog).getByRole("button", { name: "Discard" }),
  );

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/batches");
  });
  expect(await sent()).toContainEqual(
    expect.objectContaining({
      items: ["one", "two"],
      action: { kind: "archive" },
    }),
  );
  expect(within(head()).queryByText(/selected/)).toBeNull();
});

test("backing out of the question sends nothing and keeps the rows marked", async () => {
  pool(queued("one", "two"));

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });

  await fireEvent.click(
    within(head()).getByRole("button", { name: "Discard" }),
  );
  await fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Back" }),
  );

  expect(asked()).not.toContain("POST /v1/batches");
  expect(within(head()).getByText("1 selected")).toBeDefined();
});

test("unmarking the last row leaves the mode", async () => {
  pool(queued("one", "two"));

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });
  await fireEvent.click(stampOf("one"));

  expect(within(head()).queryByText(/selected/)).toBeNull();
});

test("marked rows carry the gutter's bar, and no row is boxed or offered what one row is given", async () => {
  pool(queued("one", "two", "three"));

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"));
  expect(offered("process")).toBeDefined();

  await fireEvent.click(stampOf("two"), { metaKey: true });

  expect(document.querySelectorAll("[data-gutter='marked']")).toHaveLength(2);
  expect(document.querySelectorAll("[data-gutter][data-cursor]")).toHaveLength(
    1,
  );
  expect(document.querySelectorAll("[data-rail][data-selected]")).toHaveLength(
    0,
  );
  await fireEvent.keyDown(window, { key: "p" });
  expect(went.to).toEqual([]);
});

test("while marking, a marked stamp is bold and every other is not", async () => {
  pool(queued("one", "two"));

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });

  expect(stampOf("one").querySelector(".font-semibold")).not.toBeNull();
  expect(stampOf("two").querySelector(".font-semibold")).toBeNull();
  expect(stampOf("two").querySelector(".font-normal")).not.toBeNull();
});

test("the cursor keeps its outline on a row it unmarks", async () => {
  pool(queued("one", "two"));

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });
  await fireEvent.click(stampOf("two"), { metaKey: true });
  await fireEvent.click(stampOf("two"));

  expect(document.querySelector("[data-gutter='cursor']")).not.toBeNull();
});

test("a tag added on a marked row goes on every marked row at once, unasked", async () => {
  pool(queued("one", "two"));

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });
  await fireEvent.click(stampOf("two"), { metaKey: true });

  await fireEvent.keyDown(window, { key: "t" });
  const line = screen.getByRole("combobox", {
    name: "Add a tag to every selected item",
  });
  await fireEvent.input(line, { target: { value: "reading" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  expect(screen.queryByRole("dialog")).toBeNull();
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/batches");
  });
  expect(await sent()).toContainEqual(
    expect.objectContaining({
      items: ["one", "two"],
      action: { kind: "tag", tag: "reading" },
    }),
  );
});

test("a tag taken off a marked row comes off every marked row", async () => {
  const reading = [
    { name: "reading", by: { kind: "person" as const }, addedAt: on(12, 8) },
  ];
  pool(
    holding(anItem("one", { tags: reading }), anItem("two", { tags: reading })),
  );

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });
  await fireEvent.click(stampOf("two"), { metaKey: true });

  await fireEvent.click(
    screen.getAllByRole("button", { name: "remove reading" })[0]!,
  );

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/batches");
  });
  expect(await sent()).toContainEqual(
    expect.objectContaining({
      items: ["one", "two"],
      action: { kind: "untag", tag: "reading" },
    }),
  );
});

test("an unmarked row's tags are not controls while rows are marked", async () => {
  const reading = [
    { name: "reading", by: { kind: "person" as const }, addedAt: on(12, 8) },
  ];
  pool(holding(anItem("one"), anItem("two", { tags: reading })));

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });

  expect(screen.queryByRole("button", { name: "remove reading" })).toBeNull();
  expect(screen.getByText("reading")).toBeDefined();
});

test("all marks every row the queue holds", async () => {
  pool(queued("one", "two", "three"));

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });

  await fireEvent.click(within(head()).getByRole("button", { name: "All" }));

  expect(within(head()).getByText("3 selected")).toBeDefined();
});

test("a trigger tag added on a marked row asks first, naming its template", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/templates") {
      return json(200, {
        values: [
          {
            id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a90",
            name: "todo",
            destination: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
            capability: "append",
            arguments: { heading: "Inbox" },
            folder: "create",
            triggerTag: "route/todo",
            fired: { records: 0 },
          },
        ],
      });
    }
    return queued("one", "two")(request);
  });
  await client.templates.load();

  render(Listed);
  await screen.findByText("one");
  await fireEvent.click(stampOf("one"), { metaKey: true });
  await fireEvent.click(stampOf("two"), { metaKey: true });

  await fireEvent.keyDown(window, { key: "t" });
  const line = screen.getByRole("combobox", {
    name: "Add a tag to every selected item",
  });
  await fireEvent.input(line, { target: { value: "route/todo" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  const asking = await screen.findByRole("dialog");
  expect(within(asking).getByText("Route 2 items?")).toBeDefined();
  expect(
    within(asking).getByText("todo", { selector: "strong" }),
  ).toBeDefined();
  expect(asked()).not.toContain("POST /v1/batches");

  await fireEvent.click(within(asking).getByRole("button", { name: "Route" }));
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/batches");
  });
  expect(await sent()).toContainEqual(
    expect.objectContaining({
      items: ["one", "two"],
      action: { kind: "tag", tag: "route/todo" },
    }),
  );
});

test("`/` puts the caret in the search line, and the words go on the address", async () => {
  pool(queued("one"));
  render(Listed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "/" });
  const line = screen.getByRole("searchbox", { name: "search" });
  expect(document.activeElement).toBe(line);

  await fireEvent.input(line, { target: { value: "bike rack" } });
  await vi.waitFor(() => {
    expect(String(went.to.at(-1))).toBe("http://localhost/?words=bike+rack");
  });
});

test("highlights in each row the words the queue is searched by", async () => {
  const highlights = registering();
  at.path = "/?words=BIKE";
  pool(queued("a bike rack", "a bíke shed"));
  render(Listed);
  await screen.findByText("a bike rack");

  await vi.waitFor(() => {
    expect(said(highlights())).toEqual(["bike", "bíke"]);
  });
});

test("a route in its window keeps its row, counting down with Cancel", async () => {
  let held = ["one", "two"];
  const cancelled: string[] = [];
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") {
      return json(200, { values: held.map((id) => anItem(id)) });
    }
    if (route === "POST /v1/routing/r1/cancel") {
      cancelled.push(route);
      return json(200, {});
    }
    return json(200, { values: [] });
  });

  render(Listed);
  await screen.findByText("one");

  firings.opened({
    record: "r1",
    item: "one",
    name: "Vault",
    until: Date.now() + 10_000,
  });
  held = ["two"];
  await client.loadQueue();

  // Off the queue in the pool's eyes, and still drawn while its window is open.
  const line = await screen.findByText(/Routing by/);
  expect(line.closest("[data-row]")?.getAttribute("data-row")).toBe("one");
  expect(screen.getByText("10s")).toBeDefined();

  await fireEvent.click(
    screen.getByRole("button", { name: "Cancel routing Vault" }),
  );
  await vi.waitFor(() => {
    expect(cancelled).toEqual(["POST /v1/routing/r1/cancel"]);
  });

  // Called off, it is work again: the row stays, and says nothing of a route.
  await vi.waitFor(() => {
    expect(screen.queryByText(/Routing by/)).toBeNull();
  });
  expect(document.querySelector('[data-row="one"]')).not.toBeNull();
  firings.clear();
});

test("a route's row leaves once its window has closed", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") {
      return json(200, { values: ["one", "two"].map((id) => anItem(id)) });
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r1",
        item: "one",
        at: new Date().toISOString(),
        state: "pending",
        until: new Date(Date.now() + 10_000).toISOString(),
        target: {
          kind: "destination",
          destination: "vault",
          capability: "create",
          arguments: {},
        },
      });
    }
    return json(200, { values: [] });
  });

  render(Listed);
  await screen.findByText("one");
  const record = await client.routing.route("one", {
    destination: "vault",
    capability: "create",
    arguments: {},
  });
  firings.opened({
    record: record.id,
    item: "one",
    name: "Vault",
    until: Date.parse(record.until ?? ""),
  });
  expect(read(client.queue).items.map((one) => one.id)).toEqual(["two"]);
  await screen.findByText(/Routing by/);

  firings.closed("r1");
  await vi.waitFor(() => {
    expect(document.querySelector('[data-row="one"]')).toBeNull();
  });
});

test("on a phone holding a row selects it, and says the hint no more", async () => {
  viewport(390);
  pool(queued("one", "two"));
  render(Listed);
  await screen.findByText("one");
  expect(screen.getByText("Hold a row to select several.")).toBeDefined();

  vi.useFakeTimers();
  const row = document.querySelector('[data-row="one"]')!;
  await fireEvent.pointerDown(row, { pointerType: "touch", clientX: 200 });
  await vi.advanceTimersByTimeAsync(600);
  await fireEvent.pointerUp(row, { pointerType: "touch", clientX: 200 });
  vi.useRealTimers();

  expect(await screen.findByText("1 selected")).toBeDefined();
  expect(screen.queryByText("Hold a row to select several.")).toBeNull();
});

test("a wide touch screen selects by holding a row, as a phone does", async () => {
  pool(queued("one", "two"));
  render(Listed);
  await screen.findByText("one");

  vi.useFakeTimers();
  const row = document.querySelector('[data-row="one"]')!;
  await fireEvent.pointerDown(row, { pointerType: "touch", clientX: 200 });
  await vi.advanceTimersByTimeAsync(600);
  await fireEvent.pointerUp(row, { pointerType: "touch", clientX: 200 });
  vi.useRealTimers();

  expect(await screen.findByText(/1 selected/)).toBeDefined();
});

test("a delivery turned down after its window is said in red on the row it came back to", async () => {
  pool(queued("a", "b"));
  render(Listed);
  await screen.findByText("a");

  notices.raise({
    what: "Rejected by",
    subject: "Vault",
    why: "taken.md is already there, back in the queue",
    href: "/items/a",
    alarm: true,
  });

  const said = await screen.findByText(/taken\.md is already there/);
  expect(said.textContent).toBe("Rejected by Vault: taken.md is already there");
  expect(said.closest("p")?.className).toContain("text-danger");
  expect(screen.getAllByText(/Rejected by/)).toHaveLength(1);
});

test("a capture the pool refused is a row of the queue, kept on this device", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/captures"
      ? json(422, { error: { code: "payload-invalid" } })
      : queued("a")(request),
  );
  render(Listed);
  await screen.findByText("a");

  await client.capture({ channel: "web-manual", text: "a thought refused" });
  await client.drain();

  const words = await screen.findByText("a thought refused");
  const row = words.closest("[data-refused]") as HTMLElement;
  expect(row.textContent).toContain("Refused by the pool");
  expect(row.textContent).toContain("Kept on this device only");

  // The only copy: Delete asks before it goes.
  await fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
  expect(within(row).getByText("Delete it for good?")).toBeDefined();
});

test("letting go of the last marked row ends marking with nothing selected", async () => {
  pool(queued("one", "two"));
  render(Listed);
  await screen.findByText("one");

  await fireEvent.click(stampOf("one"), { metaKey: true });
  expect(document.querySelectorAll("[data-gutter='marked']")).toHaveLength(1);

  await fireEvent.click(stampOf("one"), { metaKey: true });
  expect(document.querySelectorAll("[data-gutter='marked']")).toHaveLength(0);
  expect(document.querySelector("[data-foot]")).toBeNull();
  expect(document.querySelector("[data-rail][data-selected]")).toBeNull();
  expect(went.to).toEqual([]);
});

test("when wide, a row under the pointer offers + tag, and taking a tag keeps the queue", async () => {
  pool(queued("one"));
  render(Listed);
  const words = await screen.findByText("one");
  const row = words.closest("[data-row]") as HTMLElement;

  expect(within(row).queryByRole("button", { name: "Add a tag" })).toBeNull();
  await fireEvent.pointerEnter(row);
  await fireEvent.mouseEnter(row);
  await fireEvent.click(
    await within(row).findByRole("button", { name: "Add a tag" }),
  );
  expect(went.to).toEqual([]);
});

test("when wide a row opens its item, and is marked as the one last opened", async () => {
  pool(queued("one", "two"));
  render(Listed);
  const words = await screen.findByText("one");

  await fireEvent.click(words);
  expect(went.to).toEqual(["/items/one"]);
  const row = words.closest("[data-row]") as HTMLElement;
  expect(row.hasAttribute("data-last-opened")).toBe(true);
  expect(
    (screen.getByText("two").closest("[data-row]") as HTMLElement).hasAttribute(
      "data-last-opened",
    ),
  ).toBe(false);
});

test("selecting takes the head, × lets go, and on a phone the + gives the foot to the batch", async () => {
  viewport(390);
  pool(queued("one", "two"));
  render(Listed);
  await screen.findByText("one");
  expect(screen.getByRole("link", { name: "Capture" })).toBeDefined();

  await fireEvent.click(stampOf("one"), { metaKey: true });

  expect(within(head()).getByText("1 selected")).toBeDefined();
  expect(within(head()).getByRole("button", { name: "All" })).toBeDefined();
  expect(screen.queryByRole("link", { name: "Capture" })).toBeNull();
  expect(
    within(screen.getByRole("toolbar", { name: "Selected" })).getByRole(
      "button",
      { name: "Route" },
    ),
  ).toBeDefined();

  await fireEvent.click(
    within(head()).getByRole("button", { name: "Clear the selection" }),
  );
  expect(screen.queryByText("1 selected")).toBeNull();
});

/** A finger drawn across a row, from one x to another. */
async function swipe(row: Element, from: number, to: number) {
  await fireEvent.pointerDown(row, { pointerType: "touch", clientX: from });
  await fireEvent.pointerMove(row, { pointerType: "touch", clientX: to });
  await fireEvent.pointerUp(row, { pointerType: "touch", clientX: to });
}

const uncovered = (id: string, what: string) =>
  document
    .querySelector(`[data-row="${id}"]`)
    ?.parentElement?.querySelector(`[data-uncovered="${what}"]`) ?? null;

test("on a phone a row swiped left far enough opens the quick route, and a short one does not", async () => {
  viewport(390);
  pool(queued("one"));
  render(Listed);
  await screen.findByText("one");
  const row = document.querySelector('[data-row="one"]')!;

  await fireEvent.pointerDown(row, { pointerType: "touch", clientX: 300 });
  await fireEvent.pointerMove(row, { pointerType: "touch", clientX: 250 });
  expect(uncovered("one", "route")).not.toBeNull();
  await fireEvent.pointerUp(row, { pointerType: "touch", clientX: 250 });
  expect(quick.item).toBeUndefined();
  expect(uncovered("one", "route")).toBeNull();

  await swipe(row, 300, 200);
  expect(quick.item).toBe("one");
});

test("on a phone a queue row swiped right stands open on Manual and Discard, and a short swipe does not", async () => {
  viewport(390);
  pool(queued("one"));
  render(Listed);
  await screen.findByText("one");
  const row = document.querySelector('[data-row="one"]')!;

  await swipe(row, 100, 150);
  expect(uncovered("one", "by-hand")).toBeNull();

  await swipe(row, 100, 200);
  const shelf = uncovered("one", "by-hand")!;
  expect(
    within(shelf as HTMLElement).getByRole("button", { name: /Manual/ }),
  ).toBeDefined();

  await fireEvent.click(
    within(shelf as HTMLElement).getByRole("button", { name: /Discard/ }),
  );
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/archive");
  });
  expect(notices.shown.at(-1)?.offer?.label).toBe("undo");
  expect(uncovered("one", "by-hand")).toBeNull();
});

test("a row standing open puts itself back on a tap, a scroll, or another row's swipe, and opens nothing", async () => {
  viewport(390);
  pool(queued("one", "two"));
  render(Listed);
  await screen.findByText("one");
  const one = document.querySelector('[data-row="one"]')!;
  const two = document.querySelector('[data-row="two"]')!;

  await swipe(one, 100, 200);
  await fireEvent.click(within(one as HTMLElement).getByText("one"));
  expect(uncovered("one", "by-hand")).toBeNull();
  expect(went.to).toEqual([]);

  await swipe(one, 100, 200);
  await fireEvent.scroll(window);
  expect(uncovered("one", "by-hand")).toBeNull();

  await swipe(one, 100, 200);
  await swipe(two, 100, 200);
  expect(uncovered("one", "by-hand")).toBeNull();
  expect(uncovered("two", "by-hand")).not.toBeNull();
});

test("when wide a hovered row offers Manual and Discard beside Route, selected or not", async () => {
  pool(queued("one", "two"));
  render(Listed);
  const row = (await screen.findByText("one")).closest(
    "[data-row]",
  ) as HTMLElement;

  await fireEvent.pointerEnter(row);
  for (const name of ["Route", "Manual", "Discard"]) {
    expect(within(row).getByRole("button", { name })).toBeDefined();
  }
  await fireEvent.click(within(row).getByRole("button", { name: "Manual" }));
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/mark-processed");
  });
  expect(went.to).toEqual([]);

  await fireEvent.click(stampOf("two"));
  const two = screen.getByText("two").closest("[data-row]") as HTMLElement;
  await fireEvent.pointerEnter(two);
  expect(within(two).getByRole("button", { name: "Route" })).toBeDefined();
});

test("the row last opened is marked at its edge, and not tinted as a selection is", async () => {
  pool(queued("one", "two"));
  render(Listed);
  const words = await screen.findByText("one");

  await fireEvent.click(words);

  const row = words.closest("[data-row]") as HTMLElement;
  expect(row.className).not.toContain("bg-picked");
  expect(row.className).toContain("before:bg-ink");
});
