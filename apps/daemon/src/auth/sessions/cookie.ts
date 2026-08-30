import type { Context } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import type { MintedSession } from "../types";
import type { CookieOptions } from "./config";

const getSessionCookieName = (secure: boolean) => secure 
  ? "__Host-session"
  : "session";

const defaultCookieOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
} as const;

export const setSessionCookie = (
  context: Context, 
  minted: MintedSession, 
  options: CookieOptions
) => {
  const name = getSessionCookieName(options.secure);
  setCookie(context, name, minted.token, {
    ...options,
    ...defaultCookieOptions,
    expires: new Date(minted.expiresAt),
  });
}

export const readSessionCookie = (context: Context, options: { secure: boolean }): string | undefined => {
  const name = getSessionCookieName(options.secure);
  return getCookie(context, name);
}

export const clearSessionCookie = (context: Context, options: { secure: boolean }) => {
  const name = getSessionCookieName(options.secure);
  deleteCookie(context, name, {
    ...options,
    ...defaultCookieOptions,
  });
}