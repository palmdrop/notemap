import { createClient, createMemoryStore, type Client } from "@notemap/client";
import {
  json,
  mockTransport,
  routeOf,
  type Handler,
  type MockTransport,
} from "@notemap/client/testing";

import { EDITS } from "$lib/channels";

function unanswered(): Response {
  return json(500, { error: { code: "nothing-stubbed" } });
}

let transport = mockTransport(unanswered);

/**
 * Stands in for `$lib/client`, whose export is a singleton built at import
 * time: a test replaces the module and `pool()` rebuilds what it hands out, so
 * a component reads the live binding rather than a client another test left.
 */
export let client: Client = createClient({
  transport,
  store: createMemoryStore(),
  source: EDITS,
});

export function pool(handler: Handler): MockTransport {
  transport = mockTransport(handler);
  client = createClient({
    transport,
    store: createMemoryStore(),
    source: EDITS,
  });
  return transport;
}

/** Every route the pool was asked for, oldest first. */
export function asked(): string[] {
  return transport.sent.map(routeOf);
}
