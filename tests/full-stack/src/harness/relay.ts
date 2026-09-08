import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The bundle a `--once` run in this suite executes. */
export const RELAY_MAIN = fileURLToPath(
  new URL("../../../../apps/relay-memos/dist/main.js", import.meta.url),
);

export type Polled = {
  readonly code: number | null;
  /** Everything the relay said, which is where its failures go. */
  readonly output: string;
};

export type Relaying = {
  readonly config: string;
  /** One scan of everything upstream, the way cron would run it. */
  poll(): Promise<Polled>;
};

export type Told = {
  /** Where the config file and the two token files are written. */
  readonly directory: string;
  readonly pool: { readonly url: string; readonly token: string };
  readonly memos: { readonly url: string; readonly token: string };
  readonly source?: string;
};

/**
 * The relay as someone runs it: its own config file, its secrets in files
 * beside it, and `--once` per poll — which exits when the scan is done, so a
 * test waits for a process rather than for a timer it cannot see.
 */
export function relayMemos(told: Told): Relaying {
  const at = (name: string) => join(told.directory, name);
  const config = at("relay-memos.toml");

  writeFileSync(at("pool-token"), told.pool.token, "utf8");
  writeFileSync(at("memos-token"), told.memos.token, "utf8");
  writeFileSync(
    config,
    `[pool]
url = "${told.pool.url}"
source = "${told.source ?? "memos"}"
tokenFile = "${at("pool-token")}"

[memos]
url = "${told.memos.url}"
tokenFile = "${at("memos-token")}"
`,
    "utf8",
  );

  return {
    config,
    poll: () =>
      new Promise((resolve, reject) => {
        const child = spawn(
          "node",
          [RELAY_MAIN, "--config", config, "--once"],
          { stdio: ["ignore", "pipe", "pipe"] },
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
