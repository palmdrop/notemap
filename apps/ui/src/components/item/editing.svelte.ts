import type { Item } from "@notemap/client";

import { PICTURE, TYPED } from "$lib/channels";
import { client } from "$lib/client";
import { sayItFired } from "$lib/firing";
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
 *
 * A trigger tag taken meanwhile waits here and goes with the save, which sends
 * it only once the edit has landed: sent at once, it would file the words from
 * before the edit.
 */
export class Editing {
  text = $state("");
  picture = $state<Held>(null);
  busy = $state(false);
  waiting = $state<readonly string[]>([]);

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
    return this.busy || this.waiting.length > 0 || this.#rewritten;
  }

  get #rewritten(): boolean {
    return (
      this.text !== this.#says || this.picture?.asset !== this.#carries?.asset
    );
  }

  wait(tag: string): void {
    if (!this.waiting.includes(tag)) this.waiting = [...this.waiting, tag];
  }

  unwait(tag: string): void {
    this.waiting = this.waiting.filter((held) => held !== tag);
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
    this.waiting = [];
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
    const id = this.item.id;
    const waiting = this.waiting;
    const rewritten = this.#rewritten;
    this.#close();

    if (rewritten) await client.edit(id, payload, channel, waiting);
    else for (const tag of waiting) await client.tag(id, tag);
    for (const tag of waiting) void sayItFired(id, tag);
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
