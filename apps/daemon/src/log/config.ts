export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_FORMATS = ["text", "json"] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

export type LogConfig = {
  readonly level: LogLevel;
  readonly format: LogFormat;
};

export const DEFAULT_LOG: LogConfig = { level: "info", format: "text" };

export const LOG_LEVEL_VARIABLE = "NOTEMAP_LOG_LEVEL";

export function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}
