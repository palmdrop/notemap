/**
 * Whatever a file dropped onto the page, or pasted, is attached to: the open
 * edit wherever it is drawn, and otherwise the capture box.
 */
export type Receiver = {
  /** Said by the overlay: `attach to <name>`. */
  readonly name: string;
  /** An edit outranks the box, which the queue draws beside it. */
  readonly edit: boolean;
  /** Whatever it holds is being sent, and a file arriving now would be lost with the rest. */
  readonly busy: () => boolean;
  /** The field a paste is the receiver's own in. */
  readonly owns: (target: EventTarget | null) => boolean;
  readonly take: (files: readonly File[]) => void;
};

let receivers = $state.raw<readonly Receiver[]>([]);

/** Takes files until the returned function lets it go. */
export function receives(receiver: Receiver): () => void {
  receivers = [...receivers, receiver];
  return () => {
    receivers = receivers.filter((one) => one !== receiver);
  };
}

/** The latest edit to open, else the latest box. */
export function receiver(): Receiver | undefined {
  return receivers.findLast((one) => one.edit) ?? receivers.at(-1);
}

/** Whether it still takes files, for an answer that arrives after it may have gone. */
export function isReceiving(one: Receiver): boolean {
  return receivers.includes(one);
}

/** What owns the field a paste landed in, which the paste is aimed at whatever else is open. */
export function owner(target: EventTarget | null): Receiver | undefined {
  return receivers.findLast((one) => one.owns(target));
}
