type Refusal = {
  readonly error?: { readonly code?: string } & Record<string, unknown>;
};

/** The daemon's refusal grammar, said the way the person who hit it would say it. */
export function readError(body: unknown): string {
  const error = (body as Refusal | undefined)?.error;
  if (error?.code === undefined) return "something went wrong";

  switch (error.code) {
    case "payload-invalid":
      return "nothing to capture";
    case "capture-id-conflict":
    case "source-item-changed":
      return "that capture already exists, with different content";
    case "unknown-payload-type":
      return `this daemon has no "${String(error.type)}" payload type configured`;
    case "missing-asset-slot":
      return `a capture of this type needs a file in "${String(error.slot)}"`;
    case "unknown-asset":
      return "the upload is gone; pick the file again";
    case "asset-too-large":
      return `that file is larger than this daemon accepts (${String(error.max)} bytes)`;
    case "missing-filename":
      return "the file has no name";
    default:
      return `refused: ${error.code}`;
  }
}

export function saidBy(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
