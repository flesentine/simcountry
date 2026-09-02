# SimCountry Master Plan

## North star

SimCountry is an observer-first geopolitical laboratory. The player does not need to control a civilization. They can let a world run and inspect why history unfolded the way it did.

The defining architecture rule is separation between **world truth** and **agent belief**:

1. The simulation engine is authoritative.
2. Countries observe imperfect subsets of that state.
3. Government actors form goals and beliefs.
4. Agents submit actions through constrained interfaces.
5. The engine validates and resolves those actions.
6. A historian layer explains only events that actually occurred.

This prevents an LLM or policy agent from inventing resources, armies, treaties, or outcomes.

## Phase 0 — living kernel

Goal: prove that eight countries produce recognizable emergent behavior without scripts.

- deterministic seeded world
- four-resource economy
- production and consumption
- treasury and stability
- bilateral trust/tension
- autonomous trade matching
- military power/readiness
- war declaration based on incentives and perceived advantage
- war attrition and peace
- event ledger
- browser controls and inspection UI

Success criteria: a 100-year run is reproducible, does not collapse numerically, and produces different diplomatic/economic trajectories from small seed changes.

## Phase 1 — geography and logistics

Replace abstract countries with a generated world graph.

- regions/provinces
- land and sea adjacency
- terrain, climate, arable land, deposits
- cities and ports
- transport capacity
- resource extraction sites
- shipping/trade routes
- distance-sensitive trade costs
- military supply lines

The economy must depend on physical movement rather than teleportation.

## Phase 2 — real economy

Turn the four-resource toy economy into production chains and markets.

- labor
- agriculture
- mining
- energy generation
- steel
- machinery
- consumer goods
- construction
- transport
- prices from supply/demand
- wages, taxes, budgets, debt, inflation
- private productive capacity
- sanctions and blockades

## Phase 3 — governments and delegation

Countries stop being single decision-makers.

Each state gains roles such as head of government, treasury/finance, trade, foreign affairs, defense, military command, and intelligence. Roles receive delegated goals and can disagree.

Domestic institutions constrain what can actually be done: legislature, elections, coups, bureaucratic capacity, constitutional rules, corruption, and elite factions.

## Phase 4 — diplomacy as negotiated objects

Diplomacy becomes explicit proposal/counterproposal machinery.

Treaties can include trade quotas, tariffs, transit rights, basing rights, technology licenses, loans, reparations, territorial claims, defense guarantees, sanctions, inspections, and expiration/withdrawal clauses.

Treaty reliability becomes a persistent reputation signal.

## Phase 5 — intelligence and belief

Every country receives a subjective world model.

- estimates rather than omniscient enemy strength
- collection quality
- spies and reconnaissance
- deception
- stale intelligence
- confidence intervals
- secret agreements

Observer UI gets both God Mode and country-perspective Intelligence Mode.

## Phase 6 — internal society

Population becomes politically meaningful.

- social classes and economic sectors
- culture/language/religion where useful
- ideology and political movements
- approval and legitimacy
- regional separatism
- protests, strikes, insurgency, coups, revolutions and civil war
- migration and refugees

Countries can transform, split, merge, federate, collapse, or be replaced by successor states.

## Phase 7 — technology and historical eras

Technology is a capability graph rather than a fixed game tree. Knowledge can be researched, licensed, copied, stolen, imported with experts, and independently rediscovered.

Technologies change production, communication, military capabilities and state capacity. Different worlds should be capable of reaching unusual technological sequences.

## Phase 8 — historian

Build a causal event graph from simulation facts.

The historian can answer questions such as:

- Why did these countries become enemies?
- What caused this war?
- When did this empire begin declining?
- Which treaty changed the balance of power?
- Why did food prices spike?

Narration is generated from the causal graph and event ledger, never from invented history.

## Technical invariants

- Seeded runs must be reproducible.
- Simulation state must serialize cleanly.
- UI cannot mutate authoritative state except through explicit commands.
- Agent output is treated as an untrusted proposal.
- All economic transfers conserve quantities unless a modeled process creates/destroys them.
- Every war/treaty/trade action records enough provenance to explain it later.
- Expensive AI inference must be optional; the baseline world runs locally without it.
- Fast-forward must remain possible. Narrative generation cannot sit in the weekly hot loop.

## Scaling strategy

Use multiple temporal resolutions rather than giving every object a heavyweight agent every week.

- weekly: markets, trade, military logistics, immediate policy
- monthly/quarterly: budgets, diplomacy, production changes
- yearly: demographic/technology/institutional changes
- event-driven: war declarations, coups, treaty negotiations, crises

The end state should support hundreds of countries and centuries of history while preserving causal inspectability.
