import { afterEach } from "vitest";

import {
  createClient,
  createMemoryStore,
  type Client,
  type ClientStore,
} from "@notemap/client";
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
 * A store that says which assets it is holding bytes for, which the port has no
 * way to ask: the tests about held bytes would otherwise have to settle for
 * what a surface draws, and a surface drew the right thing throughout the life
 * of the leak this answers.
 */
function recording(store: ClientStore): {
  readonly store: ClientStore;
  readonly held: ReadonlySet<string>;
} {
  const held = new Set<string>();

  return {
    held,
    store: {
      ...store,
      // The browser's store clones what it is given and throws on what it
      // cannot, a `$state` proxy among them.
      async writeOperation(operation) {
        await store.writeOperation(structuredClone(operation));
      },
      async writeBlob(asset, blob) {
        await store.writeBlob(asset, blob);
        held.add(asset);
      },
      async removeBlob(asset) {
        await store.removeBlob(asset);
        held.delete(asset);
      },
    },
  };
}

let blobs: ReadonlySet<string>;

/** The assets whose bytes the store this test built is holding. */
export function heldBlobs(): readonly string[] {
  return [...blobs];
}

/** A fresh store per client, and the one `heldBlobs` answers for. */
function recorded(): ClientStore {
  const store = recording(createMemoryStore());
  blobs = store.held;
  return store.store;
}

/**
 * Stands in for `$lib/client`, whose export is a singleton built at import
 * time: a test replaces the module and `pool()` rebuilds what it hands out, so
 * a component reads the live binding rather than a client another test left.
 */
export let client: Client = createClient({ transport, store: recorded() });

export function pool(handler: Handler): MockTransport {
  // The one it replaces holds a running probe, and nothing else will stop it.
  client.close();
  transport = mockTransport(handler);
  client = createClient({ transport, store: recorded() });
  return transport;
}

// The last client of a file has no successor to close it, and its probe would
// go on ticking for as long as the worker lives. Every test builds its own.
afterEach(() => client.close());

/** Every route the shell caused, oldest first. */
export function asked(): string[] {
  return sentTo(transport).map(routeOf);
}

/** The URLs it asked, for the assertions that are about the query. */
export function sentUrls(): string[] {
  return sentTo(transport).map((request) => request.url);
}

/** The JSON bodies it sent, for the assertions that are about what was said. */
export async function sent(): Promise<unknown[]> {
  return Promise.all(
    sentTo(transport)
      .filter((request) => request.body !== null)
      .map((request) => request.clone().json()),
  );
}
