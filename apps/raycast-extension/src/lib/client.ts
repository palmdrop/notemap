import { File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { environment, getPreferenceValues } from "@raycast/api";
import {
  createClient,
  createFetchTransport,
  createMemoryStore,
  type Client,
} from "@notemap/client";
import { createFilesystemStore } from "@notemap/client/filesystem";

type Preferences = {
  readonly daemonUrl: string;
  readonly token?: string;
};

/**
 * Raycast's Node trusts the roots it ships with and nothing the machine was
 * told to trust, so a pool served by a private CA is unreachable from here even
 * once the certificate is accepted. A publicly trusted certificate on the pool
 * is the fix; until there is one, the machine's own store stands in.
 */
setDefaultCACertificates([
  ...getCACertificates("default"),
  ...getCACertificates("system"),
]);

/**
 * Raycast's global object is missing `crypto`, which uuid reaches for rather
 * than importing — so minting an id, the first thing a capture does, threw.
 * `File` is what an attachment is on the way in and on the way back out of the
 * store; whether this runtime has one is untested, and `??=` costs nothing
 * where it does.
 */
globalThis.crypto ??= webcrypto as Crypto;
globalThis.File ??= NodeFile as unknown as typeof globalThis.File;

function transport() {
  const { daemonUrl, token } = getPreferenceValues<Preferences>();

  return createFetchTransport(
    daemonUrl.replace(/\/+$/, ""),
    token === undefined || token === "" ? {} : { token },
  );
}

const report = (error: unknown) => {
  console.error(error);
};

/**
 * A whole client, over a directory Raycast keeps for this extension. The store
 * is what carries the outbox between commands, each of which is its own
 * process.
 *
 * Built for one piece of work and closed when it ends, never for the life of a
 * view: closing abandons what is on the wire and a closed client sends nothing
 * further, so one held across a render that unmounts and mounts again would be
 * dead in the hands of the mount that kept it.
 */
export function openClient(): Client {
  return createClient({
    transport: transport(),
    store: createFilesystemStore(environment.supportPath, { onError: report }),
    onError: report,
  });
}

/**
 * A client for asking the pool something and nothing else. Over memory rather
 * than the extension's directory, so a question cannot race a capture for the
 * files the outbox lives in.
 */
export function openReader(): Client {
  return createClient({
    transport: transport(),
    store: createMemoryStore(),
    onError: report,
  });
}
