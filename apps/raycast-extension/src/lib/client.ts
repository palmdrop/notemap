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
