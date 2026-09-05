# Phase 5 — Intelligence and Belief

Phase 5 separates what the simulation knows from what each country believes.

The authoritative `WorldState` remains the only source of truth. Intelligence is a serialized observer-specific model derived from that truth through explicit collection rules. Beliefs may be incomplete, stale or wrong, and later policy code may consume them, but belief state never directly mutates authoritative reality.

## Phase 5.0 — Subjective belief-state kernel

### Foreign intelligence profiles

Each country stores a foreign intelligence profile for every other country. There is deliberately no self-profile: governments already have direct access to their own authoritative state.

The first estimate vocabulary is intentionally small:

- population
- treasury
- military strength
- military readiness
- stability

Each estimate records:

- estimated value
- lower and upper interval
- confidence
- observation week

This gives later decision code enough information to reason about uncertainty without pretending a single estimated number is exact.

### Deterministic but separate observation noise

Foreign observations are noisy, but their noise uses an intelligence-specific deterministic RNG seed derived from:

- world seed
- observer
- subject
- metric
- observation week

The intelligence layer therefore remains reproducible without consuming the simulation's normal weekly RNG stream. Adding or refreshing beliefs cannot silently alter unrelated trade, government, war or diplomatic outcomes.

### Collection quality

Observation confidence currently depends on information channels that already exist in the simulation:

- Foreign Ministry competence
- diplomatic-policy investment
- direct land border
- direct transport route
- recent bilateral trade volume
- metric-specific observability

Population is easier to estimate than hidden fiscal reserves or military readiness. Direct neighbors and active commercial partners are generally observed with higher confidence.

Phase 5.0 does not yet model explicit spy missions, reconnaissance assets or deception. Those will later modify collection opportunities and observation error rather than bypassing the belief layer.

### Staleness

All foreign profiles receive an initial estimate.

Afterward, intelligence collection runs quarterly. Each observer refreshes only two of its seven foreign profiles per quarterly cycle. This deliberately prevents the belief model from becoming an always-current mirror of world truth and guarantees that some observations age between collection opportunities.

Displayed effective confidence declines as an observation becomes stale even though the historical observation itself is retained unchanged.

### Informational-only boundary

Phase 5.0 establishes the belief representation before making it causally authoritative.

Current war, trade and diplomacy policy continues to read existing world state exactly as it did before Phase 5. The regression suite explicitly corrupts belief state and verifies that authoritative simulation history remains unchanged.

Later Phase 5 checkpoints will migrate selected decisions to observer belief one domain at a time. That migration must be explicit and regression-gated.

### Observer UI

The browser now supports:

- **God Mode** — existing omniscient inspection
- **Intelligence Mode** — the selected country becomes the observer

In Intelligence Mode, foreign country cards replace exact population, treasury, military and stability values with that observer's current estimates and show intelligence confidence/age.

The selected country's own state remains exact because a government is not required to estimate its own authoritative treasury, population or armed forces.

A foreign-intelligence inspector shows estimated military strength, readiness, treasury ranges, confidence and observation age for every other country.

This is the first observer-perspective surface. Map fog, hidden treaties and incomplete war knowledge remain later Phase 5 work.

### Phase 5.0 verification contract

Regression coverage requires:

- same seed produces identical initial beliefs
- every observer has exactly one profile for each foreign country and never itself
- estimates are finite and their intervals contain the estimate
- foreign estimates are genuinely imperfect rather than copies of truth
- quarterly collection refreshes only part of the foreign picture
- stale observations lose effective confidence
- corrupting belief state cannot alter authoritative simulation history
- serialized worlds missing intelligence can rebuild the derived initial belief structure without rewriting world truth

The 100-seed × 500-year stress gate additionally checks:

- complete observer/subject coverage
- valid foreign country references
- finite bounded estimates and confidence
- no future-dated observations
- stale intelligence exists in long-running worlds
- military intelligence remains materially imperfect across the population

The architectural rule remains unchanged: **truth is authoritative; belief is subjective; decisions may later use belief, but belief can never directly overwrite truth.**
