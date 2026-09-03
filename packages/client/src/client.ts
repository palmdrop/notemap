import { distinctUntilChanged, filter, map, skip } from "rxjs";
import { v7 as uuidv7 } from "uuid";

import { createActions } from "./actions/actions";
import { createApi, answered } from "./api/http";
import type { AssetId, Item, ItemId, PoolIdentity } from "./api/types";
import { releasedBy } from "./assets/assets";
import { envelopeFor, optimisticItem } from "./capture/envelope";
import { rewritten, saidIn } from "./capture/says";
import { PoolChanged, Refused, saidBy, Unreachable } from "./errors";
import { derived, writable, type Writable } from "./observable/observable";
import { createDestinations } from "./destinations/destinations";
import { createOutbox } from "./outbox/outbox";
import { sendOperation } from "./outbox/registry";
import { undrained, waiting } from "./outbox/undrained";
import { reachability } from "./pool/reachability";
import type { Transport } from "./ports/transport";
import { createRouting } from "./routing/routing";
import { hydrate } from "./state/hydrate";
import { persist } from "./state/persist";
import { retained } from "./state/retention";
import {
  cached,
  drawnFrom,
  emptyState,
  forget,
  forgotten,
  fromCache,
  processed,
  rebuilt,
  settle,
  settledDestination,
  withBlobUrl,
  withdrawn,
  type ClientState,
  type Surface,
} from "./state/state";
import { createSessions } from "./session/session";
import { createTags } from "./tags/tags";
import { createTokens } from "./tokens/tokens";
import { loadMore, readAfterReturn } from "./surfaces/reads";
import type { Client, ClientConfig, ListState } from "./types";

const IMAGE = "image";

function copied(file: File): Promise<File> {
  return file
    .arrayBuffer()
    .then((bytes) => new File([bytes], file.name, { type: file.type }));
}

/** A projection rebuilds its array every time, so identity alone never matches. */
function sameList(one: ListState, other: ListState): boolean {
  return (
    one.loading === other.loading &&
    one.order === other.order &&
    one.more === other.more &&
    one.fromCache === other.fromCache &&
    one.failure === other.failure &&
    one.items.length === other.items.length &&
    one.items.every((item, at) => item === other.items[at])
  );
}

/**
 * A 5xx is not evidence of reach: `undecided` reads one as a socket that never
 * opened. A 401 is the opposite — the daemon is plainly there — and it is the
 * only notice a client gets that a credential lapsed, since nothing announces
 * an expiry.
 */
function watching(
  transport: Transport,
  answered: (reached: boolean) => void,
  lapsed: () => void,
): Transport {
  return {
    ...transport,
    async fetch(request) {
      try {
        const response = await transport.fetch(request);
        answered(response.status < 500);
        if (response.status === 401) lapsed();
        return response;
      } catch (error) {
        answered(false);
        throw error;
      }
    },
  };
}

/** A set is rebuilt on every state change, so identity alone never matches. */
function sameIds(
  one: ReadonlySet<ItemId>,
  other: ReadonlySet<ItemId>,
): boolean {
  return one.size === other.size && [...one].every((id) => other.has(id));
}

function listOf(state: ClientState, surface: Surface): ListState {
  const page = state[surface];
  const drawn = fromCache(page);
  const items = drawn
    ? drawnFrom(state, surface)
    : page.ids
        .map((id) => state.items.get(id))
        .filter((item): item is Item => item !== undefined);

  return {
    items,
    order: page.order,
    loading: page.loading,
    more: !page.exhausted,
    fromCache: drawn,
    ...(page.failure === undefined ? {} : { failure: page.failure }),
  };
}

export function createClient(config: ClientConfig): Client {
  const { transport, store } = config;
  const now = config.now ?? (() => new Date().toISOString());
  const report = config.onError ?? (() => undefined);
  const held = writable<ClientState>(emptyState());
  // Every state change passes through here, so no path can forget retention.
  const state: Writable<ClientState> = {
    get: () => held.get(),
    set: (value) => held.set(retained(value)),
    update: (change) => held.update((current) => retained(change(current))),
    changes: held.changes,
  };
  const reach = reachability(() => askedHealth(), now);

  // The sessions object needs the api, and the api needs to tell it about a
  // 401, so the notice goes through a binding rather than through either.
  let noticeLapsed = (): void => undefined;
  const api = createApi(
    watching(transport, reach.answered, () => {
      noticeLapsed();
    }),
  );

  const sessions = createSessions({
    api,
    forget: () =>
      after(() => {
        state.update(forgotten);
      }),
  });

  noticeLapsed = sessions.lapsed;

  const actions = createActions({ api });

  // The watcher keeps its own tempo, and only the gates are the client's to
  // hold: it asks nothing while nobody is reading and nothing while the pool
  // is not answering.
  const onReach = reach.changes
    .pipe(
      map((mark) => mark.yes),
      distinctUntilChanged(),
    )
    .subscribe((yes) => actions.answering(yes));

  /**
   * Hydration is started here and waited on by everything that touches state,
   * so no caller can observe a half-read cache. A store that cannot be read
   * leaves a cold client rather than a dead one, which is why this cannot be
   * allowed to reject: a rejected `ready` is a client where nothing works.
   */
  const ready = hydrate(state, store, report)
    .catch((error: unknown) => {
      report(error);
      return state.get();
    })
    .then((hydrated) => {
      outbox.restored(hydrated.outbox.map((held) => held.id));
      persist(state, store, hydrated, report);
    });

  function after<T>(work: () => T | Promise<T>): Promise<T> {
    return ready.then(work);
  }

  function isThePoolWeCached(identity: PoolIdentity | undefined): void {
    if (identity === undefined) return;

    const ours = state.get().pool;
    if (ours === identity) return;

    state.update((current) =>
      ours === undefined
        ? { ...current, pool: identity }
        : rebuilt(current, identity),
    );
    if (ours !== undefined) report(new PoolChanged(ours, identity));
  }

  async function askedHealth(): Promise<boolean> {
    try {
      isThePoolWeCached((await answered(api.GET("/v1/health"))).pool);
      return true;
    } catch (error) {
      // A refusal is still the pool answering. Only silence is not.
      return !(error instanceof Unreachable);
    }
  }

  function bytesOf(asset: AssetId): string {
    return state.get().blobUrls.get(asset) ?? transport.assetUrl(asset);
  }

  const tags = createTags({
    api,
    inUse: derived(state.changes, (current) => current.tags),
    cached: (held) =>
      after(() => state.update((current) => ({ ...current, tags: held }))),
  });

  let classified = false;

  async function fetched(id: ItemId): Promise<Item | undefined> {
    try {
      return await answered(
        api.GET("/v1/items/{id}", { params: { path: { id } } }),
      );
    } catch (error) {
      if (error instanceof Refused && error.code === "no-such-item") {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * What the pool holds for an item, over whatever was drawn for it. An item
   * the pool does not have is forgotten: the operation that drew it was refused
   * and nothing will ever claim it.
   */
  async function reread(id: ItemId): Promise<void> {
    const item = await fetched(id);
    state.update((current) =>
      item === undefined ? forget(current, id) : settle(current, item),
    );
  }

  /**
   * A release that fails is reported rather than thrown: the operation has left
   * the outbox whether or not the bytes went, and failing here would hand back
   * a refusal for a capture the pool took.
   */
  async function release(operation: Parameters<typeof outbox.enqueue>[0]) {
    for (const asset of releasedBy(operation, state.get().outbox)) {
      state.update((current) => withBlobUrl(current, asset, undefined));
      await store.removeBlob(asset).catch(report);
    }
  }

  const outbox = createOutbox({
    state,
    store,
    reread,
    released: release,
    send: async (operation) => {
      const settlement = await sendOperation(
        { api, bytes: (asset) => store.readBlob(asset) },
        operation,
      );
      classified ||= operation.kind === "tag" || operation.kind === "untag";
      return settlement;
    },
    now,
    mint: uuidv7,
  });

  /**
   * A drain's own requests are evidence of reach, so an operation that sends
   * two and fails on the second reports the pool as back and then gone again.
   * A return inside a drain therefore rides it rather than starting another,
   * which would send the pair again at once and go on doing so.
   */
  let sweeping = 0;

  /**
   * Classification that reached the pool changes what is in use, and the pool
   * answering it is proof of reach — so the set is read again, once per drain
   * rather than once per operation: a backlog of eight tags is one question.
   * Failing that read leaves the last answer standing, which is what an
   * unreachable pool leaves anyway.
   */
  async function sweep(): Promise<void> {
    sweeping += 1;
    try {
      await outbox.drain();
      if (!classified) return;

      classified = false;
      await tags.load().catch(() => undefined);
    } finally {
      sweeping -= 1;
    }
  }

  /**
   * Queued rather than concurrent, so awaiting a drain means every mutation
   * made before it has been attempted — including the drain a mutation starts
   * on its own and nobody holds.
   */
  let draining: Promise<void> = ready;

  function drain(): Promise<void> {
    draining = draining.then(sweep, sweep);
    return draining;
  }

  async function mutate(operation: Parameters<typeof outbox.enqueue>[0]) {
    await ready;
    await outbox.enqueue(operation);
    void drain();
  }

  // A return, not an answer: the mark carries when it was last answered and so
  // says something on every request, and only a flip back to reachable is one.
  // skip(1) then drops where reachability starts, which is not a return either.
  // The surfaces are read after the drain rather than beside it, so the page the
  // pool answers already holds what was waiting to be sent.
  const onReturn = reach.changes
    .pipe(
      map((mark) => mark.yes),
      distinctUntilChanged(),
      skip(1),
      filter(Boolean),
    )
    .subscribe(() => {
      // The surfaces are read whichever drain this is: a read cannot start a
      // drain, so nothing here can loop.
      void (sweeping === 0 ? drain() : draining)
        .then(() => readAfterReturn(state, api))
        .catch(report);
    });

  // Work made in a previous session reaches the pool without anyone asking —
  // but not before the pool has said which pool it is.
  void after(() => reach.ask())
    .catch(() => undefined)
    .then(() => drain());

  return {
    reachable: reach.changes,
    probe: () => reach.ask(),

    session: sessions.changes,
    askSession: () => sessions.ask(),
    login: (name, password) => sessions.login(name, password),
    logout: () => sessions.logout(),

    tokens: createTokens({ api }),

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
    undrained: derived(
      state.changes,
      (current) => undrained(current.outbox),
      sameIds,
    ),
    waiting: derived(
      state.changes,
      (current) => waiting(current.outbox).length,
    ),

    loadFeed: (order) => after(() => loadMore(state, api, "feed", order)),
    loadQueue: (order) => after(() => loadMore(state, api, "queue", order)),

    item: (id) =>
      after(async () => {
        try {
          const item = await fetched(id);
          if (item !== undefined) {
            state.update((current) => ({
              ...current,
              items: cached(current, [item]),
            }));
          }
          return { fromCache: false, ...(item === undefined ? {} : { item }) };
        } catch (error) {
          // The cached copy is kept rather than dropped: nothing the pool
          // refused to answer says anything about what the client holds.
          const held = state.get().items.get(id);
          return {
            fromCache: held !== undefined,
            ...(held === undefined ? {} : { item: held }),
            failure: {
              said: saidBy(error),
              refused: !(error instanceof Unreachable),
            },
          };
        }
      }),

    held: (id) => derived(state.changes, (current) => current.items.get(id)),

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

    tag: (item, tag) => mutate({ kind: "tag", item, tag }),
    untag: (item, tag) => mutate({ kind: "untag", item, tag }),

    edit: (item, payload, source) =>
      mutate({
        kind: "edit",
        item,
        // Minted here and carried on the operation, so every retry of this edit
        // claims the same identity and the pool answers one revision.
        envelope: { source, sourceItemId: uuidv7(), payload },
      }),

    /** What an edit starts from: the payload as it stands, with new words in it. */
    saying: (item, said) => rewritten(item.payload, said),

    // A fresh id per call, not per file: nothing here replays an attachment, so
    // two calls over one file are two assets, as two uploads have always been.
    attach: (file) =>
      after(async () => {
        const asset = uuidv7();
        // Copied rather than referenced: a picker's `File` points at a file on
        // disk, which a capture that has not drained may outlive by days.
        await store.writeBlob(asset, await copied(file));

        const url = await store.blobUrl(asset);
        if (url !== undefined) {
          state.update((current) => withBlobUrl(current, asset, url));
        }

        return asset;
      }),

    assetContent: (asset) => bytesOf(asset),

    says: (item) => saidIn(item.payload),

    /** Only `image` captures: another payload type's slot may hold anything at all. */
    images: (item) =>
      item.payload.type === IMAGE
        ? item.payload.assets.map((reference) => bytesOf(reference.asset))
        : [],

    routing: createRouting({
      api,
      processed: (item, record) =>
        after(() =>
          state.update((current) => processed(current, item, record)),
        ),
      withdrawn: (item, records) =>
        after(() =>
          state.update((current) => withdrawn(current, item, records)),
        ),
    }),

    destinations: createDestinations({
      api,
      all: derived(state.changes, (current) => current.destinations),
      held: () => state.get().destinations,
      cached: (destinations) =>
        after(() => state.update((current) => ({ ...current, destinations }))),
      settled: (id, held) =>
        after(() =>
          state.update((current) => settledDestination(current, id, held)),
        ),
    }),

    tags,

    actions,

    drain,
    dismiss: (operation) => after(() => outbox.dismiss(operation)),
    watched: (yes) => {
      reach.watched(yes);
      actions.watched(yes);
    },

    close() {
      reach.stop();
      actions.stop();
      onReturn.unsubscribe();
      onReach.unsubscribe();
    },
  };
}
