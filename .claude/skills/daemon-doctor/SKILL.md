---
name: daemon-doctor
description: Get the local notemap dev daemon running on current code — rebuild it, reconcile config and data layout with the current defaults, and prove it works with a real capture.
disable-model-invocation: true
---

# Daemon doctor

The dev daemon on this machine drifts from the repo in three ways at once: a **stale build**, a
`~/.config/notemap/config.toml` written against an older schema, and a `~/.local/share/notemap`
laid out to an older default. Reconcile all three, then prove it.

This pool is a throwaway dev server. Preserving its data is worth a `mv`, and worth nothing more.

## 1. Build

```sh
pnpm --filter @notemap/daemon build
```

A build failure is a code problem, not a daemon problem. Report it and stop.

## 2. Reconcile the config

`~/.config/notemap/config.toml` is the file to change. Two things in the repo describe what it
may hold, and they answer different questions:

- `apps/daemon/src/config/load.ts` — `fileSchema` decides what is **valid**. It is a
  `strictObject`, so a key the code has since dropped makes the daemon refuse to start outright.
- `apps/daemon/config.example.toml` — decides the **shape and defaults** a current config has.

Work through the user's config against both:

- A key the schema no longer accepts → remove it.
- A table the example has that the config lacks → add it, with the example's values. `[mirror]`
  is the one that matters: absent means the mirror is off, and then the database is the only copy
  of everything.
- A path pointing at an older layout → repoint it.

Where the example itself disagrees with `fileSchema`, that is a bug in whichever commit changed
the schema. Say so rather than working around it.

**Done when** every key in the user's config is accounted for — kept, removed, added or
repointed — and you have listed the changes you made.

## 3. Reconcile the layout

Read the resolved `daemon.pool` and `mirror.root` out of the config, then look at what is actually
under `~/.local/share/notemap`.

Move the tree **whole**. The pool and its mirror are one backup unit and a rebuild needs both, so
they move together or not at all. Carry `-wal` and `-shm` alongside the database.

Moving files needs no confirmation. **One case does**: if a pool sits at both the old and the new
path, there are two pools and no way to tell which is real. Ask.

**Done when** every file under the data root is either at its configured path or explicitly
accounted for.

## 4. Restart

The daemon binds `daemon.port` from the config, so the port is the handle.

```sh
fuser -k <port>/tcp                     # whatever holds it now
mkdir -p ~/.local/state/notemap
node apps/daemon/dist/main.js > ~/.local/state/notemap/daemon.log 2>&1 &
```

Poll `GET /v1/openapi.json` until it answers.

If the user had `pnpm dev` running in their own terminal, this killed it. Say so in the report —
their terminal will be showing a dead process.

## 5. Prove it with a capture

Startup proves nothing. A breaking schema change lands without a migration during v1, which means
an existing pool has its `user_version` already at `MIGRATIONS.length`, `migrate()` applies
nothing, and the daemon comes up perfectly happily against a stale schema — failing later, on the
first write. Path drift is worse: everything succeeds and the daemon quietly fills a new empty
pool somewhere else.

So the gate is a real capture reaching real files:

```sh
curl -s -X POST http://127.0.0.1:<port>/v1/captures \
  -H 'content-type: application/json' \
  -d '{"source":"web","sourceItemId":"doctor-<timestamp>","capturedAt":"<now>",
       "payload":{"type":"text","content":{"text":"daemon doctor"},"metadata":{},"assets":[]}}'
```

**Green** is: 201 back, and within a second or two a `.json` + `.md` pair under
`<mirror.root>/YYYY/MM/DD/`. That one test covers all three kinds of drift at once.

Green → delete the capture's pair, report what you changed, and stop.

Not green → the pool cannot carry current code. Go to 6.

## 6. Scrap, only when it is not green

Archive rather than delete, and **ask before doing it**:

```sh
mv ~/.local/share/notemap ~/.local/share/notemap.scrapped-<ISO-8601>
```

State plainly what is being given up. `pool-mirror/` holds a complete, human-readable record of
every item — but **rebuild is not built**, so notemap cannot read those files back. Scrapping
loses the pool from notemap for good, even though the archive survives on disk.

Then restart (4) and capture again (5). Still not green after an empty pool is a bug in the
daemon, not drift. Report it and stop.
