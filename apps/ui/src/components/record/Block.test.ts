import { fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, expect, test, vi } from "vitest";

import type { RoutingRecord } from "@notemap/client";
import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import { NOT_YET_DELIVERED, NOTHING_KEPT } from "$lib/said";
import Block from "./Block.svelte";

afterEach(() => notices.clear());

const TARGET = {
  kind: "destination" as const,
  destination: "vault",
  capability: "create",
  arguments: { directory: "drafts", filename: "note.md" },
};

const RECORD: RoutingRecord = {
  id: "rec",
  item: "one",
  target: TARGET,
  state: "delivered",
  at: "2026-08-19T22:14:00.000Z",
  pointer: "drafts/note.md",
};

const KEPT: RoutingRecord = {
  ...RECORD,
  url: "https://vault.example/drafts/note.md",
  applied: { template: "tpl", firedByTag: true },
  output: {
    content: { blob: "abc", mediaType: "text/markdown" },
    note: "the two pictures were not carried",
  },
};

const VAULT = {
  id: "vault",
  name: "Fiction vault",
  kind: "filesystem",
  settings: {},
  retired: false,
};

const TEMPLATE = {
  id: "tpl",
  name: "Research",
  destination: "vault",
  capability: "create",
  arguments: {},
  triggerTag: "research",
};

const DESCRIBED = {
  kind: "described",
  capabilities: [
    {
      name: "create",
      accepts: ["text"],
      argumentsSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            title: "Directory",
            "x-notemap-path": "folders",
          },
          filename: {
            type: "string",
            title: "Filename",
            "x-notemap-path": "leaf",
          },
        },
      },
    },
  ],
};

const NOTE =
  "---\nid: 'one'\ntags:\n  - 'design'\n  - 'research'\n---\n# a thought\n\nand *stars*\n";

function answering(output: () => Response = () => markdown(NOTE)) {
  return (request: Request) => {
    switch (routeOf(request)) {
      case "GET /v1/destinations":
        return json(200, { values: [VAULT] });
      case "GET /v1/templates":
        return json(200, { values: [TEMPLATE] });
      case "GET /v1/destinations/vault/description":
        return json(200, DESCRIBED);
      case "GET /v1/routing/rec/output":
        return output();
      case "POST /v1/routing/rec/cancel":
        return json(204, undefined);
      default:
        return json(200, { values: [] });
    }
  };
}

const markdown = (text: string) =>
  new Response(text, {
    status: 200,
    headers: { "content-type": "text/markdown" },
  });

async function named() {
  pool(answering());
  await client.destinations.load();
  await client.templates.load();
}

test("reads as a file: destination, place, what was done, and the template", async () => {
  await named();

  render(Block, { folds: false, record: KEPT });

  expect(await screen.findByText("Fiction vault")).toBeDefined();
  expect(
    (await screen.findByText("drafts/note.md"))
      .closest("a")
      ?.getAttribute("href"),
  ).toBe("https://vault.example/drafts/note.md");
  expect(screen.getByText("created")).toBeDefined();
  expect(screen.getByText("via Research")).toBeDefined();
  expect(screen.getByRole("link", { name: "open ↗" })).toBeDefined();

  // Nothing of the old page's words, and no id.
  for (const gone of [
    "where it landed",
    "what was sent",
    "the decision",
    "routing record",
    "rec",
    "tpl",
  ]) {
    expect(screen.queryByText(gone)).toBeNull();
  }
});

/** True to the output: a path in it is the destination's, and rendering it here would break it. */
test("draws what was sent exactly as it was sent, and the note beneath", async () => {
  await named();

  render(Block, { folds: false, record: KEPT });

  const sent = await screen.findByText(/# a thought/);
  expect(sent.tagName).toBe("PRE");
  expect(sent.textContent).toBe(NOTE);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.queryByRole("button", { name: "raw" })).toBeNull();
  // The destination's note about what it could not carry is on the record.
  expect(screen.getByText("the two pictures were not carried")).toBeDefined();
});

test("draws the item's attachments above what was sent, once", async () => {
  await named();

  render(Block, {
    folds: false,
    record: KEPT,
    held: anItem("one", {
      payload: {
        type: "image",
        content: { text: "the whiteboard" },
        metadata: {},
        assets: [{ slot: "image", asset: "asset-1" }],
      },
      assets: [
        {
          id: "asset-1",
          filename: "whiteboard.jpg",
          mime: "image/jpeg",
          blob: "sha-256:whatever",
          bytes: 5,
        },
      ],
    }),
  });

  await screen.findByText(/# a thought/);
  expect(document.querySelectorAll("img")).toHaveLength(1);
});

test("an open record reads what was sent on arrival, once", async () => {
  await named();

  render(Block, { folds: false, record: KEPT });

  await screen.findByText(/# a thought/);
  expect(
    asked().filter((route) => route === "GET /v1/routing/rec/output"),
  ).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "read it" })).toBeNull();
});

test("asks for nothing where the record kept no copy, and says so", async () => {
  await named();

  render(Block, { folds: false, record: RECORD });

  expect(await screen.findByText(NOTHING_KEPT)).toBeDefined();
  expect(asked()).not.toContain("GET /v1/routing/rec/output");
});

test("says why what was sent could not be read, and does not ask again on its own", async () => {
  let refuse = true;
  pool(
    answering(() => {
      if (!refuse) return markdown(NOTE);
      refuse = false;
      return json(404, { error: { code: "blob-missing", facts: {} } });
    }),
  );
  await client.destinations.load();

  render(Block, { folds: false, record: KEPT });

  expect(await screen.findByText(/could not be read/)).toBeDefined();
  const again = await screen.findByRole("button", { name: "read it" });
  expect(
    asked().filter((route) => route === "GET /v1/routing/rec/output"),
  ).toHaveLength(1);

  await fireEvent.click(again);

  expect(await screen.findByText(/# a thought/)).toBeDefined();
});

test("draws what the delivery was given at the bottom, by the schema's names once described", async () => {
  await named();

  render(Block, { folds: false, record: KEPT });

  expect(await screen.findByText("Directory")).toBeDefined();
  expect(screen.getByText("drafts")).toBeDefined();
  expect(screen.getByText("Filename")).toBeDefined();
  expect(screen.queryByRole("button", { name: "arguments" })).toBeNull();
});

test("draws the arguments by their own keys until the destination is described", async () => {
  pool((request) =>
    routeOf(request).endsWith("/description")
      ? json(404, { error: { code: "no-such-destination", facts: {} } })
      : answering()(request),
  );

  render(Block, { folds: false, record: RECORD });

  expect(await screen.findByText("directory")).toBeDefined();
  expect(screen.getByText("filename")).toBeDefined();
});

test("a pending record says so and offers cancel, and nothing else does", async () => {
  await named();

  const { rerender } = render(Block, {
    folds: false,
    record: { ...RECORD, state: "pending", pointer: undefined },
  });

  expect(await screen.findByText(NOT_YET_DELIVERED)).toBeDefined();
  expect(screen.queryByText(NOTHING_KEPT)).toBeNull();
  expect(screen.getByRole("button", { name: "cancel" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "undo" })).toBeNull();

  await rerender({ record: RECORD });
  expect(screen.queryByRole("button", { name: "cancel" })).toBeNull();
  expect(screen.queryByRole("button", { name: "undo" })).toBeNull();
});

test("a pending record's head reads its folders and leaf as one path", async () => {
  await named();

  render(Block, {
    record: { ...RECORD, state: "pending", pointer: undefined },
  });

  expect(await screen.findByText("drafts/note.md")).toBeDefined();
});

test("cancelling calls the record off, says so in the corner, and tells the surface", async () => {
  await named();
  const undone = vi.fn();

  render(Block, {
    record: { ...RECORD, state: "pending" },
    held: anItem("one"),
    onundone: undone,
  });

  await fireEvent.click(await screen.findByRole("button", { name: "cancel" }));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/routing/rec/cancel");
  });
  await vi.waitFor(() => expect(undone).toHaveBeenCalled());
  expect(notices.shown.at(-1)?.what).toBe("cancelled");
});

test("a decision made by hand reads as one, with its note, and offers undo", async () => {
  await named();

  render(Block, {
    folds: false,
    record: {
      id: "rec",
      item: "one",
      target: { kind: "user", note: "pasted into the fiction-a vault" },
      state: "delivered",
      at: "2026-08-19T22:14:00.000Z",
    },
  });

  expect(await screen.findByText("by hand")).toBeDefined();
  expect(screen.getByText("marked processed")).toBeDefined();
  expect(screen.getByText("pasted into the fiction-a vault")).toBeDefined();
  expect(screen.getByRole("button", { name: "undo" })).toBeDefined();
  // Nothing was sent, so nothing says nothing was kept.
  expect(screen.queryByText(NOTHING_KEPT)).toBeNull();
  expect(screen.queryByRole("button", { name: "arguments" })).toBeNull();
});

/**
 * The head's own rule and the foot's used to be drawn separately, and with no
 * middle between them — a manual record with no note — they touched and read
 * as one thick rule. One `divide-y` on the container draws exactly one.
 */
test("draws one rule between sections, never a doubled one with an empty middle", async () => {
  await named();

  const { container } = render(Block, {
    folds: false,
    record: {
      id: "rec",
      item: "one",
      target: { kind: "user" },
      state: "delivered",
      at: "2026-08-19T22:14:00.000Z",
    },
  });

  await screen.findByText("marked processed");

  expect(container.querySelector(".max-w-read")?.className).toContain(
    "divide-y",
  );
  expect(container.querySelectorAll(".border-t, .border-b")).toHaveLength(0);
});

test("draws the words a delivery carried where it kept no copy of what it sent", async () => {
  await named();

  render(Block, {
    folds: false,
    record: {
      ...RECORD,
      target: { ...TARGET, content: { text: "a note, tidied" } },
    },
  });

  expect(await screen.findByText("a note, tidied")).toBeDefined();
  expect(screen.queryByText(NOTHING_KEPT)).toBeNull();
});

test("names the channel a record went to rather than its handle", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [
          {
            name: "publish",
            accepts: ["text"],
            argumentsSchema: {
              type: "object",
              properties: {
                channel: {
                  type: "string",
                  "x-notemap-candidates": true,
                  "x-notemap-offered-only": true,
                },
              },
            },
          },
        ],
      });
    }
    if (route.endsWith("/candidates")) {
      return json(200, {
        kind: "answered",
        entries: [{ label: "Reading", value: "reading", durable: "12345" }],
        truncated: false,
      });
    }
    return answering()(request);
  });
  await client.destinations.load();

  render(Block, {
    record: {
      ...RECORD,
      pointer: undefined,
      target: {
        kind: "destination",
        destination: "vault",
        capability: "publish",
        arguments: { channel: "12345" },
      },
    },
  });

  expect(await screen.findByText("Reading")).toBeDefined();
  expect(screen.queryByText(/12345/)).toBeNull();
});

test("leaves the place as text where the url is not one to follow", async () => {
  await named();

  render(Block, {
    folds: false,
    record: { ...KEPT, url: "javascript:alert(1)" },
  });

  expect((await screen.findByText("drafts/note.md")).closest("a")).toBeNull();
  expect(screen.queryByRole("link", { name: "open ↗" })).toBeNull();
});

test("says a capability it has never heard of by its name", async () => {
  await named();

  render(Block, {
    record: { ...RECORD, target: { ...TARGET, capability: "post-to-board" } },
  });

  expect(await screen.findByText("post-to-board")).toBeDefined();
});

test("draws what was sent at once the second time, without asking again", async () => {
  await named();

  const first = render(Block, { folds: false, record: KEPT });
  await screen.findByText(/# a thought/);
  first.unmount();

  render(Block, { folds: false, record: KEPT });
  expect(screen.getByText(/# a thought/)).toBeDefined();
  expect(
    asked().filter((route) => route === "GET /v1/routing/rec/output"),
  ).toHaveLength(1);
});

test("holds the line what was sent will take while it is read", async () => {
  await named();
  let answer!: (response: Response) => void;
  pool((request) =>
    routeOf(request) === "GET /v1/routing/rec/output"
      ? new Promise<Response>((resolve) => (answer = resolve))
      : json(200, { values: [] }),
  );

  const { container } = render(Block, { folds: false, record: KEPT });
  await vi.waitFor(() => {
    expect(asked()).toContain("GET /v1/routing/rec/output");
  });
  expect(container.querySelector("[data-asking]")).not.toBeNull();

  answer(markdown(NOTE));
  await screen.findByText(/# a thought/);
  expect(container.querySelector("[data-asking]")).toBeNull();
});

test("the log asks nothing of a decision made by hand, which never sends anything", async () => {
  await named();

  render(Block, {
    folds: false,
    record: {
      id: "rec",
      item: "one",
      target: { kind: "user" },
      state: "delivered",
      at: "2026-08-19T22:14:00.000Z",
    },
    blind: true,
  });

  await screen.findByText("by hand");
  expect(asked()).not.toContain("GET /v1/routing/rec/output");
});

test("says how much the delivery wrote, and nothing for words no output kept", async () => {
  await named();

  render(Block, { folds: false, record: KEPT });

  await screen.findByText(/# a thought/);
  // The bytes of the copy it just read, which is the only size anything holds.
  const size = screen.getByText("size");
  expect(size.closest("[data-facts]")).not.toBeNull();
  expect(
    screen.getByText(
      `${String(new TextEncoder().encode(NOTE).byteLength)} bytes`,
    ),
  ).toBeDefined();
});

test("says nothing about size where the words are the delivery's own and nothing was kept", async () => {
  await named();

  render(Block, {
    folds: false,
    record: {
      ...RECORD,
      target: { ...TARGET, content: { type: "text", text: "what went" } },
    },
  });

  await screen.findByText("what went");
  expect(screen.queryByText("size")).toBeNull();
});

const outputAsked = () =>
  asked().filter((route) => route === "GET /v1/routing/rec/output");

const opener = () =>
  screen.getByRole("button", { name: "Fiction vault", expanded: false });

test("folded, reads as one line: where it went and what was done, and nothing read", async () => {
  await named();

  render(Block, {
    record: KEPT,
    held: anItem("one", {
      payload: {
        type: "image",
        content: { text: "the whiteboard" },
        metadata: {},
        assets: [{ slot: "image", asset: "asset-1" }],
      },
      assets: [
        {
          id: "asset-1",
          filename: "whiteboard.jpg",
          mime: "image/jpeg",
          blob: "sha-256:whatever",
          bytes: 5,
        },
      ],
    }),
  });

  expect(await screen.findByText("Fiction vault")).toBeDefined();
  expect((await screen.findByText("drafts/note.md")).closest("a")).toBeNull();
  expect(screen.getByText("created")).toBeDefined();
  expect(opener().getAttribute("aria-expanded")).toBe("false");

  for (const gone of ["via Research", "the two pictures were not carried"]) {
    expect(screen.queryByText(gone)).toBeNull();
  }
  expect(screen.queryByRole("link", { name: "open ↗" })).toBeNull();
  expect(screen.queryByText("Directory")).toBeNull();
  expect(document.querySelectorAll("img")).toHaveLength(0);
  expect(outputAsked()).toHaveLength(0);
});

test("opens into the block, reading what was sent once however often it is opened", async () => {
  await named();

  render(Block, { record: KEPT });
  await screen.findByText("Fiction vault");

  await fireEvent.click(opener());
  expect(await screen.findByText(/# a thought/)).toBeDefined();
  expect(screen.getByText("via Research")).toBeDefined();
  expect(screen.getByRole("link", { name: "open ↗" })).toBeDefined();

  await fireEvent.click(
    screen.getByRole("button", { name: "Fiction vault", expanded: true }),
  );
  expect(screen.queryByText(/# a thought/)).toBeNull();

  await fireEvent.click(opener());
  expect(await screen.findByText(/# a thought/)).toBeDefined();
  expect(outputAsked()).toHaveLength(1);
});

test("opens on a press anywhere on the line", async () => {
  await named();

  render(Block, { record: KEPT });

  await fireEvent.click(await screen.findByText("created"));
  expect(await screen.findByText(/# a thought/)).toBeDefined();
});

test("a folded pending record offers cancel on its line, and says nothing else", async () => {
  await named();

  render(Block, { record: { ...RECORD, state: "pending" } });

  expect(await screen.findByRole("button", { name: "cancel" })).toBeDefined();
  expect(screen.queryByText(NOT_YET_DELIVERED)).toBeNull();
});

test("a folded decision made by hand keeps its note and its undo for when it is opened", async () => {
  await named();

  render(Block, {
    record: {
      id: "rec",
      item: "one",
      target: { kind: "user", note: "pasted into the fiction-a vault" },
      state: "delivered",
      at: "2026-08-19T22:14:00.000Z",
    },
  });

  const name = await screen.findByRole("button", { name: "by hand" });
  expect(screen.getByText("marked processed")).toBeDefined();
  expect(screen.queryByText("pasted into the fiction-a vault")).toBeNull();
  expect(screen.queryByRole("button", { name: "undo" })).toBeNull();

  await fireEvent.click(name);
  expect(screen.getByText("pasted into the fiction-a vault")).toBeDefined();
  expect(screen.getByRole("button", { name: "undo" })).toBeDefined();
});

test("with a lead, the line stays above the opened block and says what it is given to say", async () => {
  await named();

  const lead = createRawSnippet(() => ({
    render: () => "<span>a thought</span>",
  }));
  const end = createRawSnippet(() => ({
    render: () => "<span>unreachable</span>",
  }));
  const { container } = render(Block, { record: KEPT, lead, end });

  expect(await screen.findByText("a thought")).toBeDefined();
  expect(screen.getByText("unreachable")).toBeDefined();
  expect(screen.queryByText("created")).toBeNull();

  await fireEvent.click(opener());
  await screen.findByText(/# a thought/);
  expect(container.querySelector("[data-folded]")).not.toBeNull();
  expect(screen.getAllByRole("button", { name: "Fiction vault" })).toHaveLength(
    2,
  );
});

test("draws no foot where there is nothing to press", async () => {
  await named();

  const { container } = render(Block, {
    folds: false,
    record: { ...RECORD, target: { ...TARGET, arguments: {} } },
  });

  await screen.findByText(NOTHING_KEPT);
  expect(container.querySelector(".max-w-read")?.children).toHaveLength(2);
  expect(screen.queryByRole("link", { name: "item" })).toBeNull();
});

test("where it does not fold, the destination is no press", async () => {
  await named();

  render(Block, { folds: false, record: RECORD });

  await screen.findByText("Fiction vault");
  expect(screen.queryByRole("button", { name: "Fiction vault" })).toBeNull();
});

test("a cancel refused from the folded line says why under it", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/routing/rec/cancel"
      ? json(409, { error: { code: "already-delivered", facts: {} } })
      : answering()(request),
  );
  await client.destinations.load();
  const undone = vi.fn();

  render(Block, { record: { ...RECORD, state: "pending" }, onundone: undone });
  await fireEvent.click(await screen.findByRole("button", { name: "cancel" }));

  expect(await screen.findByRole("status")).toBeDefined();
  expect(opener()).toBeDefined();
  expect(undone).not.toHaveBeenCalled();
});

test("a press on a link in the lead follows it and leaves the line folded", async () => {
  await named();

  const lead = createRawSnippet(() => ({
    render: () => '<a href="#capture">a thought</a>',
  }));
  render(Block, { record: KEPT, lead });

  await fireEvent.click(await screen.findByRole("link", { name: "a thought" }));
  expect(opener()).toBeDefined();
  expect(outputAsked()).toHaveLength(0);
});
