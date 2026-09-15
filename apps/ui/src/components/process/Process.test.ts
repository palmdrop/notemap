import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { tick } from "svelte";

import {
  anItem,
  asked as sentTo,
  json,
  routeOf,
} from "@notemap/client/testing";

import { keyboard, online } from "$testing/dom";
import { asked, client, pool, sent } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import { NO_PREVIEW_OFFERED } from "$lib/said";
import Process from "./Process.svelte";

keyboard();

vi.mock("$lib/client", () => import("$testing/pool"));

/** Leaving the surface needs a router, and there is none outside the app. */
const went = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock("$app/navigation", () => ({
  goto: (url: string) => void went.to.push(url),
}));
vi.mock("$app/paths", () => ({
  resolve: (path: string, params?: Record<string, string>) =>
    params === undefined
      ? path
      : Object.entries(params).reduce(
          (made, [key, value]) => made.replace(`[${key}]`, value),
          path,
        ),
}));
vi.mock("$app/state", () => ({
  page: {
    url: new URL("http://localhost/items/one/process"),
    route: { id: "/items/[id]/process" },
  },
}));

afterEach(() => {
  notices.clear();
  online(true);
  went.to = [];
});

/** Where the surface went when it was done: the queue, or the next item. */
const left = () => went.to.at(-1);

/**
 * The tag section is drawn collapsed until it holds something or is pressed,
 * so the `+` is behind its label on an item with no tags.
 */
async function addingTag() {
  const section = screen.getByRole("button", { name: "tags" });
  if (section.getAttribute("aria-expanded") !== "true") {
    await fireEvent.click(section);
  }
  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  return screen.getByRole("combobox", { name: "Add a tag" });
}

const WHEN = "2026-09-04T10:00:00.000Z";

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";
const BOARD = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a78";

const CREATE = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string" },
      filename: { type: "string" },
    },
  },
};

const CREATE_ASKABLE = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string", "x-notemap-candidates": true },
      filename: { type: "string" },
    },
  },
};

const CREATE_WITH_ENUM = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string" },
      frontmatter: { type: "string", enum: ["full", "none"] },
    },
  },
};

const CREATE_WITH_DEFAULT = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string", default: "inbox" },
      filename: { type: "string" },
    },
  },
};

const APPEND = { name: "append", accepts: ["text"] };

/** As the adapter declares it, titles and sentences and all. */
const CREATE_OR_APPEND = {
  name: "create-or-append",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        title: "place",
        description:
          "The note, relative to the vault's root. Ending in `/` names a folder, and the filename is derived.",
        "x-notemap-candidates": true,
      },
      heading: {
        type: "string",
        title: "under",
        description: "The heading to append under.",
      },
    },
  },
};

function aDestination(overrides: Record<string, unknown> = {}) {
  return {
    id: VAULT,
    name: "Vault",
    kind: "filesystem",
    settings: {},
    retired: false,
    ...overrides,
  };
}

function serving(
  held: readonly Record<string, unknown>[],
  description: Record<string, unknown> = {
    kind: "described",
    capabilities: [CREATE],
  },
  preview: Record<string, unknown> = {
    kind: "previewed",
    content: {
      mediaType: "text/markdown",
      text: "# a thought\n",
      truncated: false,
    },
  },
  templates: readonly Record<string, unknown>[] = [],
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") return json(200, { values: held });
    if (route === "GET /v1/templates") {
      return json(200, { values: templates });
    }
    if (route.endsWith("/description")) return json(200, description);
    if (route === "POST /v1/items/one/route/preview") {
      return json(200, preview);
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        state: "delivered",
        target: {},
      });
    }
    if (route === "POST /v1/items/one/mark-processed") {
      return json(200, {
        id: "rec",
        item: "one",
        at: WHEN,
        state: "delivered",
        target: { kind: "user" },
      });
    }
    if (route === "POST /v1/items/one/archive") {
      return json(200, anItem("one", { archived: { archivedAt: WHEN } }));
    }
    if (route === "POST /v1/items/one/unarchive") {
      return json(200, anItem("one"));
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

/**
 * A destination whose `create` capability's `directory` can be browsed.
 * The kind is one nothing registers a control for, so this draws the
 * schema-driven browser; the kinds that hold a filesystem draw the typed line
 * and are exercised in `PathLine.test.ts`.
 */
function servingBrowsable(
  answerAt: (scope: string | undefined) => Record<string, unknown>,
  kind = "kanban",
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind })] });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [CREATE_ASKABLE],
      });
    }
    if (route.endsWith("/candidates")) {
      const scope = new URL(request.url).searchParams.get("scope") ?? undefined;
      return json(200, answerAt(scope));
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        state: "delivered",
        target: {},
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

/** A capture with words in it, which is what a subject and a copy are read from. */
function aCapture(overrides: Record<string, unknown> = {}) {
  return anItem("one", {
    payload: {
      type: "text",
      content: { text: "a note" },
      metadata: {},
      assets: [],
    },
    ...overrides,
  });
}

function draw(item = aCapture()) {
  return render(Process, { props: { item } });
}

const choose = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

/**
 * A row in a browse, taken the way the typed line's tree is taken: `mousedown`
 * on the text, the rows being options rather than buttons so that `↑↓` can walk
 * them without moving focus off the line.
 */
const entry = async (text: string) =>
  fireEvent.mouseDown(await screen.findByText(text));

/** That the destination was taken and described: its one capability's fields are drawn. */
const described = async () => screen.findByLabelText("directory");

/**
 * `route`, once there is a decision to send. A kind declaring one capability
 * has it settled a tick after its description lands, so the commit is briefly
 * disabled where nothing is clicked in between.
 */
/**
 * Routing keeps the surface: the decision is cleared for a second place, and
 * `next →` is what moves on.
 */
const stayed = async () => {
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
  expect(left()).toBeUndefined();
  expect(
    await screen.findByRole("combobox", { name: "what became of it" }),
  ).toBeDefined();
};

const commit = async () => {
  const button = (await screen.findByRole("button", {
    name: "route",
  })) as HTMLButtonElement;
  await vi.waitFor(() => {
    expect(button.disabled).toBe(false);
  });
  return fireEvent.click(button);
};

const RESEARCH = {
  id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a80",
  name: "research",
  destination: VAULT,
  capability: "create",
  arguments: { directory: "research/{{captured_at}}" },
  folder: "create",
  triggerTag: "route/research",
};

/** Answers the resolve every taken template asks for, and the route it commits with. */
function servingTemplates(
  templates: readonly Record<string, unknown>[] = [RESEARCH],
  resolved: Record<string, unknown> = {
    destination: VAULT,
    capability: "create",
    arguments: { directory: "research/2026-09-04" },
  },
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route === "GET /v1/templates") return json(200, { values: templates });
    if (route === "GET /v1/items/one/route/resolve") {
      return json(200, resolved);
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE] });
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        state: "delivered",
        target: {},
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

test("takes a template, draws what it resolved to, and leaves it editable", async () => {
  servingTemplates();

  draw();
  await choose("research");

  const directory = (await screen.findByLabelText(
    "directory",
  )) as HTMLInputElement;
  expect(directory.value).toBe("research/2026-09-04");
  expect(
    screen.getByText("research", { selector: ".font-semibold" }),
  ).toBeTruthy();

  await fireEvent.input(directory, { target: { value: "reading/2026" } });
  expect(directory.value).toBe("reading/2026");
});

/**
 * The line settles `create-or-append` for a kind that draws it — but a template
 * has already settled one, and overwriting it made the commit read as a
 * decision of the person's own: the record would not name the template, and an
 * `establish` template would never learn its folder was there.
 */
test("keeps the capability a template resolved to, over the one the line settles", async () => {
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route === "GET /v1/templates") return json(200, { values: [RESEARCH] });
    if (route === "GET /v1/items/one/route/resolve") {
      return json(200, {
        destination: VAULT,
        capability: "create",
        arguments: { directory: "research/2026-09-04" },
      });
    }
    if (route.endsWith("/description")) {
      // Declares the line's capability too, which is what used to win.
      return json(200, {
        kind: "described",
        capabilities: [CREATE_OR_APPEND, CREATE],
      });
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        state: "delivered",
        target: {},
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  draw();
  await choose("research");

  // `create`'s form, not the line: the template said what it meant.
  const directory = (await screen.findByLabelText(
    "directory",
  )) as HTMLInputElement;
  expect(directory.value).toBe("research/2026-09-04");
  expect(screen.queryByRole("combobox", { name: "place" })).toBeNull();

  await commit();

  // Untouched, so it commits *as* the template — which is what makes the
  // record name it, and an `establish` template learn its folder is there.
  await vi.waitFor(async () => {
    const sentBody = await sentTo(transport)
      .find((each) => routeOf(each) === "POST /v1/items/one/route")
      ?.clone()
      .json();
    expect(sentBody).toEqual({ template: RESEARCH.id });
  });
});

test("commits an untouched template as the template, so the record names it", async () => {
  servingTemplates();

  draw();
  await choose("research");
  await screen.findByLabelText("directory");
  await commit();

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
  expect(await sent()).toContainEqual({ template: RESEARCH.id });
});

test("commits a corrected one as the decision it became", async () => {
  servingTemplates();

  draw();
  await choose("research");
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "reading/2026" },
  });
  await commit();

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
  expect(await sent()).toContainEqual({
    destination: VAULT,
    capability: "create",
    arguments: { directory: "reading/2026" },
  });
});

/**
 * However a template was reached, the item ends up carrying its tag: the
 * classification is the same, and the record the route just made is what stops
 * the tag filing a second copy.
 */
test("puts a template's trigger tag on the item it routed", async () => {
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route === "GET /v1/templates") return json(200, { values: [RESEARCH] });
    if (route === "GET /v1/items/one/route/resolve") {
      return json(200, {
        destination: VAULT,
        capability: "create",
        arguments: { directory: "research/2026-09-04" },
      });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE] });
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        at: WHEN,
        state: "delivered",
        target: {},
        applied: { template: RESEARCH.id, firedByTag: false },
      });
    }
    if (route === "POST /v1/items/one/tag") return json(200, aCapture());
    return json(404, { error: { code: "unknown-route" } });
  });

  draw();
  await choose("research");
  await screen.findByLabelText("directory");
  await commit();

  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain("POST /v1/items/one/tag");
  });
  expect(await sent()).toContainEqual({ tag: RESEARCH.triggerTag });
});

/** Corrected, the decision is the person's own, and their tags are their own too. */
test("leaves a corrected template's tag off the item", async () => {
  const transport = servingTemplates();

  draw();
  await choose("research");
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "reading/2026" },
  });
  await commit();

  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain(
      "POST /v1/items/one/route",
    );
  });
  expect(sentTo(transport).map(routeOf)).not.toContain(
    "POST /v1/items/one/tag",
  );
});

const LINED_RESEARCH = {
  id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a81",
  name: "research",
  destination: VAULT,
  capability: "create-or-append",
  arguments: { path: "research/{{captured_at}}.md" },
  triggerTag: "route/research",
};

/** A template whose destination draws the typed line, for the read-only place. */
function servingLinedTemplate(
  templates: readonly Record<string, unknown>[] = [LINED_RESEARCH],
  resolved: Record<string, unknown> = {
    destination: VAULT,
    capability: "create-or-append",
    arguments: { path: "research/2026-09-04.md" },
  },
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "filesystem" })] });
    }
    if (route === "GET /v1/templates") return json(200, { values: templates });
    if (route === "GET /v1/items/one/route/resolve") {
      return json(200, resolved);
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE_OR_APPEND] });
    }
    if (route.endsWith("/candidates")) return json(200, answered([]));
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        state: "delivered",
        target: {},
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

/**
 * A template whose destination draws the typed line: taking it resolves the
 * place, and the line stays behind `edit` rather than open for typing — a
 * template is a decision somebody already made.
 */
test("a lined template draws its place read-only, with edit to reopen the line", async () => {
  servingLinedTemplate();

  draw();
  await choose("research");

  // The read-only summary, not the line: its own `edit` is what says so.
  await screen.findByRole("button", { name: "edit place" });
  expect(screen.getByText("research/2026-09-04.md")).toBeDefined();
  expect(screen.queryByRole("combobox", { name: "place" })).toBeNull();

  await fireEvent.click(screen.getByRole("button", { name: "edit place" }));

  const line = (await screen.findByRole("combobox", {
    name: "place",
  })) as HTMLInputElement;
  expect(line.value).toBe("research/2026-09-04.md");
});

/** Opening the line and touching nothing is not a correction. */
test("a lined template edited and left alone still commits as the template", async () => {
  servingLinedTemplate();

  draw();
  await choose("research");
  await fireEvent.click(
    await screen.findByRole("button", { name: "edit place" }),
  );
  await screen.findByRole("combobox", { name: "place" });
  await commit();

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
  expect(await sent()).toContainEqual({ template: LINED_RESEARCH.id });
});

/** Taking a destination directly still draws the line at once: only a template starts read-only. */
test("choosing a destination directly draws the line, not the read-only summary", async () => {
  servingLinedTemplate();

  draw();
  await choose(/Vault/);

  expect(await screen.findByRole("combobox", { name: "place" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "edit place" })).toBeNull();
});

/** `change`, behind the template's own line, gives the decision back, including the place. */
test("changing the destination after a lined template gives the line back", async () => {
  servingLinedTemplate();

  draw();
  await choose("research");
  await screen.findByText("research/2026-09-04.md");

  await fireEvent.click(screen.getByRole("button", { name: "change" }));
  await choose(/Vault/);

  expect(await screen.findByRole("combobox", { name: "place" })).toBeDefined();
});

/**
 * The tag files it, so the decision this surface was for is made: staying is
 * offering to route an item that is already on its way somewhere.
 */
test("advances on a trigger tag taken in its own row", async () => {
  servingTemplates();

  draw();
  await choose(/Vault/);
  await described();

  await addingTag();
  await fireEvent.mouseDown(
    await screen.findByRole("option", { name: /route\/research/ }),
  );

  await vi.waitFor(() => {
    expect(left()).toBe("/");
  });
});

/**
 * The row draws the client's held copy rather than the item the composer
 * opened on, so a tag taken here is drawn taken at once — and taken off again
 * by pressing it.
 */
test("draws a tag taken in its own row as taken, at once", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/items/one") return json(200, aCapture());
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route === "POST /v1/items/one/tag") return json(200, aCapture());
    return json(200, { values: [] });
  });
  await client.item("one");

  draw();
  await screen.findByText("tags");

  const line = await addingTag();
  await fireEvent.input(line, { target: { value: "seedling" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  const word = await screen.findByRole("button", { name: "seedling" });
  expect(word.getAttribute("aria-pressed")).toBe("true");

  await fireEvent.click(word);
  await fireEvent.click(
    screen.getByRole("button", { name: "remove seedling" }),
  );
  await vi.waitFor(() => {
    expect(screen.queryByRole("button", { name: "seedling" })).toBeNull();
  });
});

test("draws a stranded template with its reason rather than removing it", async () => {
  servingTemplates([{ ...RESEARCH, destination: BOARD }]);

  draw();

  const option = await screen.findByRole("button", { name: /research/ });
  expect(option.textContent).toContain("its destination was deleted");
});

/** The list is pool state; what one can do is I/O, and only the chosen one pays for it. */
test("describes the destination that was chosen and no other", async () => {
  serving([aDestination(), aDestination({ id: BOARD, name: "Board" })]);

  draw();
  await screen.findByRole("button", { name: /Vault/ });
  expect(asked().filter((each) => each.endsWith("/description"))).toEqual([]);

  await choose(/Vault/);
  await screen.findByLabelText("directory");

  expect(asked().filter((each) => each.endsWith("/description"))).toEqual([
    `GET /v1/destinations/${VAULT}/description`,
  ]);
});

test("composes a decision one step at a time and sends it", async () => {
  serving([aDestination()]);

  draw();
  await choose(/Vault/);

  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });
  await commit();

  await stayed();
});

/** One capability that asks for nothing: taking the destination is the whole decision. */
test("a capability that asks for nothing is one choice away from routed", async () => {
  serving([aDestination()], { kind: "described", capabilities: [APPEND] });

  draw();
  await choose(/Vault/);

  const commit = screen.getByRole("button", { name: "route" });
  await vi.waitFor(() => {
    expect((commit as HTMLButtonElement).disabled).toBe(false);
  });

  await fireEvent.click(commit);
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
});

test("an unavailable destination stays in the list, says why, and is not routable", async () => {
  serving([aDestination()], {
    kind: "unusable",
    detail: "nothing here speaks the kanban kind",
  });

  draw();
  await choose(/Vault/);

  await screen.findByText(/nothing here speaks the kanban kind/);
  expect(
    (screen.getByRole("button", { name: /Vault/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "route" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("a retired destination stays in the list and is not offered for new routing", async () => {
  serving([
    aDestination({ retired: true }),
    aDestination({ id: BOARD, name: "Board" }),
  ]);

  draw();

  const retired = await screen.findByRole("button", { name: /Vault/ });
  expect((retired as HTMLButtonElement).disabled).toBe(true);
  expect(retired.textContent).toContain("retired");
  expect(
    (screen.getByRole("button", { name: /Board/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

test("draws the capture in the head", async () => {
  serving([aDestination()]);

  draw();

  expect(await screen.findByText("a note")).toBeDefined();
});

test("browses a field that can be asked about, and takes the scope stood in", async () => {
  servingBrowsable((scope) =>
    scope === undefined
      ? {
          kind: "answered",
          entries: [{ label: "inbox", value: "inbox", scope: "inbox" }],
          truncated: false,
        }
      : {
          kind: "answered",
          entries: [{ label: "drafts", value: `${scope}/drafts` }],
          truncated: false,
        },
  );

  draw();
  await choose(/Vault/);

  await entry("inbox/");
  await choose(/use inbox/);

  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "inbox",
  );
});

test("a refusal to browse is not an alarm, and typing still works beside it", async () => {
  servingBrowsable(() => ({
    kind: "unreachable",
    detail: "the vault is not mounted",
  }));

  draw();
  await choose(/Vault/);

  await screen.findByText(/the vault is not mounted/);
  expect(screen.queryByRole("alert")).toBeNull();

  await fireEvent.input(screen.getByLabelText("directory"), {
    target: { value: "inbox" },
  });
  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "inbox",
  );
});

test("a typed value that was never listed still routes", async () => {
  const transport = servingBrowsable(() => ({
    kind: "answered",
    entries: [],
    truncated: false,
  }));

  draw();
  await choose(/Vault/);

  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "brand-new-folder" },
  });
  await commit();

  await stayed();

  const routed = sentTo(transport).find(
    (request) => routeOf(request) === "POST /v1/items/one/route",
  );
  const body = (await routed?.clone().json()) as {
    arguments: Record<string, unknown>;
  };
  expect(body.arguments).toEqual({ directory: "brand-new-folder" });
});

test("an unregistered kind gets the schema-driven control", async () => {
  servingBrowsable(() => ({
    kind: "answered",
    entries: [{ label: "inbox", value: "inbox" }],
    truncated: false,
  }));

  draw();
  await choose(/Vault/);

  // Both controls are a combobox now, so what tells them apart is the list:
  // the line draws a hierarchy it calls `places`, this draws the field's own.
  expect(
    await screen.findByRole("listbox", { name: "directory candidates" }),
  ).toBeDefined();
  expect(screen.queryByRole("listbox", { name: "places" })).toBeNull();
  expect(await screen.findByText("inbox")).toBeDefined();
});

/** The seam decides on the kind alone, and a filesystem-shaped one draws the line. */
test("a kind that holds a filesystem gets the typed line instead", async () => {
  servingBrowsable(
    () => ({
      kind: "answered",
      entries: [{ label: "inbox", value: "inbox" }],
      truncated: false,
    }),
    "filesystem",
  );

  draw();
  await choose(/Vault/);

  expect(await screen.findByRole("listbox", { name: "places" })).toBeDefined();
  expect(
    screen.queryByRole("listbox", { name: "directory candidates" }),
  ).toBeNull();
});

const answered = (entries: readonly Record<string, unknown>[]) => ({
  kind: "answered",
  entries,
  truncated: false,
});

test("walks through an entry that is only somewhere to look, and takes the one past it", async () => {
  servingBrowsable((scope) =>
    scope === undefined
      ? answered([{ label: "projects", scope: "projects" }])
      : answered([{ label: "fiction.md", value: "projects/fiction.md" }]),
  );

  draw();
  await choose(/Vault/);

  await entry("projects/");
  await screen.findByText("fiction.md");

  // A scope the field may not hold is not offered as something to take.
  expect(screen.queryByRole("button", { name: /^use / })).toBeNull();
  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "",
  );

  await entry("fiction.md");
  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "projects/fiction.md",
  );
});

test("empties a field browsed to and then left, from the top and only there", async () => {
  servingBrowsable((scope) =>
    scope === undefined
      ? answered([{ label: "inbox", value: "inbox", scope: "inbox" }])
      : answered([]),
  );

  draw();
  await choose(/Vault/);
  await screen.findByText("inbox/");

  expect(screen.queryByRole("button", { name: "clear" })).toBeNull();

  await entry("inbox/");
  await choose(/use inbox/);
  await choose("back");
  await choose("clear");

  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "",
  );
});

test("draws two entries that share a label", async () => {
  servingBrowsable(() =>
    answered([
      { label: "notes", value: "a/notes", scope: "a/notes" },
      { label: "notes", value: "b/notes", scope: "b/notes" },
    ]),
  );

  draw();
  await choose(/Vault/);

  expect(await screen.findAllByText("notes/")).toHaveLength(2);
});

test("drops an answer for a scope it has already left", async () => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  pool(async (request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "kanban" })] });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [CREATE_ASKABLE],
      });
    }
    if (route.endsWith("/candidates")) {
      if (new URL(request.url).searchParams.get("scope") === null) {
        return json(
          200,
          answered([{ label: "inbox", value: "inbox", scope: "inbox" }]),
        );
      }
      await held;
      return json(200, answered([{ label: "buried", value: "inbox/buried" }]));
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  draw();
  await choose(/Vault/);

  // Descend into an answer that hangs, then leave before it lands.
  await entry("inbox/");
  await choose("back");
  await screen.findByText("inbox/");

  release();
  await held;
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(screen.queryByText("buried")).toBeNull();
  expect(screen.getByText("inbox/")).toBeDefined();
});

/** A filesystem vault holding one note, so the line has something to forecast against. */
function servingVault(entries: readonly Record<string, unknown>[]) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "filesystem" })] });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [CREATE_OR_APPEND],
      });
    }
    if (route.endsWith("/candidates")) {
      const scope = new URL(request.url).searchParams.get("scope");
      return json(200, scope === null ? answered(entries) : answered([]));
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        state: "delivered",
        target: {},
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

/** A destination whose route answers whatever the delivery did. */
function routing(
  record: Record<string, unknown>,
  queued: readonly Record<string, unknown>[] = [],
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [APPEND] });
    }
    if (route === "POST /v1/items/one/route") return json(200, record);
    if (route === "POST /v1/items/one/mark-processed") {
      return json(200, {
        id: "rec",
        item: "one",
        at: WHEN,
        state: "delivered",
        target: { kind: "user" },
      });
    }
    if (route === "GET /v1/queue") return json(200, { values: queued });
    return json(404, { error: { code: "unknown-route" } });
  });
}

function drawAbout(content: Record<string, unknown>) {
  render(Process, {
    props: {
      item: aCapture({
        payload: { type: "text", content, metadata: {}, assets: [] },
      }),
    },
  });
}

const routed = async (transport: ReturnType<typeof pool>) => {
  const sent = sentTo(transport).find(
    (request) => routeOf(request) === "POST /v1/items/one/route",
  );
  return (await sent?.clone().json()) as {
    capability: string;
    arguments: Record<string, unknown>;
  };
};

test("stores what the person meant, not the word that was drawn", async () => {
  const transport = servingVault([
    { label: "decisions.md", value: "decisions.md" },
  ]);

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox");
  await fireEvent.input(line, { target: { value: "decisions.md" } });
  await screen.findByText("append");
  await commit();

  await vi.waitFor(async () => {
    expect(await routed(transport)).toMatchObject({
      capability: "create-or-append",
      arguments: { path: "decisions.md" },
    });
  });
});

/**
 * A `+` says the delivery will make this, and appending makes nothing: drawn
 * under the note it is going into, it reads as a second note beside it.
 */
test("draws no + where the line lands on a note that is there", async () => {
  servingVault([{ label: "decisions.md", value: "decisions.md" }]);

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox");
  await fireEvent.input(line, { target: { value: "decisions.md" } });
  await screen.findByText("append");

  expect(screen.queryByText("+ decisions.md")).toBeNull();
  // The note's own row instead, marked as the one the line holds.
  const row = screen.getByRole("option", { name: "decisions.md" });
  expect(row.className).toContain("underline");
  expect(row.getAttribute("aria-disabled")).toBeNull();
});

test("still draws a + for a note that is not there", async () => {
  servingVault([{ label: "decisions.md", value: "decisions.md" }]);

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox");
  await fireEvent.input(line, { target: { value: "thoughts.md" } });
  await screen.findByText("create");

  expect(screen.getByText("+ thoughts.md")).toBeDefined();
});

/** The one capability that promises never to write into somebody's note. */
test("shift-enter stores create under the free name it offered", async () => {
  const transport = servingVault([
    { label: "decisions.md", value: "notes/decisions.md" },
  ]);

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox");
  await fireEvent.input(line, { target: { value: "decisions.md" } });
  await screen.findByText("append");
  await fireEvent.keyDown(line, { key: "Enter", shiftKey: true });

  await vi.waitFor(async () => {
    expect(await routed(transport)).toMatchObject({
      capability: "create",
      arguments: { directory: "", filename: "decisions-1.md" },
    });
  });
});

/** Typed from memory before this: the values are the field, so they are offered. */
test("chooses an argument the schema fixes rather than typing it", async () => {
  const transport = await pickingFrontmatter(["full"]);

  await vi.waitFor(async () => {
    expect((await routed(transport)).arguments).toEqual({
      directory: "inbox",
      frontmatter: "full",
    });
  });
});

/** Absent is a value here — it inherits — so there has to be a way back to it. */
test("gives an argument back where the one taken is taken again", async () => {
  const transport = await pickingFrontmatter(["full", "full"]);

  await vi.waitFor(async () => {
    expect((await routed(transport)).arguments).toEqual({ directory: "inbox" });
  });
});

async function pickingFrontmatter(taken: readonly string[]) {
  const transport = serving([aDestination()], {
    kind: "described",
    capabilities: [CREATE_WITH_ENUM],
  });

  draw();
  await choose(/Vault/);

  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });
  for (const one of taken) await choose(one);
  await commit();

  return transport;
}

test("a blank leaf submits a path that ends in a slash", async () => {
  const transport = servingVault([]);

  drawAbout({ text: "Picker needs a trail" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox");
  await fireEvent.input(line, { target: { value: "drafts/" } });
  // In the tree, where the note is about to land, and nowhere else.
  expect(await screen.findAllByText(/Picker needs a trail\.md/)).toHaveLength(
    1,
  );
  await commit();

  await vi.waitFor(async () => {
    expect((await routed(transport)).arguments).toEqual({ path: "drafts/" });
  });
});

/**
 * Two decisions, made together and drained apart. The person classified the
 * item and that was true; the route failing is not a reason to un-say it.
 */
test("a tag taken in the composer stays applied when the route fails", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "filesystem" })] });
    }
    if (route === "GET /v1/tags") {
      return json(200, { values: [{ name: "seedling", items: 3 }] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE_OR_APPEND] });
    }
    if (route.endsWith("/candidates")) return json(200, answered([]));
    if (route === "GET /v1/items/one") return json(200, aCapture());
    if (route === "POST /v1/items/one/tag") {
      return json(
        200,
        aCapture({ tags: [{ name: "seedling", addedAt: WHEN }] }),
      );
    }
    if (route === "POST /v1/items/one/route") {
      return json(503, { error: { code: "unreachable" } });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
  await client.tags.load();
  // The row draws the client's held copy, so the item is held before it opens.
  await client.item("one");

  drawAbout({ text: "a thought" });
  await choose(/Vault/);
  await screen.findByRole("combobox", { name: "place" });

  await addingTag();
  await fireEvent.mouseDown(
    await screen.findByRole("option", { name: "seedling" }),
  );
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });

  await commit();
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });

  expect(left()).toBeUndefined();
  expect(
    screen
      .getByRole("button", { name: "seedling" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

const typing = () =>
  screen.getByRole("combobox", { name: "what became of it" });

test("takes a destination by typing enough of its name", async () => {
  serving([aDestination(), aDestination({ id: BOARD, name: "Board" })]);

  draw();
  await screen.findByRole("button", { name: /Vault/ });

  await fireEvent.input(typing(), { target: { value: "vau" } });
  await fireEvent.keyDown(typing(), { key: "Enter" });

  await described();
  expect(asked()).toContain(`GET /v1/destinations/${VAULT}/description`);
});

/** Taking one of several would be a guess, and the line does not guess. */
test("an ambiguous prefix takes nothing", async () => {
  serving([
    aDestination({ name: "Vault one" }),
    aDestination({ id: BOARD, name: "Vault two" }),
  ]);

  draw();
  await screen.findByRole("button", { name: /Vault one/ });

  await fireEvent.input(typing(), { target: { value: "vault" } });
  await fireEvent.keyDown(typing(), { key: "Enter" });

  // Both still drawn, neither bold: nothing was narrowed to.
  expect(
    screen.getByRole("button", { name: "Vault one" }).className,
  ).not.toContain("font-semibold");
  expect(screen.getByRole("button", { name: "Vault two" })).toBeDefined();
  expect(asked()).not.toContain(`GET /v1/destinations/${VAULT}/description`);
});

/** It never becomes a segment of anything, so a space in it needs no rule. */
test("completes a name with a space in it", async () => {
  serving([aDestination({ name: "obsidian vault" })]);

  draw();
  await screen.findByRole("button", { name: /obsidian vault/ });

  await fireEvent.input(typing(), { target: { value: "obsidian v" } });
  await fireEvent.keyDown(typing(), { key: "Tab" });

  await described();
});

test("the destination leaves the line and reads settled in its section", async () => {
  serving([aDestination()]);

  draw();
  await choose(/Vault/);
  await described();

  expect(
    screen.getByText("Vault", { selector: ".font-semibold" }),
  ).toBeDefined();
  expect(
    screen.queryByRole("combobox", { name: "what became of it" }),
  ).toBeNull();

  // The way back, since `esc` leaves the surface rather than the decision.
  await fireEvent.click(screen.getByRole("button", { name: "change" }));
  expect(
    screen.getByRole("combobox", { name: "what became of it" }),
  ).toBeDefined();
});

test("backspacing out of an empty line gives the destination back", async () => {
  servingVault([]);

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox", { name: "place" });
  await fireEvent.keyDown(line, { key: "Backspace" });

  await vi.waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: "what became of it" }),
    ).toBeDefined();
  });
  expect(screen.queryByRole("button", { name: "change" })).toBeNull();
});

/** Present and unavailable is not the same as unreachable, and it stays visible. */
test("an unusable destination is not takeable by typing either", async () => {
  serving([aDestination()], {
    kind: "unusable",
    detail: "nothing here speaks the kanban kind",
  });

  draw();
  await choose(/Vault/);
  await screen.findByText(/nothing here speaks the kanban kind/);

  await fireEvent.input(typing(), { target: { value: "vau" } });
  await fireEvent.keyDown(typing(), { key: "Enter" });

  expect(screen.queryByLabelText("directory")).toBeNull();
  expect(screen.getByRole("button", { name: /Vault/ })).toBeDefined();
});

test("the list still works, typing being an accelerator and not a replacement", async () => {
  serving([aDestination()]);

  draw();
  await choose(/Vault/);

  expect(await screen.findByLabelText("directory")).toBeDefined();
});

/**
 * The property deferred delivery rests on: a vault that is asleep must still be
 * routable, with the record made and the delivery deferred. Phase 1 is what
 * makes it honest — there is nothing to infer and nothing that needs inferring.
 */
test("an unreachable destination is still routable", async () => {
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "filesystem" })] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE_OR_APPEND] });
    }
    if (route.endsWith("/remembered")) {
      return json(200, { truncated: false, places: [] });
    }
    if (route.endsWith("/candidates")) {
      return json(200, {
        kind: "unreachable",
        detail: "the vault is not mounted",
      });
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, { id: "r", item: "one", state: "pending", target: {} });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox", { name: "place" });
  await fireEvent.input(line, { target: { value: "notes/decisions.md" } });
  await screen.findByText("unreachable · best effort");

  const commit = screen.getByRole("button", { name: "route" });
  expect((commit as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("alert")).toBeNull();

  await fireEvent.click(commit);
  await stayed();

  expect(await routed(transport)).toMatchObject({
    capability: "create-or-append",
    arguments: { path: "notes/decisions.md" },
  });
});

/** `browserFor` decides on the kind alone, so this one keeps Group/Option. */
test("a kind with no filesystem in it draws neither line nor tree", async () => {
  servingBrowsable(() => ({
    kind: "answered",
    entries: [{ label: "inbox", value: "inbox", scope: "inbox" }],
    truncated: false,
  }));

  draw();
  await choose(/Vault/);

  expect(await screen.findByText("inbox/")).toBeDefined();
  expect(screen.queryByRole("listbox", { name: "places" })).toBeNull();
});

/** The line says what will happen, so choosing it is not a step anybody takes. */
test("the kind that draws the line settles what to do, with no do step", async () => {
  servingVault([]);

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  expect(await screen.findByRole("combobox", { name: "place" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "create-or-append" })).toBeNull();
});

/** One thing it can do is not a choice, so it is not one anybody is asked to make. */
test("a kind that can do one thing settles it, with no do step", async () => {
  servingBrowsable(() => ({
    kind: "answered",
    entries: [{ label: "inbox", value: "inbox" }],
    truncated: false,
  }));

  draw();
  await choose(/Vault/);

  expect(await screen.findByLabelText("directory")).toBeDefined();
  expect(screen.queryByRole("button", { name: "create" })).toBeNull();
});

/**
 * The browse behaves the way the typed line does, which is the whole point of
 * it: one field, the answer under it, narrowed as it is typed into, `⇥` to
 * finish a name and `↑↓⏎` to take one. What differs is that there are no
 * segments — the whole field is the filter.
 */
const CHANNELS = [
  { label: "Reading", value: "reading" },
  { label: "Reading Notes", value: "reading-notes" },
  { label: "Reading Room", value: "reading-room" },
  { label: "Field Recordings", value: "field-recordings" },
];

async function browsingChannels() {
  servingBrowsable(() => answered(CHANNELS));
  draw();
  await choose(/Vault/);
  return (await screen.findByLabelText("directory")) as HTMLInputElement;
}

test("draws what the destination offers under the field", async () => {
  await browsingChannels();

  expect(await screen.findByText("Reading")).toBeDefined();
  expect(screen.getByText("Field Recordings")).toBeDefined();
});

test("narrows what is drawn to what is typed", async () => {
  const field = await browsingChannels();
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "read" } });

  expect(screen.getByText("Reading")).toBeDefined();
  expect(screen.getByText("Reading Notes")).toBeDefined();
  expect(screen.queryByText("Field Recordings")).toBeNull();
});

/** A title is what a person types; a slug is what the field is sent with. */
test("completes a title typed to the value the field holds", async () => {
  const field = await browsingChannels();
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "Field" } });
  await fireEvent.keyDown(field, { key: "Tab" });

  expect(field.value).toBe("field-recordings");
  // Still matched, so the one it resolved to stays under the field.
  expect(screen.getByText("Field Recordings")).toBeDefined();
});

/** As far as the two slugs agree, in the spelling the field will be sent with. */
test("completes only as far as several agree", async () => {
  const field = await browsingChannels();
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "Readi" } });
  await fireEvent.keyDown(field, { key: "Tab" });

  expect(field.value).toBe("reading");
});

/**
 * `⇥` on a prefix several answers share leaves what they agree on and no more,
 * so the next press is what walks them: pressing it four times is what a person
 * does about a name that shares its first letters with four others.
 */
test("walks what still matches on a second ⇥", async () => {
  const field = await browsingChannels();
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "read" } });
  await fireEvent.keyDown(field, { key: "Tab" });
  expect(field.value).toBe("reading");

  await fireEvent.keyDown(field, { key: "Tab" });
  expect(field.value).toBe("reading-notes");

  // Every one of them, not the first two over and over: completing again here
  // would put the shared prefix back and the third would be out of reach.
  await fireEvent.keyDown(field, { key: "Tab" });
  expect(field.value).toBe("reading-room");

  // Round again: three matched what was typed, and none is more the answer
  // than the others.
  await fireEvent.keyDown(field, { key: "Tab" });
  expect(field.value).toBe("reading");
});

/** The walk is against what was typed; the field is where its answers are put. */
test("keeps walking after typing again", async () => {
  const field = await browsingChannels();
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "read" } });
  await fireEvent.keyDown(field, { key: "Tab" });
  await fireEvent.keyDown(field, { key: "Tab" });
  expect(field.value).toBe("reading-notes");

  await fireEvent.input(field, { target: { value: "field" } });
  await fireEvent.keyDown(field, { key: "Tab" });

  expect(field.value).toBe("field-recordings");
});

test("walks the narrowed list and takes the one it landed on", async () => {
  const field = await browsingChannels();
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "read" } });
  await fireEvent.keyDown(field, { key: "ArrowDown" });
  await fireEvent.keyDown(field, { key: "ArrowDown" });
  await fireEvent.keyDown(field, { key: "Enter" });

  expect(field.value).toBe("reading-notes");
});

/** Left alone, `⏎` means route: walking is what makes it mean *take this one*. */
test("commits where the walk has not moved", async () => {
  const transport = servingBrowsable(() => answered(CHANNELS));
  draw();
  await choose(/Vault/);

  const field = (await screen.findByLabelText("directory")) as HTMLInputElement;
  await fireEvent.input(field, { target: { value: "reading" } });
  await fireEvent.keyDown(field, { key: "Enter" });

  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain(
      "POST /v1/items/one/route",
    );
  });
});

/**
 * An account of two hundred channels is a wall of names nobody reads, so the
 * list starts as a sample and the field above is the way through it.
 */
test("draws a handful of a long answer, and the rest when asked", async () => {
  const many = Array.from({ length: 20 }, (_, index) => ({
    label: `channel ${index}`,
    value: `channel-${index}`,
  }));
  servingBrowsable(() => answered(many));
  draw();
  await choose(/Vault/);

  await screen.findByText("channel 0");
  expect(screen.getByText("channel 7")).toBeDefined();
  expect(screen.queryByText("channel 8")).toBeNull();

  await choose("12 more");

  expect(await screen.findByText("channel 19")).toBeDefined();
});

test("narrowing gets there without asking for the rest", async () => {
  const many = Array.from({ length: 20 }, (_, index) => ({
    label: `channel ${index}`,
    value: `channel-${index}`,
  }));
  servingBrowsable(() => answered(many));
  draw();
  await choose(/Vault/);
  const field = (await screen.findByLabelText("directory")) as HTMLInputElement;
  await screen.findByText("channel 0");

  await fireEvent.input(field, { target: { value: "channel 19" } });

  expect(await screen.findByText("channel 19")).toBeDefined();
  expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
});

/** The walk reaches what is drawn and no further: a row the eye cannot see is nowhere to go. */
test("walks only what is drawn", async () => {
  const many = Array.from({ length: 20 }, (_, index) => ({
    label: `channel ${index}`,
    value: `channel-${index}`,
  }));
  servingBrowsable(() => answered(many));
  draw();
  await choose(/Vault/);
  const field = (await screen.findByLabelText("directory")) as HTMLInputElement;
  await screen.findByText("channel 0");

  await fireEvent.keyDown(field, { key: "ArrowUp" });
  await fireEvent.keyDown(field, { key: "Enter" });

  expect(field.value).toBe("channel-7");
});

/**
 * The ask still goes out; what the cache buys is that the wait is filled with
 * the answer from last time rather than with `loading…`.
 */
test("draws what it was told last time while it asks again", async () => {
  let held = (): void => {};
  const waiting = new Promise<void>((resolve) => {
    held = resolve;
  });
  let asks = 0;

  pool(async (request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "kanban" })] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE_ASKABLE] });
    }
    if (route.endsWith("/candidates")) {
      asks += 1;
      if (asks > 1) await waiting;
      return json(200, answered([{ label: "inbox", value: "inbox" }]));
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  const first = draw();
  await choose(/Vault/);
  await screen.findByText("inbox");
  cleanup();
  void first;

  // Second time round the answer never arrives, and the list is drawn anyway.
  draw();
  await choose(/Vault/);

  expect(await screen.findByText("inbox")).toBeDefined();
  expect(screen.queryByText("loading…")).toBeNull();
  held();
});

/**
 * A person reads titles and types one; the field is sent with the slug. Only at
 * the moment the line is done being typed — never on a keystroke.
 */
test("resolves a title typed to the value it stands for, on commit", async () => {
  const transport = servingBrowsable(() => answered(CHANNELS));
  draw();
  await choose(/Vault/);
  const field = (await screen.findByLabelText("directory")) as HTMLInputElement;
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "Reading Notes" } });
  // Still what was typed: resolving here would take the field off a person
  // still writing.
  expect(field.value).toBe("Reading Notes");

  await fireEvent.keyDown(field, { key: "Enter" });

  await vi.waitFor(async () => {
    expect((await routed(transport)).arguments).toEqual({
      directory: "reading-notes",
    });
  });
});

/**
 * The gap that sent a half-typed title to are.na as a slug: `⇥` resolved it,
 * committing without pressing `⇥` did not.
 */
test("resolves enough of a title that only one channel still matches", async () => {
  const transport = servingBrowsable(() => answered(CHANNELS));
  draw();
  await choose(/Vault/);
  const field = (await screen.findByLabelText("directory")) as HTMLInputElement;
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "Field" } });
  await fireEvent.keyDown(field, { key: "Enter" });

  await vi.waitFor(async () => {
    expect((await routed(transport)).arguments).toEqual({
      directory: "field-recordings",
    });
  });
});

test("resolves it on leaving the line too, so the pointer gets there as well", async () => {
  servingBrowsable(() => answered(CHANNELS));
  draw();
  await choose(/Vault/);
  const field = (await screen.findByLabelText("directory")) as HTMLInputElement;
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "field recordings" } });
  await fireEvent.blur(field);

  expect(field.value).toBe("field-recordings");
});

/** An answer is one page of what a destination holds, so not being in it is not being wrong. */
test("leaves something it does not recognise exactly as written, and still routes", async () => {
  const transport = servingBrowsable(() => answered(CHANNELS));
  draw();
  await choose(/Vault/);
  const field = (await screen.findByLabelText("directory")) as HTMLInputElement;
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "12345" } });
  await fireEvent.keyDown(field, { key: "Enter" });

  await vi.waitFor(async () => {
    expect((await routed(transport)).arguments).toEqual({ directory: "12345" });
  });
});

test("says so where nothing typed matches, rather than drawing nothing", async () => {
  const field = await browsingChannels();
  await screen.findByText("Reading");

  await fireEvent.input(field, { target: { value: "zzz" } });

  expect(await screen.findByText("nothing here matches")).toBeDefined();
});

/** Backspacing out of an empty field gives the destination back, as the line does. */
test("gives the destination back from an empty field", async () => {
  const field = await browsingChannels();

  await fireEvent.keyDown(field, { key: "Backspace" });

  expect(await screen.findByRole("button", { name: /Vault/ })).toBeDefined();
});

/** More than one and it is asked, its capabilities being its own to pick among. */
test("a kind that draws the browser chooses among two", async () => {
  serving([aDestination({ kind: "kanban" })], {
    kind: "described",
    capabilities: [CREATE, APPEND],
  });

  draw();
  await choose(/Vault/);

  expect(await screen.findByRole("button", { name: "create" })).toBeDefined();
  expect(screen.getByRole("button", { name: "append" })).toBeDefined();
  // Nothing is picked for you, so no field is drawn until one is.
  expect(screen.queryByLabelText("directory")).toBeNull();

  await choose("create");
  expect(await screen.findByLabelText("directory")).toBeDefined();
});

/** A composer you type into has to be one the caret is already in. */
test("the destination line has the caret when the composer opens", async () => {
  servingVault([]);
  drawAbout({ text: "a note" });

  const line = await screen.findByRole("combobox", {
    name: "what became of it",
  });
  expect(document.activeElement).toBe(line);
});

test("the place line takes the caret when a destination is taken", async () => {
  servingVault([{ label: "notes", scope: "notes" }]);
  drawAbout({ text: "a note" });

  await choose(/Vault/);

  const place = await screen.findByRole("combobox", { name: "place" });
  expect(document.activeElement).toBe(place);
});

test("the destination line takes it back when the place is released", async () => {
  servingVault([]);
  drawAbout({ text: "a note" });

  await choose(/Vault/);
  const place = await screen.findByRole("combobox", { name: "place" });
  await fireEvent.keyDown(place, { key: "Backspace" });

  const line = await screen.findByRole("combobox", {
    name: "what became of it",
  });
  expect(document.activeElement).toBe(line);
});

/** The whole list is drawn below it already; narrowing nothing is not a choice. */
test("does not say the destination list twice before one is typed", async () => {
  servingVault([]);
  drawAbout({ text: "a note" });

  await screen.findByRole("button", { name: "Vault" });
  expect(screen.getAllByText("Vault")).toHaveLength(1);
});

test("narrows the bands to what is typed, and draws the one hit bold", async () => {
  servingVault([]);
  drawAbout({ text: "a note" });

  await screen.findByRole("button", { name: "Vault" });
  expect(screen.getByRole("button", { name: "manual" })).toBeDefined();

  const line = screen.getByRole("combobox", { name: "what became of it" });
  await fireEvent.input(line, { target: { value: "Va" } });

  expect(screen.getAllByText("Vault")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Vault" }).className).toContain(
    "font-semibold",
  );
  // The other bands narrow with it, to nothing.
  expect(screen.queryByRole("button", { name: "manual" })).toBeNull();
  expect(screen.queryByText("otherwise")).toBeNull();
});

/** A sentence out of a schema is not the composer's voice. */
test("draws no field description", async () => {
  servingVault([]);
  drawAbout({ text: "a note" });
  await choose(/Vault/);

  await screen.findByRole("combobox", { name: "place" });
  expect(screen.queryByText(/relative to the vault/)).toBeNull();
});

/** `where` is the destination's own label, one step above. */
test("does not label the place with the destination step's word", async () => {
  servingVault([]);
  drawAbout({ text: "a note" });
  await choose(/Vault/);

  await screen.findByRole("combobox", { name: "place" });
  expect(screen.queryByRole("combobox", { name: "Where" })).toBeNull();
});

const aTarget = {
  kind: "destination",
  destination: VAULT,
  capability: "append",
  arguments: {},
};

/** The record goes up; what is said about it belongs to the surface below. */
test("says in the corner where it went, and stays for a second place", async () => {
  routing({
    id: "r",
    item: "one",
    at: "2026-09-03T10:00:00.000Z",
    state: "delivered",
    pointer: "notes/inbox/picker.md",
    target: aTarget,
  });

  draw();
  await choose(/Vault/);
  await commit();

  await stayed();
  const said = notices.shown.at(-1);
  expect(said?.what).toBe("routed · Vault");
  expect(said?.why).toBe("notes/inbox/picker.md");
  expect(said?.href).toBe("/items/one");
  expect(said?.key).toBe("record:r");

  await choose(/Vault/);
  await commit();
  await vi.waitFor(() => {
    expect(
      asked().filter((each) => each === "POST /v1/items/one/route"),
    ).toHaveLength(2);
  });
});

/** The next unprocessed item in the queue's order, which is what a queue worked from one end is. */
test("advances to the next item in the queue after a decision, and esc returns selected", async () => {
  routing(
    {
      id: "r",
      item: "one",
      at: "2026-09-03T10:00:00.000Z",
      state: "delivered",
      target: aTarget,
    },
    [anItem("one"), anItem("two")],
  );
  await client.enter("queue");

  draw();
  await fireEvent.keyDown(window, { key: "Escape" });
  expect(left()).toBe("/?selected=one");

  await fireEvent.keyDown(window, { key: "]" });
  expect(left()).toBe("/items/two/process");
  await fireEvent.keyDown(window, { key: "[" });
  expect(left()).toBe("/items/two/process");

  await choose(/^manual/);
  await vi.waitFor(() => {
    expect(left()).toBe("/items/two/process");
  });
});

/** A decision takes the item off the queue first; the row after it is still the one to go to. */
test("advances to the row after this one, not the top of the queue", async () => {
  routing(
    {
      id: "r",
      item: "one",
      at: "2026-09-03T10:00:00.000Z",
      state: "delivered",
      target: aTarget,
    },
    [anItem("zero"), anItem("one"), anItem("two")],
  );
  await client.enter("queue");

  draw();
  await choose(/^manual/);
  await vi.waitFor(() => {
    expect(left()).toBe("/items/two/process");
  });
});

/** An item that was never on the queue — reached from the feed — goes on from the top. */
test("goes to the first queued item after deciding one that was not on the queue", async () => {
  routing(
    {
      id: "r",
      item: "one",
      at: "2026-09-03T10:00:00.000Z",
      state: "delivered",
      target: aTarget,
    },
    [anItem("zero"), anItem("two")],
  );
  await client.enter("queue");

  draw();
  await choose(/^manual/);
  await vi.waitFor(() => {
    expect(left()).toBe("/items/zero/process");
  });
});

/** The queue is read a page at a time; the end of the page is not the end of the queue. */
test("reads the next page before returning to a queue that has more", async () => {
  let pages = 0;
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route === "POST /v1/items/one/mark-processed") {
      return json(200, {
        id: "rec",
        item: "one",
        at: WHEN,
        state: "delivered",
        target: { kind: "user" },
      });
    }
    if (route === "GET /v1/queue") {
      pages += 1;
      return pages === 1
        ? json(200, {
            values: [anItem("zero"), anItem("one")],
            next: "/v1/queue?after=one",
          })
        : json(200, { values: [anItem("two")] });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
  await client.enter("queue");

  draw();
  await choose(/^manual/);
  await vi.waitFor(() => {
    expect(left()).toBe("/items/two/process");
  });
});

test("returns to the queue when nothing is left", async () => {
  routing(
    {
      id: "r",
      item: "one",
      at: "2026-09-03T10:00:00.000Z",
      state: "delivered",
      target: aTarget,
    },
    [anItem("one")],
  );
  await client.enter("queue");

  draw();
  await choose(/^manual/);
  await vi.waitFor(() => {
    expect(left()).toBe("/");
  });
});

test("a refusal stays at the control, and the corner is left alone", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [APPEND] });
    }
    if (route === "POST /v1/items/one/route") {
      return json(400, { error: { code: "arguments-invalid" } });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  draw();
  await choose(/Vault/);
  await commit();

  await screen.findByText(/that destination needs different arguments/);
  expect(left()).toBeUndefined();
  expect(notices.shown).toHaveLength(0);
});

test("asks for the preview once the place is settled, and not before", async () => {
  serving([aDestination()]);

  draw();
  await choose(/Vault/);
  const directory = await screen.findByLabelText("directory");

  // A required argument is still empty: there is nothing to preview yet.
  await new Promise((done) => setTimeout(done, 500));
  expect(asked()).not.toContain("POST /v1/items/one/route/preview");

  await fireEvent.input(directory, { target: { value: "inbox" } });

  expect(await screen.findByText(/# a thought/)).toBeDefined();
  expect(asked()).toContain("POST /v1/items/one/route/preview");
  // The label is `preview`, and nothing says who writes.
  expect(screen.queryByText(/would write/)).toBeNull();
});

test("asks again when the decision under it changes, keeping the last answer meanwhile", async () => {
  let answered = 0;
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE] });
    }
    if (route === "POST /v1/items/one/route/preview") {
      answered += 1;
      return json(200, {
        kind: "previewed",
        content: {
          mediaType: "text/markdown",
          text: `# for ${answered === 1 ? "inbox" : "drafts"}\n`,
          truncated: false,
        },
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  draw();
  await choose(/Vault/);
  const directory = await screen.findByLabelText("directory");
  await fireEvent.input(directory, { target: { value: "inbox" } });
  await screen.findByText(/# for inbox/);

  await fireEvent.input(directory, { target: { value: "drafts" } });
  // Still up while the next one is on its way.
  expect(screen.getByText(/# for inbox/)).toBeDefined();

  expect(await screen.findByText(/# for drafts/)).toBeDefined();
  expect(answered).toBe(2);
});

test("drops a preview that resolves after the decision moved on", async () => {
  const releases: ((value: Response) => void)[] = [];
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE] });
    }
    if (route === "POST /v1/items/one/route/preview") {
      return new Promise<Response>((resolve) => releases.push(resolve));
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  draw();
  await choose(/Vault/);
  const directory = await screen.findByLabelText("directory");
  await fireEvent.input(directory, { target: { value: "inbox" } });
  await vi.waitFor(() => {
    expect(releases).toHaveLength(1);
  });

  // The person types on while the request is out.
  await fireEvent.input(directory, { target: { value: "drafts" } });
  releases[0]?.(
    json(200, {
      kind: "previewed",
      content: {
        mediaType: "text/markdown",
        text: "# for inbox\n",
        truncated: false,
      },
    }),
  );

  await vi.waitFor(() => {
    expect(releases).toHaveLength(2);
  });
  expect(screen.queryByText(/# for inbox/)).toBeNull();
});

test("says what a preview would write that it cannot show", async () => {
  serving([aDestination()], undefined, {
    kind: "previewed",
    content: { mediaType: "application/pdf", truncated: false },
  });

  draw();
  await choose(/Vault/);
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });

  expect(await screen.findByText(/application\/pdf/)).toBeDefined();
});

test("clears a failed preview's message when the next one succeeds", async () => {
  let fail = true;
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE] });
    }
    if (route === "POST /v1/items/one/route/preview") {
      if (fail) {
        fail = false;
        return json(422, {
          error: { code: "arguments-invalid", facts: {} },
        });
      }
      return json(200, {
        kind: "previewed",
        content: {
          mediaType: "text/markdown",
          text: "# a thought\n",
          truncated: false,
        },
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  draw();
  await choose(/Vault/);
  const directory = await screen.findByLabelText("directory");
  await fireEvent.input(directory, { target: { value: "inbox" } });
  expect(
    await screen.findByText(/that destination needs different arguments/),
  ).toBeDefined();

  await fireEvent.input(directory, { target: { value: "drafts" } });

  expect(await screen.findByText(/# a thought/)).toBeDefined();
  expect(
    screen.queryByText(/that destination needs different arguments/),
  ).toBeNull();
});

test("draws a kind that offers no preview as such, and still routes", async () => {
  serving([aDestination()], undefined, { kind: "not-offered" });

  draw();
  await choose(/Vault/);
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });

  expect(await screen.findByText(NO_PREVIEW_OFFERED)).toBeDefined();

  await commit();
  await stayed();
});

test("says a destination that could not be reached, and routing is still available", async () => {
  serving([aDestination()], undefined, {
    kind: "unreachable",
    detail: "the vault is asleep",
  });

  draw();
  await choose(/Vault/);
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });

  // In plain ink: the destination being asleep is ordinary, not a failure.
  const said = await screen.findByText("out of reach");
  expect(said.className).not.toContain("text-alarm");
  expect(
    (screen.getByRole("button", { name: "route" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

/** The head line the schema-driven form's arguments name, above the preview. */
test("the preview's head says the destination and the full place it names", async () => {
  serving([aDestination()]);

  draw();
  await choose(/Vault/);
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });

  expect(await screen.findByText(/# a thought/)).toBeDefined();
  expect(screen.getByText("Vault / inbox")).toBeDefined();
});

/** A destination whose place is the typed line, with a preview to head. */
function servingLinedPreview(entries: readonly Record<string, unknown>[] = []) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "filesystem" })] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE_OR_APPEND] });
    }
    if (route.endsWith("/candidates")) {
      const scope = new URL(request.url).searchParams.get("scope");
      return json(200, scope === null ? answered(entries) : answered([]));
    }
    if (route === "POST /v1/items/one/route/preview") {
      return json(200, {
        kind: "previewed",
        content: {
          mediaType: "text/markdown",
          text: "# a thought\n",
          truncated: false,
        },
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

/** The name a blank leaf would get is the same code the line forecasts with. */
test("the preview's head says the full path the typed line names", async () => {
  servingLinedPreview([]);

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox", { name: "place" });
  await fireEvent.input(line, { target: { value: "research/" } });

  expect(await screen.findByText(/# a thought/)).toBeDefined();
  expect(screen.getByText("Vault / research/a thought.md")).toBeDefined();
});

/** The two layouts, by width: asserted as the classes that make them. */
test("stacks below the wide breakpoint and takes two columns from it", async () => {
  serving([aDestination()]);

  const { container } = draw();
  const frame = container.firstElementChild as HTMLElement;

  expect(frame.className).toContain("flex-col");
  expect(frame.className).toContain(
    "wide:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]",
  );
  const head = frame.firstElementChild as HTMLElement;
  expect(head.className).toContain("border-b");
  expect(head.className).toContain("wide:border-r");
  expect(head.className).toContain("wide:row-span-2");
});

/**
 * The heading an append would use is nothing to a note that does not exist yet.
 * An absent forecast is not knowing, and not knowing keeps the field.
 */
test("drops the field beside the line where it knows a new note is being made", async () => {
  servingVault([]);

  drawAbout({ text: "Picker needs a trail" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox", { name: "place" });
  expect(screen.getByLabelText("under")).toBeDefined();

  await fireEvent.input(line, { target: { value: "drafts/" } });
  await screen.findByText("create");

  await vi.waitFor(() => {
    expect(screen.queryByLabelText("under")).toBeNull();
  });
});

test("keeps the field where the line would append to a note that is there", async () => {
  servingVault([{ label: "decisions.md", value: "decisions.md" }]);

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox", { name: "place" });
  await fireEvent.input(line, { target: { value: "decisions.md" } });

  await screen.findByText("append");
  expect(screen.getByLabelText("under")).toBeDefined();
});

/** No forecast is no evidence, and a field is not dropped on none. */
test("keeps the field where the destination could not be asked at all", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "filesystem" })] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE_OR_APPEND] });
    }
    if (route.endsWith("/candidates")) {
      return json(200, { kind: "unreachable", detail: "not mounted" });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  drawAbout({ text: "a thought" });
  await choose(/Vault/);

  const line = await screen.findByRole("combobox", { name: "place" });
  await fireEvent.input(line, { target: { value: "drafts/" } });

  await screen.findByText("unreachable · best effort");
  expect(screen.getByLabelText("under")).toBeDefined();
});

/**
 * The `where` step answers what became of the item, and a configured
 * destination is only the commonest answer. The other two are the shell's own.
 */
test("offers manual and discard below the destinations", async () => {
  serving([aDestination()]);
  draw();

  await screen.findByRole("button", { name: /Vault/ });
  await screen.findByRole("button", { name: /^manual/ });
  await screen.findByRole("button", { name: /^discard/ });
});

test("taking discard archives the item, closes, and offers it back", async () => {
  const transport = serving([aDestination()]);
  draw();

  await choose(/^discard/);

  await vi.waitFor(() => {
    expect(left()).toBe("/");
  });
  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain(
      "POST /v1/items/one/archive",
    );
  });

  const said = notices.shown.at(-1);
  expect(said?.what).toBe("discarded");
  expect(said?.standing).toBe(true);
  expect(said?.offer?.label).toBe("undo");
});

test("taking the offer unarchives it", async () => {
  const transport = serving([aDestination()]);
  draw();

  await choose(/^discard/);
  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain(
      "POST /v1/items/one/archive",
    );
  });

  notices.take(notices.shown.at(-1)?.id as string);

  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain(
      "POST /v1/items/one/unarchive",
    );
  });
});

test("discard is typed like any other entry", async () => {
  const transport = serving([aDestination()]);
  draw();

  const line = await screen.findByRole("combobox", {
    name: "what became of it",
  });
  await fireEvent.input(line, { target: { value: "disc" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain(
      "POST /v1/items/one/archive",
    );
  });
});

/**
 * The two the shell invents are names in the same list, so a destination can
 * collide with one. The existing rule holds: it takes nothing and says how many
 * matched, rather than preferring either the pool's entry or its own.
 */
test("a destination that shares a prefix with one of the two takes nothing", async () => {
  const transport = serving([aDestination({ name: "discography" })]);
  draw();

  const line = await screen.findByRole("combobox", {
    name: "what became of it",
  });
  await fireEvent.input(line, { target: { value: "disc" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  expect(screen.getByRole("button", { name: "discography" })).toBeDefined();
  expect(screen.getByRole("button", { name: "discard" })).toBeDefined();
  expect(sentTo(transport).map(routeOf)).not.toContain(
    "POST /v1/items/one/archive",
  );
});

test("an entry that cannot apply stays in the list and says why", async () => {
  serving([aDestination()]);
  draw(
    aCapture({
      archived: { archivedAt: WHEN },
      routing: { records: 1, pending: 0, to: [{ kind: "user" }] },
    }),
  );

  const discard = await screen.findByRole("button", { name: /^discard/ });
  const manual = await screen.findByRole("button", { name: /^manual/ });

  expect((discard as HTMLButtonElement).disabled).toBe(true);
  expect(discard.textContent).toContain("already discarded");
  expect((manual as HTMLButtonElement).disabled).toBe(true);
  expect(manual.textContent).toContain("already marked");
});

/** The row's `done` field, moved to where the decision is made. */
/** The `otherwise` band acts at once, as the row does: no note, no second step. */
test("manual marks processed at once, says so with an undo, and advances", async () => {
  const transport = serving([aDestination()]);
  draw();

  await choose(/^manual/);

  await vi.waitFor(() => {
    expect(left()).toBe("/");
  });
  const marked = sentTo(transport).find(
    (request) => routeOf(request) === "POST /v1/items/one/mark-processed",
  );
  expect(await marked?.json()).toEqual({});
  expect(screen.queryByLabelText("where it went")).toBeNull();
  expect(notices.shown.at(-1)?.what).toBe("marked manual");
  expect(notices.shown.at(-1)?.offer?.label).toBe("undo");
});

/**
 * Once `process` is the only way out of the queue, a composer that refuses to
 * open offline is a queue that cannot be drained offline.
 */
test("with the pool out of reach the composer opens and discards", async () => {
  const transport = serving([aDestination()]);
  online(false);

  draw();

  const vault = await screen.findByRole("button", { name: /Vault/ });
  const manual = await screen.findByRole("button", { name: /^manual/ });
  expect((vault as HTMLButtonElement).disabled).toBe(true);
  expect(vault.textContent).toContain("pool out of reach");
  expect((manual as HTMLButtonElement).disabled).toBe(true);

  const discard = await screen.findByRole("button", { name: /^discard/ });
  expect((discard as HTMLButtonElement).disabled).toBe(false);

  await choose(/^discard/);
  await vi.waitFor(() => {
    expect(left()).toBe("/");
  });

  online(true);
  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain(
      "POST /v1/items/one/archive",
    );
  });
});

test("the surface's tags are offered whatever the pool is doing", async () => {
  serving([aDestination()]);
  online(false);
  draw();

  await addingTag();
});

/**
 * `esc` leaves the surface with the row still selected, and the decision is
 * stepped back by `change` rather than by it. From a field, the first press
 * leaves the field.
 */
test("esc returns to the queue with the item selected, once the caret is out of a field", async () => {
  serving([aDestination()]);
  draw();

  await choose(/Vault/);
  await described();

  const directory = screen.getByLabelText("directory");
  directory.focus();
  await fireEvent.keyDown(directory, { key: "Escape" });
  expect(left()).toBeUndefined();
  expect(document.activeElement).not.toBe(directory);

  await fireEvent.keyDown(window, { key: "Escape" });
  expect(left()).toBe("/?selected=one");
});

/** One press does one thing: putting a field away is not leaving the surface. */
test("esc leaving the tag field leaves the surface where it was", async () => {
  serving([aDestination()]);
  draw();

  await choose(/Vault/);
  await described();
  const line = await addingTag();
  await fireEvent.input(line, { target: { value: "resea" } });

  await fireEvent.keyDown(line, { key: "Escape" });

  expect(left()).toBeUndefined();
  expect(
    screen.getByText("Vault", { selector: ".font-semibold" }),
  ).toBeDefined();
  // And what was half-typed is dropped rather than applied by the blur.
  expect(asked()).not.toContain("POST /v1/items/one/tag");
});

/**
 * What is *in use* is what the pool has seen on an item, so a template set up
 * this morning could only be fired by typing its tag exactly right — which is
 * the one time nobody knows it.
 */
test("offers a trigger tag that has never filed anything yet", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "filesystem" })] });
    }
    if (route === "GET /v1/templates") {
      return json(200, { values: [RESEARCH] });
    }
    if (route === "GET /v1/tags") {
      return json(200, { values: [{ name: "seedling", items: 3 }] });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE_OR_APPEND] });
    }
    if (route.endsWith("/candidates")) return json(200, answered([]));
    return json(404, { error: { code: "unknown-route" } });
  });
  await client.tags.load();
  await client.templates.load();

  drawAbout({ text: "a thought" });
  await choose(/Vault/);
  await screen.findByRole("combobox", { name: "place" });

  await addingTag();
  await screen.findByRole("option", { name: /route\/research.*research/ });
});

/**
 * Tagging is no longer free of consequence, so the chooser says which of them
 * sends the item. The mark names the template rather than only saying there is
 * one: `route/` is a namespace, and a namespace is not a decision.
 */
test("marks a trigger tag in the chooser with the template it applies", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "filesystem" })] });
    }
    if (route === "GET /v1/templates") {
      return json(200, { values: [RESEARCH] });
    }
    if (route === "GET /v1/tags") {
      return json(200, {
        values: [
          { name: "route/research", items: 2 },
          { name: "seedling", items: 3 },
        ],
      });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE_OR_APPEND] });
    }
    if (route.endsWith("/candidates")) return json(200, answered([]));
    return json(404, { error: { code: "unknown-route" } });
  });
  await client.tags.load();
  await client.templates.load();

  drawAbout({ text: "a thought" });
  await choose(/Vault/);
  await screen.findByRole("combobox", { name: "place" });

  await addingTag();
  await screen.findByRole("option", { name: /route\/research.*research/ });
  // An ordinary tag is left as it was: only a tag with an effect is marked.
  expect(screen.getByRole("option", { name: "seedling" })).toBeTruthy();
});

/**
 * A trigger tag that filed the item still stands until the routing is
 * cancelled, so the chooser draws it inert rather than a control that would
 * refuse the press.
 */
test("draws a trigger tag that filed the item as inert, not a control", async () => {
  const held = aCapture({
    tags: [{ name: "route/research", addedAt: WHEN }],
    routing: {
      records: 1,
      pending: 0,
      to: [{ kind: "destination", destination: VAULT }],
      templates: [RESEARCH.id],
    },
  });
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/items/one") return json(200, held);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route === "GET /v1/templates") return json(200, { values: [RESEARCH] });
    return json(200, { values: [] });
  });
  await client.templates.load();
  await client.item("one");

  draw(held);
  await screen.findByText("tags");

  // The template band also says "research", inside its own button: the
  // carried tag's span is the one that is not inside a control at all.
  const tag = screen
    .getAllByText("research")
    .find((each) => each.tagName === "SPAN" && each.closest("button") === null);
  expect(tag).toBeDefined();
  expect(tag?.getAttribute("title")).toBe(
    "filed the item — cancel the routing to take it off",
  );
  expect(
    screen.queryByRole("button", {
      name: "route/research, routes to research",
    }),
  ).toBeNull();
});

/** A destination that says where a field starts is answered: it starts there. */
test("draws a field's default and sends it", async () => {
  const transport = serving([aDestination()], {
    kind: "described",
    capabilities: [CREATE_WITH_DEFAULT],
  });

  draw();
  await choose(/Vault/);

  const directory = (await screen.findByLabelText(
    "directory",
  )) as HTMLInputElement;
  await vi.waitFor(() => {
    expect(directory.value).toBe("inbox");
  });

  await commit();

  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain(
      "POST /v1/items/one/route",
    );
  });
  expect(await sent()).toContainEqual({
    destination: VAULT,
    capability: "create",
    arguments: { directory: "inbox" },
  });
});

/** Typed over is typed over, including emptied: a default is where a field starts. */
test("keeps what is typed over a default", async () => {
  serving([aDestination()], {
    kind: "described",
    capabilities: [CREATE_WITH_DEFAULT],
  });

  draw();
  await choose(/Vault/);

  const directory = (await screen.findByLabelText(
    "directory",
  )) as HTMLInputElement;
  await vi.waitFor(() => {
    expect(directory.value).toBe("inbox");
  });

  await fireEvent.input(directory, { target: { value: "" } });

  expect(directory.value).toBe("");
});

/**
 * A template's arguments *are* the decision it saved. A default written into a
 * field it left empty would commit as a correction of it, and the record would
 * stop naming the template.
 */
test("leaves a template's own arguments alone", async () => {
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route === "GET /v1/templates") return json(200, { values: [RESEARCH] });
    if (route === "GET /v1/items/one/route/resolve") {
      return json(200, {
        destination: VAULT,
        capability: "create",
        arguments: { directory: "research/2026-09-04" },
      });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [CREATE_WITH_DEFAULT],
      });
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        state: "delivered",
        target: {},
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  draw();
  await choose("research");

  const directory = (await screen.findByLabelText(
    "directory",
  )) as HTMLInputElement;
  expect(directory.value).toBe("research/2026-09-04");

  await commit();

  await vi.waitFor(() => {
    expect(sentTo(transport).map(routeOf)).toContain(
      "POST /v1/items/one/route",
    );
  });
  expect(await sent()).toContainEqual({ template: RESEARCH.id });
});

/** The label and what it holds, since the modal's own chrome says the capture too. */
/** The head draws the words this delivery carries; `edit` opens them in place. */
const head = () => screen.getByText(/a note/, { selector: "div" });

test("the head draws the capture, read-only until edit", async () => {
  serving([aDestination()]);

  draw();

  expect(head()).toBeTruthy();
  expect(screen.queryByLabelText("words")).toBeNull();
  expect(screen.getByRole("button", { name: "edit" })).toBeDefined();
});

test("edit opens the capture's words in a box, and routing sends what was typed", async () => {
  serving([aDestination()]);

  draw();
  await choose("edit");

  const field = (await screen.findByLabelText("words")) as HTMLTextAreaElement;
  expect(field.value).toBe("a note");
  expect(field.className).toContain("border");
  // Hidden meanwhile: the two words under the box are the way out.
  expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "keep the capture's" }),
  ).toBeDefined();

  await fireEvent.input(field, { target: { value: "a note, tidied" } });
  await choose("done");
  expect(screen.queryByLabelText("words")).toBeNull();
  expect(screen.getByText("a note, tidied")).toBeDefined();

  await choose("Vault");
  await described();
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });
  await commit();

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
  expect(await sent()).toContainEqual({
    destination: VAULT,
    capability: "create",
    arguments: { directory: "inbox" },
    content: { text: "a note, tidied" },
  });
});

test("e and a double click on the words open editing too", async () => {
  serving([aDestination()]);

  draw();
  await fireEvent.keyDown(window, { key: "e" });
  expect(await screen.findByLabelText("words")).toBeDefined();

  await choose("done");
  expect(screen.queryByLabelText("words")).toBeNull();

  await fireEvent.dblClick(head());
  expect(await screen.findByLabelText("words")).toBeDefined();
});

/** A place in one vault means nothing in another; words are not about the destination at all. */
test("changing destination keeps the words and clears the arguments", async () => {
  serving([aDestination(), aDestination({ id: BOARD, name: "Board" })]);

  draw();
  await choose("edit");
  await fireEvent.input(await screen.findByLabelText("words"), {
    target: { value: "a note, tidied" },
  });
  await choose("Vault");
  await described();
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });

  await choose("change");
  await choose("Board");
  await described();

  expect(
    ((await screen.findByLabelText("words")) as HTMLTextAreaElement).value,
  ).toBe("a note, tidied");
  expect(
    ((await screen.findByLabelText("directory")) as HTMLInputElement).value,
  ).toBe("");
});

/** A preview of words that have since changed is indistinguishable from a good one. */
test("the preview is asked for again when the words change, with the words it would carry", async () => {
  const transport = serving([aDestination()], {
    kind: "described",
    capabilities: [APPEND],
  });

  draw();
  await choose("Vault");
  await screen.findByText(/# a thought/);
  const previews = () =>
    sentTo(transport).filter(
      (request) => routeOf(request) === "POST /v1/items/one/route/preview",
    );
  expect(previews()).toHaveLength(1);

  await choose("edit");
  await fireEvent.input(await screen.findByLabelText("words"), {
    target: { value: "a note, tidied" },
  });

  await vi.waitFor(() => {
    expect(previews()).toHaveLength(2);
  });
  const asking = await previews().at(-1)?.clone().json();
  expect(asking).toMatchObject({ content: { text: "a note, tidied" } });
});

/** No rule invented here: a capture carrying assets and no text is already legitimate. */
test("an empty rewrite sends the words the payload schema allows", async () => {
  serving([aDestination()]);

  draw();
  await choose("edit");
  await fireEvent.input(await screen.findByLabelText("words"), {
    target: { value: "" },
  });
  await choose("Vault");
  await described();
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });
  await commit();

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
  expect(await sent()).toContainEqual({
    destination: VAULT,
    capability: "create",
    arguments: { directory: "inbox" },
    content: {},
  });
});

/** The presence of `content` on the record is the claim that somebody rewrote it. */
test("opening the words and typing nothing carries nothing", async () => {
  serving([aDestination()]);

  draw();
  await choose("edit");
  await screen.findByLabelText("words");
  await choose("done");

  await choose("Vault");
  await described();
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });
  await commit();

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
  expect(await sent()).toContainEqual({
    destination: VAULT,
    capability: "create",
    arguments: { directory: "inbox" },
  });
});

test("keeping the capture's words draws them again and carries nothing", async () => {
  serving([aDestination()]);

  draw();
  await choose("edit");
  await fireEvent.input(await screen.findByLabelText("words"), {
    target: { value: "a note, tidied" },
  });

  await choose("keep the capture's");

  expect(screen.queryByLabelText("words")).toBeNull();
  expect(head()).toBeTruthy();

  await choose("Vault");
  await described();
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });
  await commit();

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
  expect(await sent()).toContainEqual({
    destination: VAULT,
    capability: "create",
    arguments: { directory: "inbox" },
  });
});

/**
 * The one chord that fires with the caret in a field: the decision is finished
 * where the words are, and reaching for the mouse to send it is the gesture
 * this surface exists to spare.
 */
test("⌘⏎ routes from inside a field, where esc only leaves the field", async () => {
  serving([aDestination()], { kind: "described", capabilities: [APPEND] });

  draw();
  await choose(/Vault/);
  await vi.waitFor(() => {
    expect(
      (screen.getByRole("button", { name: "route" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  await fireEvent.keyDown(window, { key: "e" });
  const words = await screen.findByLabelText("words");
  words.focus();

  // The first press leaves the field; the editor is still open behind it.
  await fireEvent.keyDown(words, { key: "Escape" });
  expect(document.activeElement).not.toBe(words);
  expect(screen.queryByLabelText("words")).not.toBeNull();

  words.focus();
  await fireEvent.keyDown(words, { key: "Enter", metaKey: true });
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
});

/** Nowhere to send it is a refusal, and a refused command has no key either. */
test("⌘⏎ sends nothing while no destination is taken", async () => {
  serving([aDestination()]);

  draw();
  await screen.findByRole("button", { name: /Vault/ });

  await fireEvent.keyDown(window, { key: "Enter", metaKey: true });
  await tick();
  expect(asked()).not.toContain("POST /v1/items/one/route");
});
