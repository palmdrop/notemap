type Refusal = {
  readonly error?: { readonly code?: string } & Record<string, unknown>;
};

/** The pool answered, and said no. What it refuses does not become true by retrying. */
export class Refused extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "Refused";
    this.code = code;
  }
}

/** The pool could not be reached. Nothing is known about whether it would agree. */
export class Unreachable extends Error {
  constructor(cause: unknown) {
    super("the daemon is not reachable", { cause });
    this.name = "Unreachable";
  }
}

/** An operation the vocabulary names but no `/v1` route accepts yet. */
export class Unencodable extends Error {
  constructor(kind: string) {
    super(`this daemon has no route for "${kind}" yet`);
    this.name = "Unencodable";
  }
}

/** Core reports facts; turning one into a sentence is the client's job. */
export function readRefusal(body: unknown): Refused {
  const error = (body as Refusal | undefined)?.error;
  const code = error?.code;
  if (code === undefined) return new Refused("unknown", "something went wrong");

  return new Refused(code, sentenceFor(code, error ?? {}));
}

function sentenceFor(code: string, facts: Record<string, unknown>): string {
  switch (code) {
    case "payload-invalid":
      return "nothing to capture";
    case "capture-id-conflict":
    case "source-item-changed":
      return "that capture already exists, with different content";
    case "unknown-payload-type":
      return `this daemon has no "${String(facts["type"])}" payload type configured`;
    case "missing-asset-slot":
      return `a capture of this type needs a file in "${String(facts["slot"])}"`;
    case "unknown-asset":
      return "the upload is gone; pick the file again";
    case "asset-too-large":
      return `that file is larger than this daemon accepts (${String(facts["max"])} bytes)`;
    case "missing-filename":
      return "the file has no name";
    case "no-such-item":
      return "that item is not here";
    case "item-purged":
      return "that item was purged";
    case "already-archived":
      return "that item is already archived";
    case "not-archived":
      return "that item is not archived";
    case "unknown-destination":
      return "this daemon has no such destination configured";
    case "capability-undeclared":
      return "that destination cannot do this";
    case "payload-type-unsupported":
      return "that destination does not accept this kind of item";
    case "target-invalid":
      return "that destination needs a different target";
    case "rejected-by-destination":
      return "the destination refused it";
    case "unreachable":
      return "the destination could not be reached";
    case "delivery-outcome-unknown":
      return "the delivery may or may not have happened; check the destination";
    default:
      return `refused: ${code}`;
  }
}

export function saidBy(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
