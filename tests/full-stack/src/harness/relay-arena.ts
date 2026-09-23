import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Polled } from "./relay.ts";

/** The bundle a `--once` run in this suite executes. */
export const RELAY_ARENA_MAIN = fileURLToPath(
  new URL("../../../../apps/relay-arena/dist/main.js", import.meta.url),
);

export type RelayingArena = {
  readonly config: string;
  /** One scan of every watched channel, the way cron would run it. */
  poll(): Promise<Polled>;
};

export type ToldArena = {
  /** Where the config file and the two token files are written. */
  readonly directory: string;
  readonly pool: { readonly url: string; readonly token: string };
  readonly arena: { readonly url: string; readonly token: string };
  readonly channels: readonly {
    readonly handle: string;
    readonly source: string;
    readonly tags?: readonly string[];
  }[];
};

/**
 * The relay as someone runs it: its own config file, its secrets in files
 * beside it, and `--once` per poll — which exits when the scan is done, so a
 * test waits for a process rather than for a timer it cannot see.
 */
export function relayArena(told: ToldArena): RelayingArena {
  const at = (name: string) => join(told.directory, name);
  const config = at("relay-arena.toml");

  writeFileSync(at("arena-pool-token"), told.pool.token, "utf8");
  writeFileSync(at("arena-token"), told.arena.token, "utf8");

  const channels = told.channels
    .map(
      (channel) =>
        `[[channel]]
handle = "${channel.handle}"
source = "${channel.source}"
${channel.tags === undefined ? "" : `tags = [${channel.tags.map((tag) => `"${tag}"`).join(", ")}]\n`}`,
    )
    .join("\n");

  writeFileSync(
    config,
    `[pool]
url = "${told.pool.url}"
tokenFile = "${at("arena-pool-token")}"

[arena]
tokenFile = "${at("arena-token")}"

${channels}`,
    "utf8",
  );

  return {
    config,
    poll: () =>
      new Promise((resolve, reject) => {
        const child = spawn(
          "node",
          [RELAY_ARENA_MAIN, "--config", config, "--once"],
          {
            stdio: ["ignore", "pipe", "pipe"],
            // are.na's address is a constant nothing in the config file can
            // move; this is how the suite points the real binary at a fake
            // are.na instead. Never set outside a test.
            env: { ...process.env, NOTEMAP_RELAY_ARENA_API: told.arena.url },
          },
        );

        let output = "";
        const collect = (chunk: Buffer) => {
          output += chunk.toString();
        };
        child.stdout.on("data", collect);
        child.stderr.on("data", collect);

        child.on("error", reject);
        child.on("exit", (code) => resolve({ code, output }));
      }),
  };
}
