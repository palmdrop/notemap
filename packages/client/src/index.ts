export * from "./api/types";
export * from "./client";
export * from "./errors";
export * from "./types";

export * from "./adapters/fetch-transport";
export * from "./adapters/memory-store";

export type { Writable } from "./observable/observable";

/** The queue's rule, and editability's, which are one question. */
export { unprocessed } from "./state/state";

export type {
  Operation,
  OperationId,
  OperationKind,
  OperationState,
  PendingOperation,
} from "./outbox/operations";

export type { ClientStore } from "./ports/store";
export type { Transport } from "./ports/transport";
