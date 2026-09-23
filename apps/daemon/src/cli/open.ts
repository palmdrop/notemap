import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { Auth } from "../auth/types";
import { loadConfig } from "../config/load";
import { openAuth, systemClock } from "../ports";

/**
 * Opens the auth database and nothing else — no pool, no runners, no server —
 * so a command may run beside a daemon that is already serving.
 *
 * Nothing is caught: a command that failed says so through the entry point's
 * own handler, which is the one place that decides what a failure prints and
 * what it exits with.
 */
export async function withAuth(
  work: (auth: Auth) => Promise<void>,
  configPath?: string,
): Promise<void> {
  const { config } = loadConfig(configPath);
  mkdirSync(dirname(config.auth), { recursive: true });

  const { auth } = openAuth({ file: config.auth }, { clock: systemClock });

  try {
    await work(auth);
  } finally {
    await auth.close();
  }
}
