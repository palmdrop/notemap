import { NotOffered } from "../destinations/candidates";
import { Rejected } from "../destinations/probe";
import { Unusable } from "../destinations/usability";
import { ok, refused } from "#utils/result";
import type { PoolPorts } from "#types/api/ports";
import type { PreviewRefusal } from "#types/api/refusal";
import type { ItemId } from "#types/domain/ids";
import type { DeliveryRequest, PreviewReport } from "#types/domain/routing";
import type { Result } from "#types/result";
import { prepare } from "./prepare";

/**
 * What this destination would write, asked before anything is committed.
 *
 * **Indicative, never binding**: the delivery converts again when it runs, and
 * nothing here is kept. So this reserves nothing — no routing record, no job,
 * no lease, nothing appended to the log — and the pool is exactly as it was
 * whether or not it was asked.
 *
 * It is refused for the reasons a route is refused, because a preview that
 * answered where a route would refuse would be describing a decision nobody can
 * make. `unreachable` and `not-offered` are reported rather than refused: both
 * are ordinary, and neither stops the decision being made — only the seeing of
 * it.
 */
export async function preview(
  ports: PoolPorts,
  item: ItemId,
  request: DeliveryRequest,
  signal?: AbortSignal,
): Promise<Result<PreviewReport, PreviewRefusal>> {
  const prepared = await prepare(ports, item, request, signal);
  if (prepared.kind === "refused") {
    return prepared.refusal.kind === "unreachable"
      ? ok({ kind: "unreachable", detail: prepared.refusal.detail })
      : refused(prepared.refusal);
  }

  const { destination, delivery } = prepared.value;

  try {
    const output = await ports.destinations.preview(
      destination,
      delivery,
      signal,
    );
    return ok({ kind: "previewed", ...output });
  } catch (cause) {
    if (cause instanceof NotOffered) return ok({ kind: "not-offered" });
    if (cause instanceof Rejected) {
      return ok({ kind: "rejected", detail: cause.message });
    }
    if (cause instanceof Unusable) {
      return refused({
        kind: "destination-unusable",
        destination: destination.id,
        detail: cause.message,
      });
    }
    return ok({
      kind: "unreachable",
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
