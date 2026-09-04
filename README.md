# Notemap

> NOTE: This is an experimental personal notetaking app. Project uses agentic development heavily. This README is an exception, and is NOT AI generated.
> 
> NOTE: This repo comes with no guarantee. Notemap is in alpha, v1.0.0 is likely months away.

`Notemap` is a working memory processing queue.

The problem: quick note taking often results in a big "working memory file" where links, thoughts, notes, quotes, movies to watch, 
projects to start, end up. I've used this technique extensively for a long time. The problem: the file grows without bound. It is 
disorganized and unstructured. Cleaning it up means copy pasting fragments to appropriate places, visiting links, and mostly just
deleting things.

`Notemap` is a replacement for this. A queue of unprocessed notes, intended to be transferred to a more persistent location. 

Captures can be tagged, edited, "enriched", and most importantly, *routed* to other locations. `Notemap` works with various 
*routing adapters* that take the capture and transfers it to the appropriate place. A calendar entry, a todo item, a note 
in an Obsidian vault, an Are.na channel, whatever. 

`Notemap` keeps track of all the unprocessed and processed notes, and the full history can always be viewed in a feed. 
Each capture tracks the routing history, which can be surveyed at any time.

## Roadmap

A rough roadmap.

- Android/IOS App 
- External Inboxes
- Complex routing
- More adapters

## Core philosophy

Full data ownership. Fully self-hostable. Works offline through a durable client using Indexeddb. 

## Install

Copy `docker/compose/` and run

```sh
docker compose up -d                            
docker compose -f compose.yaml up -d      
```

Upgrade by bumping the version in `.env` and run `docker compose pull && up -d`.

NOTE: Basic authentication is implemented. Password can be set using `notemap password set` inside the container.
Not really security tested. Do not expose `Notemap` to the public internet.

## Development

```sh
pnpm install
mkdir -p ~/.config/notemap && cp apps/daemon/config.example.toml ~/.config/notemap/config.toml
pnpm dev
```

---

Very WIP, more to come, etc.
