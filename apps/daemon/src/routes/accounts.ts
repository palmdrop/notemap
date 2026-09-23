import type { Context } from "hono";

import type { Pool } from "@notemap/core";

import type { AccountRefusal, Accounts, KnownAccount } from "../accounts";
import { accountStatus, errorBody } from "../errors/refusals";
import type { AppEnv } from "../types";
import { putAccountRequestSchema } from "../schemas/account";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

export function accountKindsHandler(accounts: Accounts) {
  return (): Response => json({ values: accounts.kinds() }, 200);
}

export function accountsHandler(accounts: Accounts) {
  return async (): Promise<Response> => {
    const listed = [
      ...accounts.list().map((each) => ({ each, shadowed: false })),
      ...accounts.shadowed().map((each) => ({ each, shadowed: true })),
    ];

    return json(
      {
        values: await Promise.all(
          listed.map(({ each, shadowed }) => view(accounts, each, shadowed)),
        ),
      },
      200,
    );
  };
}

export function putAccountHandler(accounts: Accounts) {
  return async (context: Context<AppEnv>): Promise<Response> => {
    const body = await readBody(context, putAccountRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const put = await accounts.put({
      kind: context.req.param("kind") ?? "",
      name: context.req.param("name") ?? "",
      fields: body.value.fields as KnownAccount["fields"],
      ...(body.value.secret === undefined ? {} : { secret: body.value.secret }),
    });
    if (!put.ok) return refused(put.refusal);

    return json(await view(accounts, put.value, false), 200);
  };
}

/**
 * A destination naming the account would be left with nothing to resolve, so
 * removal waits for it to be retired — unless a config account of the same
 * kind and name takes over, in which case nothing is stranded.
 */
export function removeAccountHandler(accounts: Accounts, pool: Pool) {
  return async (context: Context<AppEnv>): Promise<Response> => {
    const kind = context.req.param("kind") ?? "";
    const name = context.req.param("name") ?? "";

    const revealing = accounts
      .shadowed()
      .some((each) => each.kind === kind && each.name === name);

    if (!revealing) {
      const naming = (await pool.destinations.list()).filter(
        (each) =>
          each.kind === kind &&
          each.settings["account"] === name &&
          each.retiredAt === undefined,
      ).length;

      const stored = accounts
        .list()
        .some(
          (each) =>
            each.from === "stored" && each.kind === kind && each.name === name,
        );

      if (stored && naming > 0) {
        return refused({ kind: "account-in-use", destinations: naming });
      }
    }

    const removed = await accounts.remove(kind, name);
    if (!removed.ok) return refused(removed.refusal);

    const { revealed } = removed.value;
    return json(
      revealed === undefined
        ? {}
        : { revealed: await view(accounts, revealed, false) },
      200,
    );
  };
}

async function view(
  accounts: Accounts,
  account: KnownAccount,
  shadowed: boolean,
) {
  return {
    ...account,
    shadowed,
    secretSet: await accounts.secretSet(account),
  };
}

function refused(refusal: AccountRefusal): Response {
  return json(errorBody(refusal), accountStatus(refusal));
}
