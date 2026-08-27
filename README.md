# notemap

Notemap captures anything worth keeping into one **pool**, enriches it without altering it, and
routes it out to wherever it actually lives. It is a conveyor belt, not an archive: items are
supposed to leave.

A capture goes in from a phone or a browser. Classification is a person's, and cheap. A **routing**
decision sends the item to a **destination** — a vault, a folder, another app — and what leaves is
a file that keeps working with notemap gone. Everything is yours, on a machine you own: local-first,
offline-friendly, self-hosted.

## Running it

One container behind the reverse proxy you already run:

```sh
git clone https://github.com/palmdrop/notemap.git
cd notemap/packaging/docker
NOTEMAP_PROXY_NETWORK=proxy docker compose up -d --build
```

There is no published port and no authentication in notemap itself — **the proxy carries TLS and
authentication**. [docs/running.md](docs/running.md) is the whole story: the config, the proxy, the
volume and what to back up, destinations, upgrades.

## Working on it

```sh
pnpm install
mkdir -p ~/.config/notemap && cp apps/daemon/config.example.toml ~/.config/notemap/config.toml
pnpm dev
```

`pnpm -r --silent test` prints nothing and says what happened through its exit code.
[AGENTS.md](AGENTS.md) is the conventions and the reasoning behind them.

## The rest

| | |
|---|---|
| [CONTEXT.md](CONTEXT.md) | The glossary. Every word above is defined there. |
| [docs/](docs/README.md) | Specs, decisions, plans and reviews. |
| [docs/running.md](docs/running.md) | Deploying and operating it. |
