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

## Phase 5.3 — Belief-Driven Negotiation Initiation

Phase 5.3 migrates the **opening of economic diplomatic negotiations** from hidden foreign truth to the proposer's subjective intelligence.

The scope is intentionally narrower than full treaty evaluation. It changes how a government decides **which foreign country appears able to supply a needed resource or extend financing**, and how the opening package is sized. Recipient cabinet acceptance remains a later migration so initiation and acceptance can be regression-gated separately.

### Trade-access talks use perceived export capacity

A proposer still knows its own resource stock and needs exactly.

When searching for a foreign trade partner, however, it no longer compares its shortage against the candidate's live resource stock or domestic needs. It uses the observer-specific exportable-supply estimates introduced in Phase 5.2.

For each resource, the proposer considers:

- its own authoritative weeks of supply
- perceived foreign exportable surplus
- effective intelligence confidence and age
- its own risk tolerance

Weak or stale supplier intelligence is hedged downward toward the estimate's low bound. Missing foreign intelligence removes that economic opportunity instead of revealing hidden stock.

The resulting treaty draft can therefore target the wrong supplier or the wrong resource. That is an intentional consequence of imperfect belief.

### Financing talks use perceived creditor capacity

A cash-constrained government knows its own treasury and population exactly.

Before approaching a potential lender, it now estimates the foreign country's:

- treasury
- population
- treasury per capita
- treasury apparently available above a conservative reserve

Treasury is hedged downward and population upward when intelligence is weak or stale, so cautious borrowers do not treat an uncertain foreign balance sheet as guaranteed lending capacity. Risk-tolerant governments act closer to the central estimate.

Loan principal in an opening proposal is sized from that perceived capacity rather than the prospective creditor's authoritative treasury.

### Truth still validates execution

Belief determines whether talks open and what economic package is proposed.

The treaty system remains authoritative. Proposal formation still validates structure, timing, treaty conflicts and any funding obligation that belongs to the proposing government itself, but it does **not** inspect a foreign creditor's hidden treasury. If the foreign country's real treasury or other execution conditions cannot support the proposed agreement by signature time, full registration validation rejects the treaty. Belief never transfers money or goods directly.

### Decision provenance

Autonomous opening-history entries now narrate the economic intelligence basis for trade-access and financing talks, including confidence and observation age.

### Scope boundary

Phase 5.3 does **not** yet migrate every cabinet evaluation to subjective belief.

Still deferred:

- a recipient creditor's evaluation of a debtor's repayment risk
- broader treaty acceptance/counteroffer valuation where foreign hidden state is consulted
- active spies and reconnaissance
- deception
- secret-agreement visibility
- map fog and incomplete world-history visibility

Those should move in separate checkpoints so a failed causal assumption can be isolated.

### Phase 5.3 verification contract

Regression coverage requires:

- changing a candidate supplier's hidden stock while holding the proposer's economic belief fixed cannot change the perceived trade opportunity
- changing a prospective creditor's hidden treasury/population while holding the borrower's fiscal belief fixed cannot change perceived lending capacity
- missing foreign intelligence blocks economic negotiation opportunity instead of falling back to truth
- autonomous trade-access proposals are tied to perceived rather than authoritative resource complementarity

The 100-seed × 500-year stress population additionally requires belief-driven economic negotiation initiation to remain observable across the population.

The architectural boundary remains: **belief decides whom to approach and what to propose; authoritative treaty machinery decides what can actually be executed.**

## Phase 5.4 — Belief-Driven Loan Evaluation

Phase 5.4 migrates the creditor side of financing negotiations from hidden debtor fiscal truth to the creditor's subjective intelligence.

### Creditor cabinets no longer inspect debtor truth

A creditor still knows its own treasury, population, liquidity reserve, government and political constraints exactly.

When deciding whether a foreign loan is attractive, however, the creditor no longer reads the debtor's authoritative treasury or population. It consumes the creditor's stored estimates of those two foreign metrics and derives a perceived fiscal-stress signal from them.

Missing debtor intelligence does not reveal hidden truth. The cabinet instead applies maximum repayment-risk stress.

### Uncertainty and risk tolerance

Weak or stale fiscal intelligence is treated pessimistically.

A cautious creditor hedges:

- debtor treasury downward toward its low bound
- debtor population downward toward its low bound when measuring debt burden per capita

This makes the same uncertain debt position look riskier. A risk-tolerant creditor stays closer to the central estimate.

The creditor's own liquidity cost remains authoritative because governments know their own balance sheet.

### Execution remains authoritative

Subjective belief changes cabinet approval, counteroffer and rejection decisions. It does not transfer funds.

At signature, the treaty registry still validates the creditor's real funding capacity and escrows the real principal. A mistaken optimistic belief about the debtor can therefore produce a bad lending decision, but it cannot create treasury or bypass execution constraints.

### Decision provenance

Financing-response history now records the creditor's perceived debtor treasury, perceived population, fiscal-stress estimate, effective intelligence confidence and observation age. If intelligence is absent, history records that the cabinet used maximum repayment-risk stress.

### Phase 5.4 verification contract

Regression coverage requires:

- changing hidden debtor treasury/population while holding creditor belief fixed cannot change the creditor's repayment assessment or cabinet evaluation
- missing debtor intelligence cannot fall back to authoritative debtor finances
- cautious creditors hedge stale low-confidence debtor intelligence more pessimistically than risk-tolerant creditors

The 100-seed × 500-year stress population additionally requires:

- creditor-side financing evaluations from subjective intelligence remain observable
- creditor loan-intelligence provenance continues to reach world history
- all prior war, trade and negotiation belief gates remain satisfied

The architectural boundary remains: **belief governs whether the creditor wants the loan; authoritative treaty machinery governs whether the loan can actually be funded and executed.**

## Phase 5.5 — Active Reconnaissance

Phase 5.5 turns intelligence collection from a purely rotating background process into a limited, actively tasked government capability.

The scope is deliberately narrow. Governments do not gain omniscient access, spy missions do not mutate foreign truth, and the total quarterly collection budget does not increase. One of the two existing foreign-profile refresh slots is retasked as active reconnaissance; the other remains a routine collection slot.

### Recon targets are chosen from belief, not hidden truth

Each observer chooses a reconnaissance target from information already available to that government:

- intelligence age
- effective intelligence confidence
- bilateral tension
- direct border access
- direct transport-route access

The target-selection score does not read the candidate country's live military, readiness, treasury, population, stability, resources or needs.

This means changing a country's hidden state while holding the observer's stored beliefs and observable relationship/geography fixed cannot change which country is selected for reconnaissance.

### Reconnaissance improves collection quality

Once a target has been selected, the collection layer is allowed to observe authoritative truth through the same noisy measurement process used by ordinary intelligence collection.

Active reconnaissance adds a bounded confidence bonus derived from the observer's own:

- Foreign Ministry competence
- diplomatic-policy investment

The bonus narrows uncertainty but never produces perfect knowledge. Routine collection remains capped at the existing 92% confidence ceiling; active reconnaissance may reach at most 98%.

Recon observations use the existing intelligence-specific deterministic RNG stream. Retasking collection therefore does not consume or perturb the simulation's normal weekly RNG.

### Collection budget and staleness remain real

Phase 5.5 does not add a third quarterly refresh.

For each observer, every quarter:

- one foreign profile is actively reconnoitered
- one different foreign profile receives the normal routine refresh
- all remaining foreign profiles continue aging

This preserves incomplete and stale intelligence as a first-class simulation condition. Active collection creates an opportunity cost: prioritizing one target necessarily leaves other countries less observed.

### Serialized state and provenance

The current reconnaissance assignment is stored per observer with:

- target country
- assignment week
- belief-derived priority score

Profiles also retain whether their latest collection was baseline, routine or reconnaissance.

Quarterly world history records the active retasking map so browser runs can verify that autonomous reconnaissance is actually occurring.

In Intelligence Mode, the selected government's foreign-intelligence inspector identifies its current recon target, the belief-derived priority score, the assignment week and whether each profile's latest collection was baseline, routine or reconnaissance.

Older serialized worlds without reconnaissance metadata repair the missing collection state without rewriting existing beliefs or authoritative world truth.

### Phase 5.5 verification contract

Regression coverage requires:

- active reconnaissance replaces one routine slot rather than increasing the two-profile quarterly refresh budget
- a recon target receives a higher-confidence observation than the same profile's routine/baseline observation under otherwise unchanged conditions
- changing hidden foreign truth while holding the observer's beliefs fixed cannot change recon target selection
- legacy intelligence state can add reconnaissance metadata without rewriting stored estimates

The 100-seed × 500-year stress population additionally requires:

- every observer retains a valid foreign reconnaissance assignment
- the current assignment corresponds to a profile actually refreshed by reconnaissance
- reconnaissance retasking continues to reach world history
- stale foreign profiles still exist
- all earlier belief-driven war, trade and diplomacy gates remain satisfied

Active reconnaissance also exposed one cross-phase calibration interaction: sharper military estimates made the older Phase 5.1 non-aggression feasibility bonus too influential in treaty-breaking decisions. The pact-breach path now requires political breach pressure of at least 64 before intelligence may help cross the existing 68-point eligibility threshold, so military feasibility can supply at most the final four threshold points. Reconnaissance quality is unchanged; treaty-breaking remains fundamentally political rather than being manufactured by better information.

The architectural boundary remains: **belief chooses where to look; collection may then learn imperfectly from truth; only authoritative world mechanics can change reality.**

## Phase 5.6 — Military Deception

Phase 5.6 lets governments deliberately distort foreign military observation without changing authoritative military truth.

The scope is intentionally narrow. Deception affects only observed military strength and readiness. Population, treasury, stability and exportable-supply intelligence remain unchanged.

### Deception posture is a subject-country decision

Each country carries a serialized military-deception posture:

- none
- conceal
- exaggerate

The posture is chosen from information the country legitimately knows about itself:

- expansionism and risk policy
- leader ambition and nationalism
- Defense Ministry competence
- defense and internal-security agenda
- the country's own bilateral tension values
- its own stability

The posture chooser does not inspect foreign countries' hidden military, readiness, treasury, population, resources or needs.

Concealment is associated with revisionist/risk-tolerant governments trying to hide capability. Exaggeration is associated with high external tension and deterrence pressure. Deception strength is bounded by the state's own defense and security capacity.

### Deception changes the apparent signal, not truth

When another country observes a deceptive subject, the intelligence layer starts from authoritative truth but applies the subject's deception bias before normal deterministic measurement noise.

This means an observer may be confidently wrong.

- concealment shifts apparent military strength/readiness downward
- exaggeration shifts them upward
- the underlying military and readiness values are never mutated
- confidence does not automatically reveal that the observation was manipulated

The existing intelligence-only deterministic RNG still supplies ordinary collection noise. Deception therefore changes the information signal without consuming the simulation's weekly RNG stream.

### Reconnaissance counters but does not defeat deception

Active reconnaissance from Phase 5.5 reduces the residual deception bias more than routine or baseline collection.

Recon effectiveness depends partly on the observer's Foreign Ministry competence. Even strong reconnaissance does not force the deception bias to zero, so active collection is an advantage rather than an omniscience switch.

The observer receives only the resulting estimate. Foreign-intelligence profiles do not expose a "deception detected" flag or the foreign country's true deception posture.

### Observer UI

A selected country may see its own current military-deception posture because governments know the deception programs they themselves are running.

Foreign country cards and foreign-intelligence estimates do not reveal whether a subject is concealing or exaggerating. Observer-limited world history, secret treaty visibility and map fog remain later Phase 5 work.

### Serialized migration

Older worlds without military-deception state repair one current posture per country without rewriting stored foreign estimates or authoritative country truth.

### Phase 5.6 verification contract

Regression coverage requires:

- changing foreign hidden state cannot change another country's deception posture
- under the same truth, observer, week and deterministic RNG, concealment lowers military/readiness estimates and exaggeration raises them
- deception leaves population, treasury, stability and exportable-supply estimates unchanged
- active reconnaissance attenuates deception more than routine collection but does not reduce the bias to zero
- collecting deceptive intelligence cannot mutate authoritative military/readiness truth
- legacy intelligence state can add deception postures without rewriting stored beliefs

The 100-seed × 500-year stress population additionally requires:

- serialized deception posture coverage for every country
- both concealment and exaggeration remain reachable
- current quarterly collection actually encounters deceptive states
- active reconnaissance sometimes collects against a deceptive state
- all earlier intelligence, war, trade, negotiation and treaty-rarity gates remain satisfied

The architectural boundary remains: **a country may manipulate what others observe, but it cannot manipulate authoritative reality.**

