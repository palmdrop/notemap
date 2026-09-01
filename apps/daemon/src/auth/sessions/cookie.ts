import type { Context } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import type { MintedSession } from "../types";
import type { CookieOptions } from "./config";

const sessionCookieName = ({ prefixed }: CookieOptions) =>
  prefixed ? "__Host-session" : "session";

/**
 * `__Host-` asks for exactly these, so they are here rather than at a call
 * site: the prefix is a promise the attributes have to keep.
 */
const attributesFor = ({ secure }: CookieOptions) =>
  ({
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
  }) as const;

export const setSessionCookie = (
  context: Context,
  minted: MintedSession,
  options: CookieOptions,
) => {
  setCookie(context, sessionCookieName(options), minted.token, {
    ...attributesFor(options),
    expires: new Date(minted.expiresAt),
  });
};

export const readSessionCookie = (
  context: Context,
  options: CookieOptions,
): string | undefined => getCookie(context, sessionCookieName(options));

export const clearSessionCookie = (
  context: Context,
  options: CookieOptions,
) => {
  deleteCookie(context, sessionCookieName(options), attributesFor(options));
};
