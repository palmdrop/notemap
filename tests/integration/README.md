# @notemap/integration-tests

Core driven through real adapters, which is the one thing neither package can test alone.

Core's own tests answer "does the domain decide correctly", and the driver's answer "does this
store honour the port contract". Both substitute the other side. These do not: they wire the
ports the way a host does ([ADR 8](../../docs/adr/0008-adapters-are-in-process-and-wired-by-the-host.md))
and drive `createPool` against the SQLite store on a real file.

It lives outside `packages/` because it is neither the domain, an adapter nor a host, and because
core must not depend on an adapter even for a test — the dependency arrow points inward, and a
devDependency pointing back out would make core's manifest say otherwise.

`src/fixture.ts` holds the ports core needs that have no adapter yet: a frozen clock, an id
generator that counts, and a schema validator that checks required keys and nothing more. They
are test doubles on purpose. When a real one ships it becomes a package and this fixture drops it.
