import type { Context } from "hono";

import type { Timestamp } from "@notemap/core";

import type { Auth, TokenId } from "../auth/types";
import type { AppEnv } from "../types";
import { mintTokenRequestSchema } from "../schemas/token";
import { toTimestamp } from "../schemas/timestamp";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

export function tokensHandler(auth: Auth) {
  return async (): Promise<Response> =>
    json({ values: await auth.listTokens() }, 200);
}

export function mintTokenHandler(auth: Auth) {
  return async (context: Context<AppEnv>): Promise<Response> => {
    const body = await readBody(context, mintTokenRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const expiresAt: Timestamp | undefined =
      body.value.expiresAt === undefined
        ? undefined
        : toTimestamp(body.value.expiresAt);

    const minted = await auth.mintToken(body.value.name, expiresAt);

    return json(minted, 201);
  };
}

export function revokeTokenHandler(auth: Auth) {
  return async (context: Context<AppEnv>): Promise<Response> => {
    await auth.revokeToken((context.req.param("id") ?? "") as TokenId);

    return new Response(null, { status: 204 });
  };
}
