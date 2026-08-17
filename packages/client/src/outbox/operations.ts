import type { CaptureEnvelope, ItemId, Payload } from "../api/types";

export type OperationId = string;

/**
 * The whole mutation vocabulary, though only `capture`, `archive` and
 * `unarchive` have a route to encode against today. The rest are declared so
 * that giving one a wire is an encoder, not a reshape of the engine.
 */
export type Operation =
  | { readonly kind: "capture"; readonly envelope: CaptureEnvelope }
  | {
      readonly kind: "archive";
      readonly item: ItemId;
      readonly reason?: string;
    }
  | { readonly kind: "unarchive"; readonly item: ItemId }
  | { readonly kind: "edit"; readonly item: ItemId; readonly payload: Payload }
  | { readonly kind: "tag"; readonly item: ItemId; readonly tag: string }
  | { readonly kind: "untag"; readonly item: ItemId; readonly tag: string }
  | {
      readonly kind: "accept-suggestion";
      readonly item: ItemId;
      readonly suggestion: string;
    }
  | {
      readonly kind: "reject-suggestion";
      readonly item: ItemId;
      readonly suggestion: string;
    };

export type OperationKind = Operation["kind"];

/**
 * `unreachable` keeps its optimistic state and drains again; `refused` has been
 * rolled back and is held only so the shell can say what the pool said.
 */
export type OperationState = "pending" | "sending" | "unreachable" | "refused";

export type PendingOperation = {
  readonly id: OperationId;
  readonly operation: Operation;
  /** The client's clock when the person acted: the last-write-wins key. */
  readonly at: string;
  readonly state: OperationState;
  readonly failure?: string;
};

/** Which item an operation is about, and therefore what it drains in order with. */
export function targetOf(operation: Operation): ItemId {
  return operation.kind === "capture" ? operation.envelope.id : operation.item;
}

const OPPOSED: Partial<Record<OperationKind, OperationKind>> = {
  archive: "unarchive",
  unarchive: "archive",
  tag: "untag",
  untag: "tag",
};

/**
 * Two operations that undo each other on the same target. Everything else is
 * commutative and needs no clock: adding two tags in either order gives both.
 */
export function opposes(one: Operation, other: Operation): boolean {
  if (OPPOSED[one.kind] !== other.kind) return false;
  if (targetOf(one) !== targetOf(other)) return false;

  const sameTag =
    (one.kind === "tag" || one.kind === "untag") &&
    (other.kind === "tag" || other.kind === "untag");

  return sameTag ? one.tag === other.tag : true;
}
