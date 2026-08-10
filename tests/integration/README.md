# @notemap/integration-tests

Core driven through real adapters, which is the one thing neither package can test alone.

Core's own tests answer "does the domain decide correctly", and the driver's answer "does this
store honour the port contract". Both substitute the other side. These do not: they wire the
ports the way a host does ([ADR 8](../../docs/adr/0008-adapters-are-in-process-and-wired-by-the-host.md))
and drive `createPool` against the SQLite store on a real file.

It lives outside `packages/` because it is neither the domain, an adapter nor a host, and because
core must not depend on an adapter even for a test — the dependency arrow points inward, and a
devDependency pointing back out would make core's manifest say otherwise.

`src/fixture.ts` holds the ports core needs that have no adapter yet: a frozen clock, and an id
generator that counts. They are test doubles on purpose — a pinned clock and a predictable
sequence are what make the assertions readable. When a real one ships it becomes a package and
this fixture drops it, which is what happened to the toy schema validator: these tests now
validate through `@notemap/schema-ajv`.
