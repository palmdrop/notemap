import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { checkAssets, checkPayload } from "./payload";
import { ok, refused } from "../utils/result";
import type { PoolConfig } from "../types/api/config";
import type { PoolPorts, PoolTx } from "../types/api/ports";
import type { EditRefusal } from "../types/api/refusal";
import type { ItemId } from "../types/domain/ids";
import type { EditOutcome, Item } from "../types/domain/item";
import type { Payload } from "../types/domain/payload";
import type { Result } from "../types/result";

type EditResult = Result<EditOutcome, EditRefusal>;

export function edit(
  config: PoolConfig,
  ports: PoolPorts,
  id: ItemId,
  payload: Payload,
): Promise<EditResult> {
  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });

    // Edits go to the end of the chain: allowing this would fork it into two
    // revisions of one original, both live, with nothing saying which is current.
    if (item.supersededBy !== undefined) {
      return refused({ kind: "item-superseded", by: item.supersededBy });
    }

    const invalid = await validate(config, ports, tx, item, payload);
    if (invalid !== undefined) return refused(invalid);

    return (await sealed(tx, item))
      ? revise(ports, tx, item, payload)
      : amend(ports, tx, item, payload);
  });
}

async function validate(
  config: PoolConfig,
  ports: PoolPorts,
  tx: PoolTx,
  item: Item,
  payload: Payload,
): Promise<EditRefusal | undefined> {
  if (payload.type !== item.payload.type) {
    return { kind: "payload-type-changed", from: item.payload.type };
  }

  const invalid = checkPayload(config, ports, payload);
  // The type is the item's own, so it was configured when the capture arrived.
  // A host that has since dropped it leaves no schema to check against, and an
  // edit that keeps the type the pool already holds is not where that is caught.
  if (invalid !== undefined && invalid.kind !== "unknown-payload-type") {
    return invalid;
  }

  return checkAssets(tx, payload);
}

/**
 * Whether a later capture has taken the head, or the item has been processed —
 * either seals it, and an edit is a revision from then on. Only a capture that
 * becomes the *new head* seals it: intake placed earlier in the feed by its
 * source time does not, and there is no timeout.
 */
async function sealed(tx: PoolTx, item: Item): Promise<boolean> {
  if (item.archived !== undefined) return true;
  if ((await tx.routingRecords(item.id)).length > 0) return true;

  const head = await tx.head();
  return head?.id !== item.id;
}

async function amend(
  ports: PoolPorts,
  tx: PoolTx,
  item: Item,
  payload: Payload,
): Promise<EditResult> {
  const at = ports.clock.now();
  const amended = await tx.amendItem(item.id, payload, at);

  await enqueueMirrorWrite(ports, tx, item.id, at);
  await recordAction(ports, tx, {
    kind: "amended",
    subject: item.id,
    // Nothing but a person edits: enrichment produces material beside a capture
    // and never changes it.
    by: { kind: "person" },
    at,
    detail: {},
  });

  return ok({ kind: "amended", item: amended });
}

async function revise(
  ports: PoolPorts,
  tx: PoolTx,
  item: Item,
  payload: Payload,
): Promise<EditResult> {
  const at = ports.clock.now();

  const revision = await tx.insertItem({
    id: ports.ids.next<ItemId>(),
    // A revision is a new item but not a new capture: no source produced it, so
    // it mints no identity of its own and keeps the capture time it revises.
    source: item.source,
    sourceItemId: item.sourceItemId,
    payload,
    tags: item.tags,
    createdAt: item.createdAt,
    contentUpdatedAt: at,
    revisionOf: item.id,
    // Archive state and routing records stay behind, so the revision starts
    // unprocessed and resurfaces in the queue.
  });

  // Both: the revision is new material, and the original is superseded, which
  // moved its `modifiedAt` and so what the mirror holds for it.
  await enqueueMirrorWrite(ports, tx, revision.id, at);
  await enqueueMirrorWrite(ports, tx, item.id, at);

  await recordAction(ports, tx, {
    kind: "revised",
    subject: item.id,
    by: { kind: "person" },
    at,
    detail: { revision: revision.id },
  });

  return ok({ kind: "revised", revision, supersedes: item.id });
}
