import {
  Action,
  ActionPanel,
  Form,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo } from "react";

import { openClient } from "./lib/client";

type Values = {
  readonly text: string;
};

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Captures through a whole client, so a note made while the daemon is
 * unreachable waits in the outbox for the drain command rather than being
 * lost. The client is closed when the view goes.
 */
export default function Command() {
  const client = useMemo(openClient, []);

  useEffect(() => () => client.close(), [client]);

  async function submit({ text }: Values) {
    if (text.trim() === "") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Nothing to capture",
      });
      return;
    }

    await client.capture({ channel: "raycast", text });
    await showToast({ style: Toast.Style.Success, title: "Captured" });
    // Given a moment to land before the view goes; past that, the drain
    // command sends it.
    await Promise.race([client.drain(), pause(2_000)]);
    await popToRoot();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Capture" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="text"
        title="Note"
        placeholder="What's on your mind?"
        autoFocus
      />
    </Form>
  );
}
