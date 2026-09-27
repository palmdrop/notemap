import { Writable } from "node:stream";

import type { LogConfig } from "./config";
import { createLogger, type Logger } from "./create";

export type CapturedLog = {
  readonly log: Logger;
  /** Every line so far, with the clock taken off a text line. */
  lines(): string[];
  /** Everything so far, verbatim. */
  said(): string;
};

const CLOCK = /^\d\d:\d\d:\d\d\.\d\d\d /;

/** A logger whose output a test reads back. */
export function capturedLog(
  config: LogConfig = { level: "debug", format: "text" },
): CapturedLog {
  let said = "";
  const out = new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      said += chunk.toString();
      done();
    },
  });

  return {
    log: createLogger(config, out),
    said: () => said,
    lines: () =>
      said
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => line.replace(CLOCK, "")),
  };
}
