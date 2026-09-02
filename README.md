# SimCountry

SimCountry is a long-horizon geopolitical simulation where autonomous countries work, trade, negotiate, delegate, compete, and go to war over time.

The project is built around one core rule: **the simulation owns reality; agents make decisions inside it.** Economics, resources, demographics, logistics, diplomacy, and war are modeled as deterministic/probabilistic systems. Higher-level AI can later provide strategy, negotiation, delegation, and historical narration without being allowed to invent state.

## Initial scope

Version 0 starts deliberately small:

- 8 autonomous countries
- population and treasury
- food, energy, metals, and manufactured goods
- production and consumption
- bilateral relations and trust
- trade offers and trade execution
- military strength and readiness
- war declarations and simple attrition
- event log / world history
- deterministic seeded simulation

## Architecture

- `src/sim/` — authoritative simulation engine
- `src/model/` — world and country data types
- `src/ai/` — policy/decision layer (initially rule-based)
- `src/ui/` — visualization and controls
- `docs/` — design, invariants, and roadmap

The simulation core must be runnable without a UI and reproducible from a seed.

## Roadmap

See [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md).
