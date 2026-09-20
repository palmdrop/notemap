import { Writable } from "node:stream";

/**
 * One of pino's JSON lines as one line a person reads: the clock, the level,
 * the message, then every other field as `key=value`. An error's stack goes on
 * the lines below, since it is the one value that is worth its own room.
 */
export function formatLine(record: Record<string, unknown>): string {
  const { time, level, msg, err, ...fields } = record;

  const head = [
    clock(time),
    String(level ?? "info").toUpperCase(),
    ...(msg === undefined ? [] : [String(msg)]),
  ];

  const pairs = flatten(fields).map(([key, value]) => `${key}=${quote(value)}`);

  const failure = err === undefined ? [] : describe(err);

  return [[...head, ...pairs].join(" "), ...failure].join("\n");
}

function clock(time: unknown): string {
  if (typeof time !== "string") return "--:--:--.---";
  const at = time.indexOf("T");
  return at === -1 ? time : time.slice(at + 1).replace(/Z$/, "");
}

function flatten(
  value: Record<string, unknown>,
  prefix = "",
): [string, unknown][] {
  return Object.entries(value).flatMap(([key, each]) =>
    isRecord(each)
      ? flatten(each, `${prefix}${key}.`)
      : [[`${prefix}${key}`, each]],
  );
}

function quote(value: unknown): string {
  if (typeof value === "string") {
    return /[\s="]/.test(value) || value === "" ? JSON.stringify(value) : value;
  }
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function describe(err: unknown): string[] {
  if (!isRecord(err)) return [`  ${quote(err)}`];
  const stack = typeof err["stack"] === "string" ? err["stack"] : undefined;
  const text =
    stack ??
    [err["type"], err["message"]]
      .filter((each) => each !== undefined)
      .join(": ");
  return text.split("\n").map((line) => `  ${line}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Takes pino's lines and writes each to `out` as text. */
export function textStream(out: NodeJS.WritableStream): Writable {
  return new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (line === "") continue;
        out.write(`${asText(line)}\n`);
      }
      done();
    },
  });
}

function asText(line: string): string {
  try {
    return formatLine(JSON.parse(line) as Record<string, unknown>);
  } catch {
    return line;
  }
}
