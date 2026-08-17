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
import {
  createFilesystemDestination,
  type Renderers,
} from "@notemap/destination-fs";
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
  NOTE,
  storedRecords,
  TEXT,
  upload,
  type Harness,
} from "./fixture";

const ALL: Page = { limit: 50 };
const VAULT = "vault" as DestinationId;
const CREATE = "create-file" as CapabilityName;

const open: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of open.splice(0).reverse()) await cleanup();
});

const renderers: Renderers = {
  [TEXT]: (delivery) => ({
    body: `${String(delivery.payload.content["text"] ?? "")}\n`,
  }),
  [NOTE]: (delivery, where) => ({
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

/** A pool wired to a real folder on disk, mirroring for real as well. */
function pooled(root: string, clock?: Harness["clock"]): Harness {
  const opened = harness(undefined, "filesystem", [
    createFilesystemDestination({
      id: VAULT,
      root,
      accepts: [TEXT, NOTE],
      renderers,
      ...(clock === undefined ? {} : { clock }),
    }),
  ]);
  open.push(opened.cleanup);
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
  target: Record<string, string>,
): Promise<RoutingRecord> {
  const result = await opened.pool.routing.route(item, {
    destination: VAULT,
    capability: CREATE,
    target,
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

    const opened = pooled(root);
    const drain = drainWith(opened);

    const picture = await upload(opened.pool, "photo.png", bytes("PNG-BYTES"));
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
        type: NOTE,
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
        join(root, "inbox", "photo.png"),
        join(root, "inbox", "what it looked like.md"),
      ].sort(),
    );

    const note = await readFile(join(root, "inbox", "a-thought.md"), "utf8");
    expect(note).toContain(`id: '${thought}'`);
    expect(note).toContain("captured_at: '2026-08-06T09:00:00.000Z'");
    expect(note).toContain("- 'kind/quote'");
    expect(note.endsWith("a thought\n")).toBe(true);

    expect(await readFile(join(root, "inbox", "photo.png"), "utf8")).toBe(
      "PNG-BYTES",
    );
    expect(
      await readFile(join(root, "inbox", "what it looked like.md"), "utf8"),
    ).toContain("![photo.png](photo.png)");

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

    const opened = pooled(root);
    const picture = await upload(opened.pool, "photo.png", bytes("PNG-BYTES"));
    const item = await captured(opened, {
      id: "item-image" as ItemId,
      source: envelope().source,
      sourceItemId: "src-image",
      capturedAt: at("2026-08-06T09:01:00.000Z"),
      payload: {
        type: NOTE,
        content: { body: "what it looked like" },
        metadata: {},
        assets: [{ slot: "recording", asset: picture.id }],
      },
    });

    await route(opened, item, { directory: "", filename: "a.md" });

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

    const opened = pooled(root);
    const deliver = deliverWith(
      opened,
      createFilesystemDestination({
        id: VAULT,
        root,
        accepts: [TEXT, NOTE],
        renderers,
      }),
    );

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
      { ...record, state: "delivered", pointer: "inbox/a-thought.md" },
    ]);
    expect(
      await readFile(join(root, "inbox", "a-thought.md"), "utf8"),
    ).toContain("a thought");
    expect((await opened.pool.work.abandoned({ limit: 50 })).values).toEqual(
      [],
    );
  });
});
