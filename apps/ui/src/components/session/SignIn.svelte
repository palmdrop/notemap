<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import { client } from "$lib/client";

  const FIELD = "w-full border-b border-ink bg-transparent focus:outline-none";

  let name = $state("admin");
  let password = $state("");
  let sending = $state(false);
  let refused: string | undefined = $state(undefined);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (sending || password === "") return;

    sending = true;
    refused = undefined;

    try {
      await client.login(name, password);
      password = "";
    } catch (error) {
      refused = saidBy(error);
    } finally {
      sending = false;
    }
  }
</script>

<form onsubmit={submit}>
  <Register>
    <Rail first>name</Rail>
    <Body first>
      <input
        bind:value={name}
        autocomplete="username"
        name="username"
        aria-label="name"
        class={FIELD}
      />
    </Body>

    <Rail>password</Rail>
    <Body>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={password}
        type="password"
        autocomplete="current-password"
        name="password"
        aria-label="password"
        autofocus
        class={FIELD}
      />
    </Body>
  </Register>

  <div class="mt-6 flex items-baseline gap-6">
    <Action submit primary disabled={sending || password === ""}>
      {sending ? "signing in" : "sign in"}
    </Action>
    {#if refused !== undefined}
      <span role="alert" class="text-alarm">{refused}</span>
    {/if}
  </div>
</form>
