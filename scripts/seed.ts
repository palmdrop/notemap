import { seed } from "@notemap/seed";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const at = args.indexOf("--url");
const url = at === -1 ? "http://127.0.0.1:4747" : args[at + 1];

if (url === undefined) {
  console.error("notemap: --url takes an address");
  process.exit(1);
}

const seeded = await seed(url);

console.log(`notemap: seeded ${url}`);
console.log(`  queued     ${seeded.queued.join(", ")}`);
console.log(`  processed  ${seeded.processed.join(", ")}`);
console.log(`  archived   ${seeded.archived.join(", ")}`);
console.log(`  with image ${seeded.withImage.item}`);
console.log(
  seeded.routed.length === 0
    ? "  routed     nothing — the daemon reports no destination that can be described"
    : `  routed     ${seeded.routed.map((each) => `${each.item} to ${each.destination}`).join(", ")}`,
);
