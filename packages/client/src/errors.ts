import type { RefusalCode } from "./api/types";

type Facts = Record<string, unknown>;

type Refusal = {
  readonly error?: { readonly code?: string } & Facts;
};

/** The pool answered, and said no. What it refuses does not become true by retrying. */
export class Refused extends Error {
  readonly code: RefusalCode | (string & {});

  constructor(code: RefusalCode | (string & {}), message: string) {
    super(message);
    this.name = "Refused";
    this.code = code;
  }
}

/** The pool could not be reached, or did not decide. Nothing is known either way. */
export class Unreachable extends Error {
  constructor(cause: unknown, said = "the daemon is not reachable") {
    super(said, { cause });
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

/**
 * Every code the document declares has a reading. Removing one stops the build,
 * which is the point: core reports facts, and turning one into a sentence a
 * person can act on is the client's job.
 */
const SAID: {
  readonly [C in RefusalCode]: string | ((facts: Facts) => string);
} = {
  "already-archived": "that item is already archived",
  "asset-too-large": (facts) =>
    `that file is larger than this daemon accepts (${String(facts["max"])} bytes)`,
  "bad-digest": "the upload's checksum is not readable",
  "bad-limit": "the app asked for a page size this daemon will not serve",
  "bad-order": "the app asked for an order this daemon does not have",
  "bad-position": "the app lost its place in the list; reload",
  "blob-missing": "the stored file is gone from this daemon's disk",
  "capability-undeclared": "that destination cannot do this",
  "capture-id-conflict": "that capture already exists, with different content",
  "delivery-in-flight":
    "that delivery has already started; it cannot be called back",
  "delivery-outcome-unknown":
    "the delivery may or may not have happened; check the destination",
  "digest-mismatch": "the upload arrived corrupted; pick the file again",
  "item-purged": "that item was purged",
  "limit-too-large":
    "the app asked for more at once than this daemon will serve",
  "malformed-envelope": "the app sent a capture this daemon cannot read",
  "malformed-json": "the app sent something this daemon cannot read",
  "missing-asset-slot": (facts) =>
    `a capture of this type needs a file in "${String(facts["slot"])}"`,
  "missing-filename": "the file has no name",
  "no-such-asset": "the upload is gone; pick the file again",
  "no-such-item": "that item is not here",
  "no-such-record": "that routing record is not here",
  "not-archived": "that item is not archived",
  "not-pending": "that delivery has already been decided",
  "payload-invalid": "nothing to capture",
  "payload-type-unsupported":
    "that destination does not accept this kind of item",
  "rejected-by-destination": "the destination refused it",
  "source-item-changed": "that capture already exists, with different content",
  "target-invalid": "that destination needs a different target",
  "unknown-asset": "the upload is gone; pick the file again",
  "unknown-destination": "this daemon has no such destination configured",
  "unknown-payload-type": (facts) =>
    `this daemon has no "${String(facts["type"])}" payload type configured`,
  unreachable: "the destination could not be reached",
  "unsupported-media-type": "this daemon does not accept that kind of request",
};

export function readRefusal(body: unknown): Refused {
  const error = (body as Refusal | undefined)?.error;
  const code = error?.code;
  if (code === undefined) return new Refused("unknown", "something went wrong");

  return new Refused(code, sentenceFor(code, error ?? {}));
}

function sentenceFor(code: string, facts: Facts): string {
  const said = (SAID as Record<string, (typeof SAID)[RefusalCode] | undefined>)[
    code
  ];
  if (said === undefined) return `refused: ${code}`;

  return typeof said === "string" ? said : said(facts);
}

export function saidBy(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
