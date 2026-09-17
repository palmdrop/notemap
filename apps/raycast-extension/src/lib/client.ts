import { File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { environment, getPreferenceValues } from "@raycast/api";
import {
  createClient,
  createFetchTransport,
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

/**
 * A whole client, over a directory Raycast keeps for this extension. Each
 * command is its own process, so this is built once per command and closed
 * by the command that built it; the store is what carries the outbox between.
 */
export function openClient(): Client {
  const { daemonUrl, token } = getPreferenceValues<Preferences>();

  return createClient({
    transport: createFetchTransport(
      daemonUrl.replace(/\/+$/, ""),
      token === undefined || token === "" ? {} : { token },
    ),
    store: createFilesystemStore(environment.supportPath, {
      onError: (error) => {
        console.error(error);
      },
    }),
    onError: (error) => {
      console.error(error);
    },
  });
}
