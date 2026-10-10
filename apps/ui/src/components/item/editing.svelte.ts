import type { Item } from "@notemap/client";
import { saidBy } from "@notemap/client";

import { isImage, nameOf } from "$lib/attachments";
import { WEB } from "$lib/channels";
import { client } from "$lib/client";
import { sayItFired } from "$lib/firing";
import { leave } from "$lib/leaving.svelte";
import { notices } from "$lib/notices.svelte";
import { sorted } from "$lib/picking";

type Carried = {
  readonly kind: "carried";
  readonly asset: string;
  readonly url: string;
  readonly name: string;
  readonly mime?: string;
  readonly bytes?: number;
  readonly image: boolean;
};

type Picked = {
  readonly kind: "picked";
  readonly file: File;
  readonly name: string;
  readonly mime?: string;
  readonly bytes: number;
  readonly image: boolean;
};

/** What an edit draws beside its words: the item's own attachments, and files it is holding. */
export type Held = Carried | Picked;

export function isPicked(held: Held): held is Picked {
  return held.kind === "picked";
}

/**
 * A capture being edited where it stands: the words and the attachments the
 * body draws, and the `close`, `revert`, `attach` and `save` the row's foot
 * draws in place of its actions. Nothing it holds outlives it — a picked file
 * is held here and attached as the edit is saved, so an edit that is never
 * saved leaves no bytes behind.
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
  #saving = false;

  constructor(item: Item, close: () => void) {
    this.item = item;
    this.#close = close;
    this.#says = client.says(item);
    this.#carries = carriedBy(item);
    this.text = this.#says;
    this.attachments = this.#carries;
  }

  /** Whether it holds anything the item does not say, a picked file included. */
  get changed(): boolean {
    return this.waiting.length > 0 || this.#rewritten;
  }

  // What the item carries is held as the objects the constructor made, so a
  // list holding anything else is a list that has been edited.
  get #rewritten(): boolean {
    return (
      this.text !== this.#says ||
      this.attachments.length !== this.#carries.length ||
      this.attachments.some((held, at) => held !== this.#carries[at])
    );
  }

  wait(tag: string): void {
    if (!this.waiting.includes(tag)) this.waiting = [...this.waiting, tag];
  }

  unwait(tag: string): void {
    this.waiting = this.waiting.filter((held) => held !== tag);
  }

  /** Holds each file after what the edit already carries; one the pool would refuse is said and left. */
  pick(files: readonly File[]): void {
    const { taken, said } = sorted(files);
    if (said !== "") notices.raise({ what: said, alarm: true });
    if (taken.length === 0) return;

    this.attachments = [...this.attachments, ...taken.map(pickedFile)];
  }

  drop(held: Held): void {
    this.attachments = this.attachments.filter((each) => each !== held);
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

  /** Attaches what is picked, in the order the edit draws it, and sends the words with it. */
  async save(): Promise<void> {
    if (this.#saving) return;

    const { taken, said } = sorted(
      this.attachments.filter(isPicked).map((held) => held.file),
    );
    if (said !== "") {
      this.attachments = this.attachments.filter(
        (held) => !isPicked(held) || taken.includes(held.file),
      );
      notices.raise({ what: said, alarm: true });
      return;
    }

    this.#saving = true;
    this.busy = true;

    const named = await this.#attached();
    if (named === undefined) {
      this.busy = false;
      this.#saving = false;
      return;
    }

    const payload = client.attached(client.saying(this.item, this.text), named);
    const id = this.item.id;
    const waiting = this.waiting;
    const rewritten = this.#rewritten;
    this.#close();

    if (rewritten) await client.edit(id, payload, WEB, waiting);
    else for (const tag of waiting) await client.tag(id, tag);
    for (const tag of waiting) void sayItFired(id, tag);
  }

  /**
   * Every attachment as an asset, holding the bytes of the ones that were
   * picked. Nothing is kept where one of them fails: the words have not been
   * sent, so the bytes already held are bytes nothing would claim.
   */
  async #attached(): Promise<string[] | undefined> {
    const named: string[] = [];
    const fresh: string[] = [];

    for (const held of this.attachments) {
      if (!isPicked(held)) {
        named.push(held.asset);
        continue;
      }

      try {
        const asset = await client.attach(held.file);
        named.push(asset);
        fresh.push(asset);
      } catch (error) {
        notices.raise({ what: `${held.name}: ${saidBy(error)}`, alarm: true });
        for (const asset of fresh) await client.detach(asset).catch(() => {});
        return undefined;
      }
    }

    return named;
  }
}

function pickedFile(file: File): Picked {
  return {
    kind: "picked",
    file,
    name: file.name,
    ...(file.type === "" ? {} : { mime: file.type }),
    bytes: file.size,
    image: isImage({ mime: file.type }),
  };
}

function carriedBy(item: Item): readonly Held[] {
  return client.attachments(item).map((carried): Carried => ({
    kind: "carried",
    asset: carried.asset,
    url: carried.url,
    name: nameOf(carried),
    ...(carried.mime === undefined ? {} : { mime: carried.mime }),
    ...(carried.bytes === undefined ? {} : { bytes: carried.bytes }),
    image: isImage(carried),
  }));
}
