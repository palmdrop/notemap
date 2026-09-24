/**
 * The shape of every table, as SQLite hands it back. Timestamps are epoch
 * milliseconds here and RFC 3339 text in the record, so nothing outside the
 * store reads a row directly.
 */

export type CredentialRow = {
  readonly id: number;
  readonly username: string;
  readonly password_hash: string;
  readonly changed_at: number;
};

export type SessionRow = {
  readonly id: string;
  readonly secret_hash: string;
  readonly created_at: number;
  readonly expires_at: number;
};

export type TokenRow = {
  readonly id: string;
  readonly name: string;
  readonly secret_hash: string;
  readonly created_at: number;
  readonly expires_at: number | null;
  readonly last_used_at: number | null;
};

export type AccountRow = {
  readonly kind: string;
  readonly name: string;
  readonly fields: string;
  readonly secret: string;
  readonly changed_at: number;
};

export type AccountListingRow = Omit<AccountRow, "secret">;

/** Every table the migrations create, and the columns each row is read as. */
export const TABLE_COLUMNS = {
  credential: ["id", "username", "password_hash", "changed_at"],
  sessions: ["id", "secret_hash", "created_at", "expires_at"],
  tokens: [
    "id",
    "name",
    "secret_hash",
    "created_at",
    "expires_at",
    "last_used_at",
  ],
  accounts: ["kind", "name", "fields", "secret", "changed_at"],
} as const satisfies Record<string, readonly string[]>;

export const CREDENTIAL_COLUMNS = TABLE_COLUMNS.credential.join(", ");
export const SESSION_COLUMNS = TABLE_COLUMNS.sessions.join(", ");
export const TOKEN_COLUMNS = TABLE_COLUMNS.tokens.join(", ");
export const ACCOUNT_COLUMNS = TABLE_COLUMNS.accounts.join(", ");
export const ACCOUNT_LISTING_COLUMNS = TABLE_COLUMNS.accounts
  .filter((column) => column !== "secret")
  .join(", ");
