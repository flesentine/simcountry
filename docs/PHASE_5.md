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


## Phase 5.1 — Belief-Driven War Assessment

Phase 5.1 gives subjective intelligence its first causal role. The migration is deliberately limited to **war initiation** so the effect of imperfect belief can be measured without simultaneously changing trade and diplomacy.

### Defender strength is no longer omniscient at authorization

A government still knows its own authoritative military strength, readiness, stability and domestic political state.

When evaluating a foreign defender, however, autonomous war policy now consumes the attacker's stored intelligence estimates for:

- defender military strength
- defender readiness
- effective intelligence confidence
- observation age

The defender's true military/readiness values are not read by the war-appetite calculation. If the attacker has no intelligence profile for that defender, war appetite is zero rather than falling back to hidden truth.

For an active non-aggression pact, the existing ideological/reputation breach pressure remains authoritative, but the same subjective military assessment can add a small, bounded feasibility bonus when the attacker believes it has a strong advantage. This reconnects deliberate pact-breaking to perceived military opportunity without lowering the global breach threshold or consulting hidden defender truth.

Battle resolution remains authoritative after war begins. Intelligence affects the decision to attack, not the physical combat equations.

### Uncertainty and risk tolerance

A point estimate with weak or stale confidence is not treated as precise.

Effective confidence declines with intelligence age under the Phase 5.0 decay model. The war assessor converts remaining uncertainty into a hedge toward the estimate's upper bound. More cautious governments hedge farther upward; risk-tolerant governments act closer to the central estimate.

This creates an explicit difference between:

- believing an opponent is weak with high confidence
- having a weak central estimate but a wide, stale uncertainty interval
- choosing to accept that uncertainty because the government is risk tolerant

The model does not intentionally bias risky governments below their central estimate. Risk tolerance means accepting uncertainty, not magically becoming optimistic.

### Decision provenance

Every newly authorized autonomous war records the attacker's belief basis at authorization:

- perceived defender military strength
- perceived defender readiness
- effective intelligence confidence
- intelligence age
- source observation week

The world-history event also narrates that belief snapshot.

This lets later historian work distinguish **what was believed when the decision was made** from the authoritative battlefield truth that actually followed.

### Scope boundary

Phase 5.1 changes only the pre-war target/appetite decision.

Still authoritative/omniscient for now:

- battlefield attrition and logistics after war starts
- trade partner selection
- treaty negotiation and cabinet evaluation
- lawful treaty withdrawal and treaty-obligation enforcement
- world-history visibility and map fog

The narrow exception is deliberate non-aggression breach feasibility: 5.1 lets the attacker's subjective military assessment contribute the bounded feasibility bonus described above.

Those domains will migrate separately so each belief-driven change can be regression-gated.

### Phase 5.1 verification contract

Regression coverage requires:

- changing hidden defender military/readiness while holding the stored belief fixed does not change war assessment
- missing intelligence blocks war appetite instead of revealing truth
- underestimating the defender increases war appetite relative to an overestimate with truth held fixed
- cautious governments hedge low-confidence intelligence farther toward the upper bound than risk-tolerant governments

The 100-seed × 500-year stress population additionally requires:

- autonomous wars are actually authorized from subjective intelligence
- every newly authorized autonomous war carries finite, bounded intelligence provenance
- at least one war begins after materially underestimating defender effective power
- at least one war begins after materially overestimating defender effective power

The architectural boundary remains: **belief may cause an action proposal, but the deterministic world engine owns the physical consequences.**

## Phase 5.2 — Belief-Driven Trade Selection

Phase 5.2 migrates autonomous supplier selection to the buyer's subjective economic picture while keeping physical settlement authoritative.

### Economic intelligence

Each foreign profile now carries an imperfect estimate of currently exportable supply for:

- food
- energy
- metals
- goods

"Exportable" means the amount that would remain above the seller's authoritative reserve policy at the time of observation. The observer does not receive the seller's exact inventory, needs, commerce policy or cabinet trade posture. It receives a noisy, confidence-bounded estimate of the economically relevant result.

Economic collection uses the same deterministic intelligence-only RNG as the Phase 5.0 kernel, with additional signal from Trade Ministry competence and commercial-policy investment. These observations refresh on the same partial quarterly cadence and can become stale.

### Supplier choice is no longer omniscient

A buyer still knows its own shortage, treasury and domestic policy exactly.

When selecting a foreign supplier, however, the buyer no longer reads the candidate seller's live resource stock, needs or reserve preference. It scores reachable candidates from:

- perceived exportable supply
- effective intelligence confidence and age
- bilateral relationship state
- observable route capacity and distance
- active treaty quota, tariff and preference terms

Missing supplier intelligence removes that candidate rather than falling back to hidden inventory.

### Uncertainty and risk tolerance

Weak or stale supplier intelligence is hedged downward toward the observed low bound.

Cautious governments therefore plan against a smaller perceived exportable surplus, while risk-tolerant governments act closer to the central estimate. Risk tolerance does not invent extra goods; it changes how much uncertainty the buyer is willing to accept before proposing the trade.

### Truth still settles the trade

Belief chooses **who to ask**. The authoritative engine still decides **what can actually move**.

After a supplier is selected, settlement rechecks the seller's true:

- resource inventory
- domestic reserve requirement
- route capacity
- treaty quota
- buyer affordability

If the believed surplus was wrong, the transaction can shrink or fail. Intelligence can therefore cause a bad commercial decision, but it can never create stock, bypass a blockade, exceed treaty capacity or mint treasury.

Quarterly trade-history entries include the buyer's perceived exportable supply, confidence and intelligence age so later historian work can distinguish the decision-time belief from the actual settlement.

### Observer UI

The foreign-intelligence inspector now exposes estimated exportable food, energy, metals and goods supply for each observed country alongside military, readiness and treasury intelligence.

### Phase 5.2 verification contract

Regression coverage requires:

- changing hidden seller inventory while holding stored economic belief fixed does not change supplier choice
- missing supplier intelligence cannot be replaced by an omniscient stock lookup
- cautious buyers hedge stale low-confidence economic intelligence farther toward the low bound than risk-tolerant buyers
- older Phase 5.0/5.1 serialized profiles repair missing economic signals without rewriting earlier beliefs or authoritative truth

The 100-seed × 500-year stress population additionally requires:

- exportable-supply intelligence remains materially imperfect
- economic estimates remain finite, bounded and non-negative
- belief-driven supplier selection still produces real completed trade

The architectural boundary remains: **belief proposes the commercial counterparty; authoritative state validates and settles the transfer.**

