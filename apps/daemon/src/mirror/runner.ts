import {
  asWorkOutcome,
  type JobKind,
  type Lease,
  type MirrorWriter,
  type Pool,
  type WorkOutcome,
} from "@notemap/core";

import {
  startRunner,
  wrongSubject,
  type Runner,
  type RunnerConfig,
} from "../work/runner";

const KINDS: readonly JobKind[] = ["mirror", "mirror-remove"];

export type MirrorRunnerConfig = RunnerConfig;
export type MirrorRunner = Runner;

export function startMirrorRunner(
  pool: Pool,
  writer: MirrorWriter,
  config: MirrorRunnerConfig,
  onError?: (cause: unknown) => void,
): MirrorRunner {
  async function perform(lease: Lease): Promise<WorkOutcome> {
    const subject = lease.job.subject;
    if (subject.kind === "routing-record") return wrongSubject(lease);

    try {
      if (lease.job.kind === "mirror-remove") {
        await writer.remove(subject);
        return { kind: "succeeded" };
      }

      // Gone means nothing left to mirror; removing its files is the other job's.
      const record = await pool.mirror.recordFor(subject);
      if (record !== undefined) await writer.write(record);
      return { kind: "succeeded" };
    } catch (cause) {
      return asWorkOutcome(cause);
    }
  }

  return startRunner(pool, KINDS, perform, config, onError);
}
