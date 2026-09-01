import { readFile } from "node:fs/promises";

import type {
  CredentialResolver,
  WebdavCredential,
} from "@notemap/destination-webdav";

import type { WebdavProfile } from "../config/load";

/**
 * The host half of a credential profile. The secret is read when a delivery
 * asks for it rather than at startup, so rotating one is writing the file: a
 * daemon that had read it once would go on presenting the old password until
 * somebody restarted it, which is the opposite of what rotation is for.
 */
export function webdavCredentials(
  profiles: readonly WebdavProfile[],
  env: NodeJS.ProcessEnv = process.env,
): CredentialResolver {
  const byName = new Map(profiles.map((profile) => [profile.name, profile]));

  return async (name: string): Promise<WebdavCredential> => {
    const profile = byName.get(name);
    if (profile === undefined) {
      throw new Error(`no webdav profile named ${name} is configured`);
    }

    return {
      baseUrl: profile.baseUrl,
      username: profile.username,
      password: await secretOf(profile, env),
    };
  };
}

async function secretOf(
  profile: WebdavProfile,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (profile.passwordEnv !== undefined) {
    const value = env[profile.passwordEnv];
    if (value === undefined || value === "") {
      throw new Error(
        `${profile.passwordEnv} holds no password for the webdav profile ${profile.name}`,
      );
    }
    return value;
  }

  const path = profile.passwordFile;
  if (path === undefined) {
    // Unreachable: the config refuses a profile naming neither.
    throw new Error(
      `the webdav profile ${profile.name} says where no password is read from`,
    );
  }

  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (cause) {
    throw new Error(
      `the password for the webdav profile ${profile.name} could not be read from ${path}: ${why(cause)}`,
      { cause },
    );
  }

  const password = withoutFinalNewline(contents);
  if (password === "") {
    throw new Error(
      `${path} is empty, so the webdav profile ${profile.name} has no password`,
    );
  }
  return password;
}

/**
 * One line ending, and no more: nearly every secret file was written by
 * something that ends its output with a newline, and trimming further would
 * silently change a password that legitimately ends in a space.
 */
function withoutFinalNewline(contents: string): string {
  return contents.replace(/\r?\n$/, "");
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
