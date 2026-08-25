import { createClient, createMemoryStore, type Client } from "@notemap/client";
import {
  asked as sentTo,
  json,
  mockTransport,
  routeOf,
  type Handler,
  type MockTransport,
} from "@notemap/client/testing";

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
});

export function pool(handler: Handler): MockTransport {
  transport = mockTransport(handler);
  client = createClient({ transport, store: createMemoryStore() });
  return transport;
}

/**
 * Every route the shell caused, oldest first. The client's own start-up health
 * probe is left out: it is housekeeping, and racing it would make these flaky.
 */
export function asked(): string[] {
  return sentTo(transport).map(routeOf);
}
