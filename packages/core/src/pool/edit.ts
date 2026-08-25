import { dequal } from "dequal";

import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { canonicalPayload, checkAssets, checkPayload } from "./payload";
import { ok, refused } from "../utils/result";
import type { PoolConfig } from "../types/api/config";
import type { Agent } from "../types/domain/agent";
import type { PoolPorts, PoolTx } from "../types/api/ports";
import type { EditRefusal } from "../types/api/refusal";
import type { EditEnvelope } from "../types/domain/capture";
import type { ItemId } from "../types/domain/ids";
import type { EditOutcome, Item } from "../types/domain/item";
import type { Payload } from "../types/domain/payload";
import type { Result } from "../types/result";

type EditResult = Result<EditOutcome, EditRefusal>;

export function edit(
  config: PoolConfig,
  ports: PoolPorts,
  id: ItemId,
  envelope: EditEnvelope,
  by: Agent,
): Promise<EditResult> {
  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });

    const invalid = await validate(config, ports, tx, item, envelope.payload);
    if (invalid !== undefined) return refused(invalid);

    return (await sealed(tx, item))
      ? revise(ports, tx, item, envelope, by)
      : amend(ports, tx, item, envelope.payload, by);
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
  // A host that has dropped the type since the capture leaves no schema to check
  // against, which an edit keeping the type the pool holds is not where to catch.
  if (invalid !== undefined && invalid.kind !== "unknown-payload-type") {
    return invalid;
  }

  return checkAssets(tx, payload);
}

/** Processed: something left, or the person declared themselves done with it. */
async function sealed(tx: PoolTx, item: Item): Promise<boolean> {
  if (item.archived !== undefined) return true;
  if (item.revisedInto.length > 0) return true;

  return (await tx.routingRecords(item.id)).length > 0;
}

async function amend(
  ports: PoolPorts,
  tx: PoolTx,
  item: Item,
  payload: Payload,
  by: Agent,
): Promise<EditResult> {
  const at = ports.clock.now();
  const amended = await tx.amendItem(item.id, payload, at);

  await enqueueMirrorWrite(ports, tx, { kind: "item", item: item.id }, at);
  await recordAction(ports, tx, {
    kind: "amended",
    subject: item.id,
    by,
    at,
    detail: {},
  });

  return ok({ kind: "amended", item: amended });
}

async function revise(
  ports: PoolPorts,
  tx: PoolTx,
  item: Item,
  envelope: EditEnvelope,
  by: Agent,
): Promise<EditResult> {
  const replayed = await tx.itemBySourceIdentity(
    envelope.source,
    envelope.sourceItemId,
  );
  if (replayed !== undefined) {
    // Same identity, same words: the resend of an edit already made. Different
    // words under a taken identity is capture's refusal, not a second revision.
    const replay =
      replayed.revisionOf === item.id &&
      dequal(
        canonicalPayload(replayed.payload),
        canonicalPayload(envelope.payload),
      );

    return replay
      ? ok({ kind: "revised", revision: replayed, revisionOf: item.id })
      : refused({ kind: "source-item-changed", existing: replayed.id });
  }

  const at = ports.clock.now();
  const revision = await tx.insertItem({
    id: ports.ids.next<ItemId>(),
    source: envelope.source,
    sourceItemId: envelope.sourceItemId,
    payload: envelope.payload,
    tags: item.tags,
    createdAt: at,
    revisionOf: item.id,
    // Archive state and routing records stay behind: a revision starts unprocessed.
  });

  // The item it came from moved too: being revised took it out of the queue.
  await enqueueMirrorWrite(ports, tx, { kind: "item", item: revision.id }, at);
  await enqueueMirrorWrite(ports, tx, { kind: "item", item: item.id }, at);

  await recordAction(ports, tx, {
    kind: "revised",
    subject: item.id,
    by,
    at,
    detail: { revision: revision.id },
  });

  return ok({ kind: "revised", revision, revisionOf: item.id });
}
