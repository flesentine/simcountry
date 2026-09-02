# Phase 1 — Physical world, territory and logistics

Phase 1 turns the Phase 0/0.1 state machine into a spatial simulation.

## Delivered

- deterministic 32×18 generated world grid
- land/ocean generation with plains, forests, hills, mountains and desert
- contiguous-ish seeded national territories with real border adjacency
- cell-level food, energy, metals and industrial potential
- national production derived from owned physical geography
- capitals plus secondary/regional cities
- ports only on coastal city cells
- land trade routes only between bordering states
- sea routes only between countries with ports
- distance and capacity on every international route
- weekly route capacity consumption and reset
- logistics cost included in import price and partner selection
- trade partner selection rejects unreachable sellers
- war declarations require a shared land frontier or maritime access
- interactive SVG territory map with cities, ports and route overlays
- selected-country geography/transport inspector

## Architectural rule

Geography is authoritative simulation state, not presentation metadata. Economy, trade and military access query the same `WorldState.geography` object that the UI renders.

That means future systems can build directly on it:

- roads and rail upgrades
- shipping lanes and chokepoints
- blockades
- army movement and supply
- conquest / border changes
- migration
- city growth
- resource depletion and discovery

without replacing the Phase 1 map model.

## Invariants

Automated tests require:

- deterministic geography for a seed
- every country owns at least one land cell
- every capital occupies land owned by its country
- every country has positive finite geography-derived production
- adjacency is symmetric
- land routes only connect adjacent countries
- sea routes terminate at real ports
- route use never exceeds route capacity
- removing transport routes removes international trade access
- every active war has physical strategic access

Phase 0.1 long-horizon stability tests continue to run unchanged on top of the spatial model.
