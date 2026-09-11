<script lang="ts">
  import Labelled from "$components/primitives/composer/Labelled.svelte";
  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { client } from "$lib/client";
  import { sayItFired } from "$lib/firing";
  import { offerable, triggeredBy } from "$lib/templates";

  /**
   * The same classification the collapsed row makes, offered where routing is
   * decided. It goes through the outbox on its own and **drains independently
   * of the route**: a route that then fails leaves the tags applied, which is
   * the honest outcome — the person classified the item, and that was true.
   */
  let {
    item,
    names,
    onfired,
  }: {
    item: string;
    /** What the item already carries, so the pool's own list draws as taken or not. */
    names: readonly string[];
    /**
     * A trigger tag was applied here, which files the item. Said as soon as the
     * tag is taken rather than when the pool answers: whoever is holding a
     * half-made decision beside this has to be told the item is spoken for
     * before they can press it into a second copy.
     */
    onfired?: () => void;
  } = $props();

  const inUse = client.tags.inUse;
  const offered = $derived(offerable($inUse.map((use) => use.name)));

  let taken = $state<readonly string[]>([]);
  /** Dropped here and not yet read back, which is what the pool still says it carries. */
  let dropped = $state<readonly string[]>([]);

  // What the pool says, plus and minus what has been decided here since.
  const applied = $derived([
    ...names.filter((name) => !dropped.includes(name)),
    ...taken.filter((name) => !names.includes(name)),
  ]);

  function fires(name: string): string | undefined {
    return triggeredBy(name)?.name;
  }

  function add(name: string): void {
    dropped = dropped.filter((each) => each !== name);
    taken = [...taken, name];
    void tagged(name);
    if (fires(name) !== undefined) onfired?.();
  }

  function remove(name: string): void {
    taken = taken.filter((each) => each !== name);
    dropped = [...dropped, name];
    void client.untag(item, name);
  }

  /** A trigger tag files the item, so what it did is said as soon as it is known. */
  async function tagged(name: string): Promise<void> {
    await client.tag(item, name);
    await sayItFired(item, name);
  }
</script>

<Labelled name="tags">
  <TagSet names={applied} {offered} {fires} onadd={add} onremove={remove} />
</Labelled>
