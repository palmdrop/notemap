import type { Api } from "../api/http";
import type { ItemId } from "../api/types";
import { Unencodable } from "../errors";
import type { Applied } from "../state/applied";
import type { ClientState } from "../state/state";
import type { Handler, Settlement } from "./handler";
import { archive } from "./kinds/archive";
import { capture } from "./kinds/capture";
import { acceptSuggestion, rejectSuggestion } from "./kinds/deferred";
import { edit } from "./kinds/edit";
import { tag, untag } from "./kinds/tags";
import { unarchive } from "./kinds/unarchive";
import type { Operation, OperationKind } from "./operations";

/**
 * Every kind the vocabulary declares answers here. The mapped type is the whole
 * point: a kind added to `Operation` without a handler stops the build, where a
 * switch with a default arm would have compiled and thrown at runtime instead.
 */
const HANDLERS: { readonly [K in OperationKind]: Handler<K> } = {
  capture,
  archive,
  unarchive,
  edit,
  tag,
  untag,
  "accept-suggestion": acceptSuggestion,
  "reject-suggestion": rejectSuggestion,
};

/** The one place the narrowing is asserted; the table above is what is checked. */
function handlerFor(operation: Operation): Handler<OperationKind> {
  return HANDLERS[operation.kind] as Handler<OperationKind>;
}

export function targetOf(operation: Operation): ItemId {
  return handlerFor(operation).target(operation);
}

/**
 * Two operations that undo each other on the same target. Everything else is
 * commutative and needs no clock: adding two tags in either order gives both.
 */
export function opposes(one: Operation, other: Operation): boolean {
  const handler = handlerFor(one);
  if (handler.opposedBy !== other.kind) return false;
  if (targetOf(one) !== targetOf(other)) return false;

  return handler.conflicts?.(one, other) ?? true;
}

export function applyOperation(
  state: ClientState,
  operation: Operation,
  at: string,
): Applied {
  const apply = handlerFor(operation).apply;
  if (apply === undefined) throw new Unencodable(operation.kind);

  return apply(state, operation, at);
}

/**
 * Sends one operation and answers how the pool's reply replaces the guess the
 * client drew.
 */
export async function sendOperation(
  api: Api,
  operation: Operation,
): Promise<Settlement> {
  const send = handlerFor(operation).send;
  if (send === undefined) throw new Unencodable(operation.kind);

  return send(api, operation);
}
