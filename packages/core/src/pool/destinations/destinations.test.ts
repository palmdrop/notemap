import { describe, expect, it } from "vitest";

import {
  fakeDestinationRow,
  fakeDestinations,
  fakeKind,
} from "#testing/destination";
import type {
  PoolPorts,
  PoolStore,
  PoolTx,
  SchemaValidator,
} from "#types/api/ports";
import type { Action } from "#types/domain/action-log";
import type { Destination, DestinationRecord } from "#types/domain/destination";
import type {
  CapabilityName,
  DestinationId,
  DestinationKindName,
  ItemId,
  MintableId,
  PayloadTypeName,
  RoutingRecordId,
  RoutingTemplateId,
  SourceId,
  Timestamp,
} from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { Job } from "#types/domain/work";
import type { RoutingRecord } from "#types/domain/routing";
import type { RoutingTemplate } from "#types/domain/template";
import type { JsonObject, JsonSchema } from "#types/json";
import { Unusable } from "./usability";
import { deliveryFor } from "../routing/delivery";

import { candidates as candidatesFor, NotOffered } from "./candidates";
import { create, edit, remove, retire, unretire } from "./lifecycle";
import { probe as probeOne, Rejected } from "./probe";
import { describe as describeOne, list } from "./reports";

const FILESYSTEM = "filesystem" as DestinationKindName;

const ROOT_REQUIRED: JsonSchema = {
  type: "object",
  required: ["root"],
  properties: { root: { type: "string" } },
};

/** Honours `required` and nothing else, which is the whole of what these tests turn on. */
const schemas: SchemaValidator = {
  validate: (schema, value) => {
    const required = schema["required"];
    if (!Array.isArray(required)) return [];

    return required
      .filter((key) => (value as JsonObject)[String(key)] === undefined)
      .map((key) => ({ path: `/${String(key)}`, keyword: "required" }));
  },
};

type Wiring = {
  readonly destinations?: readonly Destination[];
  readonly kinds?: readonly { name: string; settingsSchema?: JsonSchema }[];
  readonly records?: readonly RoutingRecord[];
  readonly items?: readonly Item[];
  readonly templates?: readonly RoutingTemplate[];
};

type Wired = PoolPorts & {
  readonly held: ReadonlyMap<DestinationId, Destination>;
  readonly appended: readonly Action[];
  readonly enqueued: readonly Job[];
  readonly adapters: ReturnType<typeof fakeDestinations>;
};

/**
 * Only what a destination's lifecycle reaches for. The rest of `PoolPorts`
 * stays unbuilt rather than stubbed into existence.
 */
function ports(wiring: Wiring = {}): Wired {
  const held = new Map<DestinationId, Destination>(
    (wiring.destinations ?? []).map((each) => [each.id, each]),
  );
  const records = [...(wiring.records ?? [])];
  const items = new Map<ItemId, Item>(
    (wiring.items ?? []).map((each) => [each.id, each]),
  );
  const appended: Action[] = [];
  const enqueued: Job[] = [];

  let minted = 0;
  let ticks = 0;

  const adapters = fakeDestinations({
    kinds: (
      wiring.kinds ?? [{ name: FILESYSTEM, settingsSchema: undefined }]
    ).map((each) =>
      fakeKind({
        name: each.name,
        ...(each.settingsSchema === undefined
          ? {}
          : { settingsSchema: each.settingsSchema }),
      }),
    ),
  });

  const stamp = (record: DestinationRecord): Destination => {
    const stored: Destination = {
      ...record,
      modifiedAt: `2026-08-17T10:00:0${String(ticks)}.000Z` as Timestamp,
    };
    held.set(stored.id, stored);
    return stored;
  };

  const reads = {
    destinations: async (): Promise<readonly Destination[]> => [
      ...held.values(),
    ],
    destination: async (id: DestinationId) => held.get(id),
    destinationEverNamed: async (id: DestinationId) =>
      records.some(
        (record) =>
          record.target.kind === "destination" &&
          record.target.destination === id,
      ),
    routingRecord: async (id: RoutingRecordId) =>
      records.find((record) => record.id === id),
    routingTemplatesNaming: async (id: DestinationId) =>
      (wiring.templates ?? []).filter((each) => each.destination === id),
    item: async (id: ItemId) => items.get(id),
    artifacts: async () => [],
    asset: async () => undefined,
  };

  const tx = {
    ...reads,
    insertDestination: async (record: DestinationRecord) => stamp(record),
    updateDestination: async (record: DestinationRecord) => stamp(record),
    deleteDestination: async (id: DestinationId) => {
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
    adapters,
    store,
    schemas,
    destinations: adapters,
    mirrorWriter: {} as PoolPorts["mirrorWriter"],
    clock: {
      now: () => `2026-08-17T11:00:0${String(ticks++)}.000Z` as Timestamp,
    },
    ids: {
      next: <T extends MintableId>() => `minted-${String(++minted)}` as T,
    },
  } as unknown as Wired;
}

/** What the log says happened to one destination, in order. */
function kinds(wired: Wired, id: string): readonly string[] {
  return wired.appended
    .filter((action) => action.detail?.["destination"] === id)
    .map((action) => action.kind);
}

function mirrorWritesFor(wired: Wired, id: string): number {
  return wired.enqueued.filter(
    (job) =>
      job.kind === "mirror" &&
      job.subject.kind === "destination" &&
      job.subject.destination === id,
  ).length;
}

describe("creating a destination", () => {
  it("refuses settings the kind's schema does not accept, with the issues", async () => {
    const wired = ports({
      kinds: [{ name: FILESYSTEM, settingsSchema: ROOT_REQUIRED }],
    });

    const result = await create(wired, {
      name: "Vault",
      kind: FILESYSTEM,
      settings: { accepts: ["text"] },
    });

    expect(result).toEqual({
      kind: "refused",
      refusal: {
        kind: "invalid-destination-settings",
        issues: [{ path: "/root", keyword: "required" }],
      },
    });
    expect(wired.held.size).toBe(0);
  });

  it("refuses a kind nothing here speaks", async () => {
    const result = await create(ports(), {
      name: "Board",
      kind: "kanban" as DestinationKindName,
      settings: {},
    });

    expect(result).toEqual({
      kind: "refused",
      refusal: { kind: "unknown-destination-kind", destinationKind: "kanban" },
    });
  });

  it("mints a row and appends an entry naming it", async () => {
    const wired = ports({
      kinds: [{ name: FILESYSTEM, settingsSchema: ROOT_REQUIRED }],
    });

    const result = await create(wired, {
      name: "Vault",
      kind: FILESYSTEM,
      settings: { root: "~/notes" },
    });

    expect(result.kind).toBe("ok");
    expect([...wired.held.values()]).toEqual([
      expect.objectContaining({ name: "Vault", settings: { root: "~/notes" } }),
    ]);
    expect(wired.appended.map((each) => each.kind)).toEqual([
      "destination-created",
    ]);
    expect(wired.appended[0]?.detail["destination"]).toBe("minted-1");
    // A destination is not an item, so the entry names it in its detail instead.
    expect(wired.appended[0]?.subject).toBeUndefined();
  });
});

describe("what a destination reports about itself", () => {
  it("is unusable where no adapter speaks its kind, and the row is left alone", async () => {
    const stale = fakeDestinationRow({ id: "old", kind: "kanban" });
    const wired = ports({ destinations: [stale] });

    expect(await describeOne(wired, stale.id)).toEqual({
      kind: "unusable",
      detail: "nothing here speaks the kanban kind",
    });
    expect(await list(wired)).toEqual([stale]);
  });

  it("is unusable where its settings no longer satisfy the kind", async () => {
    const drifted = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({
      destinations: [drifted],
      kinds: [{ name: FILESYSTEM, settingsSchema: ROOT_REQUIRED }],
    });

    expect(await describeOne(wired, drifted.id)).toEqual({
      kind: "unusable",
      detail:
        "its settings no longer satisfy the filesystem kind: /root required",
    });
  });

  it("is undescribable where the adapter went and looked and could not say", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.cannotDescribe("ENOENT: ~/notes");

    expect(await describeOne(wired, vault.id)).toEqual({
      kind: "undescribable",
      detail: "ENOENT: ~/notes",
    });
  });

  it("is unusable where the adapter itself says so, distinct from undescribable", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.cannotDescribe(
      new Unusable("/vault overlaps notemap's own state"),
    );

    expect(await describeOne(wired, vault.id)).toEqual({
      kind: "unusable",
      detail: "/vault overlaps notemap's own state",
    });
  });

  it("answers nothing at all for an id no destination has", async () => {
    expect(
      await describeOne(ports(), "ghost" as DestinationId),
    ).toBeUndefined();
  });
});

describe("what a destination answers when it is asked whether it is there", () => {
  it("is unusable before it is ever asked, on the same terms as describing it", async () => {
    const stale = fakeDestinationRow({ id: "old", kind: "kanban" });
    const wired = ports({ destinations: [stale] });

    expect(await probeOne(wired, stale.id)).toEqual({
      kind: "unusable",
      detail: "nothing here speaks the kanban kind",
    });
  });

  it("is ready where the adapter reached it and said nothing", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });

    expect(await probeOne(wired, vault.id)).toEqual({ kind: "ready" });
  });

  it("is rejected where it answered and said no", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.cannotBeProbed(
      new Rejected("no webdav account named home is configured"),
    );

    expect(await probeOne(wired, vault.id)).toEqual({
      kind: "rejected",
      detail: "no webdav account named home is configured",
    });
  });

  it("is unreachable where it could not be reached at all", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.cannotBeProbed("ECONNREFUSED");

    expect(await probeOne(wired, vault.id)).toEqual({
      kind: "unreachable",
      detail: "ECONNREFUSED",
    });
  });

  it("is unusable where the adapter itself says so", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.cannotBeProbed(
      new Unusable("/vault overlaps notemap's own state"),
    );

    expect(await probeOne(wired, vault.id)).toEqual({
      kind: "unusable",
      detail: "/vault overlaps notemap's own state",
    });
  });

  it("is not-offered where the kind does not do this at all", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.cannotBeProbed(
      new NotOffered("the filesystem kind cannot be probed"),
    );

    expect(await probeOne(wired, vault.id)).toEqual({ kind: "not-offered" });
  });

  it("answers nothing at all for an id no destination has", async () => {
    expect(await probeOne(ports(), "ghost" as DestinationId)).toBeUndefined();
  });
});

describe("what a destination answers about its candidates", () => {
  const request = {
    capability: "create-note" as CapabilityName,
    field: "directory",
  };

  it("is unusable before it is ever asked, on the same terms as describing it", async () => {
    const stale = fakeDestinationRow({ id: "old", kind: "kanban" });
    const wired = ports({ destinations: [stale] });

    expect(await candidatesFor(wired, stale.id, request)).toEqual({
      kind: "unusable",
      detail: "nothing here speaks the kanban kind",
    });
  });

  it("is answered where the adapter has entries to offer", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.answersCandidates({
      entries: [{ label: "Inbox", value: "inbox", scope: "inbox" }],
      truncated: false,
    });

    expect(await candidatesFor(wired, vault.id, request)).toEqual({
      kind: "answered",
      entries: [{ label: "Inbox", value: "inbox", scope: "inbox" }],
      truncated: false,
    });
  });

  it("is unreachable where the adapter went and asked and could not say", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.cannotAnswerCandidates("ENOENT: ~/notes");

    expect(await candidatesFor(wired, vault.id, request)).toEqual({
      kind: "unreachable",
      detail: "ENOENT: ~/notes",
    });
  });

  it("is unusable where the adapter itself says so, distinct from unreachable", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.cannotAnswerCandidates(
      new Unusable("/vault overlaps notemap's own state"),
    );

    expect(await candidatesFor(wired, vault.id, request)).toEqual({
      kind: "unusable",
      detail: "/vault overlaps notemap's own state",
    });
  });

  it("is not-offered where the kind does not do this at all", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const wired = ports({ destinations: [vault] });
    wired.adapters.cannotAnswerCandidates(
      new NotOffered("the filesystem kind does not offer candidates"),
    );

    expect(await candidatesFor(wired, vault.id, request)).toEqual({
      kind: "not-offered",
    });
  });

  it("answers nothing at all for an id no destination has", async () => {
    expect(
      await candidatesFor(ports(), "ghost" as DestinationId, request),
    ).toBeUndefined();
  });
});

describe("retiring a destination", () => {
  it("leaves a pending delivery to land", async () => {
    const vault = fakeDestinationRow({ id: "vault", kind: FILESYSTEM });
    const item: Item = {
      id: "item-1" as ItemId,
      source: "web" as SourceId,
      sourceItemId: "one",
      payload: {
        type: "text" as PayloadTypeName,
        content: { text: "a thought" },
        metadata: {},
        assets: [],
      },
      tags: [],
      createdAt: "2026-08-17T09:00:00.000Z" as Timestamp,
      modifiedAt: "2026-08-17T09:00:00.000Z" as Timestamp,
      revisedInto: [],
    };
    const record: RoutingRecord = {
      id: "record-1" as RoutingRecordId,
      item: item.id,
      target: {
        kind: "destination",
        destination: vault.id,
        capability: "create-note" as CapabilityName,
        arguments: { directory: "inbox" },
      },
      state: "pending",
      at: "2026-08-17T09:30:00.000Z" as Timestamp,
    };

    const wired = ports({
      destinations: [vault],
      items: [item],
      records: [record],
    });

    expect((await retire(wired, vault.id)).kind).toBe("ok");
    expect(wired.held.get(vault.id)?.retiredAt).toBeDefined();

    const attemptable = await deliveryFor(wired, record.id);
    expect(attemptable?.kind).toBe("ready");
  });

  it("refuses a second one rather than overwriting when the first happened", async () => {
    const wired = ports({
      destinations: [
        fakeDestinationRow({
          id: "vault",
          kind: FILESYSTEM,
          retiredAt: "2026-08-16T09:00:00.000Z",
        }),
      ],
    });

    expect(await retire(wired, "vault" as DestinationId)).toEqual({
      kind: "refused",
      refusal: {
        kind: "already-retired",
        destination: "vault",
        at: "2026-08-16T09:00:00.000Z",
      },
    });
  });

  it("offers it again, and refuses unretiring one that was never retired", async () => {
    const wired = ports({
      destinations: [
        fakeDestinationRow({
          id: "vault",
          kind: FILESYSTEM,
          retiredAt: "2026-08-16T09:00:00.000Z",
        }),
      ],
    });

    expect((await unretire(wired, "vault" as DestinationId)).kind).toBe("ok");
    expect(wired.held.get("vault" as DestinationId)?.retiredAt).toBeUndefined();

    expect(await unretire(wired, "vault" as DestinationId)).toEqual({
      kind: "refused",
      refusal: { kind: "not-retired", destination: "vault" },
    });
  });
});

describe("deleting a destination", () => {
  const referenced: RoutingRecord = {
    id: "record-1" as RoutingRecordId,
    item: "item-1" as ItemId,
    target: {
      kind: "destination",
      destination: "vault" as DestinationId,
      capability: "create-note" as CapabilityName,
      arguments: {},
    },
    state: "delivered",
    at: "2026-08-17T09:30:00.000Z" as Timestamp,
  };

  it("is refused where a record has ever named it, and the row stays", async () => {
    const wired = ports({
      destinations: [fakeDestinationRow({ id: "vault", kind: FILESYSTEM })],
      records: [referenced],
    });

    expect(await remove(wired, "vault" as DestinationId)).toEqual({
      kind: "refused",
      refusal: { kind: "destination-in-use", destination: "vault" },
    });
    expect(wired.held.size).toBe(1);
  });

  it("goes where none ever has, and the entry outlives the row", async () => {
    const wired = ports({
      destinations: [fakeDestinationRow({ id: "typo", kind: FILESYSTEM })],
    });

    expect((await remove(wired, "typo" as DestinationId)).kind).toBe("ok");
    expect(wired.held.size).toBe(0);
    expect(wired.appended.map((each) => each.kind)).toEqual([
      "destination-deleted",
    ]);
  });

  it("goes where a template names it, and the entry says which it stranded", async () => {
    const wired = ports({
      destinations: [fakeDestinationRow({ id: "vault", kind: FILESYSTEM })],
      templates: [
        {
          id: "tpl-research" as RoutingTemplateId,
          name: "Research links",
          destination: "vault" as DestinationId,
          capability: "create-file" as CapabilityName,
          arguments: {},
          folder: "create",
          createdAt: "2026-09-05T08:00:00.000Z" as Timestamp,
          modifiedAt: "2026-09-05T08:00:00.000Z" as Timestamp,
          fired: { records: 0 },
        },
      ],
    });

    expect((await remove(wired, "vault" as DestinationId)).kind).toBe("ok");
    expect(wired.appended.at(-1)?.detail).toMatchObject({
      stranded: ["tpl-research"],
    });
  });
});

describe("editing a destination", () => {
  it("checks new settings against the kind before writing them", async () => {
    const wired = ports({
      destinations: [
        fakeDestinationRow({
          id: "vault",
          kind: FILESYSTEM,
          settings: { root: "~/notes" },
        }),
      ],
      kinds: [{ name: FILESYSTEM, settingsSchema: ROOT_REQUIRED }],
    });

    expect(
      await edit(wired, "vault" as DestinationId, {
        settings: { accepts: [] },
      }),
    ).toEqual({
      kind: "refused",
      refusal: {
        kind: "invalid-destination-settings",
        issues: [{ path: "/root", keyword: "required" }],
      },
    });
    expect(wired.held.get("vault" as DestinationId)?.settings).toEqual({
      root: "~/notes",
    });
  });

  /** The code that understood it may come back, and nothing else can check the settings. */
  it("refuses to reconfigure a kind nothing here speaks", async () => {
    const wired = ports({
      destinations: [fakeDestinationRow({ id: "old", kind: "kanban" })],
    });

    expect(
      await edit(wired, "old" as DestinationId, {
        settings: { column: "inbox" },
      }),
    ).toEqual({
      kind: "refused",
      refusal: { kind: "unknown-destination-kind", destinationKind: "kanban" },
    });
  });

  /** A rename cannot be checked against the kind, so it does not ask. */
  it("renames one whose kind nothing here speaks", async () => {
    const wired = ports({
      destinations: [fakeDestinationRow({ id: "old", kind: "kanban" })],
    });

    const renamed = await edit(wired, "old" as DestinationId, {
      name: "The old board",
    });

    expect(renamed).toMatchObject({
      kind: "ok",
      value: { name: "The old board" },
    });
    expect(kinds(wired, "old")).toEqual(["destination-renamed"]);
  });

  it("changes both halves in one go, appending an entry for each", async () => {
    const wired = ports({
      destinations: [
        fakeDestinationRow({
          id: "vault",
          kind: FILESYSTEM,
          settings: { root: "~/notes" },
        }),
      ],
      kinds: [{ name: FILESYSTEM, settingsSchema: ROOT_REQUIRED }],
    });

    const edited = await edit(wired, "vault" as DestinationId, {
      name: "Second brain",
      settings: { root: "~/second-brain" },
    });

    expect(edited).toMatchObject({
      kind: "ok",
      value: { name: "Second brain", settings: { root: "~/second-brain" } },
    });
    expect(kinds(wired, "vault")).toEqual([
      "destination-reconfigured",
      "destination-renamed",
    ]);
    expect(mirrorWritesFor(wired, "vault")).toBe(1);
  });

  /** A save from a form that changed nothing is not a change. */
  it("writes nothing where neither half differs", async () => {
    const wired = ports({
      destinations: [
        fakeDestinationRow({
          id: "vault",
          name: "Vault",
          kind: FILESYSTEM,
          settings: { root: "~/notes" },
        }),
      ],
      kinds: [{ name: FILESYSTEM, settingsSchema: ROOT_REQUIRED }],
    });

    const edited = await edit(wired, "vault" as DestinationId, {
      name: "Vault",
      settings: { root: "~/notes" },
    });

    expect(edited).toMatchObject({ kind: "ok" });
    expect(kinds(wired, "vault")).toEqual([]);
    expect(mirrorWritesFor(wired, "vault")).toBe(0);
  });
});
