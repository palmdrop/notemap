import { loadConfig } from "../config/load";
import type { Auth } from "../auth/types";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openAuth, systemClock } from "../ports";

export async function withAuth(
  work: (auth: Auth) => Promise<void>,
  configPath?: string, 
): Promise<void> {
  const { config } = loadConfig(configPath);
  mkdirSync(dirname(config.auth), { recursive: true });

  const auth = openAuth({ file: config.auth }, { clock: systemClock });

  try { 
    await work(auth);
  } 
  // TODO: no error handling?
  finally {
    await auth.close();
  }
}