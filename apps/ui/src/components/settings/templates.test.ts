import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { online } from "$testing/dom";
import { asked, pool, sent } from "$testing/pool";
import Templates from "./Templates.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";
const RESEARCH = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a80";

const CREATE = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string" },
      folder: { type: "string", enum: ["create", "require"] },
    },
  },
};

/** A place, then the switches a markdown kind draws after it, as the kind declares them. */
const CREATE_WITH_SWITCHES = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string" },
      frontmatter: {
        type: "string",
        enum: ["full", "none"],
        default: "none",
        "x-notemap-inherits": true,
      },
      hashtags: {
        type: "boolean",
        default: false,
        "x-notemap-inherits": true,
      },
      triggerTags: {
        type: "boolean",
        title: "trigger tags",
        "x-notemap-when": [
          { field: "frontmatter", is: ["full"] },
          { field: "hashtags", is: [true] },
        ],
      },
    },
  },
};

function aDestination(overrides: Record<string, unknown> = {}) {
  return {
    id: VAULT,
    name: "Vault",
    kind: "filesystem",
    settings: { root: "~/notes" },
    retired: false,
    ...overrides,
  };
}

function aTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: RESEARCH,
    name: "research",
    destination: VAULT,
    capability: "create",
    arguments: { directory: "research/{{captured_at}}" },
    folder: "create",
    triggerTag: "route/research",
    fired: { records: 4, lastAt: "2026-09-05T10:00:00.000Z" },
    ...overrides,
  };
}

function serving(
  templates: readonly Record<string, unknown>[],
  report: Record<string, unknown> = { kind: "fits" },
  destinations: readonly Record<string, unknown>[] = [aDestination()],
  capabilities: readonly Record<string, unknown>[] = [CREATE],
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: destinations });
    }
    if (route === "GET /v1/templates") {
      return json(200, { values: templates });
    }
    if (route.endsWith("/report")) return json(200, report);
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities });
    }
    if (route === "POST /v1/templates") return json(201, aTemplate());
    if (route === `DELETE /v1/templates/${RESEARCH}`) {
      return new Response(null, { status: 204 });
    }
    if (route === `PATCH /v1/templates/${RESEARCH}`) {
      return json(200, aTemplate({ name: "reading" }));
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

const open = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

/** What a fact says, read off its own label: two facts may hold one word. */
const said = async (fact: string) =>
  (await screen.findByText(fact)).nextElementSibling?.textContent?.trim();

test("draws each template with its tag, its place and what it last answered", async () => {
  serving([aTemplate()]);

  render(Templates);

  await screen.findByRole("button", { name: "research" });
  expect(screen.getByText("research/{{captured_at}}")).toBeTruthy();
  await vi.waitFor(() => {
    expect(screen.getByText("ok")).toBeTruthy();
  });

  await open(/research/);
  expect(await said("tag")).toBe("route/research");
});

test("asks each row for its own report, and asks a settled one once", async () => {
  serving([aTemplate(), aTemplate({ id: "second", name: "daily" })]);

  render(Templates);

  await vi.waitFor(() => {
    expect(asked().filter((each) => each.endsWith("/report"))).toEqual([
      `GET /v1/templates/${RESEARCH}/report`,
      "GET /v1/templates/second/report",
    ]);
  });

  // Settled answers are not asked again, however often the list redraws.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(asked().filter((each) => each.endsWith("/report")).length).toBe(2);
});

test("a template whose destination is gone leads with that and offers repointing", async () => {
  serving([aTemplate({ destination: "deleted" })], { kind: "stranded" });

  render(Templates);

  await screen.findByText("Does nothing until repointed.");
  await open(/research/);
  // Repointing is an ordinary edit of the destination field; there is no
  // special repair beyond it.
  expect(await screen.findByRole("button", { name: "edit" })).toBeTruthy();
});

test("a destination that cannot be asked draws no alarm", async () => {
  serving([aTemplate()], { kind: "unreachable", detail: "ECONNREFUSED" });

  render(Templates);

  const said = await screen.findByText("not reachable");
  expect(said.className).not.toContain("text-alarm");
});

test("a missing folder is drawn as a thing to act on, and named", async () => {
  serving([aTemplate({ folder: "require" })], {
    kind: "folder-missing",
    folder: "research/",
  });

  render(Templates);

  const said = await screen.findByText(/research\/ missing/);
  expect(said.className).toContain("text-alarm");
});

test("opening one says what it does, into what, and how much it has", async () => {
  serving([aTemplate()]);

  render(Templates);
  await open(/research/);

  // By the fact it sits under: `create` is the capability here and a folder
  // mode two rows down, and a bare text query cannot tell them apart.
  expect(await said("action")).toBe("create");
  expect(screen.getByText(/4 times/)).toBeTruthy();
});

test("makes one from the form, and the arguments are typed as patterns", async () => {
  serving([]);

  render(Templates);
  await open(/add a template/);

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Research links" },
  });
  await fireEvent.input(screen.getByLabelText("trigger tag"), {
    target: { value: "research" },
  });
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "research/{{captured_at}}" },
  });
  await open("save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual({
    name: "Research links",
    destination: VAULT,
    capability: "create",
    arguments: { directory: "research/{{captured_at}}" },
    folder: "create",
    triggerTag: "route/research",
  });
});

test("says what the pool refused about a pattern, where it was typed", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route === "GET /v1/templates") return json(200, { values: [] });
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE] });
    }
    if (route === "POST /v1/templates") {
      return json(422, {
        error: { code: "unknown-pattern-field", field: "captured" },
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  render(Templates);
  await open(/add a template/);
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "research/{{captured}}" },
  });
  await open("save");

  expect(await screen.findByText(/there is no "captured"/)).toBeTruthy();
});

test("the edit form holds under a click on its label", async () => {
  serving([aTemplate()]);

  render(Templates);
  await open(/research/);
  await open(/^edit$/);

  const form = await screen.findByRole("textbox", { name: "name" });
  await fireEvent.click(screen.getByText("trigger tag"));
  expect(screen.getByRole("textbox", { name: "name" })).toBe(form);

  await open(/^cancel$/);
  expect(screen.queryByRole("textbox", { name: "name" })).toBeNull();
});

test("deleting asks in a line, and says what a record keeps", async () => {
  serving([aTemplate()]);

  render(Templates);
  await open(/research/);
  await open(/^delete$/);

  expect(
    await screen.findByText(/Records made from it keep resolving/),
  ).toBeTruthy();

  await open(/delete anyway/);
  await vi.waitFor(() => {
    expect(asked()).toContain(`DELETE /v1/templates/${RESEARCH}`);
  });
});

test("says templates can be read but not changed while the pool is away", async () => {
  serving([aTemplate()]);
  online(false);

  render(Templates);

  expect(
    await screen.findByText("Templates can be read but not changed."),
  ).toBeTruthy();
  online(true);
});

/**
 * A destination whose places are a fixed set, and which has no folders at all.
 * The form is built from what the capability published, so none of this is a
 * case the shell was told about.
 */
const ADD_CARD = {
  name: "add-card",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["column"],
    properties: {
      column: { type: "string", enum: ["reading", "done"] },
      title: { type: "string" },
    },
  },
};

function servingBoard(templates: readonly Record<string, unknown>[] = []) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "board" })] });
    }
    if (route === "GET /v1/templates") {
      return json(200, { values: templates });
    }
    if (route.endsWith("/report")) return json(200, { kind: "fits" });
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [ADD_CARD] });
    }
    if (route === "POST /v1/templates") return json(201, aTemplate());
    return json(404, { error: { code: "unknown-route" } });
  });
}

test("a field the schema fixes is chosen rather than typed", async () => {
  servingBoard();

  render(Templates);
  await open(/add a template/);

  // The values the capability declared, offered; and no box to mistype one in.
  expect(await screen.findByRole("button", { name: "reading" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "done" })).toBeTruthy();
  expect(screen.queryByLabelText("column")).toBeNull();

  // A field the schema leaves open is still typed, patterns and all.
  expect(screen.getByLabelText("title")).toBeTruthy();
});

test("a capability with no folders is offered no folder mode", async () => {
  servingBoard();

  render(Templates);
  await open(/add a template/);

  await screen.findByRole("button", { name: "reading" });
  expect(screen.queryByRole("button", { name: /^establish/ })).toBeNull();
  expect(screen.queryByText("folder")).toBeNull();
});

test("saves what was chosen, and says create where there are no folders", async () => {
  servingBoard();

  render(Templates);
  await open(/add a template/);

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Reading list" },
  });
  await open("reading");
  await fireEvent.input(screen.getByLabelText("title"), {
    target: { value: "{{captured_at}}" },
  });
  await open("save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual({
    name: "Reading list",
    destination: VAULT,
    capability: "add-card",
    arguments: { column: "reading", title: "{{captured_at}}" },
    folder: "create",
  });
});

/**
 * The three modes were drawn with the prop that says an option cannot be taken,
 * so every one of them was disabled and the mode was whatever it started as.
 */
test("the folder mode is chosen rather than only read", async () => {
  serving([]);

  render(Templates);
  await open(/add a template/);

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Research links" },
  });
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "research" },
  });
  await open(/^establish/);
  await open("save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual({
    name: "Research links",
    destination: VAULT,
    capability: "create",
    arguments: { directory: "research" },
    folder: "establish",
  });
});

/** The same fields twice, one settled and one being changed, contradict each other. */
test("editing draws the form alone, not the template beside it", async () => {
  serving([aTemplate()]);

  render(Templates);
  await open(/research/);
  expect(await said("action")).toBe("create");

  await open("edit");

  // A fact the form has no counterpart for; `action` and `folder` are both
  // words the form uses too.
  expect(screen.queryByText("used")).toBeNull();
  expect(screen.queryByRole("button", { name: "delete" })).toBeNull();
  expect(await screen.findByLabelText("name")).toBeTruthy();
});

test("draws a board template's place without knowing what a place is", async () => {
  servingBoard([
    aTemplate({
      capability: "add-card",
      arguments: { column: "reading", title: "{{captured_at}}" },
    }),
  ]);

  render(Templates);

  // Every string the arguments hold, in the order the destination declared
  // them — never a field name this shell had to be told.
  await screen.findByText("reading · {{captured_at}}");
});

/**
 * A destination whose places are neither a path nor a fixed set: a list only
 * the account can answer, picked from rather than created, and flat. The form
 * asks the destination and offers what came back, and the field stays typable
 * because a template's value may be a pattern.
 */
const PUBLISH = {
  name: "publish",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["channel"],
    properties: {
      channel: {
        type: "string",
        title: "channel",
        "x-notemap-candidates": true,
        "x-notemap-offered-only": true,
      },
    },
  },
};

function servingChannels(
  entries: readonly Record<string, unknown>[],
  templates: readonly Record<string, unknown>[] = [],
  /** What the destination names for a value its own page never listed. */
  offPage: readonly Record<string, unknown>[] = [],
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "arena" })] });
    }
    if (route === "GET /v1/templates") return json(200, { values: templates });
    if (route.endsWith("/named")) {
      const held = new URL(request.url).searchParams.get("value");
      const found = [...entries, ...offPage].find(
        (each) => each["durable"] === held || each["value"] === held,
      );
      return json(200, {
        kind: "answered",
        ...(found === undefined ? {} : { entry: found }),
      });
    }
    if (route.endsWith("/candidates")) {
      return json(200, { kind: "answered", entries, truncated: true });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [PUBLISH] });
    }
    if (route === "POST /v1/templates") return json(201, aTemplate());
    return json(404, { error: { code: "unknown-route" } });
  });
}

test("asks the destination what a browsable field could hold, and offers it", async () => {
  servingChannels([
    { label: "reading", value: "reading" },
    { label: "field recordings", value: "field-recordings" },
  ]);

  render(Templates);
  await open(/add a template/);

  // Rows rather than buttons now, as the typed line's are, so `↑↓` can walk
  // them without moving focus off the field.
  await screen.findByText("reading");
  expect(screen.getByText("field recordings")).toBeTruthy();
});

test("taking one fills the field, and the field is still typed into", async () => {
  servingChannels([{ label: "reading", value: "reading" }]);

  render(Templates);
  await open(/add a template/);
  await fireEvent.mouseDown(await screen.findByText("reading"));

  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  expect(field.value).toBe("reading");

  // A place that has to be picked from what is there and one that has to be
  // written are the same field: a template's value may hold a pattern.
  await fireEvent.input(field, { target: { value: "{{source}}" } });
  expect(field.value).toBe("{{source}}");
});

const READING = { label: "Reading", value: "reading", durable: "12345" };

/**
 * A template fires on a tag for months, and an are.na slug does not survive a
 * retitle — so the browse hands this form the name that does, and the line goes
 * on reading the name the person picked.
 */
test("takes the form of a value that survives a rename", async () => {
  servingChannels([READING]);

  render(Templates);
  await open(/add a template/);
  await fireEvent.mouseDown(await screen.findByText("Reading"));

  expect((await screen.findByLabelText("channel")) as HTMLInputElement).toEqual(
    expect.objectContaining({ value: "Reading" }),
  );

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Reading list" },
  });
  await open("save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual(
    expect.objectContaining({ arguments: { channel: "12345" } }),
  );
});

/** Typed rather than taken, and it lands on the same lasting name. */
test("resolves a title typed to the form that survives a rename", async () => {
  servingChannels([READING]);

  render(Templates);
  await open(/add a template/);
  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  // The answer has to be in before a title can be resolved against it.
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "Read" } });
  await fireEvent.blur(field);
  expect(field.value).toBe("Reading");

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Reading list" },
  });
  await open("save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual(
    expect.objectContaining({ arguments: { channel: "12345" } }),
  );
});

/**
 * What the ID cost before it was read back: a template saved months ago drew
 * `12345`, and nothing on the form said which channel that was.
 */
test("reads a saved id back as the name the destination knows it by", async () => {
  servingChannels(
    [READING],
    [aTemplate({ capability: "publish", arguments: { channel: "12345" } })],
  );

  render(Templates);
  await open(/research/);
  await open("edit");

  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  await vi.waitFor(() => expect(field.value).toBe("Reading"));
});

const GROUP = { label: "Group notes", value: "group-notes", durable: "99999" };

/**
 * A browse answers one page — are.na's does, on purpose — so an account with
 * more channels than that has the held one outside it. Reading the page alone
 * would put the ID back on the form for exactly the accounts big enough to
 * have wanted it gone.
 */
test("asks what a channel outside the answered page is called", async () => {
  servingChannels(
    [READING],
    [aTemplate({ capability: "publish", arguments: { channel: "99999" } })],
    [GROUP],
  );

  render(Templates);
  await open(/research/);
  await open("edit");

  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  await vi.waitFor(() => expect(field.value).toBe("Group notes"));

  expect(asked()).toContain(`GET /v1/destinations/${VAULT}/named`);
});

/** The page already answers for it, so nothing is asked a second time. */
test("asks nothing where the answered page already names it", async () => {
  servingChannels(
    [READING],
    [aTemplate({ capability: "publish", arguments: { channel: "12345" } })],
  );

  render(Templates);
  await open(/research/);
  await open("edit");

  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  await vi.waitFor(() => expect(field.value).toBe("Reading"));

  expect(asked()).not.toContain(`GET /v1/destinations/${VAULT}/named`);
});

/**
 * Nothing names it on the page or off it, so it stands as written — which is
 * what a channel typed by hand looks like, and it delivers perfectly well.
 */
test("leaves a handle nothing answers for exactly as it was saved", async () => {
  servingChannels(
    [READING],
    [aTemplate({ capability: "publish", arguments: { channel: "67890" } })],
  );

  render(Templates);
  await open(/research/);
  await open("edit");

  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  await screen.findByText("Reading");
  expect(field.value).toBe("67890");
});

/**
 * A slug is the name a person can actually get hold of — it is in the channel's
 * own URL, where the numeric id is not. For a channel outside the answered page
 * the browse cannot resolve one, so the destination is asked, and the field
 * takes the form that survives a rename.
 */
test("resolves a slug typed for a channel the browse never listed", async () => {
  const GROUP = {
    label: "Group notes",
    value: "group-notes",
    durable: "99999",
  };
  servingChannels([READING], [], [GROUP]);

  render(Templates);
  await open(/add a template/);
  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "group-notes" } });
  await fireEvent.blur(field);
  await vi.waitFor(() => expect(field.value).toBe("Group notes"));

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Group" },
  });
  await open("save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual(
    expect.objectContaining({ arguments: { channel: "99999" } }),
  );
});

/** The list draws pool state and asks nothing, so it learned this by browsing. */
test("draws a saved template's channel by name in the list", async () => {
  servingChannels(
    [READING],
    [aTemplate({ capability: "publish", arguments: { channel: "12345" } })],
  );

  render(Templates);
  await vi.waitFor(() => expect(screen.getByText("Reading")).toBeTruthy());
  expect(screen.queryByText("12345")).toBeNull();
});

/**
 * `⇥` completes to the one name, and pressing it again walks the rest —
 * the field taking each lasting form while the line goes on reading titles.
 */
test("walks the channels a typed name still matches, in names", async () => {
  const RE_READ = { label: "Rereading", value: "rereading", durable: "22222" };
  servingChannels([READING, RE_READ]);

  render(Templates);
  await open(/add a template/);
  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  await screen.findByText("Rereading");

  await fireEvent.input(field, { target: { value: "Re" } });
  // Both agree as far as `Re`, so the first press has nothing to add and the
  // walk starts here.
  await fireEvent.keyDown(field, { key: "Tab" });
  expect(field.value).toBe("Reading");

  await fireEvent.keyDown(field, { key: "Tab" });
  expect(field.value).toBe("Rereading");

  // Both are still drawn: the eye and the keyboard walk the one list.
  expect(screen.getByText("Reading")).toBeTruthy();

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Reading list" },
  });
  await open("save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual(
    expect.objectContaining({ arguments: { channel: "22222" } }),
  );
});

/** An answer is one page of what a destination holds, and a group channel is not in it. */
test("keeps a channel the browse never mentioned exactly as it was typed", async () => {
  servingChannels([READING]);

  render(Templates);
  await open(/add a template/);
  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "67890" } });
  await fireEvent.blur(field);

  expect(field.value).toBe("67890");
});

/**
 * A channel is joined, not made: a pattern expanded into the field would name a
 * channel nobody has, so the vocabulary is not offered beside it.
 */
test("offers no patterns where every typed field may hold only what is offered", async () => {
  servingChannels([{ label: "reading", value: "reading" }]);

  render(Templates);
  await open(/add a template/);
  await screen.findByLabelText("channel");

  expect(screen.queryByText(/\{\{captured_at\}\}/)).toBeNull();
});

/** Under the place it is for, not under whatever switches follow it. */
test("says the patterns under the last field one can be written into", async () => {
  serving([], { kind: "fits" }, [aDestination()], [CREATE_WITH_SWITCHES]);

  render(Templates);
  await open(/add a template/);
  const place = await screen.findByLabelText("directory");
  const vocabulary = screen.getByText(/\{\{captured_at\}\}/);

  expect(
    place.compareDocumentPosition(vocabulary) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const frontmatter = screen.getByRole("button", { name: "full" });
  expect(
    vocabulary.compareDocumentPosition(frontmatter) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

/** What the destination's setting says is what an untouched argument comes out as. */
test("marks what an argument inherits, and offers what that makes meaningful", async () => {
  serving(
    [],
    { kind: "fits" },
    [aDestination({ settings: { root: "~/notes", frontmatter: "full" } })],
    [CREATE_WITH_SWITCHES],
  );

  render(Templates);
  await open(/add a template/);
  await screen.findByLabelText("directory");

  const full = await screen.findByRole("button", { name: /^full/ });
  expect(full.getAttribute("aria-pressed")).toBe("false");
  expect(full.textContent).toContain("▹");
  expect(full.textContent).toContain("(default)");
  expect(screen.getByText("trigger tags")).toBeTruthy();
});

/** A conditional argument is neither drawn nor saved while its condition does not hold. */
test("hides a conditional argument and saves nothing for it", async () => {
  serving([], { kind: "fits" }, [aDestination()], [CREATE_WITH_SWITCHES]);

  render(Templates);
  await open(/add a template/);
  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Research links" },
  });
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "research" },
  });

  expect(screen.queryByText("trigger tags")).toBeNull();
  const [hashtagsYes] = screen.getAllByRole("button", { name: /^yes/ });
  await fireEvent.click(hashtagsYes as HTMLElement);
  expect(await screen.findByText("trigger tags")).toBeTruthy();

  const [, triggerYes] = screen.getAllByRole("button", { name: /^yes/ });
  await fireEvent.click(triggerYes as HTMLElement);
  // Taking the taken option gives it back to inherit, and takes the switch with it.
  await fireEvent.click(hashtagsYes as HTMLElement);
  expect(screen.queryByText("trigger tags")).toBeNull();
  await open("save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual({
    name: "Research links",
    destination: VAULT,
    capability: "create",
    arguments: { directory: "research" },
    folder: "create",
  });
});

test("a destination that cannot be asked leaves the field typable", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "arena" })] });
    }
    if (route === "GET /v1/templates") return json(200, { values: [] });
    if (route.endsWith("/candidates")) {
      return json(200, { kind: "unreachable", detail: "ECONNREFUSED" });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [PUBLISH] });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  render(Templates);
  await open(/add a template/);

  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  await fireEvent.input(field, { target: { value: "reading" } });
  expect(field.value).toBe("reading");
});
