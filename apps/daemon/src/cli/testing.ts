import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

import type { Streams } from "./prompt";

const made: string[] = [];

/**
 * A config naming an auth database of its own, so a command runs against the
 * real `loadConfig` rather than a stand-in for it.
 */
export function configured(): { argv: string[]; auth: string } {
  const directory = mkdtempSync(join(tmpdir(), "notemap-cli-"));
  made.push(directory);

  const auth = join(directory, "auth.db");
  const path = join(directory, "config.toml");

  writeFileSync(
    path,
    `[daemon]\npool = "${join(directory, "notemap.db")}"\nauth = "${auth}"\n`,
    "utf8",
  );

  return { argv: ["--config", path], auth };
}

export function cleanup(): void {
  for (const directory of made.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Stdin as a pipe, which is the path a script and a container script take. */
export function piped(text: string): Streams {
  return { input: Readable.from([text]), output: new Writable({ write: (_c, _e, done) => done() }) };
}

/** What a command wrote, in the order it wrote it. */
export function said(): {
  out: string[];
  err: string[];
  restore: () => void;
} {
  const out: string[] = [];
  const err: string[] = [];

  const log = console.log;
  const error = console.error;

  console.log = (...args: unknown[]) => out.push(args.join(" "));
  console.error = (...args: unknown[]) => err.push(args.join(" "));

  return {
    out,
    err,
    restore: () => {
      console.log = log;
      console.error = error;
    },
  };
}
