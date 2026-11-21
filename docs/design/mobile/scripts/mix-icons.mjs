// Builds icons/<mix>.svg from sprites already built: one set as the base, with some roles taken
// from other sets, redrawn to the base's weight. Run after build-icons.mjs, which rewrites
// sets.json without the mixes.
//
//   node scripts/mix-icons.mjs

import { readFile, writeFile } from "node:fs/promises";

const icons = new URL("../icons/", import.meta.url);
const mixes = {
  notemap: {
    label: "Carbon, with Tabler's route",
    base: "carbon",
    take: { route: { from: "tabler", strokeWidth: 1.5 } },
  },
};

const symbols = (sprite) => new Map([...sprite.matchAll(/<symbol id="i-([\w-]+)"[\s\S]*?<\/symbol>/g)].map((m) => [m[1], m[0]]));
const sets = JSON.parse(await readFile(new URL("sets.json", icons), "utf8"));

for (const [id, mix] of Object.entries(mixes)) {
  let sprite = await readFile(new URL(`${mix.base}.svg`, icons), "utf8");
  const credits = [sets[mix.base]];
  for (const [role, { from, strokeWidth }] of Object.entries(mix.take)) {
    let symbol = symbols(await readFile(new URL(`${from}.svg`, icons), "utf8")).get(role);
    if (strokeWidth) symbol = symbol.replace(/stroke-width="[\d.]+"/g, `stroke-width="${strokeWidth}"`);
    const had = symbols(sprite).get(role);
    sprite = had ? sprite.replace(had, symbol) : sprite.replace("</svg>", `${symbol}\n</svg>`);
    credits.push(sets[from]);
  }
  await writeFile(new URL(`${id}.svg`, icons), sprite);
  sets[id] = {
    label: mix.label,
    licence: credits.map((c) => `${c.label}: ${c.licence}`).join("; "),
    author: credits.map((c) => c.author).join(", "),
    url: sets[mix.base].url,
    missing: sets[mix.base].missing,
  };
}
await writeFile(new URL("sets.json", icons), JSON.stringify(sets, null, 2) + "\n");
