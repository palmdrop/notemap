import type { Item } from "@notemap/client";

import { PICTURE, TYPED } from "$lib/channels";
import { client } from "$lib/client";
import {
  draftPicture,
  draftWords,
  dropDraft,
  keepDraft,
  type HeldPicture,
} from "$lib/edit-drafts.svelte";

/**
 * A capture being edited where it stands: the words and the picture the body
 * draws, and the `close`, `revert`, `attach` and `save` the row's foot draws
 * in place of its actions. It starts from the draft where there is one and
 * from what the item says otherwise, and whatever it holds that the item does
 * not say is kept as the draft until `save` sends it or `revert` lets it go.
 */
export class Editing {
  text = $state("");
  picture = $state<HeldPicture>(null);
  busy = $state(false);

  readonly #item: Item;
  readonly #close: () => void;
  readonly #says: string;
  readonly #carries: HeldPicture;

  constructor(item: Item, close: () => void) {
    this.#item = item;
    this.#close = close;
    this.#says = client.says(item);
    this.#carries = carriedBy(item);
    this.text = draftWords(item.id) ?? this.#says;
    const drafted = draftPicture(item.id);
    this.picture = drafted === undefined ? this.#carries : drafted;
  }

  /** Whether it holds anything the item does not say. */
  get changed(): boolean {
    return (
      this.text !== this.#says || this.picture?.asset !== this.#carries?.asset
    );
  }

  /** Writes what differs from the item as the draft, and nothing where nothing does. */
  keep(): void {
    keepDraft(this.#item.id, {
      ...(this.text === this.#says ? {} : { words: this.text }),
      ...(this.picture?.asset === this.#carries?.asset
        ? {}
        : { picture: this.picture }),
    });
  }

  async pick(file: File): Promise<void> {
    this.busy = true;
    try {
      const asset = await client.attach(file);
      this.picture = {
        asset,
        url: client.assetContent(asset),
        name: file.name,
        image: file.type.startsWith("image/"),
      };
    } finally {
      this.busy = false;
    }
  }

  drop(): void {
    this.picture = null;
  }

  /** Back to what the item says, and the draft with it. */
  revert(): void {
    this.text = this.#says;
    this.picture = this.#carries;
    dropDraft(this.#item.id);
  }

  close(): void {
    this.#close();
  }

  save(): void {
    if (this.busy) return;
    const payload = client.pictured(
      client.saying(this.#item, this.text),
      this.picture?.asset,
    );
    const channel = this.picture === null ? TYPED : PICTURE;
    dropDraft(this.#item.id);
    this.#close();
    void client.edit(this.#item.id, payload, channel);
  }
}

function carriedBy(item: Item): HeldPicture {
  const carried = client.picture(item);
  if (carried === undefined) return null;
  return {
    asset: carried.asset,
    url: client.assetContent(carried.asset),
    name: carried.filename ?? "picture",
    image: carried.mime?.startsWith("image/") ?? false,
  };
}
