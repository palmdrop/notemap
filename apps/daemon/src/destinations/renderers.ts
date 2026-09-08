import {
  linkTo,
  type Renderer,
  type Renderers,
} from "@notemap/output-markdown";
import type { PayloadTypeName } from "@notemap/core";

/**
 * A note as itself: its attachments in slot order, then its prose. Deliberately
 * lossy — it drops the metadata and the artifacts — because a vault wants the
 * note. Slot order is the order they were attached in, and the order a person
 * expects to see them.
 *
 * Embeds the copies that landed beside it rather than pointing back into
 * notemap: a reference into the blob layout breaks the moment notemap moves,
 * and a vault has to keep working without it.
 */
const renderNote: Renderer = (delivery, at) => {
  const mimes = new Map(
    delivery.assets.map((delivered) => [delivered.slot, delivered.asset.mime]),
  );

  const attachments = [...delivery.payload.assets]
    .sort((left, right) => (left.slot < right.slot ? -1 : 1))
    .map((reference) => ({
      name: at.assets.get(reference.slot),
      mime: mimes.get(reference.slot) ?? "",
    }))
    .filter(
      (landed): landed is { name: string; mime: string } =>
        landed.name !== undefined,
    )
    .map(
      (landed) =>
        `${landed.mime.startsWith("image/") ? "!" : ""}[${landed.name}](${linkTo(landed.name)})`,
    );

  const text = delivery.payload.content["text"];
  const lines =
    typeof text === "string" && text !== ""
      ? [...attachments, ...(attachments.length > 0 ? [""] : []), text]
      : attachments;

  return { body: `${lines.join("\n")}\n` };
};

export function destinationRenderers(): Renderers {
  return { ["note" as PayloadTypeName]: renderNote };
}
