<script lang="ts">
  import { saidBy, type Account, type AccountKind } from "@notemap/client";

  import AccountForm from "$components/settings/AccountForm.svelte";
  import Fact from "$components/settings/Fact.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";

  const pool = reachable();

  let kinds = $state<readonly AccountKind[]>([]);
  let held = $state<readonly Account[]>([]);
  let adding = $state(false);
  let editing = $state<string | undefined>(undefined);
  let going = $state(false);
  /** Which account a `remove` was pressed on, while it is asked. */
  let removing = $state<string | undefined>(undefined);
  let said = $state("");

  const keyOf = (one: Account) =>
    `${one.kind}/${one.name}/${one.shadowed ? "shadowed" : "used"}`;

  const grouped = $derived(
    kinds.map((kind) => ({
      kind: kind.name,
      accounts: held.filter((one) => one.kind === kind.name),
    })),
  );

  async function attempt(what: () => Promise<unknown>) {
    said = "";
    going = true;
    try {
      await what();
    } catch (error) {
      said = saidBy(error);
    } finally {
      going = false;
    }
  }

  const read = () =>
    attempt(async () => {
      [kinds, held] = await Promise.all([
        client.accounts.kinds(),
        client.accounts.list(),
      ]);
    });

  $effect(() => {
    if (pool.yes && kinds.length === 0) void read();
  });

  const remove = (one: Account) => {
    removing = keyOf(one);
    return attempt(async () => {
      await client.accounts.remove(one.kind, one.name);
      held = await client.accounts.list();
    }).finally(() => (removing = undefined));
  };

  const saved = () => {
    adding = false;
    editing = undefined;
    void attempt(async () => {
      held = await client.accounts.list();
    });
  };

  function describe(one: Account): string {
    const fields = Object.values(one.fields).map((value) => String(value));
    const secret = one.secretSet ? "secret set" : "no secret";
    const origin =
      one.from === "stored"
        ? `stored ${one.changedAt?.slice(0, 10) ?? ""}`.trim()
        : one.shadowed
          ? "config — ignored, a stored one replaces it"
          : "config";

    return [...fields, secret, origin].join(" · ");
  }
</script>

<Section name="accounts">
  {#if !pool.yes}
    <p role="status" class="mt-4">Accounts can be read but not changed.</p>
  {/if}

  {#each grouped as group (group.kind)}
    <Section name={group.kind} sub>
      {#each group.accounts as one (keyOf(one))}
        <Fact name={one.name}>
          <span
            class="flex flex-wrap items-baseline justify-between gap-x-[2ch] {one.shadowed
              ? 'opacity-60'
              : ''}"
          >
            <span>{describe(one)}</span>
            {#if !one.shadowed}
              <span class="flex gap-x-[2ch]">
                <Action
                  disabled={going || !pool.yes}
                  onclick={() =>
                    (editing = editing === keyOf(one) ? undefined : keyOf(one))}
                >
                  edit
                </Action>
                {#if one.from === "stored"}
                  <Action
                    disabled={going || !pool.yes}
                    working={removing === keyOf(one)}
                    onclick={() => void remove(one)}
                  >
                    remove
                  </Action>
                {/if}
              </span>
            {/if}
          </span>
        </Fact>
        {#if editing === keyOf(one)}
          <AccountForm
            {kinds}
            editing={one}
            disabled={!pool.yes}
            done={saved}
          />
        {/if}
      {:else}
        <p class="mt-2">none</p>
      {/each}
    </Section>
  {/each}

  {#if adding}
    <AccountForm {kinds} disabled={!pool.yes} done={saved} />
  {/if}

  {#if !adding}
    <div class="mt-6">
      <Action
        disabled={!pool.yes || kinds.length === 0}
        onclick={() => (adding = true)}
      >
        + add an account
      </Action>
    </div>
  {/if}

  {#if said !== ""}
    <p role="status" class="mt-3 text-alarm">{said}</p>
  {/if}
</Section>
