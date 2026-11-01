import type { SweepPolicy } from "../domain/asset";
import type { PayloadTypeDescriptor } from "../domain/payload";
import type { PoolSettingDescriptor } from "../domain/pool-setting";
import type { Duration } from "../domain/ids";
import type { RetryPolicy } from "../domain/work";

export type PoolConfig = {
  readonly payloadTypes: readonly PayloadTypeDescriptor[];
  /** The pool settings this code knows, on `payloadTypes`' pattern: core exports the list, a host hands it back. */
  readonly poolSettings: readonly PoolSettingDescriptor[];
  readonly retry: RetryPolicy;
  readonly sweep: SweepPolicy;
  /**
   * An IANA zone name, for reading the date of a capture that carries no offset
   * of its own. The host's, never core's to invent, and never a silent UTC: a
   * capture from a source is filed on the day the person running the pool is
   * living in.
   */
  readonly zone: string;
  /**
   * How long a template fired by its trigger tag waits before its delivery is
   * claimable. Nothing is attempted inline on that path, so this window is the
   * whole of what a cancel has to act in.
   */
  readonly triggerWindow: Duration;
  /**
   * How long a decision made by a person waits before its delivery is
   * claimable: a route by hand, or a template taken from a composer. Short,
   * because somebody is looking; zero makes it due at once, still as a job.
   */
  readonly undoWindow: Duration;
};
