import type { PendingOperation } from "@notemap/client";

import { goto } from "$app/navigation";
import { resolve } from "$app/paths";

import { copyable } from "./clipboard";
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

function pictureOf(held: RefusedCapture): string | undefined {
  return held.operation.envelope.payload.assets[0]?.asset;
}

export function hasPicture(held: RefusedCapture): boolean {
  return pictureOf(held) !== undefined;
}

/** The bytes it was holding, read back while the client still holds them. */
async function fileOf(asset: string): Promise<File> {
  const response = await fetch(client.assetContent(asset));
  if (!response.ok) throw new Error(`picture ${String(response.status)}`);
  const blob = await response.blob();
  const [, kind = "bin"] = blob.type.split("/");
  return new File([blob], `picture.${kind}`, { type: blob.type });
}

/**
 * Puts a refused capture back into the capture box, after what the box already
 * holds, and then lets go of it: sending it again from there mints a new
 * capture. Nothing is let go of where it could not be put back.
 */
export async function editRefused(held: RefusedCapture): Promise<void> {
  const asset = pictureOf(held);
  let file: File | undefined;
  try {
    file = asset === undefined ? undefined : await fileOf(asset);
  } catch {
    notices.raise({ what: "could not read its picture back", alarm: true });
    return;
  }

  const restored = restoreDraft(
    { text: wordsOf(held), tags: held.operation.envelope.tags ?? [] },
    file,
  );
  if (restored !== "restored") {
    notices.raise({
      what:
        restored === "picture-held"
          ? "the capture box already holds a picture"
          : "could not put it back in the capture box",
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
