import {
  Action,
  ActionPanel,
  Form,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";

import { openClient, openReader } from "./lib/client";
import { attaching, chosen, excerpt, landing } from "./lib/note";

type Values = {
  readonly text: string;
  readonly tags: string[];
  readonly newTags: string;
  readonly files: string[];
};

/** Long enough for a pool that answers to answer, short enough not to hold the form. */
const SETTLE_MS = 2_000;

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Captures through a whole client, so a note made while the daemon is
 * unreachable waits in the outbox for the drain command rather than being
 * lost. The notice says which of the two happened.
 */
export default function Command() {
  const [known, setKnown] = useState<readonly string[]>([]);

  useEffect(() => {
    const client = openReader();
    let wanted = true;

    client.tags
      .load()
      .then((tags) => {
        if (wanted) setKnown(tags.map((tag) => tag.name));
      })
      // An unreachable pool is ordinary here, and the field beside the picker
      // is what a tag can still be written in.
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        client.close();
      });

    return () => {
      wanted = false;
    };
  }, []);

  async function submit({ text, tags, newTags, files }: Values) {
    if (text.trim() === "") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Nothing to capture",
      });
      return;
    }

    const said = excerpt(text);
    // Built here rather than with the view: a client closed once sends nothing
    // further, and this one is closed as soon as the capture has been seen to.
    const client = openClient();
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Capturing",
      message: said,
    });

    try {
      const asset = await attaching(client, files);
      const item = await client.capture({
        channel: "raycast",
        text,
        ...(asset === undefined ? {} : { asset }),
      });
      for (const tag of chosen(tags, newTags)) await client.tag(item.id, tag);

      // Whichever comes first: a pool that answered, or a wait worth no more of
      // the person's time. What is still waiting, the drain command sends.
      const landed = await Promise.race([
        landing(client),
        pause(SETTLE_MS).then(() => undefined),
      ]);

      await toast.hide();
      await showHUD(
        landed === true ? `Captured — ${said}` : `Waiting to send — ${said}`,
      );
    } catch (error) {
      await toast.hide();
      await showHUD(
        `Nothing was captured — ${error instanceof Error ? error.message : said}`,
      );
    } finally {
      client.close();
    }
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
