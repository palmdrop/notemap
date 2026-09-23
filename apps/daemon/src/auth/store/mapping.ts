import type { JsonObject, Timestamp } from "@notemap/core";

import type { SessionId, TokenId } from "../types";
import type {
  AccountListing,
  AccountRecord,
  CredentialRecord,
  SessionRecord,
  TokenRecord,
} from "./types";
import type {
  AccountListingRow,
  AccountRow,
  CredentialRow,
  SessionRow,
  TokenRow,
} from "./rows";

export function toMillis(value: Timestamp): number {
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    throw new TypeError(`not a parseable timestamp: ${value}`);
  }
  return millis;
}

export function toTimestamp(millis: number): Timestamp {
  return new Date(millis).toISOString() as Timestamp;
}

export function toCredential(row: CredentialRow): CredentialRecord {
  return {
    name: row.username,
    passwordHash: row.password_hash,
    changedAt: toTimestamp(row.changed_at),
  };
}

export function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id as SessionId,
    secretHash: row.secret_hash,
    createdAt: toTimestamp(row.created_at),
    expiresAt: toTimestamp(row.expires_at),
  };
}

export function toToken(row: TokenRow): TokenRecord {
  return {
    id: row.id as TokenId,
    name: row.name,
    secretHash: row.secret_hash,
    createdAt: toTimestamp(row.created_at),
    ...(row.expires_at === null
      ? {}
      : { expiresAt: toTimestamp(row.expires_at) }),
    ...(row.last_used_at === null
      ? {}
      : { lastUsedAt: toTimestamp(row.last_used_at) }),
  };
}

export function toAccountListing(row: AccountListingRow): AccountListing {
  return {
    kind: row.kind,
    name: row.name,
    fields: JSON.parse(row.fields) as JsonObject,
    changedAt: toTimestamp(row.changed_at),
  };
}

export function toAccount(row: AccountRow): AccountRecord {
  return { ...toAccountListing(row), secret: row.secret };
}
