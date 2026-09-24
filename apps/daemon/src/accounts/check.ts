import type {
  JsonObject,
  JsonSchema,
  PoolPorts,
  SchemaIssue,
} from "@notemap/core";

import { isSecretSource, type Account } from "../config/load";
import { fieldsOf } from "./fields";

/** What each kind that holds an account asks it to carry besides its secret. */
export type AccountKinds = Readonly<Record<string, JsonSchema>>;

/**
 * A stored account holds its secret, so a key saying where one is read from is
 * refused whatever the kind's schema allows. The caller has already asked
 * whether the kind exists.
 */
export function accountIssues(
  schema: JsonSchema,
  fields: JsonObject,
  schemas: PoolPorts["schemas"],
): readonly SchemaIssue[] {
  const sources = Object.keys(fields)
    .filter(isSecretSource)
    .map((key) => ({ path: `/${key}`, keyword: "secretSource" }));

  return [...sources, ...schemas.validate(schema, fields)];
}

/**
 * At startup rather than at the first delivery: a malformed account otherwise
 * fails hours later, on a runner's timer, where nobody is looking.
 *
 * A kind nothing registers is refused too. An account naming one is a typo, and
 * starting anyway would leave a destination that can never deliver.
 */
export function refuseUnusableAccounts(
  kinds: AccountKinds,
  accounts: readonly Account[],
  schemas: PoolPorts["schemas"],
): void {
  for (const account of accounts) {
    const at = `the ${account.kind} account ${account.name}`;
    const schema = kinds[account.kind];

    if (schema === undefined) {
      throw new Error(
        `${at} names a kind nothing speaks — the kinds that hold an account are ${Object.keys(kinds).join(" and ")}`,
      );
    }

    const issues = accountIssues(schema, fieldsOf(account), schemas);
    if (issues.length > 0) {
      const said = issues
        .map((issue) => `${issue.path || "(root)"} ${issue.keyword}`)
        .join("; ");
      throw new Error(`${at} is not a ${account.kind} account: ${said}`);
    }
  }
}
