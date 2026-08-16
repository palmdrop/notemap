import createClient from "openapi-fetch";
import type { paths } from "./generated";

/**
 * Empty means same origin: in production the daemon serves this app itself,
 * and in dev vite proxies `/v1` to it. An absolute URL is for a shell that
 * cannot be same-origin, which reopens the auth question.
 */
export const baseUrl = import.meta.env.VITE_API_URL ?? "";

export const api = createClient<paths>({ baseUrl });
