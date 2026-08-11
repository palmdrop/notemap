import type { WorkOutcome } from "../types/domain/work";

/** What a mirror driver throws when it knows what went wrong. */
export class MirrorWriteFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    code: string,
    detail: string,
    retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(detail, options);
    this.name = "MirrorWriteFailure";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Anything a mirror write threw, as an outcome. An unrecognised error is retryable. */
export function asWorkOutcome(cause: unknown): WorkOutcome {
  if (cause instanceof MirrorWriteFailure) {
    return {
      kind: "failed",
      retryable: cause.retryable,
      detail: { code: cause.code, detail: cause.message },
    };
  }

  return {
    kind: "failed",
    retryable: true,
    detail: {
      code: "mirror-write-failed",
      detail: cause instanceof Error ? cause.message : String(cause),
    },
  };
}
