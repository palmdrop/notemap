import {
  Action,
  ActionPanel,
  Form,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";

import { openClient } from "./lib/client";
import { attaching, chosen, excerpt, landing } from "./lib/note";

type Values = {
  readonly text: string;
  readonly tags: string[];
  readonly newTags: string;
  readonly files: string[];
};

/** Long enough for a pool that answers to answer, short enough not to hold the form. */
const SETTLE_MS = 1_200;

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Captures through a whole client, so a note made while the daemon is
 * unreachable waits in the outbox for the drain command rather than being
 * lost. The toast says which of the two happened.
 */
export default function Command() {
  const client = useMemo(openClient, []);
  const sending = useRef<Promise<unknown>>(Promise.resolve());
  const [known, setKnown] = useState<readonly string[]>([]);

  useEffect(() => {
    const held = client.tags.inUse.subscribe((tags) => {
      setKnown(tags.map((tag) => tag.name));
    });
    // An unreachable pool is ordinary here; the picker stays as it was.
    void client.tags.load().catch(() => undefined);

    return () => {
      held.unsubscribe();
    };
  }, [client]);

  useEffect(
    () => () => {
      // Closing abandons a request on the wire, so a send that has started is
      // waited out first; the client's own request limit is what bounds that.
      void sending.current.finally(() => {
        client.close();
      });
    },
    [client],
  );

  async function submit({ text, tags, newTags, files }: Values) {
    if (text.trim() === "") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Nothing to capture",
      });
      return;
    }

    const said = excerpt(text);
    let toast: Toast;

    try {
      const asset = await attaching(client, files);
      const item = await client.capture({
        channel: "raycast",
        text,
        ...(asset === undefined ? {} : { asset }),
      });
      for (const tag of chosen(tags, newTags)) await client.tag(item.id, tag);

      toast = await showToast({
        style: Toast.Style.Animated,
        title: "Capturing",
        message: said,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Nothing was captured",
        message: error instanceof Error ? error.message : said,
      });
      return;
    }

    const landed = landing(client);
    sending.current = landed;
    void landed.then(
      (sent) => {
        toast.style = sent ? Toast.Style.Success : Toast.Style.Failure;
        toast.title = sent ? "Captured" : "Waiting in the outbox";
      },
      () => {
        toast.style = Toast.Style.Failure;
        toast.title = "Waiting in the outbox";
      },
    );

    // Whichever comes first: a pool that answered, or a wait worth no more of
    // the person's time. The toast keeps saying what happened either way.
    await Promise.race([landed, pause(SETTLE_MS)]);
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
      <Form.TagPicker id="tags" title="Tags" placeholder="Tags already in use">
        {known.map((name) => (
          <Form.TagPicker.Item key={name} value={name} title={name} />
        ))}
      </Form.TagPicker>
      <Form.TextField
        id="newTags"
        title="New tags"
        placeholder="Comma separated"
      />
      <Form.FilePicker
        id="files"
        title="Attachment"
        allowMultipleSelection={false}
      />
    </Form>
  );
}
