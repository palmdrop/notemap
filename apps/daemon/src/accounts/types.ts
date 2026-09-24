import type {
  JsonObject,
  JsonSchema,
  SchemaIssue,
  Timestamp,
} from "@notemap/core";

import type { Account } from "../config/load";

/**
 * An account as its kind's schema saw it, with the secret read. What the
 * adapter does with it is its own: this is the whole of what the host does
 * with config and secrets, and no kind is named here.
 */
export type HeldAccount = Account & { readonly secret: string };

/** Where an account came from, and which one wins where both name the same kind and name. */
export type AccountOrigin = "config" | "stored";

/** An account as anything but a delivery may see it: never with its secret. */
export type KnownAccount = {
  readonly kind: string;
  readonly name: string;
  /** What the kind asks an account to carry, without the secret or where it is read from. */
  readonly fields: JsonObject;
  readonly from: AccountOrigin;
  /** Only a stored account has one: a config account changes when its file does. */
  readonly changedAt?: Timestamp;
};

export type AccountKind = {
  readonly name: string;
  readonly accountSchema: JsonSchema;
};

/** A stored account as written. No secret keeps the one already held. */
export type AccountInput = {
  readonly kind: string;
  readonly name: string;
  readonly fields: JsonObject;
  readonly secret?: string;
};

export type AccountRefusal =
  | { readonly kind: "unknown-account-kind"; readonly accountKind: string }
  | {
      readonly kind: "no-such-account";
      readonly accountKind: string;
      readonly name: string;
    }
  | {
      readonly kind: "invalid-account";
      readonly issues: readonly SchemaIssue[];
    }
  | { readonly kind: "account-secret-missing" }
  | { readonly kind: "account-in-use"; readonly destinations: number };

export type AccountResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: AccountRefusal };

export type Accounts = {
  /** Each kind that holds an account, with what its accounts must carry besides the secret. */
  kinds(): readonly AccountKind[];
  /** The accounts in use: every stored one, and every config one no stored one shadows. */
  list(): readonly KnownAccount[];
  /** The names a destination of this kind may use, stored and config alike. */
  names(kind: string): readonly string[];
  /** The config accounts a stored one of the same kind and name replaces entirely. */
  shadowed(): readonly KnownAccount[];
  /**
   * Read afresh on every call, so a replaced account or a rewritten secret file
   * lands on the next delivery rather than the next restart.
   */
  resolve(kind: string, name: string): Promise<HeldAccount>;
  /** Whether the secret could be presented now. Answers the question, never the secret. */
  secretSet(account: KnownAccount): Promise<boolean>;
  /** Creates or replaces a stored account, checked against its kind first. */
  put(account: AccountInput): Promise<AccountResult<KnownAccount>>;
  /** Forgets a stored account, answering the config one it no longer shadows. */
  remove(
    kind: string,
    name: string,
  ): Promise<AccountResult<{ readonly revealed?: KnownAccount }>>;
};
