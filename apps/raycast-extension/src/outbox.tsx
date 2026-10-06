import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import {
  saidIn,
  type Client,
  type ItemId,
  type PendingOperation,
} from "@notemap/client";
import { useEffect, useState } from "react";

import { openClient } from "./lib/client";
import { excerpt } from "./lib/note";
import { about, done, inOrder, remaining, stateSaid } from "./lib/outbox";

const TINTS: Readonly<Record<PendingOperation["state"], Color>> = {
  pending: Color.SecondaryText,
  sending: Color.Blue,
  unreachable: Color.Orange,
  refused: Color.Red,
};

function heldBy(client: Client): (item: ItemId) => string | undefined {
  return (item) => {
    let said: string | undefined;
    client
      .held(item)
      .subscribe((held) => {
        said = held === undefined ? undefined : saidIn(held.payload);
      })
      .unsubscribe();
    return said;
  };
}

/**
 * What the outbox holds, as the store has it. Opening it drains, as opening any
 * client does, so what is drawn moves as the pool answers.
 */
export default function Command() {
  const [outbox, setOutbox] = useState<readonly PendingOperation[]>();
  const [client, setClient] = useState<Client>();
  const [draining, setDraining] = useState(true);

  useEffect(() => {
    const opened = openClient();
    setClient(opened);
    const watched = opened.outbox.subscribe((held) => {
      setOutbox(inOrder(held));
    });
    // The store is read before the opening drain is sent, and the outbox is
    // empty until it has been: an empty list is only the truth once this lands.
    void opened.drain().finally(() => {
      setDraining(false);
    });

    return () => {
      watched.unsubscribe();
      void opened.close();
    };
  }, []);

  async function drain() {
    const opened = client;
    if (opened === undefined) return;

    setDraining(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Draining",
    });
    const waiting = await remaining(opened).finally(() => {
      setDraining(false);
    });
    toast.style = waiting === 0 ? Toast.Style.Success : Toast.Style.Failure;
    toast.title =
      waiting === 0 ? "Outbox drained" : `${String(waiting)} still waiting`;
  }

  async function dismiss(entry: PendingOperation) {
    await client?.dismiss(entry.id);
    await showToast({ style: Toast.Style.Success, title: "Dismissed" });
  }

  const said = client === undefined ? undefined : heldBy(client);

  return (
    <List isLoading={draining}>
      <List.EmptyView icon={Icon.Tray} title="Nothing waiting to send" />
      {outbox?.map((entry) => {
        const words =
          said === undefined ? undefined : about(entry.operation, said);
        return (
          <List.Item
            key={entry.id}
            title={done(entry.operation)}
            subtitle={words === undefined ? "" : excerpt(words)}
            accessories={[
              {
                tag: { value: stateSaid(entry), color: TINTS[entry.state] },
                tooltip: entry.failure ?? null,
              },
              { date: new Date(entry.at) },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Drain Now"
                  icon={Icon.ArrowClockwise}
                  onAction={drain}
                />
                {entry.state === "refused" ? (
                  <Action
                    title="Dismiss"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() => dismiss(entry)}
                  />
                ) : null}
                {entry.failure === undefined ? null : (
                  <Action.CopyToClipboard
                    title="Copy Failure"
                    content={entry.failure}
                  />
                )}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
