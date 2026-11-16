<script lang="ts">
  import { saidBy, type Account, type AccountKind } from "@notemap/client";

  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  import Band from "$components/primitives/blocks/Band.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import PageBar from "$components/primitives/frame/PageBar.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import Dialog from "$components/primitives/sheets/Dialog.svelte";
  import AccountForm from "$components/settings/AccountForm.svelte";
  import Section from "$components/settings/Section.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";

  import { newHref, openHref, settingsHref } from "./href";

  const pool = reachable();

  let kinds = $state<readonly AccountKind[]>([]);
  let held = $state<readonly Account[]>([]);
  /** The list, or an account's form: read off the address. */
  const opened = $derived(page.url.searchParams.get("open") ?? undefined);
  const adding = $derived(page.url.searchParams.has("new"));
  const editing = $derived(
    held.find((one) => !one.shadowed && `${one.kind}/${one.name}` === opened),
  );
  let doomed = $state<Account | undefined>(undefined);

  /** A form done with gives way to the list, in its place in history. */
  function back(): void {
    void goto(settingsHref("accounts"), { replaceState: true });
  }
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
    try {
      await what();
    } catch (error) {
      said = saidBy(error);
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

  const remove = (one: Account) =>
    attempt(async () => {
      await client.accounts.remove(one.kind, one.name);
      held = await client.accounts.list();
    });

  const saved = () => {
    back();
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

    return fields.length === 0
      ? `${secret}, ${origin}`
      : `${fields.join(", ")}, ${secret}, ${origin}`;
  }
</script>

{#if adding}
  <AccountForm {kinds} disabled={!pool.yes} done={saved} />
{:else if editing !== undefined}
  {@const one = editing}
  <AccountForm
    {kinds}
    editing={one}
    disabled={!pool.yes}
    done={saved}
    onremove={one.from === "stored" ? () => (doomed = one) : undefined}
  />
{:else}
  <Section name="accounts">
    <div class="flex flex-col">
      <div>
        {#if !pool.yes}
          <p role="status" class="m-0 px-gutter py-3 text-small text-muted">
            The pool is out of reach. Accounts can be read but not changed.
          </p>
        {/if}

        {#each grouped as group (group.kind)}
          <Band>{group.kind}</Band>
          {#each group.accounts as one (keyOf(one))}
            <LinkRow
              title={one.name}
              label={one.name}
              line={describe(one)}
              end={one.from === "stored" ? undefined : "config file"}
              muted={one.shadowed}
              chevron={!one.shadowed}
              disabled={one.shadowed}
              href={one.shadowed
                ? undefined
                : openHref("accounts", `${one.kind}/${one.name}`)}
            />
          {:else}
            <p class="m-0 border-b border-rule px-gutter py-3 text-muted">
              none
            </p>
          {/each}
        {/each}

        {#if said !== ""}
          <p role="status" class="m-0 px-gutter py-3 text-danger">{said}</p>
        {/if}
      </div>

      <PageBar label="Accounts">
        <BarAction
          icon="plus"
          label="Add an account"
          primary
          why={!pool.yes
            ? "The pool is out of reach."
            : kinds.length === 0
              ? "The pool has said no kinds of account."
              : undefined}
          href={newHref("accounts")}
        />
      </PageBar>
    </div>
  </Section>
{/if}

{#if doomed !== undefined}
  {@const leaving = doomed}
  <Dialog
    title="Remove {leaving.name}?"
    ways={[
      { label: "Keep", value: false },
      { label: "Remove", value: true, kind: "danger" },
    ]}
    onanswer={(yes) => {
      const one = leaving;
      doomed = undefined;
      if (yes === true) void remove(one).then(back);
    }}
  >
    <p class="m-0">A destination that names it can no longer sign in.</p>
  </Dialog>
{/if}
