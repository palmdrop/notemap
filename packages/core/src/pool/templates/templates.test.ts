import { describe, expect, it } from "vitest";

import type { PoolPorts, PoolStore, PoolTx } from "#types/api/ports";
import type { Action } from "#types/domain/action-log";
import type { Destination } from "#types/domain/destination";
import type {
  CapabilityName,
  DestinationId,
  DestinationKindName,
  MintableId,
  RoutingTemplateId,
  TagName,
  Timestamp,
} from "#types/domain/ids";
import type {
  RoutingTemplate,
  RoutingTemplateRecord,
} from "#types/domain/template";
import type { Job } from "#types/domain/work";

import { create, edit, list, remove } from "./lifecycle";

const VAULT = "dst-vault" as DestinationId;
const CREATE = "create" as CapabilityName;

type Wiring = {
  readonly destinations?: readonly DestinationId[];
  readonly templates?: readonly RoutingTemplate[];
};

type Wired = PoolPorts & {
  readonly held: Map<RoutingTemplateId, RoutingTemplate>;
  readonly appended: Action[];
  readonly enqueued: Job[];
};

/** Only what a template's lifecycle reaches for; the rest of `PoolPorts` stays unbuilt. */
function ports(wiring: Wiring = {}): Wired {
  const destinations = new Set<DestinationId>(wiring.destinations ?? [VAULT]);
  const held = new Map<RoutingTemplateId, RoutingTemplate>(
    (wiring.templates ?? []).map((each) => [each.id, each]),
  );
  const appended: Action[] = [];
  const enqueued: Job[] = [];

  let minted = 0;
  let ticks = 0;

  const stamp = (record: RoutingTemplateRecord): RoutingTemplate => {
    const stored: RoutingTemplate = {
      ...record,
      modifiedAt: `2026-09-05T10:00:0${String(ticks)}.000Z` as Timestamp,
      fired: { records: 0 },
    };
    held.set(stored.id, stored);
    return stored;
  };

  const reads = {
    destination: async (id: DestinationId): Promise<Destination | undefined> =>
      destinations.has(id)
        ? ({
            id,
            name: id,
            kind: "filesystem" as DestinationKindName,
            settings: {},
            createdAt: "2026-09-01T08:00:00.000Z" as Timestamp,
            modifiedAt: "2026-09-01T08:00:00.000Z" as Timestamp,
          } satisfies Destination)
        : undefined,
    routingTemplates: async () => [...held.values()],
    routingTemplate: async (id: RoutingTemplateId) => held.get(id),
    routingTemplateByTriggerTag: async (tag: TagName) =>
      [...held.values()].find((each) => each.triggerTag === tag),
  };

  const tx = {
    ...reads,
    insertRoutingTemplate: async (record: RoutingTemplateRecord) =>
      stamp(record),
    updateRoutingTemplate: async (record: RoutingTemplateRecord) =>
      stamp(record),
    deleteRoutingTemplate: async (id: RoutingTemplateId) => {
      held.delete(id);
    },
    appendAction: async (action: Action) => {
      appended.push(action);
    },
    enqueue: async (jobs: readonly Job[]) => {
      enqueued.push(...jobs);
    },
  } as unknown as PoolTx;

  const store = {
    ...reads,
    transaction: <T>(work: (handle: PoolTx) => Promise<T>) => work(tx),
  } as unknown as PoolStore;

  return {
    held,
    appended,
    enqueued,
    store,
    mirrorWriter: {} as PoolPorts["mirrorWriter"],
    clock: {
      now: () => `2026-09-05T11:00:0${String(ticks++)}.000Z` as Timestamp,
    },
    ids: { next: <T extends MintableId>() => `tpl-${String(++minted)}` as T },
  } as unknown as Wired;
}

const draft = {
  name: "Research links",
  destination: VAULT,
  capability: CREATE,
  arguments: { path: "research/{{captured_at}}.md" },
};

describe("creating a template", () => {
  it("defaults to creating its folder, which is what routing does today", async () => {
    const wired = ports();

    const made = await create(wired, draft);

    expect(made.kind).toBe("ok");
    if (made.kind !== "ok") return;
    expect(made.value.folder).toBe("create");
    expect(made.value.triggerTag).toBeUndefined();
  });

  it("refuses a destination the pool does not hold", async () => {
    const wired = ports({ destinations: [] });

    const made = await create(wired, draft);

    expect(made).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-destination", destination: VAULT },
    });
  });

  it("refuses a trigger tag outside the reserved namespace", async () => {
    const wired = ports();

    const made = await create(wired, {
      ...draft,
      triggerTag: "research" as TagName,
    });

    expect(made).toMatchObject({
      kind: "refused",
      refusal: { kind: "trigger-tag-unreserved", tag: "research" },
    });
  });

  it("refuses the namespace on its own, which names nothing", async () => {
    const wired = ports();

    const made = await create(wired, {
      ...draft,
      triggerTag: "route/" as TagName,
    });

    expect(made).toMatchObject({
      kind: "refused",
      refusal: { kind: "trigger-tag-unreserved" },
    });
  });

  it("refuses a tag that is nothing but space", async () => {
    const wired = ports();

    const made = await create(wired, { ...draft, triggerTag: "  " as TagName });

    expect(made).toMatchObject({
      kind: "refused",
      refusal: { kind: "trigger-tag-invalid" },
    });
  });

  it("refuses a trigger tag another template already claims", async () => {
    const wired = ports();
    const first = await create(wired, {
      ...draft,
      triggerTag: "route/research" as TagName,
    });
    expect(first.kind).toBe("ok");

    const second = await create(wired, {
      ...draft,
      name: "Something else",
      triggerTag: "route/research" as TagName,
    });

    expect(second).toMatchObject({
      kind: "refused",
      refusal: { kind: "trigger-tag-taken", tag: "route/research" },
    });
  });

  it("refuses a draft whose arguments hold a pattern it does not know", async () => {
    const wired = ports();

    const made = await create(wired, {
      ...draft,
      arguments: { path: "research/{{bogus}}.md" },
    });

    expect(made).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-pattern-field", field: "bogus" },
    });
  });

  it("owes the mirror a write and says so in the log", async () => {
    const wired = ports();

    const made = await create(wired, draft);
    expect(made.kind).toBe("ok");
    if (made.kind !== "ok") return;

    expect("triggerTag" in made.value).toBe(false);
    expect(wired.appended.map((action) => action.kind)).toEqual([
      "template-created",
    ]);
    expect(wired.appended[0]).toMatchObject({
      by: { kind: "person" },
      detail: {
        template: made.value.id,
        name: draft.name,
        destination: draft.destination,
        capability: draft.capability,
      },
    });
    expect(wired.appended[0]?.detail).not.toHaveProperty("tag");
    expect(wired.enqueued).toEqual([
      expect.objectContaining({
        kind: "mirror",
        subject: { kind: "template", template: made.value.id },
      }),
    ]);
  });

  it("names the trigger tag it claimed, in the log", async () => {
    const wired = ports();

    const made = await create(wired, {
      ...draft,
      triggerTag: "route/research" as TagName,
    });
    expect(made.kind).toBe("ok");
    if (made.kind !== "ok") return;

    expect(made.value.triggerTag).toBe("route/research");
    expect(wired.appended[0]?.detail).toMatchObject({
      tag: "route/research",
    });
  });
});

describe("editing a template", () => {
  it("keeps its own trigger tag, which it is not taking from anyone", async () => {
    const wired = ports();
    const made = await create(wired, {
      ...draft,
      triggerTag: "route/research" as TagName,
    });
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, {
      name: "Research",
      triggerTag: "route/research" as TagName,
    });

    expect(edited).toMatchObject({ kind: "ok", value: { name: "Research" } });
  });

  it("leaves an existing trigger tag alone when the edit does not mention it", async () => {
    const wired = ports();
    const made = await create(wired, {
      ...draft,
      triggerTag: "route/research" as TagName,
    });
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, { name: "Research" });

    expect(edited).toMatchObject({
      kind: "ok",
      value: { triggerTag: "route/research" },
    });
  });

  it("claims a different trigger tag than the one it held", async () => {
    const wired = ports();
    const made = await create(wired, {
      ...draft,
      triggerTag: "route/research" as TagName,
    });
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, {
      triggerTag: "route/links" as TagName,
    });

    expect(edited).toMatchObject({
      kind: "ok",
      value: { triggerTag: "route/links" },
    });
    expect(wired.appended.at(-1)?.detail).toMatchObject({
      tag: "route/links",
    });

    // The old tag is free again: the template no longer claims it.
    const another = await create(wired, {
      ...draft,
      name: "Something else",
      triggerTag: "route/research" as TagName,
    });
    expect(another.kind).toBe("ok");
  });

  it("refuses to claim a trigger tag another template already holds", async () => {
    const wired = ports();
    const first = await create(wired, {
      ...draft,
      triggerTag: "route/research" as TagName,
    });
    if (first.kind !== "ok") throw new Error("not created");
    const second = await create(wired, {
      ...draft,
      name: "Something else",
      triggerTag: "route/links" as TagName,
    });
    if (second.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, second.value.id, {
      triggerTag: "route/research" as TagName,
    });

    expect(edited).toMatchObject({
      kind: "refused",
      refusal: { kind: "trigger-tag-taken", tag: "route/research" },
    });
  });

  it("takes the tag off where the change says null", async () => {
    const wired = ports();
    const made = await create(wired, {
      ...draft,
      triggerTag: "route/research" as TagName,
    });
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, { triggerTag: null });

    expect(edited.kind).toBe("ok");
    if (edited.kind !== "ok") return;
    expect(edited.value.triggerTag).toBeUndefined();
    expect("triggerTag" in edited.value).toBe(false);
  });

  it("refuses to repoint at a destination the pool does not hold", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, {
      destination: "dst-nowhere" as DestinationId,
    });

    expect(edited).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-destination", destination: "dst-nowhere" },
    });
  });

  it("edits a template whose destination has since been deleted, as long as the edit does not repoint it", async () => {
    const stranded: RoutingTemplate = {
      id: "tpl-stranded" as RoutingTemplateId,
      name: "Research links",
      destination: VAULT,
      capability: CREATE,
      arguments: {},
      folder: "create",
      createdAt: "2026-09-01T08:00:00.000Z" as Timestamp,
      modifiedAt: "2026-09-01T08:00:00.000Z" as Timestamp,
      fired: { records: 0 },
    };
    const wired = ports({ destinations: [], templates: [stranded] });

    const edited = await edit(wired, stranded.id, {
      name: "Links",
      destination: VAULT,
    });

    expect(edited).toMatchObject({ kind: "ok", value: { name: "Links" } });
  });

  it("applies a changed destination to a template that was never established", async () => {
    const other = "dst-other" as DestinationId;
    const wired = ports({ destinations: [VAULT, other] });
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, { destination: other });

    expect(edited).toMatchObject({
      kind: "ok",
      value: { destination: other },
    });
  });

  it("applies a changed capability to a template that was never established", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, {
      capability: "append" as CapabilityName,
    });

    expect(edited).toMatchObject({
      kind: "ok",
      value: { capability: "append" },
    });
  });

  it("refuses an edit whose arguments hold a pattern it does not know", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, {
      arguments: { path: "research/{{bogus}}.md" },
    });

    expect(edited).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-pattern-field", field: "bogus" },
    });
  });

  it("unestablishes a template repointed at another destination", async () => {
    const other = "dst-other" as DestinationId;
    const wired = ports({ destinations: [VAULT, other] });
    const made = await create(wired, { ...draft, folder: "establish" });
    if (made.kind !== "ok") throw new Error("not created");

    wired.held.set(made.value.id, {
      ...made.value,
      establishedAt: "2026-09-06T09:00:00.000Z" as Timestamp,
    });

    const edited = await edit(wired, made.value.id, { destination: other });

    expect(edited.kind).toBe("ok");
    if (edited.kind !== "ok") return;
    // What was established was established somewhere else, and requiring it
    // where this now files would refuse every delivery.
    expect(edited.value.establishedAt).toBeUndefined();
  });

  it("unestablishes a template pointed at another capability", async () => {
    const wired = ports();
    const made = await create(wired, { ...draft, folder: "establish" });
    if (made.kind !== "ok") throw new Error("not created");

    wired.held.set(made.value.id, {
      ...made.value,
      establishedAt: "2026-09-06T09:00:00.000Z" as Timestamp,
    });

    const edited = await edit(wired, made.value.id, {
      capability: "append" as CapabilityName,
    });

    expect(edited.kind).toBe("ok");
    if (edited.kind !== "ok") return;
    expect(edited.value.establishedAt).toBeUndefined();
  });

  it("unestablishes a template whose arguments changed", async () => {
    const wired = ports();
    const made = await create(wired, { ...draft, folder: "establish" });
    if (made.kind !== "ok") throw new Error("not created");

    wired.held.set(made.value.id, {
      ...made.value,
      establishedAt: "2026-09-06T09:00:00.000Z" as Timestamp,
    });

    const edited = await edit(wired, made.value.id, {
      arguments: { path: "research/{{item}}.md" },
    });

    expect(edited.kind).toBe("ok");
    if (edited.kind !== "ok") return;
    expect(edited.value.arguments).toEqual({ path: "research/{{item}}.md" });
    expect(edited.value.establishedAt).toBeUndefined();
  });

  it("keeps the rest of a template as it was when only its folder changes", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, { folder: "require" });

    expect(edited).toMatchObject({
      kind: "ok",
      value: {
        name: draft.name,
        destination: draft.destination,
        capability: draft.capability,
        arguments: draft.arguments,
        folder: "require",
      },
    });
  });

  it("keeps its establishment where only the name changed", async () => {
    const wired = ports();
    const made = await create(wired, { ...draft, folder: "establish" });
    if (made.kind !== "ok") throw new Error("not created");

    const at = "2026-09-06T09:00:00.000Z" as Timestamp;
    wired.held.set(made.value.id, { ...made.value, establishedAt: at });

    const edited = await edit(wired, made.value.id, { name: "Links" });

    expect(edited).toMatchObject({ kind: "ok", value: { establishedAt: at } });
  });

  it("records what changed about it, in the log", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");
    wired.appended.length = 0;

    const edited = await edit(wired, made.value.id, { name: "Links" });
    expect(edited.kind).toBe("ok");

    expect(wired.appended).toEqual([
      expect.objectContaining({
        kind: "template-edited",
        by: { kind: "person" },
        detail: expect.objectContaining({
          template: made.value.id,
          name: "Links",
          destination: draft.destination,
          capability: draft.capability,
        }),
      }),
    ]);
    expect(wired.appended[0]?.detail).not.toHaveProperty("tag");
  });

  it("appends nothing where nothing changed", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");
    wired.appended.length = 0;
    wired.enqueued.length = 0;

    const edited = await edit(wired, made.value.id, { name: draft.name });

    expect(edited.kind).toBe("ok");
    expect(wired.appended).toEqual([]);
    expect(wired.enqueued).toEqual([]);
  });

  it("refuses a template that is not there", async () => {
    const wired = ports();

    const edited = await edit(wired, "tpl-nobody" as RoutingTemplateId, {
      name: "x",
    });

    expect(edited).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-template" },
    });
  });
});

describe("what a template asks for", () => {
  const asking = { ...draft, asked: { heading: { label: "list" } } };

  it("keeps the fields it asks for, with their labels", async () => {
    const made = await create(ports(), asking);

    expect(made.kind === "ok" && made.value.asked).toEqual({
      heading: { label: "list" },
    });
  });

  it("stores asking for nothing as not asking at all", async () => {
    const made = await create(ports(), { ...draft, asked: {} });

    expect(made.kind === "ok" && "asked" in made.value).toBe(false);
  });

  it.each([["folder"], [" "]])(
    "refuses to ask for %j, before anything is written",
    async (field) => {
      const wired = ports();

      const made = await create(wired, { ...draft, asked: { [field]: {} } });

      expect(made).toEqual({
        kind: "refused",
        refusal: { kind: "asked-invalid", field },
      });
      expect(wired.held.size).toBe(0);
    },
  );

  it("refuses an edit asking for the folder mode", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, {
      asked: { folder: {} },
    });

    expect(edited).toMatchObject({
      kind: "refused",
      refusal: { kind: "asked-invalid", field: "folder" },
    });
    expect(wired.held.get(made.value.id)?.asked).toBeUndefined();
  });

  it("starts asking on an edit, and says it changed", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");
    wired.appended.length = 0;

    const edited = await edit(wired, made.value.id, {
      asked: { heading: {} },
    });

    expect(edited.kind === "ok" && edited.value.asked).toEqual({
      heading: {},
    });
    expect(wired.appended.map((each) => each.kind)).toEqual([
      "template-edited",
    ]);
  });

  it("stops asking where an edit asks for nothing", async () => {
    const wired = ports();
    const made = await create(wired, asking);
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, { asked: {} });

    expect(edited.kind === "ok" && "asked" in edited.value).toBe(false);
  });

  it("leaves what it asks for alone where an edit does not mention it", async () => {
    const wired = ports();
    const made = await create(wired, asking);
    if (made.kind !== "ok") throw new Error("not created");

    const edited = await edit(wired, made.value.id, { name: "Todo" });

    expect(edited.kind === "ok" && edited.value.asked).toEqual(asking.asked);
  });

  it("appends nothing where it is asked for the same fields again", async () => {
    const wired = ports();
    const made = await create(wired, asking);
    if (made.kind !== "ok") throw new Error("not created");
    wired.appended.length = 0;

    await edit(wired, made.value.id, { asked: { heading: { label: "list" } } });

    expect(wired.appended).toEqual([]);
  });
});

describe("deleting a template", () => {
  it("removes it and owes the mirror a removal", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");
    wired.enqueued.length = 0;

    const gone = await remove(wired, made.value.id);

    expect(gone.kind).toBe("ok");
    expect(await list(wired)).toEqual([]);
    expect(wired.enqueued).toEqual([
      expect.objectContaining({
        kind: "mirror-remove",
        subject: { kind: "template", template: made.value.id },
      }),
    ]);
  });

  it("names what it removed, in the log", async () => {
    const wired = ports();
    const made = await create(wired, draft);
    if (made.kind !== "ok") throw new Error("not created");
    wired.appended.length = 0;

    await remove(wired, made.value.id);

    expect(wired.appended).toEqual([
      expect.objectContaining({
        kind: "template-deleted",
        by: { kind: "person" },
        detail: { template: made.value.id, name: draft.name },
      }),
    ]);
  });

  it("refuses to remove a template that is not there", async () => {
    const wired = ports();

    const gone = await remove(wired, "tpl-nobody" as RoutingTemplateId);

    expect(gone).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-template" },
    });
  });

  it("frees the trigger tag it claimed", async () => {
    const wired = ports();
    const made = await create(wired, {
      ...draft,
      triggerTag: "route/research" as TagName,
    });
    if (made.kind !== "ok") throw new Error("not created");
    await remove(wired, made.value.id);

    const again = await create(wired, {
      ...draft,
      triggerTag: "route/research" as TagName,
    });

    expect(again.kind).toBe("ok");
  });
});
