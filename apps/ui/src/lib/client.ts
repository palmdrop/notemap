import { createClient, createFetchTransport } from "@notemap/client";
import { createIndexedDbStore } from "@notemap/client/indexeddb";

/**
 * Empty means same origin: in production the daemon serves this app itself,
 * and in dev vite proxies `/v1` to it. An absolute URL is for a shell that
 * cannot be same-origin, which reopens the auth question.
 */
const baseUrl = import.meta.env.VITE_API_URL ?? "";

/**
 * The web shell's ports. The store is the browser's own, and the client reads
 * it back on start, so an outbox filled with the pool down survives a reload
 * and drains without anyone asking.
 */
export const client = createClient({
  transport: createFetchTransport(baseUrl),
  store: createIndexedDbStore(),
});
