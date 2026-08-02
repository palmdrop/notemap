# 8. Adapters are in-process, bundled, and wired by the host

**Date**: 2026-08-02
**Status**: Accepted

---

## Context and problem statement

Providers come in and destinations go out, both as adapters
([audio-intake.md](../exploration/vision/audio-intake.md#transcription-is-a-provider-not-a-component),
[pool-and-routing.md](../exploration/vision/pool-and-routing.md#destinations-and-the-routing-table)).
Where do adapters live, and how does core reach them?

---

## Decision outcome

**Core defines ports and nothing else. Adapters are ordinary in-process modules, and the host
wires them in.**

```
src/core/          the domain. imports nothing outward.
src/adapters/      filesystem, append-file, obsidian-vault,
                   openai-compatible transcription,
                   webhook, command
src/hosts/daemon/  composition root: constructs adapters,
                   registers them against core's ports
```

*Amended 2026-08-02*: the layout is realized as **pnpm workspace packages** — core, adapters
and each host as separate packages — so core's no-outward-imports rule is enforced by an empty
dependency list and a tsconfig without Node types, not by convention.

Calls are direct in-process function calls — no IPC, no wire protocol, no latency. What the
host-wires-them rule buys is the direction of the dependency: core keeps no filesystem or HTTP
dependency, stays runtime-neutral per [ADR 5](0005-typescript-now-rust-later.md), and remains
embeddable in a plugin host per [ADR 2](0002-core-is-a-host-agnostic-library.md). It also lets
different hosts wire different adapters.

The notemap service ships with a useful default set. **A plugin system for third-party adapters
is a future concern** — deliberately not designed now.

Note that the `webhook` and `command` adapters are themselves in-process: they are bundled
adapters that happen to call out. They are what keep the ports honest, in the same way
`append-file` proves the destination interface is real rather than a vault writer in disguise.

Adapters hold secrets — API tokens, vault paths. Core never does; secrets stay with the host
and reach the adapter as configuration data, consistent with
[ADR 7](0007-enrichment-steps-declare-their-needs.md)'s rule that core takes configuration as
data but does not source it.

### Considered options

- **All adapters out-of-process.** Language-agnostic and sandboxed, but writing a file to a
  local vault would involve a protocol hop, and every deployment would gain services to run.
- **Core imports adapters directly.** Least ceremony today; costs runtime-neutrality, the
  plugin host, and per-host adapter selection.
