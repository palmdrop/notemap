import {
  APPEND,
  capabilitiesFor,
  CREATE,
  CREATE_OR_APPEND,
  markdownOutput,
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

import { webdavCandidates } from "./candidates";
import type { CredentialResolver } from "./credentials";
import { createDav, type Dav } from "./dav";
import { Refused, Unreachable } from "./errors";
import {
  appendToNote,
  createNote,
  createOrAppendToNote,
  previewNote,
  type Landed,
  type Wiring,
} from "./notes";
import { contain } from "./paths";
import {
  asWebdavSettings,
  WEBDAV,
  webdavSettings,
  type WebdavSettings,
} from "./settings";

/** The destination's own frontmatter setting travels with the wiring; a delivery's argument beats it. */
function wiringFor(
  dav: Dav,
  renderers: Renderers,
  settings: WebdavSettings,
): Wiring {
  return {
    dav,
    root: settings.root,
    renderers,
    ...(settings.frontmatter === undefined
      ? {}
      : { frontmatter: settings.frontmatter }),
  };
}

/** What the host wires: neither a renderer nor a credential is a person's setting. */
export type WebdavDestinationConfig = {
  /** By payload type. A type with no renderer gets the default rendering. */
  readonly renderers?: Renderers;
  /** What every destination of this kind takes. */
  readonly accepts: readonly PayloadTypeName[];
  /** Turns an account's name into the account. The adapter never learns where one is held. */
  readonly credentials: CredentialResolver;
  /** Names only: an address or a secret here is one `/v1` would answer with. */
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
          browsable: true,
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
          wiringFor(dav, renderers, settings),
          delivery,
          signal,
        );
        // No url: the address here is the daemon's credential, not a link.
        return {
          kind: "delivered",
          pointer: landed.pointer,
          output: markdownOutput(landed.written),
        };
      } catch (cause) {
        return failure(cause);
      }
    },

    /** Reads what a delivery reads, so an account that is asleep cannot be previewed against. */
    preview: async (destination, delivery, signal) => {
      const settings = asWebdavSettings(destination.settings);
      if (settings === undefined) {
        throw new Rejected(why(unreadable(destination)));
      }

      const dav = createDav(await config.credentials(settings.account));

      try {
        return markdownOutput(
          await previewNote(
            wiringFor(dav, renderers, settings),
            delivery,
            signal,
          ),
        );
      } catch (cause) {
        const failed = failure(cause);
        if (failed.kind === "rejected") throw new Rejected(failed.detail);
        throw cause;
      }
    },

    /**
     * One `PROPFIND` at `Depth: 1` per scope, which is what the typed line asks
     * for a level at a time. It reaches the server, so an account that is
     * asleep answers unreachable here and the line goes on being typed — the
     * same arrangement the filesystem kind has with an unmounted drive.
     */
    candidates: webdavCandidates(config.credentials),

    /**
     * A rejected credential is `Rejected` here and `Unreachable` to a delivery:
     * the delivery is right to retry one, a password having possibly just been
     * rotated, and a person asking now is owed the answer that it is wrong.
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
      const where = named(settings.root);

      switch (looked.kind) {
        case "there":
          if (!looked.collection) {
            throw new Rejected(`${where} is a file rather than a folder`);
          }
          return;

        case "not-there":
          throw new Rejected(`${where} is not there`);

        case "refused":
          throw new Rejected(refusal(where, looked.status));
      }
    },
  };
}

/** A blank root is the account's own collection, which has no name to give. */
function named(root: string): string {
  return root === "" ? "the account's own folder" : root;
}

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
/** Answered by an address that is served but is not a DAV collection. */
const NO_SUCH_METHOD = 405;

function refusal(where: string, status: number): string {
  if (status === UNAUTHORIZED || status === FORBIDDEN) {
    return `the account's credentials were refused, with ${status}`;
  }

  if (status === NO_SUCH_METHOD) {
    return `${where} does not answer PROPFIND, so the account's address is not a WebDAV collection`;
  }

  return `${where} answered ${status}`;
}

function carryOut(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<Landed> {
  switch (delivery.capability) {
    case CREATE:
      return createNote(wiring, delivery, signal);
    case APPEND:
      return appendToNote(wiring, delivery, signal);
    case CREATE_OR_APPEND:
      return createOrAppendToNote(wiring, delivery, signal);
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
