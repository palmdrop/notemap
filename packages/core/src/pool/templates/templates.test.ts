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
const CREATE_FILE = "create-file" as CapabilityName;

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
  capability: CREATE_FILE,
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

  it("owes the mirror a write and says so in the log", async () => {
    const wired = ports();

    const made = await create(wired, draft);
    expect(made.kind).toBe("ok");
    if (made.kind !== "ok") return;

    expect(wired.appended.map((action) => action.kind)).toEqual([
      "template-created",
    ]);
    expect(wired.enqueued).toEqual([
      expect.objectContaining({
        kind: "mirror",
        subject: { kind: "template", template: made.value.id },
      }),
    ]);
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
      capability: "append-to-file" as CapabilityName,
    });

    expect(edited.kind).toBe("ok");
    if (edited.kind !== "ok") return;
    expect(edited.value.establishedAt).toBeUndefined();
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
