import { recordAction } from "../actions";
import { enqueueMirrorRemove, enqueueMirrorWrite } from "../mirror";
import { sameJson } from "../../utils/json";
import { ok, refused } from "../../utils/result";
import type { PoolPorts, PoolTx } from "../../types/api/ports";
import type {
  DestinationDeletionRefusal,
  DestinationRefusal,
  RetireRefusal,
} from "../../types/api/refusal";
import type {
  Destination,
  DestinationChanges,
  DestinationDraft,
  DestinationRecord,
} from "../../types/domain/destination";
import type { DestinationId, Timestamp } from "../../types/domain/ids";
import type { JsonObject } from "../../types/json";
import type { ActionKind } from "../../types/domain/action-log";
import type { Result } from "../../types/result";
import { declaredKind } from "./usability";

type Created = Result<Destination, DestinationRefusal>;
type Edited = Result<Destination, DestinationRefusal>;
type Retired = Result<Destination, RetireRefusal>;

export function create(
  ports: PoolPorts,
  draft: DestinationDraft,
): Promise<Created> {
  const declared = declaredKind(ports, draft.kind);
  if (declared === undefined) {
    return Promise.resolve(
      refused<Destination, DestinationRefusal>({
        kind: "unknown-destination-kind",
        destinationKind: draft.kind,
      }),
    );
  }

  const issues = ports.schemas.validate(
    declared.settingsSchema,
    draft.settings,
  );
  if (issues.length > 0) {
    return Promise.resolve(
      refused<Destination, DestinationRefusal>({
        kind: "invalid-destination-settings",
        issues,
      }),
    );
  }

  return ports.store.transaction(async (tx) => {
    const at = ports.clock.now();
    const record: DestinationRecord = {
      id: ports.ids.next<DestinationId>(),
      name: draft.name,
      kind: draft.kind,
      settings: draft.settings,
      createdAt: at,
    };

    const stored = await tx.insertDestination(record);
    await changed(ports, tx, "destination-created", stored, at, {
      name: stored.name,
      destinationKind: stored.kind,
    });

    return ok<Destination, DestinationRefusal>(stored);
  });
}

/** Settings of a kind no adapter is registered for cannot be checked, so they cannot be edited. */
export function edit(
  ports: PoolPorts,
  id: DestinationId,
  changes: DestinationChanges,
): Promise<Edited> {
  return ports.store.transaction(async (tx) => {
    const held = await tx.destination(id);
    if (held === undefined) {
      return refused<Destination, DestinationRefusal>({
        kind: "unknown-destination",
        destination: id,
      });
    }

    if (changes.settings !== undefined) {
      const declined = unfit(ports, held, changes.settings);
      if (declined !== undefined) {
        return refused<Destination, DestinationRefusal>(declined);
      }
    }

    const renamed = changes.name !== undefined && changes.name !== held.name;
    const reconfigured =
      changes.settings !== undefined &&
      !sameJson(changes.settings, held.settings);
    if (!renamed && !reconfigured) {
      return ok<Destination, DestinationRefusal>(held);
    }

    const at = ports.clock.now();
    const stored = await tx.updateDestination({
      ...record(held),
      ...(renamed ? { name: changes.name as string } : {}),
      ...(reconfigured ? { settings: changes.settings as JsonObject } : {}),
    });

    if (reconfigured) {
      await trace(ports, tx, "destination-reconfigured", stored, at, {});
    }
    if (renamed) {
      await trace(ports, tx, "destination-renamed", stored, at, {
        from: held.name,
        name: stored.name,
      });
    }
    await owedToMirror(ports, tx, stored, at);

    return ok<Destination, DestinationRefusal>(stored);
  });
}

function unfit(
  ports: PoolPorts,
  held: Destination,
  settings: JsonObject,
): DestinationRefusal | undefined {
  const declared = declaredKind(ports, held.kind);
  if (declared === undefined) {
    return { kind: "unknown-destination-kind", destinationKind: held.kind };
  }

  const issues = ports.schemas.validate(declared.settingsSchema, settings);
  return issues.length > 0
    ? { kind: "invalid-destination-settings", issues }
    : undefined;
}

/** Nothing already decided is disturbed: a reservation still lands. */
export function retire(ports: PoolPorts, id: DestinationId): Promise<Retired> {
  return ports.store.transaction(async (tx) => {
    const held = await tx.destination(id);
    if (held === undefined) {
      return refused<Destination, RetireRefusal>({
        kind: "unknown-destination",
        destination: id,
      });
    }
    if (held.retiredAt !== undefined) {
      return refused<Destination, RetireRefusal>({
        kind: "already-retired",
        destination: id,
        at: held.retiredAt,
      });
    }

    const at = ports.clock.now();
    const stored = await tx.updateDestination({
      ...record(held),
      retiredAt: at,
    });
    await changed(ports, tx, "destination-retired", stored, at);

    return ok<Destination, RetireRefusal>(stored);
  });
}

export function unretire(
  ports: PoolPorts,
  id: DestinationId,
): Promise<Retired> {
  return ports.store.transaction(async (tx) => {
    const held = await tx.destination(id);
    if (held === undefined) {
      return refused<Destination, RetireRefusal>({
        kind: "unknown-destination",
        destination: id,
      });
    }
    if (held.retiredAt === undefined) {
      return refused<Destination, RetireRefusal>({
        kind: "not-retired",
        destination: id,
      });
    }

    const at = ports.clock.now();
    const { retiredAt: _retired, ...offered } = record(held);
    const stored = await tx.updateDestination(offered);
    await changed(ports, tx, "destination-unretired", stored, at);

    return ok<Destination, RetireRefusal>(stored);
  });
}

/** Anything a record has ever named can never stop resolving, and is retired instead. */
export function remove(
  ports: PoolPorts,
  id: DestinationId,
): Promise<Result<void, DestinationDeletionRefusal>> {
  return ports.store.transaction(async (tx) => {
    const held = await tx.destination(id);
    if (held === undefined) {
      return refused<void, DestinationDeletionRefusal>({
        kind: "unknown-destination",
        destination: id,
      });
    }

    if (await tx.destinationEverNamed(id)) {
      return refused<void, DestinationDeletionRefusal>({
        kind: "destination-in-use",
        destination: id,
      });
    }

    const at = ports.clock.now();
    await tx.deleteDestination(id);
    await removed(ports, tx, held, at);

    return ok<void, DestinationDeletionRefusal>(undefined);
  });
}

/** Every field the store writes, taken off what it last answered with. */
function record(held: Destination): DestinationRecord {
  const { modifiedAt: _modified, ...fields } = held;
  return fields;
}

async function changed(
  ports: PoolPorts,
  tx: PoolTx,
  kind: ActionKind,
  destination: Destination,
  at: Timestamp,
  detail: JsonObject = {},
): Promise<void> {
  await trace(ports, tx, kind, destination, at, detail);
  await owedToMirror(ports, tx, destination, at);
}

function owedToMirror(
  ports: PoolPorts,
  tx: PoolTx,
  destination: Destination,
  at: Timestamp,
): Promise<void> {
  return enqueueMirrorWrite(
    ports,
    tx,
    { kind: "destination", destination: destination.id },
    at,
  );
}

/** The row has gone, so what the mirror holds about it is owed a removal instead. */
async function removed(
  ports: PoolPorts,
  tx: PoolTx,
  destination: Destination,
  at: Timestamp,
): Promise<void> {
  await trace(ports, tx, "destination-deleted", destination, at, {
    name: destination.name,
    destinationKind: destination.kind,
  });
  await enqueueMirrorRemove(
    ports,
    tx,
    { kind: "destination", destination: destination.id },
    at,
  );
}

/** A destination is not an item, so an entry names it in its detail rather than as its subject. */
function trace(
  ports: PoolPorts,
  tx: PoolTx,
  kind: ActionKind,
  destination: Destination,
  at: Timestamp,
  detail: JsonObject,
): Promise<void> {
  return recordAction(ports, tx, {
    kind,
    by: { kind: "person" },
    at,
    detail: { destination: destination.id, ...detail },
  });
}
