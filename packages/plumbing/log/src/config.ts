export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_FORMATS = ["text", "json"] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

export type LogConfig = {
  readonly level: LogLevel;
  readonly format: LogFormat;
};

export const DEFAULT_LOG: LogConfig = { level: "info", format: "text" };

export function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * The level a variable names, or nothing where it names none — which a program
 * reads as "the config file decides". One that names something that is not a
 * level is refused, rather than run at a level nobody asked for. Each program
 * names its own variable; the levels are everyone's.
 */
export function levelFrom(
  variable: string,
  env: NodeJS.ProcessEnv,
): LogLevel | undefined {
  const level = env[variable];
  if (level === undefined || level === "") return undefined;

  if (!isLogLevel(level)) {
    throw new Error(
      `${variable} is "${level}", and a level is one of ${LOG_LEVELS.join(", ")}`,
    );
  }
  return level;
}
