import {
  environment,
  LaunchType,
  showHUD,
  updateCommandMetadata,
} from "@raycast/api";

import { openClient } from "./lib/client";
import { remaining, waitingSaid } from "./lib/outbox";

/**
 * Sends what the capture command left in the outbox. Runs on an interval in
 * the background, and by hand; either way the client is closed before this
 * returns, so the process ends.
 */
export default async function Command() {
  const client = openClient();

  try {
    const waiting = await remaining(client);
    await updateCommandMetadata({ subtitle: waitingSaid(waiting) });

    if (environment.launchType === LaunchType.UserInitiated) {
      await showHUD(
        waiting === 0
          ? "Outbox drained"
          : `${String(waiting)} still waiting to send`,
      );
    }
  } finally {
    await client.close();
  }
}
