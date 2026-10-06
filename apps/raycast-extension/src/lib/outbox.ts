import {
  saidIn,
  type Client,
  type ItemId,
  type Operation,
  type PendingOperation,
} from "@notemap/client";

/** Drains, and answers how many operations are still waiting to be sent. */
export async function remaining(client: Client): Promise<number> {
  await client.drain();

  return new Promise<number>((resolve) => {
    client.waiting.subscribe((count) => resolve(count)).unsubscribe();
  });
}

/** What the drain command's subtitle says, or nothing where nothing waits. */
export function waitingSaid(count: number): string | null {
  return count === 0 ? null : `${String(count)} waiting to send`;
}

/** What was done, in a few words; the note it was done to is said beside it. */
export function done(operation: Operation): string {
  switch (operation.kind) {
    case "capture":
      return "Capture";
    case "tag":
      return `Tag #${operation.tag}`;
    case "untag":
      return `Untag #${operation.tag}`;
    case "archive":
      return "Archive";
    case "unarchive":
      return "Unarchive";
    case "edit":
      return "Edit";
    case "accept-suggestion":
      return `Accept ${operation.suggestion}`;
    case "reject-suggestion":
      return `Reject ${operation.suggestion}`;
  }
}

/**
 * The words of the note an operation is about. A capture carries its own; any
 * other names an item, which the client's copy says where it holds one.
 */
export function about(
  operation: Operation,
  held: (item: ItemId) => string | undefined,
): string | undefined {
  if (operation.kind === "capture") return saidIn(operation.envelope.payload);
  if (operation.kind === "edit") return saidIn(operation.envelope.payload);
  return held(operation.item);
}

const STATES: Readonly<Record<PendingOperation["state"], string>> = {
  pending: "Pending",
  sending: "Sending",
  unreachable: "Unreachable",
  refused: "Refused",
};

export function stateSaid(entry: PendingOperation): string {
  return STATES[entry.state];
}

export function inOrder(
  outbox: readonly PendingOperation[],
): readonly PendingOperation[] {
  return [...outbox].sort((a, b) => a.at.localeCompare(b.at));
}
