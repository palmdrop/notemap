import {
  createClient,
  createFetchTransport,
  createMemoryStore,
} from "@notemap/client";

/**
 * Empty means same origin: in production the daemon serves this app itself,
 * and in dev vite proxies `/v1` to it. An absolute URL is for a shell that
 * cannot be same-origin, which reopens the auth question.
 */
const baseUrl = import.meta.env.VITE_API_URL ?? "";

/**
 * The web shell's ports. The store is in-memory, so nothing survives a reload
 * yet; making it durable is the whole of what offline needs from this file.
 */
export const client = createClient({
  transport: createFetchTransport(baseUrl),
  store: createMemoryStore(),
});
