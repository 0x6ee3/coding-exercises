# Reproducible scenarios

`property-retention.jsonl` is a manual source transcript after READY and a subscriber SUBSCRIBE ACK. It accepts demo-1 and demo-3, discards demo-2 as stale, and discards the second demo-3 as duplicate. Expected final state:

```json
{"type":"STATE","deviceId":"tracker-0","sequence":3,"timestamp":1720000003,"data":{"latitude":52.52,"longitude":13.405,"percentage":80}}
```

The subscriber receives exactly two EVENTs, LOCATION then BATTERY. No STATUS value is present. Barrier reply is `{"type":"BARRIER_ACK","barrierId":"demo-end"}`.

Small automated run: `npm test -- --command "node participant/main.js" --seed 7 --devices 3 --subscribers 2 --events 30 --verbose`.

Bursty run: `npm test -- --command "node participant/main.js" --seed 42 --devices 1000 --events 50000 --rate 0`.

Paced run: `npm test -- --command "node participant/main.js" --seed 42 --devices 100 --events 1000 --rate 200`.

These commands require your implementation. The transcript is documentation, not an executable server.
