import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import Dropping from "$components/dropping/Dropping.svelte";
import Feed from "$components/feed/Feed.svelte";

import { readDraft, writeDraft } from "$lib/draft";
import { client, pool } from "$testing/pool";
import Capture from "./Capture.svelte";

type Envelope = {
  id: string;
  source: string;
  payload: { assets: readonly { slot: string; asset: string }[] };
};

const UPLOAD = "PUT /v1/assets/";

const empty = json(200, { values: [] });

async function capture(text: string) {
  const written = screen.getByLabelText("What to capture");
  await fireEvent.input(written, { target: { value: text } });
  await fireEvent.click(screen.getByRole("button", { name: "capture" }));
  return written as HTMLTextAreaElement;
}

/** The row clears when the capture is applied, which is before the pool answers. */
async function cleared(written: HTMLTextAreaElement): Promise<void> {
  await vi.waitFor(() => {
    expect(written.value).toBe("");
  });
}

test("says why an empty box captures nothing, until something is written", async () => {
  const asked: string[] = [];
  pool((request) => {
    asked.push(routeOf(request));
    return empty.clone();
  });
  render(Capture);

  const written = await capture("   ");
  expect(screen.getByRole("status").textContent).toBe("nothing to capture");
  expect(asked).not.toContain("POST /v1/captures");

  await fireEvent.input(written, { target: { value: "a thought" } });
  expect(screen.queryByRole("status")).toBeNull();
});

test("draws a capture before the pool answers, and clears the form", async () => {
  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = resolve;
  });

  pool(async (request) => {
    if (routeOf(request) !== "POST /v1/captures") return empty.clone();

    await held;
    const envelope = (await request.json()) as Envelope;
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id, { source: envelope.source }),
      matchedOn: "id",
    });
  });

  render(Feed);
  render(Capture);

  const written = await capture("before any round trip");

  expect(await screen.findByText("before any round trip")).toBeDefined();
  await cleared(written);

  answer();
});

test("takes the caret, so the queue is typed into rather than clicked into", () => {
  pool(() => empty.clone());
  render(Capture);

  expect(document.activeElement).toBe(screen.getByLabelText("What to capture"));
});

test("stamps every capture web, and names every file in the order picked", async () => {
  const stamped: string[] = [];
  const named: string[] = [];
  const minted: string[] = [];

  pool(async (request) => {
    const route = routeOf(request);
    if (route.startsWith(UPLOAD)) {
      minted.push(route.slice(UPLOAD.length));
      return json(201, { id: minted.at(-1) });
    }
    if (route !== "POST /v1/captures") return empty.clone();

    const envelope = (await request.json()) as Envelope;
    stamped.push(envelope.source);
    named.push(...envelope.payload.assets.map((each) => each.asset));
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id, { source: envelope.source }),
      matchedOn: "id",
    });
  });

  render(Capture);

  await cleared(await capture("a typed note"));

  const picker = screen.getByLabelText("Files to capture");
  await fireEvent.change(picker, {
    target: { files: [new File(["bytes"], "shot.png", { type: "image/png" })] },
  });
  await fireEvent.change(picker, {
    target: {
      files: [new File(["%PDF"], "paper.pdf", { type: "application/pdf" })],
    },
  });
  await capture("a picture and a paper");

  await vi.waitFor(() => {
    expect(stamped).toEqual(["web", "web"]);
  });

  // The capture names the assets the uploads actually went up under.
  expect(minted).toHaveLength(2);
  expect(named).toEqual(minted);
});

/** jsdom draws nothing, so it implements no handle on a blob's bytes either. */
function stubObjectUrls(): void {
  URL.createObjectURL = vi.fn(() => "blob:held");
  URL.revokeObjectURL = vi.fn();
}

const shot = () => new File(["bytes"], "shot.png", { type: "image/png" });

async function attach(file = shot()) {
  await fireEvent.change(screen.getByLabelText("Files to capture"), {
    target: { files: [file] },
  });
}

/**
 * A picture goes up with the capture and cannot be taken back once it has, so
 * it is looked at before it is sent rather than recognised afterwards.
 */
test("draws an attached picture before it is committed, and offers a way to remove it", async () => {
  stubObjectUrls();
  pool(() => empty.clone());

  render(Capture);
  await attach();

  const drawn = await screen.findByAltText("shot.png");
  expect(drawn.getAttribute("src")).toBe("blob:held");
  expect(screen.getByText("shot.png")).toBeDefined();

  await fireEvent.click(
    screen.getByRole("button", { name: "remove shot.png" }),
  );

  expect(screen.queryByAltText("shot.png")).toBeNull();
  expect(screen.queryByText("shot.png")).toBeNull();
});

test("takes a file dropped anywhere on the page, and a picture pasted into its field", async () => {
  stubObjectUrls();
  pool(() => empty.clone());

  render(Capture);
  render(Dropping);

  await fireEvent.drop(document.body, {
    dataTransfer: { types: ["Files"], files: [shot()] },
  });
  await screen.findByAltText("shot.png");

  await fireEvent.paste(screen.getByLabelText("What to capture"), {
    clipboardData: {
      types: ["Files"],
      files: [new File(["more"], "pasted.png", { type: "image/png" })],
    },
  });
  await screen.findByAltText("pasted.png");
});

test("scrolls a list of attachments to the newest as one arrives", async () => {
  stubObjectUrls();
  pool(() => empty.clone());

  render(Capture);
  await attach();
  const list = (await screen.findByAltText("shot.png")).closest(
    ".overflow-y-auto",
  );
  if (list === null) throw new Error("no list of pictures");
  // jsdom lays nothing out, so the list's end is only what it is told.
  let top = 0;
  Object.defineProperty(list, "scrollHeight", { get: () => 400 });
  Object.defineProperty(list, "scrollTop", {
    get: () => top,
    set: (to: number) => {
      top = to;
    },
  });

  await attach(new File(["more"], "second.png", { type: "image/png" }));

  await vi.waitFor(() => {
    expect(top).toBe(400);
  });
});

test("brings the box into view once a dropped file has landed in it", async () => {
  stubObjectUrls();
  pool(() => empty.clone());

  const { container } = render(Capture);
  render(Dropping);
  const box = container.querySelector("form");
  const scrolled = vi.mocked(Element.prototype.scrollIntoView);
  scrolled.mockClear();

  await fireEvent.drop(document.body, {
    dataTransfer: { types: ["Files"], files: [shot()] },
  });

  await vi.waitFor(() => {
    expect(scrolled.mock.contexts).toContain(box);
  });
});

test("draws a file that is not a picture as a line, with no picture's room", async () => {
  stubObjectUrls();
  pool(() => empty.clone());

  render(Capture);
  await attach(new File(["%PDF"], "paper.pdf", { type: "application/pdf" }));

  const name = await screen.findByText("paper.pdf");
  expect(name.classList.contains("font-semibold")).toBe(true);
  // Whole where it is being put in: wrapped rather than cut, and nothing to hover for.
  expect(name.children).toHaveLength(0);
  expect(name.getAttribute("title")).toBeNull();
  expect(screen.getByText("4 bytes")).toBeDefined();
  expect(screen.queryByText("application/pdf")).toBeNull();
  expect(screen.queryByAltText("shot.png")).toBeNull();
});

const follows = (one: Node, other: Node) =>
  (one.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

test("draws a picture above the field and every other file under it, as a capture is read", async () => {
  stubObjectUrls();
  pool(() => empty.clone());

  render(Capture);
  await attach(new File(["%PDF"], "paper.pdf", { type: "application/pdf" }));
  await attach();

  const field = screen.getByLabelText("What to capture");
  const picture = await screen.findByAltText("shot.png");
  const paper = screen.getByText("paper.pdf");
  expect(follows(picture, field)).toBe(true);
  expect(follows(field, paper)).toBe(true);
});

test("a removed picture is not sent with the capture that follows", async () => {
  stubObjectUrls();
  const sent: Envelope[] = [];
  pool(async (request) => {
    if (routeOf(request) !== "POST /v1/captures") return empty.clone();
    const envelope = (await request.json()) as Envelope;
    sent.push(envelope);
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id),
      matchedOn: "id",
    });
  });

  render(Capture);
  await attach();
  await fireEvent.click(
    screen.getByRole("button", { name: "remove shot.png" }),
  );
  await capture("just words");

  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.payload.assets).toEqual([]);
});

/** `⏎` in the field is a new line, which is what prose wants, and so is `⇧⏎`. */
test("commits the capture with mod-enter from the field it is written in", async () => {
  pool(async (request) => {
    if (routeOf(request) !== "POST /v1/captures") return empty.clone();
    const envelope = (await request.json()) as Envelope;
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id),
      matchedOn: "id",
    });
  });

  render(Capture);
  const written = screen.getByLabelText(
    "What to capture",
  ) as HTMLTextAreaElement;
  await fireEvent.input(written, { target: { value: "sent by keystroke" } });

  await fireEvent.keyDown(written, { key: "Enter" });
  await fireEvent.keyDown(written, { key: "Enter", shiftKey: true });
  expect(written.value).toBe("sent by keystroke");

  await fireEvent.keyDown(written, { key: "Enter", ctrlKey: true });
  await cleared(written);
});

/** Classifying is part of writing it down, not a second gesture on the row. */
test("carries the tags chosen in the box on the capture, and clears them with it", async () => {
  const sent: (Envelope & { tags?: string[] })[] = [];
  pool(async (request) => {
    const route = routeOf(request);
    if (route === "GET /v1/tags") {
      return json(200, { values: [{ name: "research", count: 3 }] });
    }
    if (route !== "POST /v1/captures") return empty.clone();
    const envelope = (await request.json()) as Envelope;
    sent.push(envelope);
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id),
      matchedOn: "id",
    });
  });

  render(Capture);

  await fireEvent.click(
    screen.getByRole("button", { name: "Tag the capture" }),
  );
  const line = screen.getByLabelText("Tag the capture");
  await fireEvent.input(line, { target: { value: "research" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  await fireEvent.click(
    screen.getByRole("button", { name: "Tag the capture" }),
  );
  await fireEvent.input(screen.getByLabelText("Tag the capture"), {
    target: { value: "fresh" },
  });
  await fireEvent.keyDown(screen.getByLabelText("Tag the capture"), {
    key: "Enter",
  });

  expect(
    screen.getByRole("button", { name: "research", pressed: true }),
  ).toBeDefined();
  expect(
    screen.getByRole("button", { name: "fresh", pressed: true }),
  ).toBeDefined();

  const written = await capture("a classified thought");

  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.tags).toEqual(["research", "fresh"]);
  await cleared(written);
  expect(screen.queryByRole("button", { name: "research" })).toBeNull();
  expect(screen.queryByRole("button", { name: "fresh" })).toBeNull();
});

function captured() {
  return pool(async (request) => {
    if (routeOf(request) !== "POST /v1/captures") return empty.clone();
    const envelope = (await request.json()) as Envelope;
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id),
      matchedOn: "id",
    });
  });
}

/**
 * A crash or a closed tab should not cost what was typed before `capture`, so
 * the box keeps a draft and starts from it. The picture is not part of it.
 */
test("starts from the draft it last held, words and tags both", () => {
  captured();
  writeDraft({ text: "half a thought", tags: ["research"] });

  render(Capture);

  expect(
    (screen.getByLabelText("What to capture") as HTMLTextAreaElement).value,
  ).toBe("half a thought");
  expect(
    screen.getByRole("button", { name: "research", pressed: true }),
  ).toBeDefined();
});

test("keeps what is typed and tagged as it goes, and lets go when the capture commits", async () => {
  captured();
  render(Capture);

  await fireEvent.click(
    screen.getByRole("button", { name: "Tag the capture" }),
  );
  await fireEvent.input(screen.getByLabelText("Tag the capture"), {
    target: { value: "research" },
  });
  await fireEvent.keyDown(screen.getByLabelText("Tag the capture"), {
    key: "Enter",
  });
  const written = screen.getByLabelText("What to capture");
  await fireEvent.input(written, { target: { value: "half a thought" } });

  await vi.waitFor(() => {
    expect(readDraft()).toEqual({ text: "half a thought", tags: ["research"] });
  });

  await fireEvent.click(screen.getByRole("button", { name: "capture" }));
  await cleared(written as HTMLTextAreaElement);

  expect(readDraft()).toEqual({ text: "", tags: [] });
});

test("keeps the draft where the capture fails", async () => {
  captured();
  vi.spyOn(client, "capture").mockRejectedValue(new Error("not this time"));
  render(Capture);

  const written = await capture("not lost");

  expect(await screen.findByRole("status")).toBeDefined();
  expect(written.value).toBe("not lost");
  expect(readDraft()).toEqual({ text: "not lost", tags: [] });
});

/** The box unmounts with the queue, and a picture picked for it should not go with it. */
test("keeps a picked picture across the box being drawn again, until the capture commits", async () => {
  stubObjectUrls();
  captured();

  const first = render(Capture);
  await attach();
  expect(await screen.findByText("shot.png")).toBeDefined();
  first.unmount();

  const second = render(Capture);
  expect(await screen.findByText("shot.png")).toBeDefined();
  await capture("with the picture");
  await vi.waitFor(() => {
    expect(screen.queryByText("shot.png")).toBeNull();
  });
  second.unmount();

  render(Capture);
  expect(screen.queryByText("shot.png")).toBeNull();
});

/** A pool that asks for no credentials and takes at most `max` bytes, its limit already learned. */
async function limitedTo(
  max: number,
  handler: (request: Request) => Response | Promise<Response> = () =>
    empty.clone(),
) {
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/session") {
      return json(200, { authenticated: false, requiresCredentials: false });
    }
    if (route === "GET /v1/assets/limits") return json(200, { maxUpload: max });
    return handler(request);
  });
  await client.askSession();
  await vi.waitFor(() => {
    expect(
      client.refuses(new File(["x".repeat(max + 1)], "probe")),
    ).toBeDefined();
  });
  return transport;
}

test("refuses a file larger than the pool takes as it is picked, by name, and keeps the rest", async () => {
  stubObjectUrls();
  await limitedTo(4);

  render(Capture);
  await fireEvent.change(screen.getByLabelText("Files to capture"), {
    target: {
      files: [
        new File(["far too many bytes"], "huge.bin"),
        new File(["%PDF"], "paper.pdf", { type: "application/pdf" }),
      ],
    },
  });

  const refused = await screen.findByRole("status");
  expect(refused.textContent).toContain("huge.bin");
  expect(refused.textContent).toContain("larger than this daemon accepts");
  expect(screen.queryByText("huge.bin")).toBeNull();
  expect(screen.getByText("paper.pdf")).toBeDefined();
});

test("lets go of every file it attached when the capture fails, and keeps them in the box", async () => {
  stubObjectUrls();
  pool(() => empty.clone());
  const detached: string[] = [];
  const detach = vi.spyOn(client, "detach").mockImplementation((asset) => {
    detached.push(asset);
    return Promise.resolve();
  });
  const attached: string[] = [];
  const held = client.attach.bind(client);
  vi.spyOn(client, "attach").mockImplementation(async (file) => {
    if (file.name === "second.pdf") throw new Error("the store is full");
    const asset = await held(file);
    attached.push(asset);
    return asset;
  });

  render(Capture);
  await attach(new File(["%PDF"], "first.pdf", { type: "application/pdf" }));
  await attach(new File(["%PDF"], "second.pdf", { type: "application/pdf" }));
  await capture("with two files");

  await vi.waitFor(() => expect(detached).toHaveLength(1));
  expect(detached).toEqual(attached);
  expect(screen.getByText("first.pdf")).toBeDefined();
  expect(screen.getByText("second.pdf")).toBeDefined();
  detach.mockRestore();
});

test("asks again at the button, where the limit was learned after the file was picked", async () => {
  stubObjectUrls();
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/session") {
      return json(200, { authenticated: false, requiresCredentials: false });
    }
    if (route === "GET /v1/assets/limits") return json(200, { maxUpload: 4 });
    return empty.clone();
  });
  const attaching = vi.spyOn(client, "attach");

  render(Capture);
  await attach(new File(["far too many bytes"], "huge.bin"));
  expect(screen.getByText("huge.bin")).toBeDefined();

  await client.askSession();
  await vi.waitFor(() => {
    expect(client.refuses(new File(["far too many"], "probe"))).toBeDefined();
  });
  await capture("with a file learned too large");

  expect((await screen.findByRole("status")).textContent).toContain("huge.bin");
  expect(screen.queryByText("huge.bin")).toBeNull();
  expect(attaching).not.toHaveBeenCalled();
});

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";

/** A todo list whose heading is asked each time, the destination listing the note's own. */
function todo(arguments_: Record<string, unknown> = { path: "todo.md" }) {
  return {
    id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a90",
    name: "todo",
    destination: VAULT,
    capability: "append",
    arguments: arguments_,
    asked: { heading: { label: "list" } },
    folder: "create",
    triggerTag: "route/todo",
    fired: { records: 0 },
  };
}

const APPEND = {
  name: "append",
  accepts: ["note"],
  argumentsSchema: {
    type: "object",
    required: ["path"],
    properties: {
      path: {
        type: "string",
        "x-notemap-path": true,
        "x-notemap-candidates": true,
      },
      heading: {
        type: "string",
        title: "under",
        "x-notemap-candidates": true,
        "x-notemap-candidates-given": ["path"],
      },
    },
  },
};

async function servingTodo(template: Record<string, unknown>) {
  const sent: Record<string, unknown>[] = [];
  const asking: string[] = [];
  pool(async (request) => {
    const route = routeOf(request);
    if (route === "GET /v1/templates") {
      return json(200, { values: [template] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [APPEND] });
    }
    if (route.endsWith("/candidates")) {
      asking.push(new URL(request.url).search);
      return json(200, {
        kind: "answered",
        entries: [
          { label: "## Next", value: "Next" },
          { label: "## Someday", value: "Someday" },
          { label: "archive", scope: "archive" },
        ],
        truncated: false,
      });
    }
    if (route === "POST /v1/captures") {
      const envelope = (await request.json()) as Record<string, unknown>;
      sent.push(envelope);
      return json(201, {
        kind: "captured",
        item: anItem(envelope["id"] as string),
        matchedOn: "id",
      });
    }
    return empty.clone();
  });
  await client.templates.load();
  render(Capture);
  return { sent, asking };
}

async function takeTag(name: string) {
  await fireEvent.click(
    screen.getByRole("button", { name: "Tag the capture" }),
  );
  const line = screen.getByLabelText("Tag the capture");
  await fireEvent.input(line, { target: { value: name } });
  await fireEvent.keyDown(line, { key: "Enter" });
}

test("asks a trigger tag's template for its heading, from the note's own", async () => {
  const { sent, asking } = await servingTodo(todo());

  await takeTag("route/todo");
  const line = await screen.findByRole("combobox", { name: "list" });
  expect(await screen.findByText("## Next")).toBeDefined();
  expect(decodeURIComponent(asking[0] ?? "")).toContain("given[path]=todo.md");
  // Not on the capture until the value is given.
  expect(screen.queryByRole("button", { name: /route\/todo/ })).toBeNull();

  await fireEvent.keyDown(line, { key: "ArrowDown" });
  await fireEvent.keyDown(line, { key: "ArrowDown" });
  await fireEvent.keyDown(line, { key: "Enter" });

  expect(await screen.findByText("list Someday")).toBeDefined();
  await capture("buy milk");

  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.["tags"]).toEqual(["route/todo"]);
  expect(sent[0]?.["arguments"]).toEqual({
    "route/todo": { heading: "Someday" },
  });
});

test("takes a heading the note does not have, typed, as a row of its own", async () => {
  const { sent } = await servingTodo(todo());

  await takeTag("route/todo");
  const line = await screen.findByRole("combobox", { name: "list" });
  await fireEvent.input(line, { target: { value: "Ideas" } });
  expect(await screen.findByText("+ Ideas")).toBeDefined();
  await fireEvent.keyDown(line, { key: "Enter" });

  await capture("a thought");
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.["arguments"]).toEqual({
    "route/todo": { heading: "Ideas" },
  });
});

test("an empty line takes the default, which the pool fills in", async () => {
  const { sent } = await servingTodo(
    todo({ path: "todo.md", heading: "Inbox" }),
  );

  await takeTag("route/todo");
  const line = await screen.findByRole("combobox", { name: "list" });
  expect(line.getAttribute("placeholder")).toBe("Inbox");
  await fireEvent.keyDown(line, { key: "Enter" });

  expect(await screen.findByText("list Inbox")).toBeDefined();
  await capture("a thought");
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.["tags"]).toEqual(["route/todo"]);
  expect(sent[0]).not.toHaveProperty("arguments");
});

test("an empty line with no default keeps asking", async () => {
  await servingTodo(todo());

  await takeTag("route/todo");
  const line = await screen.findByRole("combobox", { name: "list" });
  await fireEvent.keyDown(line, { key: "Enter" });

  expect(screen.getByRole("combobox", { name: "list" })).toBe(line);
  expect(screen.queryByRole("button", { name: /route\/todo/ })).toBeNull();
});

test("says what it asks beside the list rather than in it, and the line points at it", async () => {
  await servingTodo(todo({ path: "todo.md", heading: "Inbox" }));

  await takeTag("route/todo");
  const line = await screen.findByRole("combobox", { name: "list" });
  const said = document.getElementById(
    line.getAttribute("aria-describedby") ?? "",
  );

  expect(said?.textContent).toContain("default Inbox");
  expect(
    within(screen.getByRole("listbox", { name: "list" })).queryByText(
      /default Inbox/,
    ),
  ).toBeNull();
});

test("offers no entry that is only somewhere to look further", async () => {
  await servingTodo(todo());

  await takeTag("route/todo");
  expect(await screen.findByText("## Next")).toBeDefined();
  expect(screen.queryByText("archive")).toBeNull();
});

test("a heading typed as the list reads it is the listed one, not a new one", async () => {
  const { sent } = await servingTodo(todo());

  await takeTag("route/todo");
  const line = await screen.findByRole("combobox", { name: "list" });
  expect(await screen.findByText("## Next")).toBeDefined();
  await fireEvent.input(line, { target: { value: "## Next" } });
  expect(screen.queryByText("+ ## Next")).toBeNull();
  await fireEvent.keyDown(line, { key: "Enter" });

  await capture("a thought");
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.["arguments"]).toEqual({
    "route/todo": { heading: "Next" },
  });
});

test("an asked place is typed rather than listed a level deep", async () => {
  const { sent, asking } = await servingTodo({
    ...todo({ heading: "Inbox" }),
    asked: { path: { label: "note" } },
  });

  await takeTag("route/todo");
  const line = await screen.findByRole("combobox", { name: "note" });
  expect(screen.queryByRole("option")).toBeNull();
  await fireEvent.input(line, { target: { value: "lists/todo.md" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  await capture("a thought");
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.["arguments"]).toEqual({
    "route/todo": { path: "lists/todo.md" },
  });
  expect(asking.some((query) => query.includes("field=path"))).toBe(false);
});

test("esc steps back to the tags without taking one", async () => {
  await servingTodo(todo());

  await takeTag("route/todo");
  const line = await screen.findByRole("combobox", { name: "list" });
  await fireEvent.keyDown(line, { key: "Escape" });

  expect(
    await screen.findByRole("combobox", { name: "Tag the capture" }),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: /route\/todo/ })).toBeNull();
});
