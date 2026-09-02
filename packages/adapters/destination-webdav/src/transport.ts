/**
 * What an account is reached over is this adapter's to judge, not the host's:
 * the host reads accounts and secrets and knows nothing about DAV. It asks for
 * what should be said about them and says it.
 */
export type AccountAddress = {
  readonly name: string;
  readonly baseUrl: string;
};

/**
 * Said once at startup for every account whose password would leave a network
 * the operator controls, and not enforced: where the address is not private,
 * whether plain HTTP is acceptable is a thing only the person who wrote the
 * address knows, and refusing would refuse deployments that are fine — a
 * private VLAN, a tunnel, a mesh interface — for a guess.
 */
export function transportWarnings(
  accounts: readonly AccountAddress[],
): readonly string[] {
  return accounts.flatMap((account) => {
    const url = new URL(account.baseUrl);
    if (url.protocol === "https:" || isPrivateHost(url.hostname)) return [];

    return [
      `the webdav account ${account.name} reaches ${url.hostname} over plain HTTP, so its password crosses the network in the clear — put TLS in front of it, or reach it at a private address`,
    ];
  });
}

/**
 * Somewhere a password cannot cross a network somebody else is on. Loopback is
 * the narrowest case of it and not the ordinary one: a service reached as
 * `nextcloud` on a container network is a single label that resolves nowhere
 * else, and calling that public would call the deployment this kind is written
 * for public.
 */
export function isPrivateHost(bracketed: string): boolean {
  // `URL.hostname` hands an IPv6 literal back in the brackets it was written in.
  const host = bracketed.replace(/^\[|]$/g, "");

  if (host === "::1") return true;
  if (host.includes(":")) return isPrivateV6(host);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return isPrivateV4(host);

  // `localhost` among them, and every container reached by its service name.
  return !host.includes(".");
}

/** `127/8` included: the whole of it is loopback, not just the address people type. */
function isPrivateV4(host: string): boolean {
  const [a, b] = host.split(".").map(Number) as [number, number];

  if (a === 10 || a === 127) return true;
  if (a === 172) return b >= 16 && b <= 31;
  if (a === 192) return b === 168;
  return a === 169 && b === 254;
}

/** Unique-local `fc00::/7` and link-local `fe80::/10`, by the two digits that name them. */
function isPrivateV6(host: string): boolean {
  const address = host.toLowerCase().split("%")[0] ?? "";
  return /^f[cd]/.test(address) || /^fe[89ab]/.test(address);
}
