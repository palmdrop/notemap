import type { Item } from "@notemap/client";

import { PICTURE, TYPED } from "$lib/channels";
import { client } from "$lib/client";
import { leave } from "$lib/leaving.svelte";

type Held = {
  readonly asset: string;
  readonly url: string;
  readonly name: string;
  readonly image: boolean;
} | null;

/**
 * A capture being edited where it stands: the words and the picture the body
 * draws, and the `close`, `revert`, `attach` and `save` the row's foot draws
 * in place of its actions. Nothing it holds outlives it; closing it with
 * changes asks first.
 */
export class Editing {
  text = $state("");
  picture = $state<Held>(null);
  busy = $state(false);

  readonly item: Item;
  readonly #close: () => void;
  readonly #says: string;
  readonly #carries: Held;
  #uploading: Promise<void> | undefined;
  #saving = false;

  constructor(item: Item, close: () => void) {
    this.item = item;
    this.#close = close;
    this.#says = client.says(item);
    this.#carries = carriedBy(item);
    this.text = this.#says;
    this.picture = this.#carries;
  }

  /** Whether it holds anything the item does not say, a picture on its way included. */
  get changed(): boolean {
    return (
      this.busy ||
      this.text !== this.#says ||
      this.picture?.asset !== this.#carries?.asset
    );
  }

  pick(file: File): Promise<void> {
    this.busy = true;
    const uploading = (async () => {
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
        this.#uploading = undefined;
      }
    })();
    this.#uploading = uploading;
    return uploading;
  }

  drop(): void {
    this.picture = null;
  }

  /** Back to what the item says, the edit still open. */
  revert(): void {
    this.text = this.#says;
    this.picture = this.#carries;
  }

  /** Asks first where there are changes to lose. */
  close(): void {
    leave(() => this.#close());
  }

  /** Lets the changes go and closes, for an answer already given. */
  abandon(): void {
    this.revert();
    this.#close();
  }

  /** Waits for a picture still being attached, so it goes with the words. */
  async save(): Promise<void> {
    if (this.#saving) return;
    this.#saving = true;
    if (this.#uploading !== undefined) {
      await this.#uploading.catch(() => undefined);
    }
    const payload = client.pictured(
      client.saying(this.item, this.text),
      this.picture?.asset,
    );
    const channel = this.picture === null ? TYPED : PICTURE;
    this.#close();
    void client.edit(this.item.id, payload, channel);
  }
}

function carriedBy(item: Item): Held {
  const carried = client.picture(item);
  if (carried === undefined) return null;
  return {
    asset: carried.asset,
    url: client.assetContent(carried.asset),
    name: carried.filename ?? "picture",
    image: carried.mime?.startsWith("image/") ?? false,
  };
}
