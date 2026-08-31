import type { Clock, Timestamp } from "@notemap/core";

import { TOKEN_PREFIX } from "../config";
import { hasPassed, mintSecret, verifySecret } from "../secret";
import type { AuthStore, TokenRecord } from "../store/types";
import type { MintedToken, TokenId, Token } from "../types";
import { TOUCH_AFTER_MS } from "./config";

type TokensOptions = {
  clock: Clock;
}

export type Tokens = {
  mint(name: string, expiresAt?: Timestamp): Promise<MintedToken>;
  verify(token: string): Promise<Token | undefined>;
  list(): Promise<readonly Token[]>;
  revoke(id: TokenId): Promise<void>;
};

const needsTouch = (now: Timestamp, lastUsedAt?: Timestamp) =>
  lastUsedAt === undefined ||
  Date.parse(now) - Date.parse(lastUsedAt) >= TOUCH_AFTER_MS;

const recordToToken = (record: TokenRecord): Token => ({
  id: record.id,
  name: record.name,
  createdAt: record.createdAt,
  ...(record.expiresAt === undefined ? {} : { expiresAt: record.expiresAt }),
  ...(record.lastUsedAt === undefined ? {} : { lastUsedAt: record.lastUsedAt }),
});

export const createTokens = (store: AuthStore, { clock }: TokensOptions): Tokens => ({
  mint: async (name, expiresAt) => {
    const minted = await mintSecret(TOKEN_PREFIX);

    const tokenRecord: TokenRecord = {
      name,
      id: minted.id as TokenId,
      secretHash: minted.secretHash,
      createdAt: clock.now(),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    }

    await store.addToken(tokenRecord);

    const token = recordToToken(tokenRecord);

    return {
      ...token,
      token: minted.token
    };
  },

  verify: async (token) => {
    const record = await verifySecret(
      token,
      (id) => store.getToken(id as TokenId),
      TOKEN_PREFIX,
    );

    if(!record) return undefined;

    const now = clock.now();

    // No expiry means it never reaches one.
    const isExpired =
      record.expiresAt !== undefined && hasPassed(now, record.expiresAt);

    // The row stays either way: a token is a named thing someone reads in a
    // list, and seeing it sitting there expired is what answers why a client
    // stopped working. Taking it away is a deliberate revoke.
    if(isExpired) return undefined;

    // Bookkeeping on a read path, so a failure here may not fail the request.
    if(needsTouch(now, record.lastUsedAt)) {
      try {
        await store.touchToken(record.id, now);
      } catch (cause) {
        console.warn(`notemap: could not record use of token ${record.id}`, cause);
      }
    }

    return recordToToken(record);
  },

  list: async () => (await store.listTokens()).map(record => recordToToken(record)),
  revoke: async (id) => {
    await store.deleteToken(id);
  },
});
