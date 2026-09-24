import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { tick } from "svelte";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import { NO_MORE_OFFLINE } from "$lib/said";
import { keyboard, online } from "$testing/dom";
import { remember } from "$lib/order";
import { remember as rememberView } from "$lib/view";
import Queue from "./Queue.svelte";

keyboard();

vi.mock("$lib/client", () => import("$testing/pool"));

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

  expect(await screen.findByText("Nothing left to process.")).toBeDefined();
  expect(screen.getByLabelText("What to capture")).toBeDefined();
});

test("reads the drained queue as the thing it was working toward", async () => {
  pool(queued());

  const { container } = render(Queue);

  // One line where the rows were, and no register drawn under it.
  expect(await screen.findByText("Nothing left to process.")).toBeDefined();
  expect(screen.queryByText("zero")).toBeNull();
  expect(
    container.querySelector(".grid-cols-\\[var\\(--spacing-rail\\)_1fr\\]"),
  ).toBeNull();
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

test("says a capture is pending until the pool has taken it", async () => {
  const transport = pool((request) =>
    routeOf(request) === "POST /v1/captures"
      ? taken(request)
      : json(200, { values: [] }),
  );

  render(Queue);
  await screen.findByText("Nothing left to process.");
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

  await fireEvent.click(stamps(false)[0]!);
  await discard();

  // The pool put the row back, and the operation it refused is still held.
  // The mark is drawn while the operation is in flight, so this waits for the
  // refusal rather than reading the row in the window before it lands.
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/archive");
    expect(screen.queryByText("Nothing left to process.")).toBeNull();
    expect(screen.queryByText("pending")).toBeNull();
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
  expect(screen.queryByText("Nothing left to process.")).toBeNull();
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
  await screen.findByText("Nothing left to process.");
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
  expect(said?.standing).toBeUndefined();
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
  const boxed = () => container.querySelectorAll("[data-selected]");

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

  await fireEvent.click(screen.getByRole("button", { name: "index" }));

  expect(replaced.urls).toEqual(["http://localhost/?view=index"]);
  expect(localStorage.getItem("notemap:view:queue")).toBe("index");

  // A gap after more than half a day, and not after less.
  const gapped = [...container.querySelectorAll("[data-gap]")];
  expect(gapped).toHaveLength(1);
  expect(gapped[0]?.textContent).toContain("three");
  expect(screen.getByRole("button", { name: "index" }).className).toContain(
    "font-semibold",
  );

  cleanup();
  rememberView("queue", "index");
  render(Queue);
  await screen.findByText("one");
  expect(container.querySelector("[data-gap]")).toBeDefined();
  expect(screen.getByRole("button", { name: "index" }).className).toContain(
    "font-semibold",
  );
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

/**
 * The editable shape holds a draft and its own `cancel`, so `esc` leaves it
 * before it leaves the selection — and losing the selection any other way
 * leaves it too, the box's foot going with the box.
 */
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

test("walking to another row leaves the one being rewritten as it was", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "e" });
  expect(await screen.findByLabelText("What it says")).toBeTruthy();

  await fireEvent.keyDown(window, { key: "j" });
  await tick();
  expect(screen.queryByLabelText("What it says")).toBeNull();
});
