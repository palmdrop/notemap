import pino, { type Logger } from "pino";

import type { LogConfig } from "./config";
import { textStream } from "./text";

export type { Logger } from "pino";

/**
 * Belt and braces: nothing should hand a secret to the log in the first place,
 * and one that does is printed as this instead.
 */
const REDACTED = ["authorization", "cookie", "password", "secret", "token"];

export function createLogger(
  config: LogConfig,
  out: NodeJS.WritableStream = process.stdout,
): Logger {
  return pino(
    {
      level: config.level,
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: {
        paths: REDACTED.flatMap((key) => [key, `*.${key}`]),
        censor: "[redacted]",
      },
    },
    config.format === "json" ? out : textStream(out),
  );
}

/** A logger that says nothing, for a test or a tool that wants the daemon quiet. */
export function silentLogger(): Logger {
  return pino({ level: "silent" });
}
