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
import { CREATE, markdownOutput } from "@notemap/output-markdown";

import { createArena, type Arena, type BlockInput } from "./api";
import {
  arenaCapabilities,
  asArenaArguments,
  type ArenaArguments,
} from "./capabilities";
import { arenaCandidates } from "./candidates";
import type { CredentialResolver } from "./credentials";
import { Refused, TokenRefused, Unreachable } from "./errors";
import {
  droppedBy,
  provenanceOf,
  type ArenaBlock,
  type ArenaRenderers,
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
  readonly accounts?: readonly string[];
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
    settingsSchema: arenaSettings(config.accounts ?? []),

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

      try {
        const value = await valueFor(arena, wanted.block, delivery, signal);
        const created = await arena.createBlock(
          wanted.args.channel,
          inputFor(wanted.block, value, delivery),
          signal,
        );

        return {
          kind: "delivered",
          pointer: String(created.id),
          url: `${webUrl}/block/${created.id}`,
          output: outputOf(wanted.block, value, delivery),
        };
      } catch (cause) {
        return failure(cause);
      }
    },

    /** Converts and reaches nothing: what a block will read as is known without asking. */
    preview: async (destination, delivery) => {
      const wanted = wanting(config.renderers, destination, delivery);
      if (wanted.kind === "refused") throw new Rejected(wanted.detail);

      // The bytes are not uploaded to show a preview, so the value is the one
      // thing a preview cannot know; the caption and what was dropped are.
      return outputOf(wanted.block, wanted.block.value, delivery);
    },

    candidates: arenaCandidates(reach),

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
      readonly block: ArenaBlock;
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

  if (delivery.capability !== CREATE) {
    return {
      kind: "refused",
      detail: `no capability named ${delivery.capability}`,
    };
  }

  const args = asArenaArguments(delivery.arguments);
  if (args === undefined) {
    return { kind: "refused", detail: "that is not a create argument set" };
  }

  // A guard rather than a case: the client builds `assets` as zero-or-one, so
  // only a direct `/v1` caller reaches this.
  if (delivery.payload.assets.length > 1) {
    return {
      kind: "refused",
      detail:
        "a block holds one thing, and this capture carries more than one asset",
    };
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

  return { kind: "wanted", settings, args, block: renderer(delivery) };
}

/**
 * Where the block is an asset, the bytes go up first and the value is where
 * they landed. Presign and upload belong to one attempt — the URL expires in an
 * hour — so a retry presigns again.
 */
async function valueFor(
  arena: Arena,
  block: ArenaBlock,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<string> {
  if (block.asset === undefined) return block.value;

  const slot = block.asset.slot;
  const delivered = delivery.assets.find((each) => each.slot === slot);
  if (delivered === undefined) {
    throw new Refused(
      `the capture references an asset in ${slot} that is not there`,
    );
  }

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

/** The block as a person would read it back, and what a block could not carry. */
function outputOf(
  block: ArenaBlock,
  value: string,
  delivery: Delivery,
): DeliveredOutput {
  // An empty value is left out rather than drawn as a blank line: a preview of
  // an image has none, the bytes not having been uploaded to show one.
  const lines = [
    ...(value === "" ? [] : [value]),
    ...(block.description === undefined ? [] : [block.description]),
  ];
  const note = droppedBy(delivery);

  return {
    ...markdownOutput(`${lines.join("\n\n")}\n`),
    ...(note === undefined ? {} : { note }),
  };
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
