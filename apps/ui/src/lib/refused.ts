import type { PendingOperation } from "@notemap/client";

import { goto } from "$app/navigation";
import { resolve } from "$app/paths";

import { copyable } from "./clipboard";
import { nameOf } from "./attachments";
import { client } from "./client";
import { restoreDraft } from "./draft";
import { notices } from "./notices.svelte";

type CaptureOperation = Extract<
  PendingOperation["operation"],
  { kind: "capture" }
>;

/** A refused capture: the one refusal held, its outbox entry being the only copy of it. */
export type RefusedCapture = PendingOperation & {
  readonly operation: CaptureOperation;
};

export function isCapture(held: PendingOperation): held is RefusedCapture {
  return held.operation.kind === "capture";
}

/** The words a capture carried, whole. */
export function wordsOf(held: RefusedCapture): string {
  const content: unknown = held.operation.envelope.payload.content;
  if (typeof content !== "object" || content === null) return "";
  const text = (content as Record<string, unknown>)["text"];
  return typeof text === "string" ? text : "";
}

function assetsOf(held: RefusedCapture): readonly string[] {
  return held.operation.envelope.payload.assets.map(
    (reference) => reference.asset,
  );
}

export function attachmentCount(held: RefusedCapture): number {
  return assetsOf(held).length;
}

/** The bytes it was holding, read back while the client still holds them. */
async function filesOf(held: RefusedCapture): Promise<File[]> {
  const known = client.attachments({
    payload: held.operation.envelope.payload,
  });
  return Promise.all(
    known.map(async (attachment) => {
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`attachment ${String(response.status)}`);
      }
      const blob = await response.blob();
      return new File([blob], nameOf(attachment), {
        type: attachment.mime ?? blob.type,
      });
    }),
  );
}

/**
 * Puts a refused capture back into the capture box, after what the box already
 * holds, and then lets go of it: sending it again from there mints a new
 * capture. Nothing is let go of where it could not be put back.
 */
export async function editRefused(held: RefusedCapture): Promise<void> {
  let files: File[];
  try {
    files = assetsOf(held).length === 0 ? [] : await filesOf(held);
  } catch {
    notices.raise({ what: "could not read its attachments back", alarm: true });
    return;
  }

  const restored = restoreDraft(
    { text: wordsOf(held), tags: held.operation.envelope.tags ?? [] },
    files,
  );
  if (restored !== "restored") {
    notices.raise({
      what: "could not put it back in the capture box",
      alarm: true,
    });
    return;
  }

  await client.dismiss(held.id);
  await goto(resolve("/"));
}

export async function deleteRefused(held: RefusedCapture): Promise<void> {
  await client.dismiss(held.id);
  notices.raise({ what: "refused capture deleted" });
}

export async function copyRefused(held: RefusedCapture): Promise<void> {
  if (!copyable()) return;
  try {
    await navigator.clipboard.writeText(wordsOf(held));
    notices.raise({ what: "copied" });
  } catch {
    notices.raise({ what: "could not copy", alarm: true });
  }
}
