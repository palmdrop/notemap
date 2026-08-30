import type { Branded, Timestamp } from "@notemap/core";

import type { TokenRecord } from "./store/types"

export type SessionId = Branded<string, "SessionId">;
export type TokenId = Branded<string, "TokenId">;
export type MintedToken = TokenRecord & {
  readonly token: string;
}

export type MintedSession = {
  readonly id: SessionId;
  readonly token: string;
  readonly expiresAt: Timestamp;
}

export type Identity =
  | { readonly kind: "session"; readonly id: SessionId }
  | { readonly kind: "token"; readonly id: TokenId, readonly name: string }

export type Auth = {
  requiresCredentials(): Promise<boolean>
  authenticate(kind: "session" | "token", token: string): Promise<Identity | undefined>

  setPassword(name: string, password: string): Promise<void>
  login(name: string, password: string): Promise<MintedSession | undefined>
  endSession(id: SessionId): Promise<void>
  endAllSessions(): Promise<void>

  mintToken(name: string, expiresAt?: Timestamp): Promise<MintedToken>
  listTokens(): Promise<readonly TokenRecord[]>
  revokeToken(id: TokenId): Promise<void>
}
