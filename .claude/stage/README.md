# A stage

notemap built from one branch, with something at every destination and a pool already seeded.
`agent stage <branch>` runs it; this directory is what it runs, read from `main`.

## What it holds

| Service   | Built from                       | What it is                                                         |
| --------- | -------------------------------- | ------------------------------------------------------------------ |
| `notemap` | the branch, `Dockerfile`         | the daemon, exactly as the release image builds it                 |
| `webdav`  | `rclone serve webdav`, pinned    | a real WebDAV server, standing in for Nextcloud                    |
| `arena`   | the branch, `Dockerfile.stage`   | a fake are.na, partial and in memory                               |
| `pages`   | the branch, `Dockerfile.stage`   | one placeholder page with OpenGraph tags, answered on every path   |
| `seed`    | the branch, `Dockerfile.stage`   | runs once: signs in, lays out `fixtures.json`, captures, exits     |
| `edge`    | caddy, pinned, and `Caddyfile`   | the only service with a published port                             |

`seed` makes three destinations (a filesystem vault, a WebDAV folder, an are.na channel) and a
routing template for each, then captures the usual seed items plus one per template carrying its
trigger tag. Those are routed by the pool, and land once the trigger window has passed.

The vault also holds `todo.md`, a list under four headings, and a fourth template, `Todo`
(`route/todo`), that files a capture into it as a task under a heading **asked each time**. Its
seeded capture gives `Next`. Tagging an item `route/todo` in the shell asks for the heading,
listing the note's own. `todo.md` is written by a capture routed there by hand, so it is in the
feed as a routed item too. Each
text capture links to `pages`, so it has a preview. `edge` waits for `seed` to finish, so the URL
answers only once the pool is seeded.

The fake are.na implements the calls the adapter makes and no more. What it accepts says nothing
about whether are.na would. The block links in the log point at the real `www.are.na` and lead
nowhere.

## The password

`$STAGE_SECRETS` is `~/.config/agents/notemap.stage.env`, holding one line:

```sh
NOTEMAP_PASSWORD=…
```

The daemon sets it as its credential on its empty auth db, and `seed` signs in with it. Sign in at
the app URL as `admin`. Every rebuild starts from empty volumes, so a changed password takes effect
on the next one.

**It must not be the password of a real pool.** Containers built from the branch hold it, and a
branch is code nobody has reviewed yet.

## Inspecting what arrived

- **The vault**: `podman exec <stage>-notemap-1 ls -R /var/lib/notemap/vaults/stage`.
- **WebDAV**: the `webdav` port, as `stage` / `stage`. A browser gets a directory listing.
- **are.na**: `GET /_inspect` on the `arena` port answers the blocks and uploads the fake holds.
  Nothing else of the fake is published.
- **The log**: `podman logs <stage>-notemap-1`. A warning that a sign-in arrived for `notemap:4747`
  is the seed, which reaches the daemon by its service name rather than through `edge`.

## The network

Everything built from the branch (`notemap`, `arena`, `pages`, `seed`) and `webdav` join `stack`
alone, which is `internal: true`: it has no route out, to the internet or to the LAN. `edge` joins
`stack` and the default network, publishes every port on `127.0.0.1`, and proxies to the services
behind it. The app is reached over Twingate at `$STAGE_URL`. `agent stage` refuses a definition in
which a branch-built service joins a network that is not internal or publishes a port, and
`tests/integration/src/compose.test.ts` checks this file for the same.

`stack` has a subnet from publicly routable space, `44.128.$STAGE_INDEX.0/24`: a /24 per stage,
because podman will not give two networks the same one. The unfurl guard refuses every
private and reserved range, so on a default subnet `pages` would be refused and no link would have
a preview. The guard is unchanged: on this subnet `pages` simply is public, as far as it can tell.
Nothing outside reaches the range, because nothing routes it to this machine and the bridge lives
in podman's rootless namespace; `ip route get 44.128.0.5` on the host still goes out the default
route. Nothing inside leaves, because `stack` is internal. The only addresses shadowed are the
range's real ones, and only from containers that could not reach them anyway.

A preview's image is loaded by the browser rather than by the daemon, so `pages` names it under
`$STAGE_URL/_stage/`, which `edge` sends to `pages`.

## What is not closed

**Build-time egress.** `podman build` has unrestricted network, so a `postinstall` script from the
branch runs with a route out. The build holds nothing secret (the password only exists at
runtime), and an agent working the branch already holds a GitHub token, which is a way out for the
same code. Closing it would need a trusted Dockerfile separate from the real one, and then a stage
would stop testing the real one.
