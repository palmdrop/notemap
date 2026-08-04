# NOTEMAP

Notemap is a quick way of capturing and processing notes, and routing the contents of these notes to other knowledge-management systems.  
See `/docs` for further details.

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

## Coding guidelines

Do not write comments that refer to discussions, ADRs or other docs, unless particularly justified. 

Only write comments that describe decisions that are unexpected. Code and comments should be self-contained.

## Git

- **`origin` is HTTPS** — `https://github.com/palmdrop/notemap.git`. Credentials come from
  `gh` on the host and from `GH_TOKEN` in a container. Never change it back to
  `git@github.com:`: the SSH key on this machine is passphrase-protected and no agent
  session has an `ssh-agent`, so a push over SSH dies with `Permission denied (publickey)`.
- Branch per plan, `agent/<plan-file-stem>`. Never commit to `main` directly.
- Never force-push a branch that has an open PR.
