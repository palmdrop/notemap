<script lang="ts">
  import type { Destination } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import Commit from "$components/primitives/composer/Commit.svelte";
  import Modal from "$components/primitives/composer/Modal.svelte";

  /**
   * Deleting is the one thing on this page that cannot be undone, so it is the
   * one thing that asks — and the asking offers the reversible half instead.
   */
  let {
    one,
    said,
    onclose,
    ondelete,
    onretire,
  }: {
    one: Destination;
    /** Why the pool said no, which is the only thing that knows. */
    said?: string;
    onclose: () => void;
    ondelete: () => void;
    onretire: () => void;
  } = $props();
</script>

<Modal title="delete a destination" subject={one.name} {onclose}>
  <p class="mt-4">
    The pool refuses this if any routing record names it, since a record that
    cannot resolve its destination says less than one that can.
  </p>

  {#if said !== undefined && said !== ""}
    <p role="status" class="mt-4 text-accent">{said}</p>
  {/if}

  <p class="mt-5 border-t border-t-ink/20 pt-4 text-ink-muted">
    Retiring stops it being offered, disturbs nothing already decided, and can
    be undone.
  </p>

  <Commit>
    <Action primary onclick={ondelete}>
      <span aria-hidden="true">×</span> Delete anyway
    </Action>
    <Action onclick={onretire}>Retire instead</Action>
  </Commit>
</Modal>
