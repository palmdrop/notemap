import type { JsonObject } from "@notemap/core";

import { isSecretSource, type Account } from "../config/load";

/** A config account as its kind sees it: without its kind, its name, or where its secret is. */
export function fieldsOf(account: Account): JsonObject {
  const { kind: _kind, name: _name, ...rest } = account;
  return Object.fromEntries(
    Object.entries(rest).filter(([key]) => !isSecretSource(key)),
  );
}
