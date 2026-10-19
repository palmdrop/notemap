import {
  Action,
  ActionPanel,
  Form,
  PopToRootType,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import type { RoutingTemplate } from "@notemap/client";
import { useEffect, useState } from "react";

import { askedFor, fieldId, suppliedFrom, type AskedField } from "./lib/asked";
import { openClient, openReader } from "./lib/client";
import { chosen, excerpt } from "./lib/note";
import { submitting, type Values } from "./lib/submitting";

/** Long enough for a pool that answers to answer, short enough not to hold the form. */
const SETTLE_MS = 2_000;

/**
 * The capture form. What it does with what it holds is `submitting`; this is
 * the fields, the toast and the notice it leaves behind.
 */
export default function Command() {
  const [known, setKnown] = useState<readonly string[]>([]);
  const [templates, setTemplates] = useState<readonly RoutingTemplate[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  /** By trigger tag, what its template asks; asked of the pool once a tag is chosen. */
  const [asking, setAsking] = useState<
    Readonly<Record<string, readonly AskedField[]>>
  >({});
  /** What each list is being typed into, so a value it does not hold can be taken. */
  const [searching, setSearching] = useState<Readonly<Record<string, string>>>(
    {},
  );

  useEffect(() => {
    const client = openReader();
    let wanted = true;

    Promise.allSettled([
      client.tags.load().then((tags) => {
        if (wanted) setKnown(tags.map((tag) => tag.name));
      }),
      client.templates.load().then((held) => {
        if (wanted) setTemplates(held);
      }),
    ])
      .then((settled) => {
        // An unreachable pool is ordinary here, and the field beside the picker
        // is what a tag can still be written in.
        for (const one of settled) {
          if (one.status === "rejected") console.error(one.reason);
        }
      })
      .finally(() => {
        void client.close();
      });

    return () => {
      wanted = false;
    };
  }, []);

  const tags = chosen(picked, typed);

  /** A trigger tag that asks for something, newly chosen, is asked about once. */
  useEffect(() => {
    const unasked = tags.flatMap((tag) => {
      const template = templates.find((one) => one.triggerTag === tag);
      return template !== undefined &&
        Object.keys(template.asked ?? {}).length > 0 &&
        asking[tag] === undefined
        ? [{ tag, template }]
        : [];
    });
    if (unasked.length === 0) return;

    const client = openReader();
    let wanted = true;
    void Promise.all(
      unasked.map(async ({ tag, template }) => ({
        tag,
        fields: await askedFor(client, tag, template),
      })),
    )
      .then((found) => {
        if (!wanted) return;
        setAsking((current) => ({
          ...current,
          ...Object.fromEntries(found.map(({ tag, fields }) => [tag, fields])),
        }));
      })
      .finally(() => {
        void client.close();
      });

    return () => {
      wanted = false;
    };
  }, [tags.join("\n"), templates]);

  /** The trigger tags declared, offered beside those in use: one set up today has filed nothing yet. */
  const offered = [
    ...templates.flatMap((one) =>
      one.triggerTag === undefined || known.includes(one.triggerTag)
        ? []
        : [one.triggerTag],
    ),
    ...known,
  ];

  const askedFields = tags.flatMap((tag) => asking[tag] ?? []);

  async function submit(values: Values & Record<string, unknown>) {
    if (values.text.trim() === "") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Nothing to capture",
      });
      return;
    }

    const supplied = suppliedFrom(values, tags);
    const missing = askedFields.find(
      (one) =>
        one.default === undefined &&
        supplied[one.tag]?.[one.field] === undefined,
    );
    if (missing !== undefined) {
      await showToast({
        style: Toast.Style.Failure,
        title: `${missing.tag} needs ${missing.label}`,
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
      { ...values, asked: supplied },
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
      <Form.TagPicker
        id="tags"
        title="Tags"
        placeholder="Tags already in use"
        value={picked}
        onChange={setPicked}
      >
        {offered.map((name) => (
          <Form.TagPicker.Item key={name} value={name} title={name} />
        ))}
      </Form.TagPicker>
      <Form.TextField
        id="newTags"
        title="New tags"
        placeholder="Comma separated"
        value={typed}
        onChange={setTyped}
      />
      {askedFields.map((one) => {
        const id = fieldId(one.tag, one.field);
        const values = one.closed ?? one.listed?.map((entry) => entry.value);
        if (values === undefined) {
          return (
            <Form.TextField
              key={id}
              id={id}
              title={one.label}
              info={one.tag}
              placeholder={one.default ?? ""}
            />
          );
        }

        // A list the destination answered also takes what it does not hold:
        // a heading that is not there yet is still somewhere to file.
        const search = (searching[id] ?? "").trim();
        const fresh =
          one.listed !== undefined && search !== "" && !values.includes(search);
        return (
          <Form.Dropdown
            key={id}
            id={id}
            title={one.label}
            info={one.tag}
            filtering
            onSearchTextChange={(text) =>
              setSearching((current) => ({ ...current, [id]: text }))
            }
          >
            {one.default !== undefined && (
              <Form.Dropdown.Item value="" title={`default ${one.default}`} />
            )}
            {(
              one.listed ??
              one.closed?.map((value) => ({ label: value, value })) ??
              []
            ).map((entry) => (
              <Form.Dropdown.Item
                key={entry.value}
                value={entry.value}
                title={entry.label}
              />
            ))}
            {fresh && (
              <Form.Dropdown.Item value={search} title={`+ ${search}`} />
            )}
          </Form.Dropdown>
        );
      })}
      <Form.FilePicker id="files" title="Attachments" />
    </Form>
  );
}
