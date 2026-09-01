import { spawn } from "node:child_process";

import { MAIN } from "./daemon.ts";
import { world, type Told, type World } from "./world.ts";

export const NAME = "admin";
export const PASSWORD = "correct horse battery staple";

/**
 * Sets the credential the way a person does — the shipped CLI over the same
 * config file the daemon will read — rather than by reaching into the auth
 * database. Piped, because the prompt reads stdin whole when it is not a
 * terminal, so the password must arrive without a trailing newline.
 */
export function setPassword(
  on: World,
  password: string = PASSWORD,
  name: string = NAME,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      [MAIN, "password", "set", "--config", on.config, "--name", name],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let said = "";
    const collect = (chunk: Buffer) => {
      said += chunk.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`setting the password exited with ${code}:\n${said}`));
    });

    child.stdin.end(password);
  });
}

/** A world whose credential is set, so the daemon started over it opens shut. */
export async function shutWorld(told: Told = {}): Promise<World> {
  const on = world(told);
  await setPassword(on);
  return on;
}

/**
 * Mints an access token the way a person does, and reads it off stdout — which
 * is where the command puts it alone, so that a script can take it.
 */
export function mintToken(on: World, name = "a script"): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      [MAIN, "token", "mint", "--config", on.config, "--name", name],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let out = "";
    let said = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      said += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve(out.trim());
      reject(new Error(`minting a token exited with ${code}:\n${said}`));
    });
  });
}
