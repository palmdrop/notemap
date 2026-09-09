import type {
  Action,
  CapabilityName,
  JsonSchema,
  DestinationId,
  Item,
  ItemId,
  Page,
  Pool,
  RoutingTemplateDraft,
  RoutingTemplateId,
  TagName,
} from "@notemap/core";
import { PATH_FIELD } from "@notemap/core";
import { fakeCapability, fakeDestinations } from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { deliverWith, envelope, harness, type Harness } from "./fixture";

const VAULT = "vault" as DestinationId;
const CREATE_NOTE = "create-note" as CapabilityName;
const PERSON = { kind: "person" } as const;
const ALL: Page = { limit: 50 };
const RESEARCH = "route/research" as TagName;

/** The fixture's clock starts here, and the window is fifteen seconds wide. */
const CAPTURED_AT = "2026-08-06T09:00:00.000Z";
const INSIDE = "2026-08-06T09:00:10.000Z";
const AFTER = "2026-08-06T09:00:20.000Z";

const PATH_SCHEMA = {
  type: "object",
  required: ["path"],
  properties: {
    path: { type: "string" },
    folder: { type: "string", enum: ["create", "require"] },
  },
  additionalProperties: false,
};

/** A capability that writes nothing into a folder, and so declares no mode. */
const FOLDERLESS_SCHEMA = {
  type: "object",
  required: ["path"],
  properties: { path: { type: "string" } },
  additionalProperties: false,
};

const DELIVERED = {
  kind: "delivered",
  pointer: "vault/research/2026-09-05.md",
} as const;

const open: Harness[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

async function pooled(schema: JsonSchema = PATH_SCHEMA) {
  const destination = fakeDestinations({
    capabilities: [
      fakeCapability({ name: "create-note", argumentsSchema: schema }),
    ],
  });
  const opened = harness(undefined, "stub", destination);
  open.push(opened);
  await opened.putDestination({ id: VAULT });
  destination.answers(DELIVERED);
  return { ...opened, destination, deliver: deliverWith(opened, destination) };
}

const queued = async (pool: Pool): Promise<readonly ItemId[]> =>
  (await pool.views.queue(ALL)).values.map((each) => each.id);

const tagsOn = async (pool: Pool, item: ItemId): Promise<readonly string[]> =>
  ((await pool.items.get(item))?.tags ?? []).map((held) => held.name);

const logFor = async (pool: Pool, item: ItemId): Promise<readonly Action[]> =>
  (await pool.actions.forItem(item, ALL)).values;

function succeeded<T>(
  result: { kind: "ok"; value: T } | { kind: "refused"; refusal: unknown },
): T {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

function captured(result: Awaited<ReturnType<Pool["capture"]>>): Item {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value.item;
}

const draft = (
  overrides: Partial<RoutingTemplateDraft> = {},
): RoutingTemplateDraft => ({
  name: "Research links",
  destination: VAULT,
  capability: CREATE_NOTE,
  arguments: { path: "research/{{captured_at}}.md" },
  ...overrides,
});

describe("saving a template with a pattern in it", () => {
  it("refuses a field no item has, while the person is still looking at it", async () => {
    const { pool } = await pooled();

    const made = await pool.templates.create(
      draft({ arguments: { path: "research/{{captured}}.md" } }),
    );

    expect(made).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-pattern-field", field: "captured" },
    });
  });

  it("refuses a format nobody named, rather than learning a date language", async () => {
    const { pool } = await pooled();

    const made = await pool.templates.create(
      draft({ arguments: { path: "{{captured_at:YYYY-MM-DD}}.md" } }),
    );

    expect(made).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-pattern-format", format: "YYYY-MM-DD" },
    });
  });

  it("refuses one an edit would introduce, on the same terms", async () => {
    const { pool } = await pooled();
    const template = succeeded(await pool.templates.create(draft()));

    const edited = await pool.templates.edit(template.id, {
      arguments: { path: "{{nope}}.md" },
    });

    expect(edited).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-pattern-field" },
    });
  });
});

describe("what a template would route an item as", () => {
  it("answers the destination, the capability and the expanded place", async () => {
    const { pool } = await pooled();
    const template = succeeded(await pool.templates.create(draft()));
    const item = captured(
      await pool.capture(
        envelope({ capturedAt: "2026-09-05T20:32:00.000Z", utcOffset: 120 }),
      ),
    );

    expect(await pool.templates.resolve(item.id, template.id)).toEqual({
      destination: VAULT,
      capability: CREATE_NOTE,
      arguments: { path: "research/2026-09-05.md" },
    });
  });

  it("reserves nothing, so the item is still in the queue", async () => {
    const { pool } = await pooled();
    const template = succeeded(await pool.templates.create(draft()));
    const item = captured(await pool.capture(envelope()));

    await pool.templates.resolve(item.id, template.id);

    expect(await pool.routing.recordsFor(item.id)).toEqual([]);
  });

  it("says nothing about a template that is not there", async () => {
    const { pool } = await pooled();
    const item = captured(await pool.capture(envelope()));

    expect(
      await pool.templates.resolve(item.id, "tpl-nobody" as RoutingTemplateId),
    ).toBeUndefined();
  });
});

describe("the folder a template asks for", () => {
  it("asks for nothing where it creates, which is what routing has always done", async () => {
    const { pool } = await pooled();
    const template = succeeded(await pool.templates.create(draft()));
    const item = captured(await pool.capture(envelope()));

    const resolved = await pool.templates.resolve(item.id, template.id);

    expect(resolved?.arguments["folder"]).toBeUndefined();
  });

  it("asks for the folder outright where it requires one", async () => {
    const { pool } = await pooled();
    const template = succeeded(
      await pool.templates.create(draft({ folder: "require" })),
    );
    const item = captured(await pool.capture(envelope()));

    const resolved = await pool.templates.resolve(item.id, template.id);

    expect(resolved?.arguments["folder"]).toBe("require");
  });

  it("creates once and requires after, which is what establish means", async () => {
    const { pool } = await pooled();
    const template = succeeded(
      await pool.templates.create(draft({ folder: "establish" })),
    );
    const first = captured(await pool.capture(envelope({ id: "item-1" })));
    const second = captured(await pool.capture(envelope({ id: "item-2" })));

    const before = await pool.templates.resolve(first.id, template.id);
    succeeded(await pool.templates.route(first.id, template.id));
    const after = await pool.templates.resolve(second.id, template.id);

    expect(before?.arguments["folder"]).toBeUndefined();
    expect(after?.arguments["folder"]).toBe("require");
    expect((await pool.templates.get(template.id))?.establishedAt).toEqual(
      expect.any(String),
    );
  });

  it("stays unestablished where the first delivery never landed", async () => {
    const { pool, destination } = await pooled();
    destination.answers({ kind: "unreachable", detail: "ECONNREFUSED" });
    const template = succeeded(
      await pool.templates.create(draft({ folder: "establish" })),
    );
    const item = captured(await pool.capture(envelope()));

    succeeded(await pool.templates.route(item.id, template.id));

    expect(
      (await pool.templates.get(template.id))?.establishedAt,
    ).toBeUndefined();
  });

  it("loses its establishment when the place is edited, since that is a different place", async () => {
    const { pool } = await pooled();
    const template = succeeded(
      await pool.templates.create(draft({ folder: "establish" })),
    );
    const item = captured(await pool.capture(envelope()));
    succeeded(await pool.templates.route(item.id, template.id));

    const edited = succeeded(
      await pool.templates.edit(template.id, {
        arguments: { path: "reading/{{captured_at}}.md" },
      }),
    );

    expect(edited.establishedAt).toBeUndefined();
  });

  it("keeps it through a rename, which moves nothing", async () => {
    const { pool } = await pooled();
    const template = succeeded(
      await pool.templates.create(draft({ folder: "establish" })),
    );
    const item = captured(await pool.capture(envelope()));
    succeeded(await pool.templates.route(item.id, template.id));

    const edited = succeeded(
      await pool.templates.edit(template.id, { name: "Research" }),
    );

    expect(edited.establishedAt).toEqual(expect.any(String));
  });

  it("hands the item back where the folder it required is gone", async () => {
    const { pool, destination } = await pooled();
    destination.answers({
      kind: "rejected",
      detail: "research/2026/ is missing",
    });
    const template = succeeded(
      await pool.templates.create(draft({ folder: "require" })),
    );
    const item = captured(await pool.capture(envelope()));

    const refusal = await pool.templates.route(item.id, template.id);

    expect(refusal).toMatchObject({
      kind: "refused",
      refusal: {
        kind: "rejected-by-destination",
        detail: "research/2026/ is missing",
      },
    });
    // Abandoned on the first attempt: no reservation, and the item is back.
    expect(await pool.routing.recordsFor(item.id)).toEqual([]);
    expect(
      (await pool.views.queue({ limit: 50 })).values.map((each) => each.id),
    ).toEqual([item.id]);
  });
});

describe("a capability that declares no folder mode", () => {
  it("takes a template that creates, since creating is what it already did", async () => {
    const { pool } = await pooled(FOLDERLESS_SCHEMA);
    const template = succeeded(await pool.templates.create(draft()));
    const item = captured(await pool.capture(envelope()));

    expect((await pool.templates.route(item.id, template.id)).kind).toBe("ok");
  });

  it("refuses one that requires a folder it cannot promise", async () => {
    const { pool } = await pooled(FOLDERLESS_SCHEMA);
    const template = succeeded(
      await pool.templates.create(draft({ folder: "require" })),
    );
    const item = captured(await pool.capture(envelope()));

    expect(await pool.templates.route(item.id, template.id)).toMatchObject({
      kind: "refused",
      refusal: { kind: "arguments-invalid" },
    });
  });
});

describe("routing from a template", () => {
  it("stores the expanded arguments, so the record names a place a person can read", async () => {
    const { pool } = await pooled();
    const template = succeeded(await pool.templates.create(draft()));
    const item = captured(
      await pool.capture(
        envelope({ capturedAt: "2026-09-05T20:32:00.000Z", utcOffset: 120 }),
      ),
    );

    const record = succeeded(await pool.templates.route(item.id, template.id));

    expect(record.target).toMatchObject({
      kind: "destination",
      destination: VAULT,
      capability: CREATE_NOTE,
      arguments: { path: "research/2026-09-05.md" },
    });
  });

  it("names the template it came from, and says a person took it", async () => {
    const { pool } = await pooled();
    const template = succeeded(await pool.templates.create(draft()));
    const item = captured(await pool.capture(envelope()));

    const record = succeeded(await pool.templates.route(item.id, template.id));

    expect(record.applied).toEqual({
      template: template.id,
      firedByTag: false,
    });
    expect((await pool.routing.recordsFor(item.id))[0]?.applied).toEqual({
      template: template.id,
      firedByTag: false,
    });
  });

  it("says a tag applied it where the tag did", async () => {
    const { pool } = await pooled();
    const template = succeeded(
      await pool.templates.create(
        draft({ triggerTag: "route/research" as TagName }),
      ),
    );
    const item = captured(await pool.capture(envelope()));

    const record = succeeded(
      await pool.templates.route(item.id, template.id, { firedByTag: true }),
    );

    expect(record.applied?.firedByTag).toBe(true);
  });

  it("validates the expanded arguments as a hand-made set is validated", async () => {
    const { pool } = await pooled();
    const template = succeeded(
      await pool.templates.create(
        draft({ arguments: { elsewhere: "{{captured_at}}" } }),
      ),
    );
    const item = captured(await pool.capture(envelope()));

    expect(await pool.templates.route(item.id, template.id)).toMatchObject({
      kind: "refused",
      refusal: { kind: "arguments-invalid" },
    });
  });

  it("refuses a template that is not there", async () => {
    const { pool } = await pooled();
    const item = captured(await pool.capture(envelope()));

    expect(
      await pool.templates.route(item.id, "tpl-nobody" as RoutingTemplateId),
    ).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-template" },
    });
  });
});

/**
 * The gesture this whole plan exists for. Nothing is attempted while the window
 * is open, which is what makes the corner's cancel real rather than a control
 * that works or does not depending on what somebody configured.
 */
describe("a trigger tag applying its template", () => {
  async function tagged(overrides: Partial<RoutingTemplateDraft> = {}) {
    const opened = await pooled();
    const template = succeeded(
      await opened.pool.templates.create(
        draft({ triggerTag: RESEARCH, ...overrides }),
      ),
    );
    const item = captured(await opened.pool.capture(envelope()));
    const result = await opened.pool.items.tag(item.id, RESEARCH, PERSON);
    return { ...opened, template, item, result };
  }

  it("reserves, and hands the destination nothing at all", async () => {
    const { pool, destination, item, template } = await tagged();

    const [record] = await pool.routing.recordsFor(item.id);
    expect(record).toMatchObject({
      state: "pending",
      target: {
        destination: VAULT,
        arguments: { path: "research/2026-08-06.md" },
      },
      applied: { template: template.id, firedByTag: true },
    });
    expect(destination.received).toEqual([]);
  });

  it("commits the tag and the reservation together", async () => {
    const { pool, item, result } = await tagged();

    expect(result.kind).toBe("ok");
    expect(await tagsOn(pool, item.id)).toEqual([RESEARCH]);
    expect(await pool.routing.recordsFor(item.id)).toHaveLength(1);
    // Reserving takes it out of the queue, although nothing has arrived.
    expect(await queued(pool)).toEqual([]);
  });

  it("waits the window out before the delivery is claimable", async () => {
    const { clock, deliver, destination } = await tagged();

    clock.set(INSIDE);
    expect(await deliver()).toBe(0);
    expect(destination.received).toEqual([]);

    clock.set(AFTER);
    expect(await deliver()).toBe(1);
    expect(destination.received).toHaveLength(1);
  });

  it("says which template fired, so the log does not read as somebody taking one", async () => {
    const { pool, item, template } = await tagged();

    expect(
      (await logFor(pool, item.id)).find(
        (one) => one.kind === "template-fired",
      ),
    ).toMatchObject({
      detail: { template: template.id, name: "Research links", tag: RESEARCH },
    });
  });

  it("fires nothing on a tag the item already carries", async () => {
    const { pool, item } = await tagged();

    succeeded(await pool.items.tag(item.id, RESEARCH, PERSON));

    expect(await pool.routing.recordsFor(item.id)).toHaveLength(1);
  });

  it("fires nothing for a revision that carries it over", async () => {
    const { pool, item } = await tagged();

    const outcome = succeeded(
      await pool.items.edit(
        item.id,
        {
          source: item.source,
          sourceItemId: "edit-1",
          payload: { ...item.payload, content: { text: "a second thought" } },
        },
        PERSON,
      ),
    );
    if (outcome.kind !== "revised") throw new Error("expected a revision");

    expect(await tagsOn(pool, outcome.revision.id)).toEqual([RESEARCH]);
    expect(await pool.routing.recordsFor(outcome.revision.id)).toEqual([]);
  });

  it("fires from a capture that arrives already carrying it", async () => {
    const { pool, destination } = await pooled();
    succeeded(await pool.templates.create(draft({ triggerTag: RESEARCH })));

    const item = captured(
      await pool.capture(
        envelope({ capturedAt: CAPTURED_AT, tags: ["route/research"] }),
      ),
    );

    expect(await pool.routing.recordsFor(item.id)).toMatchObject([
      { state: "pending", applied: { firedByTag: true } },
    ]);
    expect(destination.received).toEqual([]);
  });
});

/**
 * A stale template is the person's to go and fix, and a tag that filed nothing
 * is spent the moment it lands — re-applying it would be absorbed. So the tag
 * does not land at all. A destination that merely could not be *reached* is not
 * this: that is the delivery's business, and the reservation waits it out.
 */
describe("a trigger tag whose template cannot route", () => {
  it("refuses the tag and writes nothing", async () => {
    const { pool } = await pooled();
    const template = succeeded(
      await pool.templates.create(
        draft({ triggerTag: RESEARCH, arguments: { elsewhere: "no" } }),
      ),
    );
    const item = captured(await pool.capture(envelope()));

    expect(await pool.items.tag(item.id, RESEARCH, PERSON)).toMatchObject({
      kind: "refused",
      refusal: {
        kind: "trigger-refused",
        tag: RESEARCH,
        template: template.id,
      },
    });
    expect(await tagsOn(pool, item.id)).toEqual([]);
    expect(await pool.routing.recordsFor(item.id)).toEqual([]);
    expect(await queued(pool)).toEqual([item.id]);
  });

  it("refuses it where the destination was retired out from under it", async () => {
    const { pool } = await pooled();
    succeeded(await pool.templates.create(draft({ triggerTag: RESEARCH })));
    succeeded(await pool.destinations.retire(VAULT));
    const item = captured(await pool.capture(envelope()));

    expect(await pool.items.tag(item.id, RESEARCH, PERSON)).toMatchObject({
      kind: "refused",
      refusal: { kind: "trigger-refused" },
    });
    expect(await tagsOn(pool, item.id)).toEqual([]);
  });

  it("keeps the capture, and drops the tag, where a source supplied it", async () => {
    const { pool } = await pooled();
    succeeded(
      await pool.templates.create(
        draft({ triggerTag: RESEARCH, arguments: { elsewhere: "no" } }),
      ),
    );

    const item = captured(
      await pool.capture(envelope({ tags: ["route/research"] })),
    );

    // The capture stands and the item is work. The tag is gone rather than
    // spent: tagging is idempotent, so one that filed nothing could never file
    // this item once somebody had fixed the template.
    expect(await pool.routing.recordsFor(item.id)).toEqual([]);
    expect(await tagsOn(pool, item.id)).toEqual([]);
    expect(await queued(pool)).toEqual([item.id]);
  });
});

describe("a reservation a trigger tag made, removed without delivering", () => {
  async function fired() {
    const opened = await pooled();
    const template = succeeded(
      await opened.pool.templates.create(draft({ triggerTag: RESEARCH })),
    );
    const item = captured(await opened.pool.capture(envelope()));
    succeeded(await opened.pool.items.tag(item.id, RESEARCH, PERSON));
    const [record] = await opened.pool.routing.recordsFor(item.id);
    if (record === undefined) throw new Error("expected a reservation");
    return { ...opened, template, item, record };
  }

  it("takes the trigger tag with it when it is cancelled inside the window", async () => {
    const { pool, item, record, clock } = await fired();
    clock.set(INSIDE);

    succeeded(await pool.routing.cancelDelivery(record.id));

    expect(await tagsOn(pool, item.id)).toEqual([]);
    expect(await pool.routing.recordsFor(item.id)).toEqual([]);
    expect(await queued(pool)).toEqual([item.id]);
  });

  it("says the tag came off with the cancellation, so it does not read as removing itself", async () => {
    const { pool, item, record, template, clock } = await fired();
    clock.set(INSIDE);

    succeeded(await pool.routing.cancelDelivery(record.id));

    expect(
      (await logFor(pool, item.id)).find((one) => one.kind === "untagged"),
    ).toMatchObject({
      detail: { tag: RESEARCH, record: record.id, template: template.id },
    });
  });

  it("takes it back when the first attempt is abandoned", async () => {
    const { pool, destination, deliver, item, clock } = await fired();
    destination.answers({ kind: "rejected", detail: "research/ is missing" });

    clock.set(AFTER);
    await deliver();

    expect(await tagsOn(pool, item.id)).toEqual([]);
    expect(await pool.routing.recordsFor(item.id)).toEqual([]);
    expect(await queued(pool)).toEqual([item.id]);
  });

  it("leaves the tag where a delivery landed, since it says why the item went there", async () => {
    const { pool, deliver, item, clock } = await fired();

    clock.set(AFTER);
    await deliver();

    expect(await tagsOn(pool, item.id)).toEqual([RESEARCH]);
    expect(await pool.routing.recordsFor(item.id)).toMatchObject([
      { state: "delivered" },
    ]);
  });

  /**
   * The tag says why an item went where it went, so a route that never landed
   * takes it back however the template was reached. A tag the item wore before
   * the template existed is not an exception: nothing routes retroactively, so
   * it meant nothing until this decision gave it its meaning — and the decision
   * is what is being called off.
   */
  it("takes the tag with it where a person took the template in the composer", async () => {
    const { pool, destination } = await pooled();
    destination.answers({ kind: "unreachable", detail: "ECONNREFUSED" });

    const item = captured(
      await pool.capture(envelope({ tags: ["route/research"] })),
    );
    const template = succeeded(
      await pool.templates.create(draft({ triggerTag: RESEARCH })),
    );

    const record = succeeded(await pool.templates.route(item.id, template.id));
    expect(record.applied?.firedByTag).toBe(false);
    succeeded(await pool.routing.cancelDelivery(record.id));

    expect(await tagsOn(pool, item.id)).toEqual([]);
    expect(await pool.routing.recordsFor(item.id)).toEqual([]);
    expect(await queued(pool)).toEqual([item.id]);
  });
});

/**
 * The question every one of these answers: what does a template do against a
 * destination nobody had written when it was designed. Core reads what a
 * capability says about itself, so a kind whose places are a fixed set — a
 * board's columns, a mailbox, a webhook — needs no change anywhere.
 */
describe("a trigger tag that filed an item", () => {
  async function filed() {
    const opened = await pooled();
    const template = succeeded(
      await opened.pool.templates.create(draft({ triggerTag: RESEARCH })),
    );
    const item = captured(await opened.pool.capture(envelope()));
    succeeded(await opened.pool.items.tag(item.id, RESEARCH, PERSON));
    const [record] = await opened.pool.routing.recordsFor(item.id);
    if (record === undefined) throw new Error("expected a reservation");
    return { ...opened, template, item, record };
  }

  it("cannot be taken off while what it filed still stands", async () => {
    const { pool, item, template, record } = await filed();

    const refused = await pool.items.untag(item.id, RESEARCH, PERSON);

    expect(refused).toMatchObject({
      kind: "refused",
      refusal: {
        kind: "trigger-tag-held",
        tag: RESEARCH,
        template: template.id,
        record: record.id,
      },
    });
    expect(await tagsOn(pool, item.id)).toEqual([RESEARCH]);
  });

  it("cannot be taken off once the delivery has landed either", async () => {
    const { pool, deliver, item, clock } = await filed();
    clock.set(AFTER);
    await deliver();

    const refused = await pool.items.untag(item.id, RESEARCH, PERSON);

    expect(refused).toMatchObject({
      kind: "refused",
      refusal: { kind: "trigger-tag-held" },
    });
    expect(await tagsOn(pool, item.id)).toEqual([RESEARCH]);
  });

  it("is live again once the routing is cancelled, which is the way back", async () => {
    const { pool, item, record, clock } = await filed();
    clock.set(INSIDE);

    succeeded(await pool.routing.cancelDelivery(record.id));
    expect(await tagsOn(pool, item.id)).toEqual([]);

    // Nothing it filed stands, so the tag files again rather than being spent.
    succeeded(await pool.items.tag(item.id, RESEARCH, PERSON));

    expect(await pool.routing.recordsFor(item.id)).toHaveLength(1);
  });

  it("files nothing a second time where the record was made by hand", async () => {
    const { pool, destination } = await pooled();
    const template = succeeded(
      await pool.templates.create(draft({ triggerTag: RESEARCH })),
    );
    const item = captured(await pool.capture(envelope()));
    destination.answers({ kind: "unreachable", detail: "ECONNREFUSED" });
    succeeded(await pool.templates.route(item.id, template.id));

    // The tag lands as classification: the item is already filed there, and a
    // second reservation would be a second copy.
    succeeded(await pool.items.tag(item.id, RESEARCH, PERSON));

    expect(await pool.routing.recordsFor(item.id)).toHaveLength(1);
    expect(await tagsOn(pool, item.id)).toEqual([RESEARCH]);
  });
});

describe("a destination that is not filesystem-shaped", () => {
  const COLUMN_SCHEMA = {
    type: "object",
    required: ["column"],
    properties: {
      column: { type: "string", enum: ["reading", "done"] },
      title: { type: "string" },
    },
    additionalProperties: false,
  };

  /** A place field under a name core has never heard of, marked as the path it is. */
  const NOTEBOOK_SCHEMA = {
    type: "object",
    required: ["notebook"],
    properties: {
      notebook: { type: "string", [PATH_FIELD]: true },
      folder: { type: "string", enum: ["create", "require"] },
    },
    additionalProperties: false,
  };

  it("saves a template whose place is a value from a fixed set", async () => {
    const { pool } = await pooled(COLUMN_SCHEMA);

    const template = succeeded(
      await pool.templates.create(
        draft({ arguments: { column: "reading", title: "{{captured_at}}" } }),
      ),
    );

    expect(template.arguments).toEqual({
      column: "reading",
      title: "{{captured_at}}",
    });
  });

  it("expands the patterns and leaves the fixed value exactly as it is", async () => {
    const { pool } = await pooled(COLUMN_SCHEMA);
    const template = succeeded(
      await pool.templates.create(
        draft({ arguments: { column: "reading", title: "{{captured_at}}" } }),
      ),
    );
    const item = captured(
      await pool.capture(
        envelope({ capturedAt: "2026-09-07T20:32:00.000Z", utcOffset: 120 }),
      ),
    );

    const record = succeeded(await pool.templates.route(item.id, template.id));

    expect(record.target).toMatchObject({
      arguments: { column: "reading", title: "2026-09-07" },
    });
  });

  it("reports fits, having no folders to go and look for", async () => {
    const { pool } = await pooled(COLUMN_SCHEMA);
    const template = succeeded(
      await pool.templates.create(draft({ arguments: { column: "reading" } })),
    );

    expect(await pool.templates.report(template.id)).toEqual({ kind: "fits" });
  });

  it("fires from a trigger tag like anything else", async () => {
    const { pool, destination } = await pooled(COLUMN_SCHEMA);
    succeeded(
      await pool.templates.create(
        draft({ arguments: { column: "reading" }, triggerTag: RESEARCH }),
      ),
    );
    const item = captured(await pool.capture(envelope()));

    succeeded(await pool.items.tag(item.id, RESEARCH, PERSON));

    expect(await pool.routing.recordsFor(item.id)).toMatchObject([
      { state: "pending", applied: { firedByTag: true } },
    ]);
    expect(destination.received).toEqual([]);
  });

  /**
   * The table this replaced was keyed on the three capability names that
   * existed, so a field called anything else was never checked.
   */
  it("checks the folder of a path field whatever the capability calls it", async () => {
    const { pool, destination } = await pooled(NOTEBOOK_SCHEMA);
    destination.answersCandidates({ entries: [], truncated: false });
    const template = succeeded(
      await pool.templates.create(
        draft({
          arguments: { notebook: "research/{{captured_at}}.md" },
          folder: "require",
        }),
      ),
    );

    expect(await pool.templates.report(template.id)).toEqual({
      kind: "folder-missing",
      folder: "research/",
    });
  });

  /**
   * The walk used to name the missing folder by looking up the *first* segment
   * with that label, which in a path saying `research` twice is the one that is
   * there.
   */
  it("names the level that is missing, not the first one spelt the same", async () => {
    const { pool, destination } = await pooled(NOTEBOOK_SCHEMA);
    destination.answersCandidates((request) =>
      request.scope === undefined
        ? {
            entries: [{ label: "research", scope: "research/" }],
            truncated: false,
          }
        : request.scope === "research/"
          ? {
              entries: [{ label: "notes", scope: "research/notes/" }],
              truncated: false,
            }
          : { entries: [], truncated: false },
    );
    const template = succeeded(
      await pool.templates.create(
        draft({
          arguments: { notebook: "research/notes/research/{{captured_at}}.md" },
          folder: "require",
        }),
      ),
    );

    expect(await pool.templates.report(template.id)).toEqual({
      kind: "folder-missing",
      folder: "research/notes/research/",
    });
  });

  it("says it fits once that folder is there", async () => {
    const { pool, destination } = await pooled(NOTEBOOK_SCHEMA);
    destination.answersCandidates({
      entries: [{ label: "research", scope: "research/" }],
      truncated: false,
    });
    const template = succeeded(
      await pool.templates.create(
        draft({
          arguments: { notebook: "research/{{captured_at}}.md" },
          folder: "require",
        }),
      ),
    );

    expect(await pool.templates.report(template.id)).toEqual({ kind: "fits" });
  });
});
