<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import Row from "$components/settings/Row.svelte";
  import Section from "$components/settings/Section.svelte";
  import { client } from "$lib/client";
  import { session } from "$lib/session.svelte";

  const who = session();

  let going = $state(false);
  let failed: string | undefined = $state(undefined);

  async function signOut() {
    going = true;
    failed = undefined;

    try {
      await client.logout();
    } catch (error) {
      // The cache is dropped either way; this only says the daemon was not told.
      failed = saidBy(error);
    } finally {
      going = false;
    }
  }
</script>

{#if who.known}
  <Section name="session">
    {#if who.canSignOut}
      <Row
        mark="✓"
        what="signed in"
        why={failed ?? "this browser holds a session"}
        tone={failed === undefined ? "good" : "bad"}
      >
        <span class="ml-6 max-narrow:ml-[var(--spacing-mark)]">
          <Action disabled={going} onclick={signOut}>
            {going ? "signing out" : "Sign out"}
          </Action>
        </span>
      </Row>

      <p class="mt-4 text-ink-muted">
        Signing out drops what this browser cached and keeps what it has not
        sent yet.
      </p>
    {:else}
      <Row
        mark="—"
        what="open"
        why="no password is set, so every request is let through"
        tone="quiet"
      />

      <p class="mt-4 text-ink-muted">
        Run <code class="font-mono">notemap password set</code> where the daemon
        runs to close the door.
      </p>
    {/if}
  </Section>
{/if}
