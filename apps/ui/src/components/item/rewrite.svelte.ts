import type { Item } from "@notemap/client";

import { PICTURE, TYPED } from "$lib/channels";
import { client } from "$lib/client";

type Held = {
  readonly asset: string;
  readonly url: string;
  readonly name: string;
  readonly image: boolean;
};

/**
 * A capture being rewritten where it stands: the words and the picture the
 * body draws, and the `cancel`, `attach` and `save` the row's foot draws in
 * place of its actions. A draft starts from what the item says and then stops
 * following it.
 */
export class Rewrite {
  text = $state("");
  picture = $state<Held | undefined>(undefined);
  busy = $state(false);

  readonly #item: Item;
  readonly #done: () => void;

  constructor(item: Item, done: () => void) {
    this.#item = item;
    this.#done = done;
    this.text = client.says(item);

    const carried = client.picture(item);
    if (carried !== undefined) {
      this.picture = {
        asset: carried.asset,
        url: client.assetContent(carried.asset),
        name: carried.filename ?? "picture",
        image: carried.mime?.startsWith("image/") ?? false,
      };
    }
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
    this.picture = undefined;
  }

  cancel(): void {
    this.#done();
  }

  save(): void {
    if (this.busy) return;
    this.#done();
    const payload = client.pictured(
      client.saying(this.#item, this.text),
      this.picture?.asset,
    );
    void client.edit(
      this.#item.id,
      payload,
      this.picture === undefined ? TYPED : PICTURE,
    );
  }
}
