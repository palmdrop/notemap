import { createApi, answered } from "./api/http";
import type { Asset, Item, ItemId } from "./api/types";
import { envelopeFor, optimisticItem } from "./capture/envelope";
import { uuidv7 } from "./capture/uuid";
import { readRefusal, Refused, Unreachable } from "./errors";
import { derived, writable } from "./observable/observable";
import { createOutbox } from "./outbox/outbox";
import { sendOperation } from "./outbox/encode";
import { createRouting } from "./routing/routing";
import { persistItems } from "./state/persist";
import { cached, emptyState, type ClientState } from "./state/state";
import { loadMore, type Surface } from "./surfaces/reads";
import type { Client, ClientConfig, ListState } from "./types";

const IMAGE = "image";

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
    feed: derived(state, (current) => listOf(current, "feed")),
    queue: derived(state, (current) => listOf(current, "queue")),
    outbox: derived(state, (current) => current.outbox),

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

    async uploadAsset(file: File) {
      const request = new Request(`${transport.baseUrl}/v1/assets`, {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        },
        body: file,
      });

      let response: Response;
      try {
        response = await transport.fetch(request);
      } catch (cause) {
        throw new Unreachable(cause);
      }

      const body: unknown = await response.json();
      if (response.status !== 201) throw readRefusal(body);
      return body as Asset;
    },

    assetContent,

    /** Only `image` captures: another payload type's slot may hold anything at all. */
    images: (item) =>
      item.payload.type === IMAGE
        ? item.payload.assets.map((reference) => assetContent(reference.asset))
        : [],

    routing: createRouting(api),

    drain: () => outbox.drain(),
    dismiss: (operation) => outbox.dismiss(operation),
  };
}
