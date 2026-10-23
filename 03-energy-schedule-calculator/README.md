# Energy Schedule Calculator

A black-box Node.js/TypeScript challenge harness. Implement your participant in any language; no participant scheduler or solution is supplied. Node.js 22+ and npm are required.

Run from this directory:

    npm install
    npm run test:harness
    npm run typecheck
    npm test -- --command "node participant/main.js"
    npm test -- --command "python participant.py" --seed demo --cases 12 --timeout 2000
    npm test -- --command "node participant/main.js" --seed demo --case 3 --verbose
    npm test -- --seed demo --case 3 --export-case scenario.json

--case selects one zero-based case index and is mutually exclusive with --cases. --cases accepts 1–10000; duplicate valued options are errors. Otherwise --cases runs indices 0 through N-1 (default 12). --seed is an arbitrary string (default energy). --timeout is an integer from 1 to 2147483647 in milliseconds per participant invocation (default 2000), including startup, reading input, computing, flushing output, and exiting; benchmark calculation is outside that deadline. --verbose adds the input and full hourly simulation. --export-case writes one complete JSONL request for replay; it can be used without --command. Only execute trusted commands: --command is interpreted by the platform shell, relative to the current directory.

## Protocol

For each case the harness starts a fresh process, writes one compact JSON object followed by LF to stdin, and closes stdin. Read a complete line and emit one compact JSON object followed by LF to stdout. The participant must exit successfully (status 0) within the deadline. The harness validates the complete stdout stream after exit, so extra output and nonzero exits fail consistently regardless of pipe chunking. LF and CRLF are accepted; trailing JSON whitespace after the response line is allowed. Missing LF, blank first lines, UTF-8 BOM, malformed UTF-8, and non-JSON stdout are rejected. Do not write logs or additional responses to stdout; use stderr. The complete stdout stream is limited to 1 MiB (1048576 bytes); the last 16384 bytes of stderr are retained for transport failures. State is not shared across cases. On timeout or protocol failure, the harness requests process-tree termination with taskkill on Windows or kills the process group on POSIX. Commands must not launch detached background processes. Precompile compiled-language programs before running the assessment; compilation is outside the harness. Use the same seed, case count, hardware, and a runtime-appropriate timeout for all candidates. The default timeout is a local development setting, not a cross-language performance criterion.

The exported scenario is a full example of the input schema. Each request contains:

- requestId: string, to echo exactly.
- battery: capacityKWh, initialChargeKWh, minChargeKWh, maxChargeKWh, maxChargeRateKW, maxDischargeRateKW, chargeEfficiency, dischargeEfficiency.
- grid: maxImportKW and maxExportKW.
- hours: exactly 24 objects in ascending order, each containing hour (0–23), solarGenerationKWh, consumptionKWh, purchasePrice, feedInPrice.

All input numbers are finite. Solar generation, consumption, rates, and grid limits are nonnegative. JSON numbers use decimal point syntax and are evaluated using IEEE 754 double precision; emit enough precision for the physical tolerance. Do not round actions to a fixed number of decimal places unless the resulting schedule remains feasible. Energy and capacity are kWh; rates are kW. Each interval lasts one hour, so a rate limit has the same numerical value as the interval's energy limit. Prices are EUR/kWh and can be negative. Efficiencies are in (0,1]. Charge bounds lie within battery capacity, and initial charge lies within those bounds.

Return an object with the matching requestId and a schedule array of exactly 24 objects in ascending hour order. Each action contains hour, batteryAction ("CHARGE", "DISCHARGE", or "IDLE"), and batteryEnergyKWh (a finite, nonnegative number). IDLE requires exactly zero. Unknown extra fields are ignored. Zero-energy CHARGE and DISCHARGE are accepted. A single action per hour prevents simultaneous charge and discharge. Grid energy is the signed hourly net flow, so simultaneous import and export is not a separate permitted decision. Charging from the grid and exporting battery energy are allowed. There is no terminal value credit for energy left in the battery beyond the final-charge constraint.

batteryEnergyKWh is measured at the battery's external AC boundary. For CHARGE it is the energy delivered before charging losses. For DISCHARGE it is the energy delivered after discharging losses.

## Physics and validation

Starting at initialChargeKWh, simulate each interval in order:

    CHARGE:    SoC += batteryEnergyKWh * chargeEfficiency
    DISCHARGE: SoC -= batteryEnergyKWh / dischargeEfficiency
    IDLE:      SoC stays unchanged

    gridEnergy = consumptionKWh - solarGenerationKWh + chargeAC - dischargeAC
    hourlyCost = max(gridEnergy, 0) * purchasePrice
               - max(-gridEnergy, 0) * feedInPrice

Check charge/discharge rate limits, min/max SoC after every hour, import/export limits, and final SoC >= initialChargeKWh. There is no load shedding or PV curtailment. All limits use absolute tolerance 1e-7 kWh (or numerically equivalent kW). Tolerance applies only to physical inequalities; energy nonnegativity, exact IDLE zero, hour indices, and JSON structure are strict. Values are never rounded or clamped in the simulation. Costs use full floating point precision.

Malformed schedules have no simulated cost or trajectory. Structurally valid but physically invalid schedules show their full simulated trajectory and violations, but earn zero points.

## Baseline, benchmark, and score

The baseline takes IDLE every hour. Generation explicitly checks its feasibility, including terminal charge. Grid limits are derived from idle net demand, with positive margins or exact binding limits in boundary cases. Thus every emitted case has a constructive feasible schedule.

The internal benchmark is deterministic and approximates the continuous optimum. It uses only feasible schedules, is never worse than idle, and has no claimed continuous-optimality error bound. Candidates may beat it. Organizer-only benchmark details are in ASSESSOR.md; no particular optimization method or discretization is required of participants.

For valid schedules, let B be baseline cost, O benchmark cost, and C participant cost:

    improvementEUR = B - C
    if B - O > 1e-6 EUR:
        score = clamp(100 * (B - C) / (B - O), 0, 100)
    otherwise:
        score = 100 if C <= B + 1e-6 EUR, else 0

Invalid responses earn zero. The mean score weights every case equally, including invalid cases. Negative costs use the same formula. Beating the benchmark earns 100. When no meaningful benchmark improvement exists, matching the feasible baseline earns 100.

Each case prints a JSON report with validity, costs, improvement, score, violations, and all hourly SoC values (after each hour). Verbose reports include net grid energy and hourly costs. A final JSON summary reports mean score and invalid count. Exit status is 0 for all valid responses, 1 for any invalid response/transport failure, and 2 for CLI/setup errors. Valid schedules can score zero without failing the process.

## Generation and examples

The seeded generator cycles sunny, cloudy, winter, high-PV/negative-purchase-price, negative-feed-in-price, and low-PV profiles. It varies demand, morning/evening peaks, evening electricity price spikes, capacities (5–20 kWh), rates, efficiencies (0.85–1), and initial charge, including nearly empty and nearly full batteries. Seed plus case index fully determines each scenario for this harness version. The 12-case default also exercises exactly minimum/maximum initial charge, zero minimum charge, maximum charge below capacity, binding import/export limits, and unit efficiencies. Reproducibility requires retaining the generator version and package lockfile.

Automated hand calculations include:

- Starting at 2 kWh with efficiencies 0.8/0.5, charging 2.5 kWh AC reaches 4 kWh; discharging 1 kWh AC returns to 2 kWh. At purchase 0.20 and feed-in 0.10, the combined cost is 0.50 - 0.10 = 0.40 EUR.
- Exporting 2 kWh at 0.08 earns 0.16 EUR. Importing 2 kWh at -0.10 earns 0.20 EUR. Exporting 1 kWh at -0.05 costs 0.05 EUR. Combined cost: -0.31 EUR.
- Internal tests independently check a small hand-calculated optimization benchmark; benchmark internals are reserved for organizers.
- B=10, O=6, C=8 gives 50 points. C=12 gives 0, C=5 gives 100. B=-2, O=-4, C=-3 also gives 50.

