import { v7 as uuidv7 } from "uuid";

import { createApi, answered } from "./api/http";
import type { Item, ItemId } from "./api/types";
import { envelopeFor, optimisticItem } from "./capture/envelope";
import { Refused } from "./errors";
import { derived, writable } from "./observable/observable";
import { createOutbox } from "./outbox/outbox";
import { sendOperation } from "./outbox/encode";
import { createRouting } from "./routing/routing";
import { persistItems } from "./state/persist";
import { cached, emptyState, processed, type ClientState } from "./state/state";
import { loadMore, type Surface } from "./surfaces/reads";
import type { Client, ClientConfig, ListState } from "./types";

const IMAGE = "image";

/** A projection rebuilds its array every time, so identity alone never matches. */
function sameList(one: ListState, other: ListState): boolean {
  return (
    one.loading === other.loading &&
    one.more === other.more &&
    one.failure === other.failure &&
    one.items.length === other.items.length &&
    one.items.every((item, at) => item === other.items[at])
  );
}

function listOf(state: ClientState, surface: Surface): ListState {
  const page = state[surface];
  const items = page.ids
    .map((id) => state.items.get(id))
    .filter((item): item is Item => item !== undefined);

  return {
    items,
    loading: page.loading,
    more: !page.exhausted,
    ...(page.failure === undefined ? {} : { failure: page.failure }),
  };
}

export function createClient(config: ClientConfig): Client {
  const { transport, store } = config;
  const now = config.now ?? (() => new Date().toISOString());
  const api = createApi(transport);
  const state = writable<ClientState>(emptyState());

  persistItems(state, store);

  const outbox = createOutbox({
    state,
    store,
    send: (operation) => sendOperation(api, operation),
    now,
    mint: uuidv7,
  });

  function assetContent(asset: string): string {
    return `${transport.baseUrl}/v1/assets/${encodeURIComponent(asset)}/content`;
  }

  async function mutate(operation: Parameters<typeof outbox.enqueue>[0]) {
    await outbox.enqueue(operation);
    void outbox.drain();
  }

  return {
    feed: derived(
      state.changes,
      (current) => listOf(current, "feed"),
      sameList,
    ),
    queue: derived(
      state.changes,
      (current) => listOf(current, "queue"),
      sameList,
    ),
    outbox: derived(state.changes, (current) => current.outbox),

    loadFeed: () => loadMore(state, api, "feed"),
    loadQueue: () => loadMore(state, api, "queue"),

    async item(id: ItemId) {
      try {
        const item = await answered(
          api.GET("/v1/items/{id}", { params: { path: { id } } }),
        );
        state.update((current) => ({
          ...current,
          items: cached(current, [item]),
        }));
        return item;
      } catch (error) {
        if (error instanceof Refused && error.code === "no-such-item") {
          return undefined;
        }
        throw error;
      }
    },

    async capture(input) {
      const id = uuidv7();
      const envelope = envelopeFor(input, id, now());

      await mutate({ kind: "capture", envelope });
      return optimisticItem(envelope);
    },

    archive: (item, reason) =>
      mutate({
        kind: "archive",
        item,
        ...(reason === undefined ? {} : { reason }),
      }),

    unarchive: (item) => mutate({ kind: "unarchive", item }),

    uploadAsset: (file: File) =>
      answered(
        api.POST("/v1/assets", {
          params: {
            header: {
              "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            },
          },
          headers: { "content-type": file.type || "application/octet-stream" },
          // The body is the bytes, raw. Serialising them would be the one thing
          // this route does not want.
          body: file as unknown as string,
          bodySerializer: (body: unknown) => body as BodyInit,
        }),
      ),

    assetContent,

    says: (item) => {
      const said =
        item.payload.content["text"] ?? item.payload.content["caption"];
      return typeof said === "string" ? said : "";
    },

    /** Only `image` captures: another payload type's slot may hold anything at all. */
    images: (item) =>
      item.payload.type === IMAGE
        ? item.payload.assets.map((reference) => assetContent(reference.asset))
        : [],

    routing: createRouting({
      api,
      processed: (item) => state.update((current) => processed(current, item)),
    }),

    drain: () => outbox.drain(),
    dismiss: (operation) => outbox.dismiss(operation),
  };
}
