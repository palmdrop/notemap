# NOTEMAP

Notemap is a quick way of capturing and processing notes, and routing the contents of these notes to other knowledge-management systems.  
See `/docs` for further details.

This is a learning project. Interface design, architecture and module apis should be designed in tandem with me, the developer, 
unless otherwise instructed. Before choosing language, library or other major decisions, consult me. 

Notemap is a greenfield project. There are no live users. Features and API's may change without proper migrations.

Privacy, data ownership, self-hostable, local-first, offline-friendly, are important keywords for the project.

## Where things are written down

- `CONTEXT.md` — the glossary. Use these words and avoid the listed alternatives. If a term is
  missing or wrong, fix it there rather than inventing a synonym.
- `docs/adr/` — decisions and why they were made. Read before re-opening a settled question.
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
