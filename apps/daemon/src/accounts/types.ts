import type { JsonObject, Timestamp } from "@notemap/core";

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

export type Accounts = {
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
};
