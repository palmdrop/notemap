import { linkTo, type Renderer, type Renderers } from "@notemap/destination-fs";
import type { PayloadTypeName } from "@notemap/core";

/**
 * The prose of a `text` capture, as itself. Deliberately lossy — it drops the
 * metadata and the artifacts — because a vault wants the note, not a dump.
 */
const renderText: Renderer = (delivery) => {
  const text = delivery.payload.content["text"];
  if (typeof text !== "string") {
    throw new Error("a text capture with no text");
  }
  return { body: `${text}\n` };
};

/**
 * Embeds the copies that landed beside the note rather than pointing back into
 * notemap: a reference into the blob layout breaks the moment notemap moves,
 * and a vault has to keep working without it.
 */
const renderImage: Renderer = (delivery, at) => {
  const images = delivery.payload.assets
    .map((reference) => at.assets.get(reference.slot))
    .filter((name): name is string => name !== undefined)
    .map((name) => `![${name}](${linkTo(name)})`);

  const caption = delivery.payload.content["caption"];
  const lines =
    typeof caption === "string" && caption !== ""
      ? [...images, "", caption]
      : images;

  return { body: `${lines.join("\n")}\n` };
};

export function destinationRenderers(): Renderers {
  return {
    ["text" as PayloadTypeName]: renderText,
    ["image" as PayloadTypeName]: renderImage,
  };
}
