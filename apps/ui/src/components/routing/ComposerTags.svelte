<script lang="ts">
  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { client } from "$lib/client";
  import { sayItFired } from "$lib/firing";
  import { offerable, triggeredBy } from "$lib/templates";

  /**
   * The same classification the row makes, offered where routing is decided.
   * It goes through the outbox on its own and **drains independently of the
   * route**: a route that then fails leaves the tags applied, which is the
   * honest outcome — the person classified the item, and that was true.
   */
  let {
    item,
    names,
    templates = [],
    onfired,
  }: {
    item: string;
    /** What the item carries, read live: a tag taken here is drawn taken at once. */
    names: readonly string[];
    /** The templates whose records stand, from the item's routing summary. */
    templates?: readonly string[];
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

  function fires(name: string): string | undefined {
    return triggeredBy(name)?.name;
  }

  /** A trigger tag whose template's record still stands cannot be taken off here. */
  function held(name: string): boolean {
    const template = triggeredBy(name);
    return template !== undefined && templates.includes(template.id);
  }

  function add(name: string): void {
    void tagged(name);
    if (fires(name) !== undefined) onfired?.();
  }

  /** A trigger tag files the item, so what it did is said as soon as it is known. */
  async function tagged(name: string): Promise<void> {
    await client.tag(item, name);
    await sayItFired(item, name);
  }
</script>

<div class="flex min-w-0 flex-wrap items-baseline gap-x-[1ch]">
  <TagSet
    {names}
    {offered}
    {fires}
    {held}
    onadd={add}
    onremove={(name) => void client.untag(item, name)}
  />
</div>
