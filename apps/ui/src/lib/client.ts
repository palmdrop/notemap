import {
  createClient,
  createFetchTransport,
  createMemoryStore,
} from "@notemap/client";

import { EDITS } from "./channels";

/**
 * Empty means same origin: in production the daemon serves this app itself,
 * and in dev vite proxies `/v1` to it. An absolute URL is for a shell that
 * cannot be same-origin, which reopens the auth question.
 */
const baseUrl = import.meta.env.VITE_API_URL ?? "";

/**
 * The web shell's ports. The store is in-memory, so nothing survives a reload:
 * offline needs a durable one here *and* a client that reads it back on start,
 * which is not wired yet.
 */
export const client = createClient({
  transport: createFetchTransport(baseUrl),
  store: createMemoryStore(),
  source: EDITS,
});
