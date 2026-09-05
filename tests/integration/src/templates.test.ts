import type {
  CapabilityName,
  JsonSchema,
  DestinationId,
  Item,
  Pool,
  RoutingTemplateDraft,
  RoutingTemplateId,
  TagName,
} from "@notemap/core";
import { fakeCapability, fakeDestinations } from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { envelope, harness, type Harness } from "./fixture";

const VAULT = "vault" as DestinationId;
const CREATE_NOTE = "create-note" as CapabilityName;

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
  return { ...opened, destination };
}

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
