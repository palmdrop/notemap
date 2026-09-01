import type { Clock, Timestamp } from "@notemap/core";

import { hasPassed, mintSecret, verifySecret } from "../secret";
import type { AuthStore, SessionRecord } from "../store/types";
import type { MintedSession, SessionId } from "../types";
import { AUTH_SESSION_EXPIRES_IN_SECONDS } from "./config";

export type Sessions = {
  mint(): Promise<MintedSession>;
  verify(token: string): Promise<SessionRecord | undefined>;
};

export const createSessions = (
  store: AuthStore,
  { clock }: { clock: Clock },
): Sessions => ({
  mint: async () => {
    const minted = await mintSecret();

    const session: SessionRecord = {
      id: minted.id as SessionId,
      secretHash: minted.secretHash,
      createdAt: clock.now(),
      expiresAt: new Date(
        Date.parse(clock.now()) + AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
      ).toISOString() as Timestamp,
    };

    await store.addSession(session);

    return {
      id: session.id,
      token: minted.token,
      expiresAt: session.expiresAt,
    };
  },

  verify: async (token) => {
    const session = await verifySecret(token, (id) =>
      store.getSession(id as SessionId),
    );

    if (!session) return undefined;

    // Nobody lists sessions, so an expired one is taken away rather than shown.
    if (hasPassed(clock.now(), session.expiresAt)) {
      await store.deleteSession(session.id);
      return undefined;
    }

    return session;
  },
});
