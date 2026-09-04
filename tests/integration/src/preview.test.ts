import type {
  CapabilityName,
  DestinationId,
  ItemId,
  Page,
  Pool,
  PreviewReport,
} from "@notemap/core";
import { fakeCapability, fakeDestinations } from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  bytes,
  collect,
  envelope,
  harness,
  streamOf,
  type Harness,
} from "./fixture";

const ALL: Page = { limit: 50 };
const VAULT = "vault" as DestinationId;

const PATH_SCHEMA = {
  type: "object",
  required: ["path"],
  properties: { path: { type: "string" } },
  additionalProperties: false,
};

const CAPABILITIES = [
  fakeCapability({ name: "create-note", argumentsSchema: PATH_SCHEMA }),
];

const open: Harness[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

async function pooled() {
  const destination = fakeDestinations({ capabilities: CAPABILITIES });
  const opened = harness(undefined, "stub", destination);
  open.push(opened);
  await opened.putDestination({ id: VAULT });
  return { ...opened, destination };
}

function request(path = "inbox/a-thought.md") {
  return {
    destination: VAULT,
    capability: "create-note" as CapabilityName,
    arguments: { path },
  };
}

function markdown(text: string) {
  return {
    content: {
      mediaType: "text/markdown",
      open: () => Promise.resolve(streamOf(bytes(text))),
    },
  };
}

async function capture(pool: Pool, id = "item-1"): Promise<ItemId> {
  const result = await pool.capture(envelope({ id }));
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value.item.id;
}

function shown(
  result: Awaited<ReturnType<Pool["routing"]["preview"]>>,
): PreviewReport {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

async function text(report: PreviewReport): Promise<string> {
  if (report.kind !== "previewed" || report.content === undefined) {
    throw new Error(`nothing to read: ${report.kind}`);
  }
  return new TextDecoder().decode(await collect(await report.content.open()));
}

describe("asking what a destination would write", () => {
  it("answers the output, and reserves nothing at all", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answersPreview({
      ...markdown("# a thought\n"),
      note: "the two pictures would not be carried",
    });
    const item = await capture(pool);

    const report = shown(await pool.routing.preview(item, request()));

    expect(report.kind).toBe("previewed");
    expect(await text(report)).toBe("# a thought\n");
    expect(report.kind === "previewed" ? report.note : undefined).toBe(
      "the two pictures would not be carried",
    );

    // No record, no job, nothing said in the log, and the item is still work.
    expect(await pool.routing.recordsFor(item)).toEqual([]);
    expect((await pool.views.queue(ALL)).values.map((one) => one.id)).toEqual([
      item,
    ]);
    expect(
      (await pool.actions.forItem(item, { limit: 50 })).values.map(
        (one) => one.kind,
      ),
    ).toEqual(["captured"]);
  });

  it("hands the destination what a delivery would be handed", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answersPreview(markdown("# a thought\n"));
    const item = await capture(pool);

    await pool.routing.preview(item, request());

    expect(opened.destination.previewed[0]).toMatchObject({
      item,
      destination: VAULT,
      capability: "create-note",
      arguments: { path: "inbox/a-thought.md" },
      source: "scratchpad",
      payload: { type: "text", content: { text: "a thought" } },
    });
  });

  it("reports a kind that does not offer one, rather than refusing", async () => {
    const opened = await pooled();
    const { pool } = opened;
    const item = await capture(pool);

    expect(shown(await pool.routing.preview(item, request()))).toEqual({
      kind: "not-offered",
    });
  });

  it("reports a destination that had to be reached and could not be", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answersPreview(markdown("# a thought\n"));
    opened.destination.cannotPreview("the vault is asleep");
    const item = await capture(pool);

    expect(shown(await pool.routing.preview(item, request()))).toEqual({
      kind: "unreachable",
      detail: "the vault is asleep",
    });
  });

  it("reports unreachable where the destination cannot even say what it does", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.cannotDescribe("ECONNREFUSED");
    const item = await capture(pool);

    expect(shown(await pool.routing.preview(item, request()))).toMatchObject({
      kind: "unreachable",
    });
  });

  it("refuses for the reasons a route refuses", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answersPreview(markdown("# a thought\n"));
    const item = await capture(pool);

    expect(
      await pool.routing.preview(item, {
        ...request(),
        capability: "post-to-board" as CapabilityName,
      }),
    ).toEqual({
      kind: "refused",
      refusal: { kind: "capability-undeclared", capability: "post-to-board" },
    });

    expect(
      await pool.routing.preview(item, { ...request(), arguments: {} }),
    ).toMatchObject({
      kind: "refused",
      refusal: { kind: "arguments-invalid" },
    });

    expect(await pool.routing.preview("ghost" as ItemId, request())).toEqual({
      kind: "refused",
      refusal: { kind: "no-such-item", item: "ghost" },
    });
  });
});
