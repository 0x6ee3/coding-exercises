# Protocol and evaluation

This is the authoritative participant contract; TASK.md is the construction brief.

Transport is UTF-8 JSONL. Each stdin line is a complete request object. Each stdout line must be a complete response object. LF and CRLF are accepted. Multiple requests share a process. JSON whitespace inside a line is allowed; blank lines, pretty-printed multiline JSON, trailing output and missing final newlines fail. The harness sends one request and waits for its response before sending the next. Flush stdout after each response; do not wait for stdin EOF before responding. After the final response the harness closes stdin, and the program must exit with code zero. Compilation must happen before launch; any language implementing this protocol is permitted. Startup counts toward the first timeout. Responses must arrive in request order. Unknown object properties are ignored; required properties must have their specified types. Logs belong on stderr. The harness supplies valid input and checks its generated data before launch; request ingestion from arbitrary external files is outside its API.

## Request

```json
{"requestId":"dispatch-001","zones":[{"zoneId":"A","latitude":52.52,"longitude":13.4,"targetVehicles":1},{"zoneId":"B","latitude":52.5,"longitude":13.45,"targetVehicles":1}],"vehicles":[{"vehicleId":"V1","zoneId":"A","batteryPercentage":75,"status":"AVAILABLE"},{"vehicleId":"V2","zoneId":"A","batteryPercentage":80,"status":"AVAILABLE"}],"constraints":{"maxRelocations":20,"minBatteryPercentage":30,"maxRelocationDistanceKm":15}}
```

Zone IDs are unique within zones, and vehicle IDs are unique within vehicles. IDs are nonempty, case-sensitive, opaque strings; they may contain Unicode, spaces or names such as `__proto__`. No ID sorting or format assumption is required. Input array order has no priority meaning. Coordinates are finite degrees (latitude −90 to 90, longitude −180 to 180). Targets and maximum relocation counts are nonnegative safe integers (at most 2⁵³−1). Batteries and minimum battery are finite percentages from 0 to 100 and may be fractional. Maximum distance is finite and nonnegative. Status is `AVAILABLE`, `IN_USE` or `MAINTENANCE`. Every vehicle references an existing zone. Zone and vehicle arrays may be empty. Zones may share coordinates. A zero target, zero relocation limit or zero distance cap is valid. The generated suite contains at most 300 zones and 6000 vehicles per request; the response limit is 2 MiB and the configurable default timeout is 2000 ms per response and final exit.

## Response

```json
{"requestId":"dispatch-001","relocations":[{"vehicleId":"V1","fromZone":"A","toZone":"B"}]}
```

The request ID must match exactly. `relocations` must be an array, including when empty. Each item must be an object with string `vehicleId`, `fromZone`, and `toZone`.

Initial inventory counts **all AVAILABLE vehicles**, including those with insufficient battery to move. Other statuses do not count toward supply. Apply relocations in array order:

1. Vehicle and both zones must exist; the vehicle must belong to `fromZone` and must not have appeared in an earlier relocation.
2. Vehicle status must be AVAILABLE and battery must be at least the minimum (inclusive).
3. Source and destination IDs must differ, even for colocated zones.
4. Before the move, source inventory must exceed its target and destination inventory must be below its target.
5. Distance must be at most the configured maximum. The validator permits a numerical tolerance of 1e−9 km at the boundary.
6. Decrement source inventory and increment destination inventory by one. Source must retain at least its target.
7. Total move count must not exceed `maxRelocations`.

One invalid move invalidates the whole plan; there is no partial credit for invalid plans. Errors identify the move index and violated condition. Final shortages are returned per zone in verbose diagnostics.

## Geometry

For latitude φ and longitude λ in radians, use

`h = sin²((φ₂−φ₁)/2) + cos(φ₁)cos(φ₂)sin²((λ₂−λ₁)/2)`

`distanceKm = 2 × 6371 × asin(sqrt(clamp(h, 0, 1)))`.

Use zone centers; road distances are irrelevant.

## Score

Let `S = sum(max(target − initialAvailable, 0))`, `F` be the analogous final shortage, `R = S − F`, `D` total relocation distance, and `L` maximum allowed distance.

Every valid move reduces shortage by exactly one, so `R` is also the number of moves. If `S = 0`, score is 100 (the already balanced objective is achieved). Otherwise:

```text
E = 0                         if R = 0
E = 1                         if R > 0 and L = 0
E = clamp(1 − D/(R×L), 0, 1)  otherwise
score = 100 × (R + 0.5×E)/(S + 0.5)
```

Scores range from 0 to 100 and are computed only after the entire plan passes validation. One extra reduction always beats any possible distance bonus for the same request. At equal reduction, shorter distance scores higher. These priorities apply within each request; the aggregate is a mean of case scores, not a global shortage objective. An empty plan is valid and scores zero whenever shortage exists, even if that shortage is impossible to fill. Cases with no shortage score 100. Scores are absolute, not normalized against the baseline or a theoretical optimizer. Mean case scores weight each case equally, with invalid plans contributing zero. A valid plan need not reach 100 or match the reference score to be correct. Aggregate scores across different seeds need not be comparable. There is no built-in hiring score threshold.

Hand calculations: with `S=2`, full reduction and zero distance scores 100; full reduction at `D=20, L=10` scores 80; one zero-distance move scores 60; empty scores 0. For `S=4`, two moves each of distance 1.1119492664455874 km and `L=10`, final shortage is 2 and score is 54.32005637061601.

## Generated coverage

A seeded 32-bit LCG (`state = 1664525×state + 1013904223 mod 2³²`) drives a repeating cycle of 24 profiles: small, dense urban, sparse rural, surplus-heavy, shortage-heavy, low-battery, unavailable, balanced, one-move-limit, impossible-distance, symmetric-destination, large-fleet, empty-world, no-fleet, zero-limit, colocated, battery-threshold, exact-distance-boundary, dateline, polar, all-low-battery, all-unavailable, zero-target, and shuffled-input cases. Some boundary fixtures intentionally repeat across seeds. The large profile has 300 zones and 6000 vehicles. The impossible profile uses separated centers and a zero-distance cap; the ties profile has equal Haversine distances. Identical seed/case counts produce identical requests and deterministic reference results. No optimization benchmark is required to evaluate a plan.
