# NOTEMAP

Notemap is a quick way of capturing and processing notes, and routing the contents of these notes to other knowledge-management systems.  
See `/docs` for further details.

## Rules

Design and process

- Consult me before choosing a language, library, or making any other major decision.
- Design interfaces, architecture and module APIs together with me, unless told otherwise.
- Say so and make the case when you see a better pattern, even where a doc states the opposite. Never quietly implement a shape you believe is wrong.
- Push back when I write code or define interfaces that contradict a spec or ADR — then concede if I confirm that is the shape I want.
- Change the doc and the code in the same change, and get my confirmation before either lands.
- Read `CONTEXT.md` and use its words. Fix a term there rather than inventing a synonym.

Code

- Comments are the exception. Do not restate the code, do not explain rejected alternatives, do not point at discussions, ADRs or other docs.
- Before writing one, two questions: would a reader ask _why_ here, and can the code itself answer it? Write the comment only if the answers are yes and no.
- Keep files small and grouped by concern, in folders. Tests live beside what they test.
- Reach across a top-level `src/` folder through an alias, where one exists: `#folder/*` from
  the package's own `imports` field, `$folder` in the UI. Relative is for reaching within your
  own folder, and for crossings no alias covers.

Git

- Branch per plan, `agent/<plan-file-stem>`. Never commit to `main` directly.
- Keep `origin` on HTTPS — `https://github.com/palmdrop/notemap.git`. Never change it to `git@github.com:`.
- Never force-push a branch that has an open PR.
- Use conventional commits. Specify part of the app, i.e "feat(client): a clear statement indicating what has changed".

Verification

- Run typecheck, tests and linters when you finish a feature or a larger test.
- Run tests as `pnpm -r --silent test`, which prints nothing at all; on a non-zero exit, re-run
  the failing package without `--silent` to see why.
- `pnpm test:stack` is not part of finishing a feature. Run it after a change that crosses the
  layers — the HTTP surface, the host's wiring, the client's transport, the config file.
- Resolve every issue before you commit or state that you are done.

---

The rest of this file is the reasoning behind those rules.

## What this project is

This is a learning project. Interface design, architecture and module apis should be designed in tandem with me, the developer, 
unless otherwise instructed. Before choosing language, library or other major decisions, consult me. When I write code or define interfaces, push back if they contradict specs or ADRs, but ultimately concede if I confirm this is the shape I want. Update the docs accordingly.

Notemap is a greenfield project. There are no live users. Features and API's may change without proper migrations. 

Privacy, data ownership, self-hostable, local-first, offline-friendly, are important keywords for the project.

## How settled any of this is

Less than the docs sound. They are written in decided language because a decision is only
useful if it is stated plainly — not because the question is closed. The API is still being
explored; no ADR, spec or standard outranks a better idea.

So: if you see a better pattern, a cleaner interface, a simpler implementation, **say so and
make the case**, even where a doc states the opposite. An ADR tells you what was known and
what was weighed at the time — read it so you argue with the reasoning rather than around it,
then argue. Quietly implementing the documented shape while believing it is wrong is the
failure mode here; disagreement is not.

What is not loose is that **docs and code must agree** — this is spec-driven development.
That cuts both ways:

- Changing behaviour means changing the doc that describes it, in the same change.
- Don't retrofit a doc to match code you already wrote, and don't code against a doc you
  think is wrong without raising it first.
- Propose the doc change and the code change together, and get my confirmation before either
  lands. Reversing a decision worth the reasoning gets a new ADR (or a superseding note), not
  an edit that erases the old one.

## Where things are written down

- `CONTEXT.md` — the glossary. Use these words and avoid the listed alternatives. If a term is
  missing or wrong, fix it there rather than inventing a synonym.
- `docs/adr/` — decisions and the reasoning behind them, as it stood on the date at the top.
- `docs/specs/` — what each piece is, in observable terms. `core.md` is the domain.
- `docs/standards.md` — principles, formats, interop contract.
- `docs/exploration/` — frozen. The design phase these were derived from, kept as rationale.
  Where it disagrees with an ADR, the ADR wins.
- `README.md`- general information about Notemap, user- or developer-facing. THIS FILE IS WRITTEN
  by hand, by the developer. Do not edit. You may, however, suggest edits and additions.

## Coding guidelines

Do not write comments that refer to discussions, ADRs or other docs, unless particularly justified. 

Only write comments that describe decisions that are unexpected. Code and comments should be self-contained.

Comments are the exception, not the habit. Do not restate what the code does, do not explain why
an alternative was rejected, and do not write a paragraph where the code is already clear — that
reasoning belongs in the docs, which the code never points back at. A comment that claims a
guarantee must be one the code actually enforces; a stale or false comment is worse than none.

Keep files small and grouped by concern, in folders — routes, middleware, schemas, errors,
types, utils, constants. A flat directory of everything is not a structure. Tests live beside
what they test.

Within a folder, import relatively. Reaching across a top-level folder under `src/` goes through
an alias where one exists — `#types/domain/ids`, not `../../types/domain/ids` — which leaves `..`
saying one thing: the folder the file belongs to.

Aliases live in the `imports` field of the package's own `package.json`, and in
`apps/ui/vite.config.ts` for the app ([ADR 0025](docs/adr/0025-cross-folder-aliases-live-in-the-imports-field.md)).
A package names the folders it aliases and stops there; `apps/daemon` names none, and a crossing
no alias covers stays relative. Add an entry where a folder is reached across often enough to
earn one and convert its callers in the same change. Nothing checks any of this.

## Git

- **`origin` is HTTPS** — `https://github.com/palmdrop/notemap.git`. Credentials come from
  `gh` on the host and from `GH_TOKEN` in a container. Never change it back to
  `git@github.com:`: the SSH key on this machine is passphrase-protected and no agent
  session has an `ssh-agent`, so a push over SSH dies with `Permission denied (publickey)`.
- Branch per plan, `agent/<plan-file-stem>`. Never commit to `main` directly.
- Never force-push a branch that has an open PR.

## Verification

When you are done implementing a feature, or making a larger test, run typecheck, tests and linters. 
Resolve any issues before commiting or stating that you are done.

The full-stack suite is deliberately outside all of that. `pnpm -r test` skips it for want of a
`test` script, and `pnpm test:stack` runs it: a daemon spawned per test, on a real port, driven by
a real client. Run it after a change that crosses the layers — the HTTP surface, the host's wiring,
the client's transport, the config file — or when asked, and leave it alone otherwise. CI runs it
on every push, which is what keeps it honest without anyone paying for it locally.

Run the tests as `pnpm -r --silent test`. It prints nothing — not even the failures — and says
what happened through its exit code alone, which is all a green run has to say and is worth the
few lines a full run spends per package. When it exits non-zero, re-run the package that failed
without `--silent`, or run `pnpm test` in full, and read it there. This is for agents, whose
context the noise costs; run them however you like by hand. 
