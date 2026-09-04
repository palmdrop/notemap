/**
 * A pull-driven bridge from what core streams to what a `Response` takes. Pull
 * rather than push, so a slow reader is what paces the read, and a cancelled
 * response closes the source rather than leaving it open.
 */
export function webStream(
  bytes: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const chunks = bytes[Symbol.asyncIterator]();

  return new ReadableStream({
    pull: async (controller) => {
      const { done, value } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: async (reason) => {
      await chunks.return?.(reason);
    },
  });
}
