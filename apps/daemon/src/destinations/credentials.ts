import { readFile } from "node:fs/promises";

import type {
  CredentialResolver,
  WebdavCredential,
} from "@notemap/destination-webdav";

import { isPrivateHost, type WebdavProfile } from "../config/load";

/**
 * The host half of a credential profile. The secret is read when a delivery
 * asks for it rather than at startup, so rotating one is writing the file: a
 * daemon that had read it once would go on presenting the old password until
 * somebody restarted it, which is the opposite of what rotation is for.
 *
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

/**
 * Said once at startup for every account whose password would leave a network
 * the operator controls, and not enforced: where the address is not private,
 * whether plain HTTP is acceptable is a thing only the person who wrote the
 * address knows, and a daemon that refused would refuse deployments that are
 * fine — a private VLAN, a tunnel, a mesh interface — for a guess.
 */
export function plainHttpWarnings(
  profiles: readonly WebdavProfile[],
): readonly string[] {
  return profiles.flatMap((profile) => {
    const url = new URL(profile.baseUrl);
    if (url.protocol === "https:" || isPrivateHost(url.hostname)) return [];

    return [
      `the webdav account ${profile.name} reaches ${url.hostname} over plain HTTP, so its password crosses the network in the clear — put TLS in front of it, or reach it at a private address`,
    ];
  });
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
