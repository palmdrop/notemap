import type { Clock } from "@notemap/core";

import { silentLogger, type Logger } from "@notemap/log";
import { UnreadableHash } from "./passwords/errors";
import { hashPassword, needsRehash, verifyPassword } from "./passwords";
import { DEFAULT_ALGORITHM } from "./passwords/config";
import type { ScryptParams } from "./passwords/scrypt";
import { sameSecretly } from "./secret";
import { createSessions } from "./sessions";
import type { AuthStore } from "./store/types";
import { createTokens } from "./tokens";
import type { Auth } from "./types";

type AuthParams = {
  clock: Clock;
  log?: Logger;
  /** What a password is hashed under. The algorithm's own defaults when absent. */
  hashing?: ScryptParams;
};

export const createAuth = (
  store: AuthStore,
  { clock, log = silentLogger(), hashing }: AuthParams,
): Auth => {
  const sessions = createSessions(store, { clock });
  const tokens = createTokens(store, { clock, log });
  const hash = (password: string) =>
    hashPassword(password, DEFAULT_ALGORITHM, hashing);

  return {
    requiresCredentials: async () => {
      const credential = await store.getCredential();
      return credential !== undefined;
    },
    authenticate: async (kind, token) => {
      if (kind === "session") {
        const session = await sessions.verify(token);

        if (!session) return undefined;

        return {
          kind: "session",
          id: session.id,
        };
      }

      const accessToken = await tokens.verify(token);

      if (!accessToken) return undefined;

      return {
        kind: "token",
        id: accessToken.id,
        name: accessToken.name,
      };
    },
    setPassword: async (name, password) => {
      const passwordHash = await hash(password);

      await store.setCredential({
        name,
        passwordHash,
        changedAt: clock.now(),
      });
    },
    login: async (name, password) => {
      const credential = await store.getCredential();

      if (!credential) {
        log.warn("sign-in refused: no password is set");
        return undefined;
      }

      // Both halves are weighed whatever the first one said, and the name is
      // compared without leaking where it stopped matching, so a wrong name and
      // a wrong password cost the same — which is what the route promises.
      let proved: boolean;
      try {
        proved = await verifyPassword(password, credential.passwordHash);
      } catch (cause) {
        if (!(cause instanceof UnreadableHash)) throw cause;

        // A row nobody can read is not a password anybody can get wrong, and
        // answering 500 would tell a person to try again at something broken.
        log.error(
          { err: cause },
          "sign-in refused: the stored credential cannot be read — run `notemap password set`",
        );
        return undefined;
      }

      const named = sameSecretly(credential.name, name);

      if (!named || !proved) {
        log.warn("sign-in refused: wrong name or password");
        return undefined;
      }

      // The password is in hand exactly here, which is the only moment a hash
      // written under weaker parameters can be brought up to the current ones.
      if (await needsRehash(credential.passwordHash, hashing)) {
        await store.rehashCredential(await hash(password));
      }

      const minted = await sessions.mint();
      log.info({ session: minted.id }, "signed in");
      return minted;
    },
    endSession: async (id) => {
      await store.deleteSession(id);
      log.info({ session: id }, "signed out");
    },
    endAllSessions: async () => {
      await store.deleteAllSessions();
      log.info("every session ended");
    },
    forgetExpired: async () => {
      await store.cleanExpired(clock.now());
    },
    mintToken: (name, expiresAt) => tokens.mint(name, expiresAt),
    listTokens: () => tokens.list(),
    revokeToken: (id) => tokens.revoke(id),

    close: async () => {
      await store.close();
    },
  };
};
