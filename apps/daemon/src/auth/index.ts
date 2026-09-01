import type { Clock } from "@notemap/core";

import { UnreadableHash } from "./passwords/errors";
import { hashPassword, needsRehash, verifyPassword } from "./passwords";
import { sameSecretly } from "./secret";
import { createSessions } from "./sessions";
import type { AuthStore } from "./store/types";
import { createTokens } from "./tokens";
import type { Auth } from "./types";

type AuthParams = {
  clock: Clock;
};

export const createAuth = (store: AuthStore, { clock }: AuthParams): Auth => {
  const sessions = createSessions(store, { clock });
  const tokens = createTokens(store, { clock });

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
      const passwordHash = await hashPassword(password);

      await store.setCredential({
        name,
        passwordHash,
        changedAt: clock.now(),
      });
    },
    login: async (name, password) => {
      const credential = await store.getCredential();

      if (!credential) {
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
        console.error(
          "notemap: the stored credential cannot be read — run `notemap password set`",
          cause,
        );
        return undefined;
      }

      const named = sameSecretly(credential.name, name);

      if (!named || !proved) {
        return undefined;
      }

      // The password is in hand exactly here, which is the only moment a hash
      // written under weaker parameters can be brought up to the current ones.
      if (await needsRehash(credential.passwordHash)) {
        await store.rehashCredential(await hashPassword(password));
      }

      return await sessions.mint();
    },
    endSession: async (id) => {
      await store.deleteSession(id);
    },
    endAllSessions: async () => {
      await store.deleteAllSessions();
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
