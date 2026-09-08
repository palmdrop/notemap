# @notemap/relay

A **relay** is a program outside notemap that reads someone else's system and
feeds the pool over `/v1`. This is the half every relay shares: derive an asset
id, upload what the pool has not got, capture, and turn a `409` into the edit
that change earned.

It holds no state. The recovery strategy for a failed poll is to poll again,
and the pool's own dedup is what makes re-reading everything harmless.

```ts
const relay = createRelay({
  pool: { url: "http://localhost:4747", token },
  source: "memos",
  namespace: MEMOS_NAMESPACE,
});

for (const memo of await readEverything()) {
  await relay.relay({
    sourceItemId: memo.uid,
    version: memo.updateTime,
    capturedAt: memo.createTime,
    text: memo.content,
    tags: memo.tags,
    attachments: memo.resources.map(asAttachment),
  });
}
```

Reading upstream, the loop and the timer are the caller's.
