import type { Timestamp } from "@notemap/core";

import type { SessionId, TokenId } from "../types";

export type CredentialRecord = {
  readonly name: string;
  readonly passwordHash: string;
  readonly changedAt: Timestamp;
};

export type SessionRecord = {
  readonly id: SessionId;
  readonly secretHash: string;
  readonly createdAt: Timestamp;
  readonly expiresAt: Timestamp;
};

export type TokenRecord = {
  readonly id: TokenId;
  readonly secretHash: string;
  readonly name: string;
  readonly createdAt: Timestamp;
  readonly expiresAt?: Timestamp;
  readonly lastUsedAt?: Timestamp;
};

export type AuthStore = {
  getCredential(): Promise<CredentialRecord | undefined>;
  /** Sets the credential, and ends every session: a reset answers a suspicion. */
  setCredential(credential: CredentialRecord): Promise<void>;
  /**
   * Rewrites the hash of the password already set, leaving sessions alone. The
   * password did not change — only what this build stores it under — so nobody
   * should be signed out by it.
   */
  rehashCredential(passwordHash: string): Promise<void>;

  addSession(session: SessionRecord): Promise<void>;
  getSession(id: SessionId): Promise<SessionRecord | undefined>;
  deleteSession(id: SessionId): Promise<void>;
  deleteAllSessions(): Promise<void>;

  addToken(token: TokenRecord): Promise<void>;
  getToken(id: TokenId): Promise<TokenRecord | undefined>;
  touchToken(id: TokenId, at: Timestamp): Promise<void>;
  listTokens(): Promise<readonly TokenRecord[]>;
  deleteToken(id: TokenId): Promise<void>;
  deleteAllTokens(): Promise<void>;

  cleanExpired(now: Timestamp): Promise<void>;

  close(): Promise<void>;
};
