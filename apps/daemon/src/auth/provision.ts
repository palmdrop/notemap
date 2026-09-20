import { readFileSync } from "node:fs";

import { silentLogger, type Logger } from "../log";
import { DEFAULT_CREDENTIALS_NAME } from "./config";
import {
  MAX_PASSWORD_BYTE_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "./passwords/config";
import { UnusablePassword, type PasswordRefusal } from "./passwords/errors";
import type { Auth } from "./types";

export const PASSWORD = "NOTEMAP_PASSWORD";
export const PASSWORD_FILE = "NOTEMAP_PASSWORD_FILE";

export type FromEnvironment = {
  readonly password: string;
  /** Which of the two it came from, for the line that says so. */
  readonly variable: string;
};

const WRONG_WITH_IT: Record<PasswordRefusal, string> = {
  "password-empty": "is empty",
  "password-too-short": `is shorter than ${String(MIN_PASSWORD_LENGTH)} characters`,
  "password-too-long": `is longer than ${String(MAX_PASSWORD_BYTE_LENGTH)} bytes`,
  "password-forbidden-characters": "carries a character a password may not",
};

/**
 * A file written by `echo` or mounted as a secret ends in a newline, and a
 * newline inside a password is refused rather than ignored — so one at the end
 * is taken off, instead of becoming a daemon that will not start.
 */
const withoutTrailingNewline = (contents: string): string =>
  contents.replace(/\r?\n$/, "");

export function passwordFromEnvironment(
  env: NodeJS.ProcessEnv,
): FromEnvironment | undefined {
  const direct = env[PASSWORD];
  const file = env[PASSWORD_FILE];

  if (direct !== undefined && file !== undefined) {
    throw new Error(
      `notemap: ${PASSWORD} and ${PASSWORD_FILE} are both set and may say different things — set one of them`,
    );
  }

  if (direct !== undefined) return { password: direct, variable: PASSWORD };
  if (file === undefined) return undefined;

  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch (cause) {
    throw new Error(
      `notemap: ${PASSWORD_FILE} names ${file}, which could not be read — ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }

  return {
    password: withoutTrailingNewline(contents),
    variable: PASSWORD_FILE,
  };
}

/**
 * The credential a deployment arrives with, and only where it has none. The
 * database owns the password once one is set: a variable that reasserted itself
 * every start would end every open session each time the container restarted,
 * and would make `notemap password set` a change that does not survive.
 */
export async function provisionCredential(
  auth: Auth,
  env: NodeJS.ProcessEnv,
  log: Logger = silentLogger(),
): Promise<void> {
  const arrived = passwordFromEnvironment(env);
  if (arrived === undefined) return;

  if (await auth.requiresCredentials()) {
    log.warn(
      { variable: arrived.variable },
      "a password is set already, so the one in the auth database stands — change it with `notemap password set`",
    );
    return;
  }

  try {
    await auth.setPassword(DEFAULT_CREDENTIALS_NAME, arrived.password);
  } catch (cause) {
    if (!(cause instanceof UnusablePassword)) throw cause;

    throw new Error(
      `notemap: the password in ${arrived.variable} ${WRONG_WITH_IT[cause.refusal]}`,
      { cause },
    );
  }

  log.info(
    { variable: arrived.variable, name: DEFAULT_CREDENTIALS_NAME },
    "the password was taken from the environment",
  );
}
