import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import { NO_OUTPUT_KEPT, NO_RECORDS_OFFLINE } from "$lib/said";
import { dayOf } from "$lib/stamp";
import Record from "./Record.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const RECORD = {
  id: "rec",
  item: "one",
  target: {
    kind: "destination",
    destination: "vault",
    capability: "create-note",
    arguments: { directory: "drafts", filename: "note.md" },
  },
  state: "delivered",
  at: "2026-08-19T22:14:00.000Z",
  pointer: "drafts/note.md",
};

const VAULT = {
  id: "vault",
  name: "Fiction vault",
  kind: "filesystem",
  settings: {},
  retired: false,
};

const DESCRIBED = {
  kind: "described",
  capabilities: [
    {
      name: "create-note",
      accepts: ["text"],
      argumentsSchema: {
        type: "object",
        properties: {
          directory: { type: "string", title: "Directory" },
          filename: { type: "string", title: "Filename" },
        },
      },
    },
  ],
};

/** The pool answers the item, its records and the destinations behind them. */
function answering(
  records: readonly unknown[] = [RECORD],
  description: unknown = DESCRIBED,
  output: (() => Response) | undefined = undefined,
) {
  return (request: Request) => {
    switch (routeOf(request)) {
      case "GET /v1/items/one":
        return json(200, anItem("one"));
      case "GET /v1/items/one/routing":
        return json(200, { values: records });
      case "GET /v1/destinations":
        return json(200, { values: [VAULT] });
      case "GET /v1/destinations/vault/description":
        return json(200, description);
      case "GET /v1/routing/rec/output":
        return (
          output?.() ?? json(404, { error: { code: "no-output", facts: {} } })
        );
      default:
        return json(200, { values: [] });
    }
  };
}

const WITH_OUTPUT = {
  ...RECORD,
  url: "https://vault.example/drafts/note.md",
  output: {
    content: { blob: "abc", mediaType: "text/markdown" },
    note: "the two pictures were not carried",
  },
};

const markdown = () =>
  new Response("# a thought\n", {
    status: 200,
    headers: { "content-type": "text/markdown" },
  });

test("draws a record in full, against the capability's own schema", async () => {
  pool(answering());
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText("Fiction vault")).toBeDefined();
  expect(screen.getByText("create-note")).toBeDefined();
  expect(screen.getByText("delivered")).toBeDefined();
  expect(screen.getByText(dayOf(RECORD.at))).toBeDefined();

  // The titles the destination gives its fields, not the keys behind them.
  expect(await screen.findByText("Directory")).toBeDefined();
  expect(screen.getByText("drafts")).toBeDefined();
  expect(screen.getByText("Filename")).toBeDefined();

  // Text, never a link: nothing here guesses whether a string is a URL.
  const pointer = screen.getByText("drafts/note.md");
  expect(pointer.closest("a")).toBeNull();
});

test("draws the arguments by their own keys when the destination cannot be described", async () => {
  pool(answering([RECORD], { kind: "undescribable", detail: "unplugged" }));
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText("directory")).toBeDefined();
  expect(screen.getByText("filename")).toBeDefined();
  expect(screen.queryByText("Directory")).toBeNull();
  // The fallback is honest, not a failure: everything else still draws.
  expect(screen.getByText("drafts/note.md")).toBeDefined();
});

test("says a record this item does not have", async () => {
  pool(answering([]));

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(/No such record/)).toBeDefined();
});

test("says records are out of reach while the item still draws", async () => {
  const transport = pool(answering());
  await client.item("one");
  transport.unreachable(true);

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(NO_RECORDS_OFFLINE)).toBeDefined();
  // The item is the client's own and is drawn from it; the record is nobody's.
  expect(screen.getByRole("link", { name: "one" })).toBeDefined();
});

test("reads a decision the person carried out themselves", async () => {
  pool(
    answering([
      {
        id: "rec",
        item: "one",
        target: { kind: "user", note: "pasted into the fiction-a vault" },
        state: "delivered",
        at: "2026-08-19T22:14:00.000Z",
      },
    ]),
  );

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText("the user")).toBeDefined();
  expect(screen.getByText("pasted into the fiction-a vault")).toBeDefined();
  expect(screen.getByText("not recorded")).toBeDefined();
});

/** The name the wire carries, and what a person should read instead of it. */
test.each([
  ["create-file", "Created a note"],
  ["append-to-file", "Appended to a note"],
  ["create-or-append-file", "Created or appended to a note"],
])("says what %s did", async (capability, said) => {
  pool(answering([{ ...RECORD, target: { ...RECORD.target, capability } }]));
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(said)).toBeDefined();
  expect(screen.queryByText(capability)).toBeNull();
});

test("says a capability it has never heard of by its name", async () => {
  pool(
    answering([
      { ...RECORD, target: { ...RECORD.target, capability: "post-to-board" } },
    ]),
  );
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  // The names are the wire's, and one this shell does not know is still what
  // happened: saying nothing would be worse than saying it technically.
  expect(await screen.findByText("post-to-board")).toBeDefined();
});

test("draws the record and not its bookkeeping", async () => {
  pool(answering());
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });
  await screen.findByText("Fiction vault");

  // Both ids are in the address bar, which is where an id belongs.
  expect(screen.queryByText("rec")).toBeNull();
  expect(screen.queryByText("record")).toBeNull();
});

test("says a decision the person carried out with nothing written down", async () => {
  pool(
    answering([
      {
        id: "rec",
        item: "one",
        target: { kind: "user" },
        state: "delivered",
        at: "2026-08-19T22:14:00.000Z",
      },
    ]),
  );

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText("Marked done by hand")).toBeDefined();
  // The heading stands with `none` beneath it, as an empty argument set does.
  expect(screen.getByText("note")).toBeDefined();
  expect(screen.getByText("none")).toBeDefined();
});

test("says a delivery that kept no copy of what it sent", async () => {
  pool(answering());
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(NO_OUTPUT_KEPT)).toBeDefined();
  expect(screen.queryByRole("button", { name: "read it" })).toBeNull();
});

test("draws the note at once and reads what was sent only when asked", async () => {
  pool(answering([WITH_OUTPUT], DESCRIBED, markdown));
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  // The note is on the record; the bytes are a fetch, and one nobody made yet.
  expect(
    await screen.findByText("the two pictures were not carried"),
  ).toBeDefined();
  expect(asked()).not.toContain("GET /v1/routing/rec/output");

  await fireEvent.click(screen.getByRole("button", { name: "read it" }));

  expect(await screen.findByText(/# a thought/)).toBeDefined();
  expect(asked()).toContain("GET /v1/routing/rec/output");
});

test("makes the pointer a link where the destination offered one", async () => {
  pool(answering([WITH_OUTPUT], DESCRIBED, markdown));
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  const pointer = await screen.findByText("drafts/note.md");
  expect(pointer.closest("a")?.getAttribute("href")).toBe(
    "https://vault.example/drafts/note.md",
  );
});

test("leaves the pointer as text where the url is not one to follow", async () => {
  pool(
    answering(
      [{ ...WITH_OUTPUT, url: "javascript:alert(1)" }],
      DESCRIBED,
      markdown,
    ),
  );
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect((await screen.findByText("drafts/note.md")).closest("a")).toBeNull();
});

test("says why what was sent could not be read, and lets it be asked again", async () => {
  pool(
    answering([WITH_OUTPUT], DESCRIBED, () =>
      json(404, { error: { code: "blob-missing", facts: {} } }),
    ),
  );
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });
  await fireEvent.click(await screen.findByRole("button", { name: "read it" }));

  expect(await screen.findByText(/could not be read/)).toBeDefined();
  expect(screen.getByRole("button", { name: "read it" })).toBeDefined();
});
