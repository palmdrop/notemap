import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { tick } from "svelte";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import { NO_MORE_OFFLINE } from "$lib/said";
import { keyboard, online, viewport } from "$testing/dom";
import { rows as layout } from "$lib/rows.svelte";
import { remember } from "$lib/order";
import { remember as rememberView } from "$lib/view";
import Queue from "./Queue.svelte";

keyboard();

/** Every slide asked for, to tell a row that moved from one drawn still or not at all. */
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

/** Discarding is the quick tier: it acts from the row, at once. */
async function discard() {
  await fireEvent.click(screen.getByRole("button", { name: "discard" }));
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

  const disabled = (name: string | RegExp) =>
    (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

  // The door itself never closes: what a decision needs of the pool is said
  // by the surface behind it. On the row, discarding is the one decision that
  // needs nothing of the pool.
  expect(disabled("process")).toBe(false);
  expect(disabled("manual")).toBe(true);
  expect(disabled("discard")).toBe(false);

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
  expect(screen.getAllByRole("button", { name: "process" })).toHaveLength(1);
  expect(stamps(true)).toHaveLength(1);

  await open(0);

  // The second row's stamp, the first one now being expanded.
  expect(stamps(true)).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "process" })).toHaveLength(1);
});

/** The queue holds unrouted items, so opening one has nothing to ask about. */
test("opens a row without asking where an item has never been, and without saying so", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  // Every row on the queue is unrouted, so a word saying so says nothing.
  expect(screen.queryByText("unrouted")).toBeNull();

  await open(0);

  expect(await screen.findByRole("button", { name: "process" })).toBeDefined();
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
  expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
  expect(screen.getByText("revised")).toBeDefined();

  await open(0);
  expect(screen.getAllByRole("button", { name: "edit" })).toHaveLength(1);
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
  return fireEvent.click(screen.getByRole("button", { name: "capture" }));
}

/** A row comes and goes by sliding, by day or not: a read is what draws still. */
test.each(["rail", "by day"] as const)(
  "a captured row slides in and a released one slides out, read %s",
  async (reading) => {
    layout.choose(reading);
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
    rememberView("queue", view);
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
  expect(await screen.findByRole("img", { name: "pending" })).toBeDefined();

  transport.unreachable(false);
  await client.drain();

  await vi.waitFor(() => {
    expect(screen.queryByRole("img", { name: "pending" })).toBeNull();
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
    expect(screen.queryByRole("img", { name: "pending" })).toBeNull();
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
  expect(screen.queryByRole("link", { name: "open" })).toBeNull();

  await open(0);
  expect(screen.getByRole("link", { name: "open" }).getAttribute("href")).toBe(
    "/items/one",
  );
  expect(stamps(true)).toHaveLength(1);
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

  // Where it went and the place it landed: the capability is the adapter's
  // word and delivered is what a record with no alarm on it already means.
  const line = await screen.findByRole("link", { name: /drafts/ });
  expect(line.getAttribute("href")).toBe("/items/one/records/rec");
  expect(screen.queryByText(/create-note/)).toBeNull();
  expect(screen.queryByText(/delivered/)).toBeNull();
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

  await fireEvent.click(screen.getByRole("button", { name: "manual" }));

  await vi.waitFor(() => {
    expect(notices.shown.map((notice) => notice.what)).toContain(
      "marked manual",
    );
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
    expect(screen.getByText("discarded")).toBeDefined();
  });
  expect(screen.getByText("one")).toBeDefined();
  expect(screen.getByRole("button", { name: "undiscard" })).toBeDefined();
  expect(container.querySelectorAll("[data-selected]")).toHaveLength(2);
  expect(notices.shown.at(-1)?.offer?.label).toBe("undo");

  await fireEvent.keyDown(window, { key: "Escape" });
  await vi.waitFor(() => {
    expect(screen.queryByText("one")).toBeNull();
  });
  expect(screen.getByText("two")).toBeDefined();
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
  await screen.findByText("discarded");

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

  expect(went.to).toEqual(["/items/one/process"]);
  // The second click of a double is not a toggle: select, nothing, go.
  expect(stamps(true)).toHaveLength(1);
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
  expect(screen.getAllByRole("button", { name: "discard" })).toHaveLength(1);
});

/** Every row reserves the foot's height, so selecting one shifts nothing. */
test("keeps the foot's height on every row, selected or not", async () => {
  pool(queued("one", "two"));

  const { container } = render(Queue);
  await screen.findByText("one");

  // Unselected, the foot is one cell per column with the rail's rule between
  // them; selected, one strip holding the actions. Both are the same height.
  const feet = () =>
    [...container.querySelectorAll(".h-9")].map((foot) =>
      foot.classList.contains("col-span-full") ? "box" : "cell",
    );
  expect(feet()).toEqual(["cell", "cell", "cell", "cell"]);

  await open(0);
  expect(feet()).toEqual(["box", "cell", "cell"]);
});

/** The keys the actions are drawn to be guessed from. */
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
  expect(went.to).toEqual(["/items/one/process"]);
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
  await screen.findByText("discarded");

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
  expect(screen.getAllByRole("button", { name: "discard" })).toHaveLength(1);
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

test("gives the capture field the caret when the queue is simply arrived at", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  expect(document.activeElement).toBe(screen.getByLabelText("What to capture"));
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

  await fireEvent.click(screen.getByRole("button", { name: "View" }));
  await fireEvent.click(screen.getByRole("button", { name: "index" }));

  expect(replaced.urls).toEqual(["http://localhost/?view=index"]);
  expect(localStorage.getItem("notemap:view:queue")).toBe("index");

  // A gap after more than half a day, and not after less.
  const gapped = [...container.querySelectorAll("[data-gap]")];
  expect(gapped).toHaveLength(1);
  expect(gapped[0]?.textContent).toContain("three");
  expect(screen.getByRole("button", { name: "View" }).textContent).toContain(
    "index",
  );

  cleanup();
  rememberView("queue", "index");
  render(Queue);
  await screen.findByText("one");
  expect(container.querySelector("[data-gap]")).toBeDefined();
  expect(screen.getByRole("button", { name: "View" }).textContent).toContain(
    "index",
  );
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
  rememberView("queue", "index");

  render(Queue);
  const words = await screen.findByText("one");
  const line = words.closest(".grid-cols-subgrid")!;

  await fireEvent.click(line.querySelector("button")!);
  expect(line.className).toContain("font-semibold");

  await fireEvent.click(words);
  expect(line.className).not.toContain("font-semibold");
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

const dialog = () => screen.queryByRole("dialog", { name: "Unsaved changes" });

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

  await fireEvent.click(screen.getByRole("button", { name: "close" }));
  await tick();
  await fireEvent.click(
    within(dialog()!).getByRole("button", { name: "revert" }),
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
    within(dialog()!).getByRole("button", { name: "save" }),
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
    within(dialog()!).getByRole("button", { name: "keep editing" }),
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
    within(dialog()!).getByRole("button", { name: "save" }),
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
  await fireEvent.click(screen.getByRole("button", { name: "revert" }));
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
  expect(screen.queryByRole("button", { name: "process" })).toBeNull();
  expect(screen.queryByRole("button", { name: "revert" })).toBeNull();

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

  await fireEvent.click(screen.getByRole("button", { name: "close" }));
  await tick();
  await fireEvent.click(
    within(dialog()!).getByRole("button", { name: "revert" }),
  );
  await tick();

  expect(waitingTag()).toBeNull();
  expect(screen.getByRole("button", { name: "reading" })).toBeDefined();
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

  await fireEvent.click(screen.getByRole("button", { name: "close" }));
  await tick();
  expect(dialog()).not.toBeNull();

  await fireEvent.click(
    within(dialog()!).getByRole("button", { name: "save" }),
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
    screen.getByRole("button", { name: /^route\/one, files the item/ }),
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "remove route/one" }),
  );
  await tick();
  expect(
    screen.getAllByTitle("files the item once the edit is saved"),
  ).toHaveLength(1);

  await fireEvent.click(screen.getByRole("button", { name: "revert" }));
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
  ).toEqual(["2026-09-12 saturday", "2026-09-13 sunday"]);
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
    rememberView("queue", view);
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

test("reads by day on a wide screen only when chosen, keeping the tags in the rail", async () => {
  pool(overDays());

  const { container } = render(Queue);
  await screen.findByText("three");
  expect(container.querySelectorAll("[data-day]")).toHaveLength(0);

  layout.choose("by day");
  await tick();
  expect(container.querySelectorAll("[data-day]")).toHaveLength(2);
  expect(screen.getByText("design").closest("[data-rail]")).not.toBeNull();
});

test("the rail, chosen, draws no headings on a narrow screen", async () => {
  viewport(390);
  layout.choose("rail");
  pool(overDays());

  const { container } = render(Queue);
  await screen.findByText("three");

  expect(container.querySelectorAll("[data-day]")).toHaveLength(0);
  expect(screen.getAllByText("2026-09-12").length).toBeGreaterThan(0);
});

test("auto follows the window as it crosses narrow", async () => {
  pool(overDays());

  const { container } = render(Queue);
  await screen.findByText("three");
  expect(container.querySelectorAll("[data-day]")).toHaveLength(0);

  viewport(390);
  await tick();
  expect(container.querySelectorAll("[data-day]")).toHaveLength(2);

  viewport(1024);
  await tick();
  expect(container.querySelectorAll("[data-day]")).toHaveLength(0);
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
  await screen.findByText("discarded");
  // Held where it stood, its heading with it, until the selection leaves.
  expect(container.querySelectorAll("[data-day]")).toHaveLength(2);

  await fireEvent.keyDown(window, { key: "Escape" });
  await vi.waitFor(() => {
    expect(container.querySelectorAll("[data-day]")).toHaveLength(1);
  });
});

test("the index reads by day too: headings, the time alone, and no gap", async () => {
  viewport(390);
  rememberView("queue", "index");
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

  layout.choose("rail");
  await tick();
  expect(container.querySelectorAll("[data-day]")).toHaveLength(0);
  expect(container.querySelectorAll("[data-gap]")).toHaveLength(1);
});
