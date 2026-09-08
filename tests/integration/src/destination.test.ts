import { mkdtempSync, rmSync } from "node:fs";
import { chmod, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CapabilityName,
  CaptureEnvelope,
  DestinationId,
  Item,
  ItemId,
  Page,
  RoutingRecord,
} from "@notemap/core";
import { destinationRegistry } from "@notemap/core";
import { createFilesystemDestination } from "@notemap/destination-fs";
import type { Renderers } from "@notemap/output-markdown";
import { afterEach, describe, expect, it } from "vitest";

import {
  at,
  bytes,
  collect,
  deliverWith,
  drainWith,
  envelope,
  filesUnder,
  harness,
  SECOND,
  storedRecords,
  TEXT,
  upload,
  type Harness,
} from "./fixture";

const ALL: Page = { limit: 50 };
const VAULT = "vault" as DestinationId;
const CREATE = "create" as CapabilityName;

const open: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of open.splice(0).reverse()) await cleanup();
});

const renderers: Renderers = {
  [TEXT]: (delivery) => ({
    body: `${String(delivery.payload.content["text"] ?? "")}\n`,
  }),
  [SECOND]: (delivery, where) => ({
    body: `${[
      ...[...where.assets.values()].map((name) => `![${name}](${name})`),
      String(delivery.payload.content["body"] ?? ""),
    ].join("\n")}\n`,
  }),
};

/** A vault is somewhere else on disk, so it gets a directory of its own. */
function vault(): { readonly root: string } {
  const directory = mkdtempSync(join(tmpdir(), "notemap-vault-"));
  open.push(() => rmSync(directory, { recursive: true, force: true }));
  return { root: join(directory, "vault") };
}

const FILESYSTEM = destinationRegistry([
  createFilesystemDestination({ renderers, accepts: [TEXT, SECOND] }),
]);

/** A pool holding one destination that is a real folder on disk, mirroring for real as well. */
async function pooled(root: string): Promise<Harness> {
  const opened = harness(undefined, "filesystem", FILESYSTEM);
  open.push(opened.cleanup);
  await opened.putDestination({
    id: VAULT,
    kind: "filesystem",
    settings: { root, frontmatter: "full" },
  });
  return opened;
}

async function captured(
  opened: Harness,
  which: CaptureEnvelope,
): Promise<ItemId> {
  const result = await opened.pool.capture(which);
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value.item.id;
}

async function route(
  opened: Harness,
  item: ItemId,
  args: Record<string, string>,
): Promise<RoutingRecord> {
  const result = await opened.pool.routing.route(item, {
    destination: VAULT,
    capability: CREATE,
    arguments: args,
  });
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

const ids = (values: readonly Item[]) => values.map((item) => item.id);

describe("a capture leaving for a folder on disk", () => {
  it("lands as a note and its image, with the pool, the mirror and the vault agreeing", async () => {
    const { root } = vault();
    await mkdir(root, { recursive: true });

    const opened = await pooled(root);
    const drain = drainWith(opened);

    const picture = await upload(opened.pool, "photo.png", bytes("PNG-BYTES"));
    // Named for the upload and for its content, so a delivery retried after
    // placing it lands on the copy it wrote rather than beside it.
    const placed = `photo-${picture.blob.slice(0, 8)}.png`;
    const thought = await captured(
      opened,
      envelope({ id: "item-text", text: "a thought", tags: ["kind/quote"] }),
    );
    const withImage = await captured(opened, {
      id: "item-image" as ItemId,
      source: envelope().source,
      sourceItemId: "src-image",
      capturedAt: at("2026-08-06T09:01:00.000Z"),
      payload: {
        type: SECOND,
        content: { body: "what it looked like" },
        metadata: {},
        assets: [{ slot: "recording", asset: picture.id }],
      },
    });

    const first = await route(opened, thought, {
      directory: "inbox",
      filename: "a-thought.md",
    });
    const second = await route(opened, withImage, { directory: "inbox" });
    await drain();

    // The vault, as a person opening it would find it.
    expect(await filesUnder(root)).toEqual(
      [
        join(root, "inbox", "a-thought.md"),
        join(root, "inbox", placed),
        join(root, "inbox", "what it looked like.md"),
      ].sort(),
    );

    const note = await readFile(join(root, "inbox", "a-thought.md"), "utf8");
    expect(note).toContain(`id: '${thought}'`);
    expect(note).toContain("captured_at: '2026-08-06T09:00:00.000Z'");
    expect(note).toContain("- 'kind/quote'");
    expect(note.endsWith("a thought\n")).toBe(true);

    expect(await readFile(join(root, "inbox", placed), "utf8")).toBe(
      "PNG-BYTES",
    );
    expect(
      await readFile(join(root, "inbox", "what it looked like.md"), "utf8"),
    ).toContain(`![${placed}](${placed})`);

    // The pointer names the file that is actually there.
    expect(first.pointer).toBe("inbox/a-thought.md");
    expect(second.pointer).toBe("inbox/what it looked like.md");

    // Pool, mirror and vault agree about what happened.
    const records = await opened.pool.routing.recordsFor(thought);
    expect(records).toEqual([{ ...first, state: "delivered" }]);

    const mirrored = await storedRecords(opened.mirrorRoot);
    expect(mirrored.get(thought)?.routing).toEqual(records);
    expect(mirrored.get(withImage)?.routing).toEqual(
      await opened.pool.routing.recordsFor(withImage),
    );

    // And both items are out of the queue, having been decided.
    expect(ids((await opened.pool.views.queue(ALL)).values)).toEqual([]);
  });

  it("leaves the blob where it was: the vault got a copy, not a reference", async () => {
    const { root } = vault();
    await mkdir(root, { recursive: true });

    const opened = await pooled(root);
    const picture = await upload(opened.pool, "photo.png", bytes("PNG-BYTES"));
    // Named for the upload and for its content, so a delivery retried after
    // placing it lands on the copy it wrote rather than beside it.
    const placed = `photo-${picture.blob.slice(0, 8)}.png`;
    const item = await captured(opened, {
      id: "item-image" as ItemId,
      source: envelope().source,
      sourceItemId: "src-image",
      capturedAt: at("2026-08-06T09:01:00.000Z"),
      payload: {
        type: SECOND,
        content: { body: "what it looked like" },
        metadata: {},
        assets: [{ slot: "recording", asset: picture.id }],
      },
    });

    await route(opened, item, { directory: "", filename: "a.md" });

    expect(await filesUnder(root)).toContain(join(root, placed));

    const stillThere = await opened.pool.assets.open(picture.id);
    if (stillThere.kind === "refused") throw new Error("the blob went");
    expect(await collect(stillThere.value)).toEqual(bytes("PNG-BYTES"));
  });
});

/** The decision survives a destination that was not there to receive it. */
describe("a vault that cannot be written, and then can", () => {
  it("queues the delivery, retries it, and lands it once the folder opens", async () => {
    const { root } = vault();
    await mkdir(root, { recursive: true });
    await chmod(root, 0o500);
    open.push(() => chmod(root, 0o700));

    const opened = await pooled(root);
    const deliver = deliverWith(opened, FILESYSTEM);

    const item = await captured(opened, envelope({ id: "item-1" }));
    const record = await route(opened, item, {
      directory: "inbox",
      filename: "a-thought.md",
    });

    // The decision stands although nothing arrived, and the item has left the
    // queue: it is the decision that processes an item, not the arrival.
    expect(record.state).toBe("pending");
    expect(record.pointer).toBeUndefined();
    expect(ids((await opened.pool.views.queue(ALL)).values)).toEqual([]);

    opened.clock.set("2026-08-06T09:01:00.000Z");
    expect(await deliver()).toBe(1);
    expect((await opened.pool.routing.recordsFor(item))[0]?.state).toBe(
      "pending",
    );
    expect(await filesUnder(root)).toEqual([]);

    await chmod(root, 0o700);
    opened.clock.set("2026-08-06T09:02:00.000Z");
    expect(await deliver()).toBe(1);

    expect(await opened.pool.routing.recordsFor(item)).toEqual([
      {
        ...record,
        state: "delivered",
        pointer: "inbox/a-thought.md",
        // The retry that landed is what wrote the note, so it says what went.
        output: {
          content: {
            blob: expect.any(String) as unknown as string,
            mediaType: "text/markdown",
          },
        },
      },
    ]);
    expect(
      await readFile(join(root, "inbox", "a-thought.md"), "utf8"),
    ).toContain("a thought");
    expect((await opened.pool.work.abandoned({ limit: 50 })).values).toEqual(
      [],
    );
  });
});

describe("a root that overlaps notemap's own state", () => {
  it("is unusable, and routing to it is refused rather than attempted", async () => {
    const { root } = vault();
    await mkdir(root, { recursive: true });

    const guarded = destinationRegistry([
      createFilesystemDestination({
        renderers,
        accepts: [TEXT, SECOND],
        reserved: [root],
      }),
    ]);
    const opened = harness(undefined, "filesystem", guarded);
    open.push(opened.cleanup);
    await opened.putDestination({
      id: VAULT,
      kind: "filesystem",
      settings: { root },
    });

    expect(await opened.pool.destinations.describe(VAULT)).toMatchObject({
      kind: "unusable",
    });

    const item = await captured(opened, envelope({ id: "item-1" }));
    const refusal = await opened.pool.routing.route(item, {
      destination: VAULT,
      capability: CREATE,
      arguments: { directory: "inbox", filename: "a.md" },
    });

    expect(refusal).toMatchObject({
      kind: "refused",
      refusal: { kind: "destination-unusable" },
    });
    expect(await filesUnder(root)).toEqual([]);
  });
});

describe("asking the vault what it would write", () => {
  it("answers the note, writes nothing, and matches the delivery that follows", async () => {
    const { root } = vault();
    await mkdir(root, { recursive: true });
    const opened = await pooled(root);
    const item = await captured(opened, envelope({ text: "a thought" }));

    const asked = await opened.pool.routing.preview(item, {
      destination: VAULT,
      capability: CREATE,
      arguments: { directory: "inbox", filename: "a-thought.md" },
    });
    if (asked.kind === "refused") {
      throw new Error(`refused: ${JSON.stringify(asked.refusal)}`);
    }
    const report = asked.value;
    if (report.kind !== "previewed" || report.content === undefined) {
      throw new Error(`nothing to read: ${report.kind}`);
    }

    const would = new TextDecoder().decode(
      await collect(await report.content.open()),
    );
    expect(would).toContain("a thought");
    expect(await filesUnder(root)).toEqual([]);
    expect(await opened.pool.routing.recordsFor(item)).toEqual([]);

    const record = await route(opened, item, {
      directory: "inbox",
      filename: "a-thought.md",
    });
    expect(await readFile(join(root, record.pointer ?? ""), "utf8")).toBe(
      would,
    );
  });

  it("cannot be shown against a vault that is not there, and routing still can be", async () => {
    const { root } = vault();
    const opened = await pooled(root);
    const item = await captured(opened, envelope({ text: "a thought" }));

    const asked = await opened.pool.routing.preview(item, {
      destination: VAULT,
      capability: CREATE,
      arguments: { directory: "inbox", filename: "a-thought.md" },
    });

    expect(asked).toMatchObject({
      kind: "ok",
      value: { kind: "unreachable" },
    });
    // The decision is still available: it is the seeing that failed.
    expect((await route(opened, item, { directory: "inbox" })).state).toBe(
      "pending",
    );
  });
});
