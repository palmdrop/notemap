import {
  Rejected,
  Unusable,
  type Delivery,
  type DeliveredOutput,
  type DeliveryOutcome,
  type Destination,
  type DestinationKindAdapter,
  type PayloadTypeName,
} from "@notemap/core";
import { CREATE, PLACE_ASSETS, markdownOutput } from "@notemap/output-markdown";

import { createArena, type Arena, type BlockInput } from "./api";
import {
  arenaCapabilities,
  asArenaArguments,
  type ArenaArguments,
} from "./capabilities";
import { arenaCandidates, arenaNaming } from "./candidates";
import type { CredentialResolver } from "./credentials";
import { Refused, TokenRefused, Unreachable } from "./errors";
import {
  droppedBy,
  provenanceOf,
  renderAssets,
  type ArenaBlock,
  type ArenaRenderers,
  type Carrying,
} from "./blocks";
import { arenaSettings, asArenaSettings, ARENA } from "./settings";

/** Where a person follows a block. Composed by convention: the API offers no web permalink. */
export const ARENA_WEB = "https://www.are.na";

/** What the host wires: neither a renderer nor a credential is a person's setting. */
export type ArenaDestinationConfig = {
  /** By payload type. A type with none is refused by core before a decision is made. */
  readonly renderers: ArenaRenderers;
  /** Turns an account's name into the token. The adapter never learns where one is held. */
  readonly credentials: CredentialResolver;
  /** Names only: a token here is one `/v1` would answer with. */
  readonly accounts?: () => readonly string[];
  /** Host-wired, so the suite can point at a fake. Never config and never a setting. */
  readonly baseUrl?: string;
  readonly uploadsUrl?: string;
  readonly webUrl?: string;
};

export function createArenaDestination(
  config: ArenaDestinationConfig,
): DestinationKindAdapter {
  const accepts = Object.keys(config.renderers) as PayloadTypeName[];
  const webUrl = (config.webUrl ?? ARENA_WEB).replace(/\/+$/, "");

  const reach = async (account: string): Promise<Arena> =>
    createArena({
      credential: await config.credentials(account),
      ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
      ...(config.uploadsUrl === undefined
        ? {}
        : { uploadsUrl: config.uploadsUrl }),
    });

  return {
    name: ARENA,
    // Asked each time: an account may be added while the daemon runs.
    get settingsSchema() {
      return arenaSettings(config.accounts?.() ?? []);
    },

    /**
     * Never touches the network, exactly as both file kinds refuse to: a
     * destination must be routable while are.na is unreachable, which is what
     * makes deferred delivery work at all.
     */
    describe: (destination) => {
      const settings = asArenaSettings(destination.settings);
      if (settings === undefined) {
        return Promise.reject(unreadable(destination));
      }

      return Promise.resolve({ capabilities: arenaCapabilities(accepts) });
    },

    deliver: async (destination, delivery, signal) => {
      const wanted = wanting(config.renderers, destination, delivery);
      if (wanted.kind === "refused") {
        return { kind: "rejected", detail: wanted.detail };
      }

      let arena: Arena;
      try {
        arena = await reach(wanted.settings.account);
      } catch (cause) {
        return { kind: "unreachable", detail: why(cause) };
      }

      // One block at a time, each one's bytes going up before it is made. A
      // block that landed before a later one failed stays where it is: nothing
      // here can ask are.na what it already holds, so a retry makes it again.
      const posted: Posted[] = [];
      try {
        for (const block of wanted.blocks) {
          const value = await valueFor(arena, block, signal);
          const created = await arena.createBlock(
            wanted.args.channel,
            inputFor(block, value, delivery),
            signal,
          );
          posted.push({ block, value, id: created.id });
        }
      } catch (cause) {
        return failure(cause);
      }

      const one = posted.length === 1 ? posted[0]?.id : undefined;

      return {
        kind: "delivered",
        // A channel has no address this adapter can compose, so a delivery
        // that made several blocks names the channel and lists them in its
        // output instead.
        ...(one === undefined
          ? { pointer: wanted.args.channel }
          : { pointer: String(one), url: blockUrl(webUrl, one) }),
        output: outputOf(posted, wanted.carrying, delivery, webUrl),
      };
    },

    /** Converts and reaches nothing: what a block will read as is known without asking. */
    preview: async (destination, delivery) => {
      const wanted = wanting(config.renderers, destination, delivery);
      if (wanted.kind === "refused") throw new Rejected(wanted.detail);

      // The bytes are not uploaded to show a preview, so neither a block's
      // value nor its address is a thing a preview can know; the captions and
      // what was dropped are.
      return outputOf(
        wanted.blocks.map((block) => ({ block, value: block.value })),
        wanted.carrying,
        delivery,
        webUrl,
      );
    },

    candidates: arenaCandidates(reach),
    naming: arenaNaming(reach),

    /**
     * `GET /v3/me`, and nothing more. The answer does not carry the token's
     * scope, so a **read-only token passes this** and finds out at the first
     * delivery, with a `403` that says so. Nothing else in the API exposes it.
     */
    probe: async (destination, signal) => {
      const settings = asArenaSettings(destination.settings);
      if (settings === undefined) throw unreadable(destination);

      // `Unusable`, not `Rejected`: nothing was reached, so nothing refused
      // anything. An account nobody declared is a destination that cannot be
      // made sense of at all — a config edit away, and not a retry away, which
      // is the one thing `unreachable` would promise.
      let arena: Arena;
      try {
        arena = await reach(settings.account);
      } catch (cause) {
        throw new Unusable(why(cause), { cause });
      }

      try {
        await arena.me(signal);
      } catch (cause) {
        if (cause instanceof TokenRefused || cause instanceof Refused) {
          throw new Rejected(why(cause), { cause });
        }
        throw cause;
      }
    },
  };
}

type Wanted =
  | {
      readonly kind: "wanted";
      readonly settings: { readonly account: string };
      readonly args: ArenaArguments;
      /** One per block the delivery will make, in slot order. */
      readonly blocks: readonly ArenaBlock[];
      readonly carrying: Carrying;
    }
  | { readonly kind: "refused"; readonly detail: string };

/** Everything decided before anything is reached, so a delivery and a preview decide it once. */
function wanting(
  renderers: ArenaRenderers,
  destination: Destination,
  delivery: Delivery,
): Wanted {
  const settings = asArenaSettings(destination.settings);
  if (settings === undefined) {
    return { kind: "refused", detail: why(unreadable(destination)) };
  }

  if (delivery.capability !== CREATE && delivery.capability !== PLACE_ASSETS) {
    return {
      kind: "refused",
      detail: `no capability named ${delivery.capability}`,
    };
  }

  const args = asArenaArguments(delivery.arguments);
  if (args === undefined) {
    return {
      kind: "refused",
      detail: `that is not a ${delivery.capability} argument set`,
    };
  }

  if (delivery.capability === PLACE_ASSETS) {
    const blocks = renderAssets(delivery);
    // Nothing to deliver, and no later attempt finds more.
    if (blocks.length === 0) {
      return {
        kind: "refused",
        detail: "this capture carries no attachment to make a block from",
      };
    }

    return { kind: "wanted", settings, args, blocks, carrying: "assets" };
  }

  const renderer = renderers[delivery.payload.type];
  if (renderer === undefined) {
    // Unreachable through core, which refuses a payload type `accepts` does
    // not name before a decision is even made.
    return {
      kind: "refused",
      detail: `nothing turns a ${delivery.payload.type} into a block`,
    };
  }

  return {
    kind: "wanted",
    settings,
    args,
    blocks: renderer(delivery),
    carrying: "everything",
  };
}

/**
 * Where the block is an asset, the bytes go up first and the value is where
 * they landed. Presign and upload belong to one attempt — the URL expires in an
 * hour — so a retry presigns again.
 */
async function valueFor(
  arena: Arena,
  block: ArenaBlock,
  signal?: AbortSignal,
): Promise<string> {
  const delivered = block.asset;
  if (delivered === undefined) return block.value;

  const presigned = await arena.presign(
    delivered.asset.filename,
    delivered.asset.mime,
    signal,
  );
  await arena.upload(
    presigned,
    await delivered.open(signal),
    delivered.asset.bytes,
    signal,
  );

  return arena.uploadedUrl(presigned.key);
}

function inputFor(
  block: ArenaBlock,
  value: string,
  delivery: Delivery,
): BlockInput {
  const metadata = provenanceOf(delivery);

  return {
    value,
    ...(block.description === undefined
      ? {}
      : { description: block.description }),
    // Only where the value is an image: alt text on a text block describes
    // nothing.
    ...(block.asset === undefined || block.altText === undefined
      ? {}
      : { alt_text: block.altText }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/** One block, with the value it was posted under and the id it came back with. */
type Posted = {
  readonly block: ArenaBlock;
  readonly value: string;
  readonly id?: number;
};

/** The blocks as a person would read them back, and what a block could not carry. */
function outputOf(
  posted: readonly Posted[],
  carrying: Carrying,
  delivery: Delivery,
  webUrl: string,
): DeliveredOutput {
  const note = droppedBy(delivery, carrying);

  return {
    ...markdownOutput(bodyOf(posted, webUrl)),
    ...(note === undefined ? {} : { note }),
  };
}

/**
 * Where a delivery made several blocks, the addresses it made, one a line:
 * the record's pointer names the channel, so this is the only place that says
 * which blocks went. One block reads as itself instead, and so does a preview,
 * which knows no address at all.
 */
function bodyOf(posted: readonly Posted[], webUrl: string): string {
  const made = posted.flatMap(({ id }) =>
    id === undefined ? [] : [blockUrl(webUrl, id)],
  );
  if (posted.length > 1 && made.length > 0) return `${made.join("\n")}\n`;

  // An empty value is left out rather than drawn as a blank line: a preview of
  // an image has none, the bytes not having been uploaded to show one.
  const lines = posted.flatMap(({ block, value }) => [
    ...(value === "" ? [] : [value]),
    ...(block.description === undefined ? [] : [block.description]),
  ]);

  return `${lines.join("\n\n")}\n`;
}

function blockUrl(webUrl: string, id: number): string {
  return `${webUrl}/block/${id}`;
}

/** Core checks settings against the schema first, so this is the two disagreeing. */
function unreadable(destination: Destination): Error {
  return new Error(`${destination.name} has no readable arena settings`);
}

/**
 * A token that was refused is `unreachable` to a delivery and `rejected` to a
 * probe, following the WebDAV kind: the delivery is right to retry one, a token
 * having possibly just been rotated, and a person asking now is owed the answer
 * that it is wrong. Everything else about the *target* — an under-scoped token,
 * a channel that is gone, a block are.na would not take — is permanent.
 */
function failure(cause: unknown): DeliveryOutcome {
  if (cause instanceof Unreachable || cause instanceof TokenRefused) {
    return { kind: "unreachable", detail: why(cause) };
  }
  return { kind: "rejected", detail: why(cause) };
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
