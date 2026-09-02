import {
  APPEND_TO_FILE,
  capabilitiesFor,
  CREATE_FILE,
  type Renderers,
} from "@notemap/output-markdown";
import {
  Rejected,
  type Delivery,
  type DeliveryOutcome,
  type Destination,
  type DestinationKindAdapter,
  type PayloadTypeName,
} from "@notemap/core";

import type { CredentialResolver } from "./credentials";
import { createDav, type Dav } from "./dav";
import { Refused, Unreachable } from "./errors";
import { appendToNote, createNote, type Wiring } from "./notes";
import { contain } from "./paths";
import { asWebdavSettings, WEBDAV, webdavSettings } from "./settings";

/** What the host wires: neither a renderer nor a credential is a person's setting. */
export type WebdavDestinationConfig = {
  /** By payload type. A type with no renderer gets the default rendering. */
  readonly renderers?: Renderers;
  /** What every destination of this kind takes. */
  readonly accepts: readonly PayloadTypeName[];
  /** Turns an account's name into the account. The adapter never learns where one is held. */
  readonly credentials: CredentialResolver;
  /**
   * The names of the accounts declared for this kind, so a person is offered
   * them rather than told to go and read the config. Names only: an address or
   * a secret here would be one `GET /v1/destination-kinds` answers with.
   */
  readonly accounts?: readonly string[];
};

export function createWebdavDestination(
  config: WebdavDestinationConfig,
): DestinationKindAdapter {
  const renderers = config.renderers ?? {};

  return {
    name: WEBDAV,
    settingsSchema: webdavSettings(config.accounts ?? []),

    /**
     * Never touches the network, exactly as the filesystem kind refuses to
     * touch the disk: a Nextcloud that is asleep must still be routable, with
     * the record made and the delivery deferred. That property is why deferred
     * delivery works at all. An account that is not declared is not checked for
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
        dav = createDav(await config.credentials(settings.account));
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

    /**
     * A `PROPFIND` at the root and nothing else: the account resolves, the
     * server answers, it accepts the credential, and the folder is there. That
     * a note can be *written* is inferred from all four, never proved, since
     * proving it means putting a file in somebody's vault.
     *
     * A rejected credential is `Rejected` here and `Unreachable` to a delivery.
     * The delivery is right to retry one — a password may have just been
     * rotated — and a person asking now is owed the answer that it is wrong.
     */
    probe: async (destination, signal) => {
      const settings = asWebdavSettings(destination.settings);
      if (settings === undefined) throw unreadable(destination);

      let dav: Dav;
      try {
        dav = createDav(await config.credentials(settings.account));
      } catch (cause) {
        throw new Rejected(why(cause), { cause });
      }

      const root = contain(settings.root, "");
      if (root.kind === "refused") throw new Rejected(root.detail);

      const looked = await dav.look(root.path.encoded, signal);
      if (looked.kind === "there") {
        // A note is not somewhere notes go, which the filesystem kind says of
        // a root that is a file. Nothing else would notice until a delivery.
        if (!looked.collection) {
          throw new Rejected(`${named(settings.root)} is not a folder`);
        }
        return;
      }

      throw new Rejected(
        looked.kind === "not-there"
          ? `${named(settings.root)} is not there`
          : looked.status === 401 || looked.status === 403
            ? `the account's credentials were refused, with ${looked.status}`
            : `${named(settings.root)} answered ${looked.status}`,
      );
    },
  };
}

/** A blank root is the account's own collection, which has no name to give. */
function named(root: string): string {
  return root === "" ? "the account's own folder" : root;
}

function carryOut(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<string> {
  switch (delivery.capability) {
    case CREATE_FILE:
      return createNote(wiring, delivery, signal);
    case APPEND_TO_FILE:
      return appendToNote(wiring, delivery, signal);
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
