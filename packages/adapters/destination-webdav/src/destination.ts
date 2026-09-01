import {
  capabilitiesFor,
  CREATE_FILE,
  type Renderers,
} from "@notemap/output-markdown";
import type {
  Delivery,
  DeliveryOutcome,
  Destination,
  DestinationKindAdapter,
  PayloadTypeName,
} from "@notemap/core";

import type { CredentialResolver } from "./credentials";
import { createDav, type Dav } from "./dav";
import { Refused, Unreachable } from "./errors";
import { createNote, type Wiring } from "./notes";
import { asWebdavSettings, WEBDAV, WEBDAV_SETTINGS } from "./settings";

/** What the host wires: neither a renderer nor a credential is a person's setting. */
export type WebdavDestinationConfig = {
  /** By payload type. A type with no renderer gets the default rendering. */
  readonly renderers?: Renderers;
  /** What every destination of this kind takes. */
  readonly accepts: readonly PayloadTypeName[];
  /** Turns a profile name into an account. The adapter never learns where one is held. */
  readonly credentials: CredentialResolver;
};

export function createWebdavDestination(
  config: WebdavDestinationConfig,
): DestinationKindAdapter {
  const renderers = config.renderers ?? {};

  return {
    name: WEBDAV,
    settingsSchema: WEBDAV_SETTINGS,

    /**
     * Never touches the network, exactly as the filesystem kind refuses to
     * touch the disk: a Nextcloud that is asleep must still be routable, with
     * the record made and the delivery deferred. That property is why deferred
     * delivery works at all. A profile that is not declared is not checked for
     * here either — it satisfies the schema, and a settings screen that stalled
     * or refused over it would be answering a question nobody asked.
     */
    describe: (destination) => {
      const settings = asWebdavSettings(destination.settings);
      if (settings === undefined) {
        return Promise.reject(unreadable(destination));
      }

      return Promise.resolve({
        capabilities: capabilitiesFor({
          accepts: config.accepts,
          // Enumerating what is already in the vault is a slice of its own, and
          // a field claiming it can be browsed draws a button that answers
          // not-offered.
          browsable: false,
        }),
      });
    },

    deliver: async (destination, delivery, signal) => {
      const settings = asWebdavSettings(destination.settings);
      if (settings === undefined) {
        return { kind: "rejected", detail: why(unreadable(destination)) };
      }

      let dav: Dav;
      try {
        dav = createDav(await config.credentials(settings.profile));
      } catch (cause) {
        return { kind: "unreachable", detail: why(cause) };
      }

      try {
        const landed = await carryOut(
          { dav, root: settings.root, renderers },
          delivery,
          signal,
        );
        return { kind: "delivered", pointer: landed };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}

function carryOut(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<string> {
  switch (delivery.capability) {
    case CREATE_FILE:
      return createNote(wiring, delivery, signal);
    default:
      return Promise.reject(
        new Refused(`no capability named ${delivery.capability}`),
      );
  }
}

/** Core checks settings against the schema first, so this is the two disagreeing. */
function unreadable(destination: Destination): Error {
  return new Error(`${destination.name} has no readable webdav settings`);
}

/**
 * What a throw from the middle of a delivery means. Anything about the *target*
 * — a path that leaves the vault, a note that is not there — is `rejected`,
 * which is abandoned on the first attempt, because retrying cannot change it.
 */
function failure(cause: unknown): DeliveryOutcome {
  if (cause instanceof Unreachable) {
    return { kind: "unreachable", detail: why(cause) };
  }
  return { kind: "rejected", detail: why(cause) };
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
