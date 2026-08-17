import { spawn } from "node:child_process";

type Step = {
  readonly label: string;
  readonly args: readonly string[];
};

/** `pnpm dev -- --config x` keeps the separator; the daemon parses flags only. */
const daemonArgs = process.argv.slice(2).filter((arg) => arg !== "--");

const steps: readonly Step[] = [
  {
    label: "building the app",
    args: ["--filter", "@notemap/ui", "build"],
  },
  {
    label: "starting the daemon",
    args: ["--filter", "@notemap/daemon", "start", ...daemonArgs],
  },
];

/**
 * Ctrl-C reaches the daemon through the terminal's process group, so this
 * process only has to stay alive long enough to report how the daemon ended.
 */
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {});
}

const run = ({ args }: Step): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn("pnpm", [...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });

for (const step of steps) {
  console.log(`notemap: ${step.label}`);

  const code = await run(step);
  if (code !== 0) process.exit(code);
}
