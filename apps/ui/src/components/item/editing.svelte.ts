import type { Item, ItemId } from "@notemap/client";
import { saidBy } from "@notemap/client";

import type { Supplied } from "$lib/asked";
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
 * Whether two entries are the same attachment. By asset and by file rather
 * than by identity: the list is `$state`, which hands out a proxy of each
 * entry, and a proxy never equals the object it proxies.
 */
function same(one: Held, other: Held | undefined): boolean {
  if (other === undefined || one.kind !== other.kind) return false;
  return isPicked(one) && isPicked(other)
    ? one.file === other.file
    : !isPicked(one) && !isPicked(other) && one.asset === other.asset;
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
  /** By waiting tag, the values given for what its template asks. */
  given = $state<Readonly<Record<string, Supplied>>>({});

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

  get #rewritten(): boolean {
    return (
      this.text !== this.#says ||
      this.attachments.length !== this.#carries.length ||
      this.attachments.some((held, at) => !same(held, this.#carries[at]))
    );
  }

  wait(tag: string, supplied?: Supplied): void {
    if (!this.waiting.includes(tag)) this.waiting = [...this.waiting, tag];
    if (supplied !== undefined) this.given = { ...this.given, [tag]: supplied };
  }

  unwait(tag: string): void {
    this.waiting = this.waiting.filter((held) => held !== tag);
    const { [tag]: _dropped, ...rest } = this.given;
    this.given = rest;
  }

  /** Holds each file after what the edit already carries; one the pool would refuse is said and left. */
  pick(files: readonly File[]): void {
    const { taken, said } = sorted(files);
    if (said !== "") notices.raise({ what: said, alarm: true });
    if (taken.length === 0) return;

    this.attachments = [...this.attachments, ...taken.map(pickedFile)];
  }

  drop(held: Held): void {
    this.attachments = this.attachments.filter((each) => !same(each, held));
  }

  /** Back to what the item says, the edit still open. */
  revert(): void {
    this.text = this.#says;
    this.attachments = this.#carries;
    this.waiting = [];
    this.given = {};
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

  /**
   * Attaches what is picked, in the order the edit draws it, and sends the
   * words with it. Answers whether it saved: a file the pool has since begun
   * refusing, bytes that could not be held and an operation that could not be
   * recorded all leave the edit open, holding the words, for whoever asked to
   * decide what to do instead.
   */
  async save(): Promise<boolean> {
    if (this.#saving) return false;
    if (this.#refuses()) return false;

    this.#saving = true;
    this.busy = true;
    try {
      const id = this.item.id;
      const waiting = this.waiting;
      const given = this.given;

      // Read before anything is attached: an edit that says nothing new sends
      // its waiting tags and names no asset, so there is nothing to hold.
      if (!this.#rewritten) {
        for (const tag of waiting) await client.tag(id, tag, given[tag]);
        this.#sent(id, waiting);
        return true;
      }

      const attached = await this.#attached();
      if (attached === undefined) return false;

      try {
        await client.edit(
          id,
          client.attached(client.saying(this.item, this.text), attached.named),
          WEB,
          waiting,
          given,
        );
      } catch (error) {
        notices.raise({ what: saidBy(error), alarm: true });
        await this.#letGo(attached.fresh);
        return false;
      }

      this.#sent(id, waiting);
      return true;
    } finally {
      this.busy = false;
      this.#saving = false;
    }
  }

  /**
   * What the pool would now refuse, dropped and said: a file picked while the
   * limit was unknown, or before a refused capture taught the client what it
   * is, is refused here rather than at the pool.
   */
  #refuses(): boolean {
    const { taken, said } = sorted(
      this.attachments.filter(isPicked).map((held) => held.file),
    );
    if (said === "") return false;

    this.attachments = this.attachments.filter(
      (held) => !isPicked(held) || taken.includes(held.file),
    );
    notices.raise({ what: said, alarm: true });
    return true;
  }

  /**
   * Every attachment as an asset, holding the bytes of the ones that were
   * picked, and what was freshly held — which nothing names until the
   * operation that does has been recorded.
   */
  async #attached(): Promise<
    { readonly named: string[]; readonly fresh: string[] } | undefined
  > {
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
        await this.#letGo(fresh);
        return undefined;
      }
    }

    return { named, fresh };
  }

  /** Bytes held for an edit that was not sent, which an operation that names them keeps. */
  async #letGo(fresh: readonly string[]): Promise<void> {
    for (const asset of fresh) await client.detach(asset).catch(() => {});
  }

  #sent(id: ItemId, waiting: readonly string[]): void {
    this.#close();
    for (const tag of waiting) void sayItFired(id, tag);
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
