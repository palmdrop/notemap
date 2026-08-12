import type { DaemonRefusal } from "../types";

/** Thrown out of the body stream, so an upload refused mid-flight stores nothing. */
export class RefusedUpload extends Error {
  readonly refusal: DaemonRefusal;

  constructor(refusal: DaemonRefusal) {
    super(refusal.kind);
    this.name = "RefusedUpload";
    this.refusal = refusal;
  }
}
