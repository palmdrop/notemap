import { recordAction } from "../actions";
import { ok, refused } from "../../utils/result";
import type { PoolPorts, PoolTx } from "../../types/api/ports";
import type {
  DestinationDeletionRefusal,
  DestinationRefusal,
  RetireRefusal,
} from "../../types/api/refusal";
import type {
  Destination,
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
    await trace(ports, tx, "destination-created", stored, at, {
      name: stored.name,
      destinationKind: stored.kind,
    });

    return ok<Destination, DestinationRefusal>(stored);
  });
}

/** Free, because a routing record names the id and never the name. */
export function rename(
  ports: PoolPorts,
  id: DestinationId,
  name: string,
): Promise<Edited> {
  return ports.store.transaction(async (tx) => {
    const held = await tx.destination(id);
    if (held === undefined) {
      return refused<Destination, DestinationRefusal>({
        kind: "unknown-destination",
        destination: id,
      });
    }

    const at = ports.clock.now();
    const stored = await tx.updateDestination({ ...record(held), name });
    await trace(ports, tx, "destination-renamed", stored, at, {
      from: held.name,
      name,
    });

    return ok<Destination, DestinationRefusal>(stored);
  });
}

/**
 * The kind is fixed: changing it would make one destination two, and a record
 * cannot tell which it meant. Settings of a kind no adapter is registered for
 * cannot be checked, so they cannot be edited either.
 */
export function reconfigure(
  ports: PoolPorts,
  id: DestinationId,
  settings: JsonObject,
): Promise<Edited> {
  return ports.store.transaction(async (tx) => {
    const held = await tx.destination(id);
    if (held === undefined) {
      return refused<Destination, DestinationRefusal>({
        kind: "unknown-destination",
        destination: id,
      });
    }

    const declared = declaredKind(ports, held.kind);
    if (declared === undefined) {
      return refused<Destination, DestinationRefusal>({
        kind: "unknown-destination-kind",
        destinationKind: held.kind,
      });
    }

    const issues = ports.schemas.validate(declared.settingsSchema, settings);
    if (issues.length > 0) {
      return refused<Destination, DestinationRefusal>({
        kind: "invalid-destination-settings",
        issues,
      });
    }

    const at = ports.clock.now();
    const stored = await tx.updateDestination({ ...record(held), settings });
    await trace(ports, tx, "destination-reconfigured", stored, at, {});

    return ok<Destination, DestinationRefusal>(stored);
  });
}

/** Stops it being offered for new routing. Nothing already decided is disturbed. */
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
    await trace(ports, tx, "destination-retired", stored, at, {});

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
    await trace(ports, tx, "destination-unretired", stored, at, {});

    return ok<Destination, RetireRefusal>(stored);
  });
}

/**
 * A typo need not become permanent furniture; anything a record has ever named
 * can never stop resolving, and is retired instead.
 */
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
    // The entry outlives the row, as an item's does: what happened is not
    // erased by erasing what it happened to.
    await trace(ports, tx, "destination-deleted", held, at, {
      name: held.name,
      destinationKind: held.kind,
    });

    return ok<void, DestinationDeletionRefusal>(undefined);
  });
}

/** Every field the store writes, taken off what it last answered with. */
function record(held: Destination): DestinationRecord {
  const { modifiedAt: _modified, ...fields } = held;
  return fields;
}

/**
 * A destination is not an item, so the entry carries no subject and names the
 * destination in its detail instead.
 */
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
