import {
  Action,
  ActionPanel,
  Form,
  PopToRootType,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";

import { openClient, openReader } from "./lib/client";
import { excerpt } from "./lib/note";
import { submitting, type Values } from "./lib/submitting";

/** Long enough for a pool that answers to answer, short enough not to hold the form. */
const SETTLE_MS = 2_000;

/**
 * The capture form. What it does with what it holds is `submitting`; this is
 * the fields, the toast and the notice it leaves behind.
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
        void client.close();
      });

    return () => {
      wanted = false;
    };
  }, []);

  async function submit(values: Values) {
    if (values.text.trim() === "") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Nothing to capture",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Capturing",
      message: excerpt(values.text),
    });

    await submitting(
      {
        // Built per capture rather than with the view: a client closed once
        // sends nothing further, and this one is closed as soon as the capture
        // has been seen to.
        open: openClient,
        failing: (title, message) => {
          toast.style = Toast.Style.Failure;
          toast.title = title;
          toast.message = message;
        },
        leaving: async (said) => {
          await toast.hide();
          // The form is left behind as well as closed: without this the next
          // launch comes back to it, still holding the note already sent.
          await showHUD(said, {
            clearRootSearch: true,
            popToRootType: PopToRootType.Immediate,
          });
        },
        settleMs: SETTLE_MS,
      },
      values,
    );
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
