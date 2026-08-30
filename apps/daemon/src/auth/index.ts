import type { Clock } from "@notemap/core";

import { hashPassword, verifyPassword } from "./passwords"
import { createSessions } from "./sessions";
import type { AuthStore } from "./store/types"
import { createTokens } from "./tokens";
import type { Auth } from "./types";

type AuthParams = {
  clock: Clock
}

export const createAuth = (store: AuthStore, { clock }: AuthParams): Auth => {
  const sessions = createSessions(store, { clock });
  const tokens = createTokens(store, { clock });

  return {
    requiresCredentials: async () => {
      const credential = await store.getCredential();
      return credential !== undefined;
    },
    authenticate: async (kind, token) => {
      if(kind === 'session') {
        const session = await sessions.verify(token);

        if(!session) return undefined;

        return {
          kind: "session",
          id: session.id,
        }
      }

      const accessToken = await tokens.verify(token);

      if(!accessToken) return undefined;

      return {
        kind: "token",
        id: accessToken.id,
        name: accessToken.name,
      }
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

      if(!credential) {
        return undefined;
      }

      if(
        credential.name !== name || // NOTE: is this necessary?
        !await verifyPassword(password, credential.passwordHash)
      ) {
        return undefined;
      }

      return await sessions.mint();
    },
    endSession: async (id) => {
      await store.deleteSession(id);
    },
    endAllSessions: async () => {
      await store.deleteAllSessions();
    },
    mintToken: (name, expiresAt) => tokens.mint(name, expiresAt),
    listTokens: () => tokens.list(),
    revokeToken: (id) => tokens.revoke(id),
  }
};
