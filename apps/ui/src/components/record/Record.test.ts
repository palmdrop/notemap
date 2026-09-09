import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import {
  NO_OUTPUT_KEPT,
  NO_POINTER_BY_HAND,
  NO_POINTER_KEPT,
  NO_RECORDS_OFFLINE,
} from "$lib/said";
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
  expect(screen.getByText(dayOf(RECORD.at))).toBeDefined();

  // A record that is not saying otherwise was delivered, so it does not say it.
  expect(screen.queryByText("delivered")).toBeNull();

  // Text, never a link: nothing here guesses whether a string is a URL.
  const pointer = screen.getByText("drafts/note.md");
  expect(pointer.closest("a")).toBeNull();

  // The decision is a second reading, and it is a press away.
  expect(screen.queryByText("Directory")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "the decision" }));

  // The titles the destination gives its fields, not the keys behind them.
  expect(await screen.findByText("Directory")).toBeDefined();
  expect(screen.getByText("drafts")).toBeDefined();
  expect(screen.getByText("Filename")).toBeDefined();
});

/** Where it landed is what somebody opening a record came for, so it leads. */
test("leads with where it landed", async () => {
  pool(answering());
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText("where it landed")).toBeDefined();
  expect(screen.queryByText("arguments")).toBeNull();
});

test("says a destination that named no place to go and look", async () => {
  pool(answering([{ ...RECORD, pointer: undefined }]));
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(NO_POINTER_KEPT)).toBeDefined();
});

test("draws the arguments by their own keys when the destination cannot be described", async () => {
  pool(answering([RECORD], { kind: "undescribable", detail: "unplugged" }));
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  // The fallback is honest, not a failure: everything else still draws.
  expect(await screen.findByText("drafts/note.md")).toBeDefined();

  await fireEvent.click(screen.getByRole("button", { name: "the decision" }));

  expect(await screen.findByText("directory")).toBeDefined();
  expect(screen.getByText("filename")).toBeDefined();
  expect(screen.queryByText("Directory")).toBeNull();
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
  // Nothing was asked of anything, so nothing declined to name a place.
  expect(screen.getByText(NO_POINTER_BY_HAND)).toBeDefined();
  expect(screen.queryByText(NO_POINTER_KEPT)).toBeNull();
});

/** The name the wire carries, and what a person should read instead of it. */
test.each([
  ["create", "Created"],
  ["append", "Appended"],
  ["create-or-append", "Created or appended"],
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
  // Nothing was written down, so there is no note to head: a heading over
  // `none` is a row spent saying that a person left a field empty.
  expect(screen.queryByText("note")).toBeNull();
  // Nor is there a decision to open: marking processed is not an argument set.
  expect(screen.queryByRole("button", { name: "the decision" })).toBeNull();
});

test("says a delivery that kept no copy of what it sent", async () => {
  pool(answering());
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(NO_OUTPUT_KEPT)).toBeDefined();
  expect(screen.queryByRole("button", { name: "read it" })).toBeNull();
});

test("draws the note and reads what was sent, without being asked twice", async () => {
  pool(answering([WITH_OUTPUT], DESCRIBED, markdown));
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  // Opening the record is the asking: the bytes arrive without a press.
  expect(
    await screen.findByText("the two pictures were not carried"),
  ).toBeDefined();
  expect(await screen.findByText(/# a thought/)).toBeDefined();
  expect(screen.queryByRole("button", { name: "read it" })).toBeNull();
  expect(
    asked().filter((route) => route === "GET /v1/routing/rec/output"),
  ).toHaveLength(1);
});

test("asks for nothing where the record kept no copy", async () => {
  pool(answering());
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(NO_OUTPUT_KEPT)).toBeDefined();
  expect(asked()).not.toContain("GET /v1/routing/rec/output");
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
  let refuse = true;
  pool(
    answering([WITH_OUTPUT], DESCRIBED, () => {
      if (!refuse) return markdown();
      refuse = false;
      return json(404, { error: { code: "blob-missing", facts: {} } });
    }),
  );
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  // The read on arrival failed, and is not tried again on its own.
  expect(await screen.findByText(/could not be read/)).toBeDefined();
  const again = await screen.findByRole("button", { name: "read it" });
  expect(
    asked().filter((route) => route === "GET /v1/routing/rec/output"),
  ).toHaveLength(1);

  await fireEvent.click(again);

  expect(await screen.findByText(/# a thought/)).toBeDefined();
});

test("drops what one record sent when another is drawn", async () => {
  const both = [WITH_OUTPUT, { ...WITH_OUTPUT, id: "rec-2" }];
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/routing/rec/output") {
      return new Response("# the first one\n", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      });
    }
    if (route === "GET /v1/routing/rec-2/output") {
      return new Response("# the second one\n", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      });
    }
    return answering(both, DESCRIBED, markdown)(request);
  });
  await client.destinations.load();

  const drawn = render(Record, { item: "one", record: "rec" });
  expect(await screen.findByText(/# the first one/)).toBeDefined();

  // The page component is reused across a change of record.
  await drawn.rerender({ item: "one", record: "rec-2" });

  expect(await screen.findByText(/# the second one/)).toBeDefined();
  expect(screen.queryByText(/# the first one/)).toBeNull();
});
