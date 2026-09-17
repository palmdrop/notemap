import { environment, LaunchType, showHUD } from "@raycast/api";
import { openClient } from "./lib/client";

/**
 * Sends what the capture command left in the outbox. Runs on an interval in
 * the background, and by hand; either way the client is closed before this
 * returns, so the process ends.
 */
export default async function Command() {
  const client = openClient();

  try {
    await client.drain();

    if (environment.launchType === LaunchType.UserInitiated) {
      const waiting = await new Promise<number>((resolve) => {
        client.waiting.subscribe((count) => resolve(count)).unsubscribe();
      });
      await showHUD(
        waiting === 0
          ? "Outbox drained"
          : `${String(waiting)} still waiting to send`,
      );
    }
  } finally {
    client.close();
  }
}
