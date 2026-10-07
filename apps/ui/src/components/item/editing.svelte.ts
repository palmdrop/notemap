import type { Item } from "@notemap/client";
import { saidBy } from "@notemap/client";

import { isImage, nameOf } from "$lib/attachments";
import { WEB } from "$lib/channels";
import { client } from "$lib/client";
import { sayItFired } from "$lib/firing";
import { leave } from "$lib/leaving.svelte";
import { notices } from "$lib/notices.svelte";

type Held = {
  readonly asset: string;
  readonly url: string;
  readonly name: string;
  readonly mime?: string;
  readonly bytes?: number;
  readonly image: boolean;
};

/**
 * A capture being edited where it stands: the words and the attachments the
 * body draws, and the `close`, `revert`, `attach` and `save` the row's foot
 * draws in place of its actions. Nothing it holds outlives it; closing it with
 * changes asks first.
 *
 * A trigger tag taken meanwhile waits here and goes with the save, which sends
 * it only once the edit has landed: sent at once, it would file the words from
 * before the edit.
 */
export class Editing {
  text = $state("");
  attachments = $state<readonly Held[]>([]);
  busy = $state(false);
  waiting = $state<readonly string[]>([]);

  readonly item: Item;
  readonly #close: () => void;
  readonly #says: string;
  readonly #carries: readonly Held[];
  #uploading: Promise<void> | undefined;
  #saving = false;

  constructor(item: Item, close: () => void) {
    this.item = item;
    this.#close = close;
    this.#says = client.says(item);
    this.#carries = carriedBy(item);
    this.text = this.#says;
    this.attachments = this.#carries;
  }

  /** Whether it holds anything the item does not say, an attachment on its way included. */
  get changed(): boolean {
    return this.busy || this.waiting.length > 0 || this.#rewritten;
  }

  get #rewritten(): boolean {
    return (
      this.text !== this.#says ||
      this.attachments.length !== this.#carries.length ||
      this.attachments.some(
        (held, at) => held.asset !== this.#carries[at]?.asset,
      )
    );
  }

  wait(tag: string): void {
    if (!this.waiting.includes(tag)) this.waiting = [...this.waiting, tag];
  }

  unwait(tag: string): void {
    this.waiting = this.waiting.filter((held) => held !== tag);
  }

  /** Attaches each file after what the edit already carries; one the pool would refuse is said and left. */
  pick(files: readonly File[]): Promise<void> {
    this.busy = true;
    const uploading = (async () => {
      try {
        for (const file of files) {
          try {
            const asset = await client.attach(file);
            this.attachments = [
              ...this.attachments,
              {
                asset,
                url: client.assetContent(asset),
                name: file.name,
                mime: file.type,
                bytes: file.size,
                image: isImage({ mime: file.type }),
              },
            ];
          } catch (error) {
            notices.raise({
              what: `${file.name}: ${saidBy(error)}`,
              alarm: true,
            });
          }
        }
      } finally {
        this.busy = false;
        this.#uploading = undefined;
      }
    })();
    this.#uploading = uploading;
    return uploading;
  }

  drop(asset: string): void {
    this.attachments = this.attachments.filter((held) => held.asset !== asset);
  }

  /** Back to what the item says, the edit still open. */
  revert(): void {
    this.text = this.#says;
    this.attachments = this.#carries;
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

  /** Waits for an attachment still being attached, so it goes with the words. */
  async save(): Promise<void> {
    if (this.#saving) return;
    this.#saving = true;
    if (this.#uploading !== undefined) {
      await this.#uploading.catch(() => undefined);
    }
    const payload = client.attached(
      client.saying(this.item, this.text),
      this.attachments.map((held) => held.asset),
    );
    const id = this.item.id;
    const waiting = this.waiting;
    const rewritten = this.#rewritten;
    this.#close();

    if (rewritten) await client.edit(id, payload, WEB, waiting);
    else for (const tag of waiting) await client.tag(id, tag);
    for (const tag of waiting) void sayItFired(id, tag);
  }
}

function carriedBy(item: Item): readonly Held[] {
  return client.attachments(item).map((carried) => ({
    asset: carried.asset,
    url: carried.url,
    name: nameOf(carried),
    ...(carried.mime === undefined ? {} : { mime: carried.mime }),
    ...(carried.bytes === undefined ? {} : { bytes: carried.bytes }),
    image: isImage(carried),
  }));
}
