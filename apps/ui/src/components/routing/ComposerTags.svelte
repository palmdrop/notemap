<script lang="ts">
  import type { RoutingTemplate } from "@notemap/client";

  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { client } from "$lib/client";
  import { triggeredBy } from "$lib/templates";

  /**
   * The classification the row makes, offered where routing is decided, less
   * the trigger tags: routing is decided here already. It goes through the
   * outbox on its own and **drains independently of the route**: a route that
   * then fails leaves the tags applied, which is the honest outcome — the
   * person classified the item, and that was true.
   */
  let {
    item,
    names,
    templates = [],
    ontemplate,
  }: {
    item: string;
    /** What the item carries, read live: a tag taken here is drawn taken at once. */
    names: readonly string[];
    /** The templates whose records stand, from the item's routing summary. */
    templates?: readonly string[];
    /**
     * A trigger tag was typed in. It is not applied here, where it would route
     * beside the decision being made: its template is taken into that decision
     * instead, and nothing goes until it is committed.
     */
    ontemplate: (template: RoutingTemplate) => void;
  } = $props();

  const inUse = client.tags.inUse;
  const declared = client.templates.all;
  const offered = $derived(
    $inUse
      .map((use) => use.name)
      .filter((name) => !$declared.some((one) => one.triggerTag === name)),
  );

  function fires(name: string): string | undefined {
    return triggeredBy(name)?.name;
  }

  /** A trigger tag whose template's record still stands cannot be taken off here. */
  function held(name: string): boolean {
    const template = triggeredBy(name);
    return template !== undefined && templates.includes(template.id);
  }

  function add(name: string): void {
    const template = triggeredBy(name);
    if (template !== undefined) ontemplate(template);
    else void client.tag(item, name);
  }
</script>

<div class="relative -ml-tag flex min-w-0 flex-wrap items-baseline">
  <TagSet
    {names}
    {offered}
    {fires}
    {held}
    onadd={add}
    onremove={(name) => void client.untag(item, name)}
  />
</div>
