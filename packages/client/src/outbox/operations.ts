import type {
  BatchAction,
  CaptureEnvelope,
  EditEnvelope,
  ItemId,
  SuppliedArguments,
} from "#api/types";

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
  | {
      readonly kind: "edit";
      readonly item: ItemId;
      /** Minted once with the operation: reusing it is what makes a retry one revision. */
      readonly envelope: EditEnvelope;
      /** Sent only once the edit has landed, to whichever item then says its words. */
      readonly tags?: readonly string[];
      /** By tag among `tags`: values for what its template asks. */
      readonly arguments?: Readonly<Record<string, SuppliedArguments>>;
    }
  | {
      readonly kind: "tag";
      readonly item: ItemId;
      readonly tag: string;
      /** For the asked arguments of the template the tag fires, if it fires one. */
      readonly arguments?: SuppliedArguments;
    }
  | { readonly kind: "untag"; readonly item: ItemId; readonly tag: string }
  | {
      readonly kind: "batch";
      /** Minted once with the operation, so a resend is the same batch. */
      readonly batch: string;
      readonly items: readonly ItemId[];
      readonly action: BatchAction;
    }
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
  /**
   * While `sending`, when the lease on it lapses: another process over the same
   * store may attempt it after this, and must not before.
   */
  readonly until?: string;
  readonly failure?: string;
};

/**
 * Whether a drain may take an operation up: what is pending or unreachable,
 * and what another process was sending whose lease has lapsed by `now`.
 */
export function attemptable(entry: PendingOperation, now: string): boolean {
  return (
    entry.state === "pending" ||
    entry.state === "unreachable" ||
    (entry.state === "sending" &&
      (entry.until === undefined || entry.until <= now))
  );
}
