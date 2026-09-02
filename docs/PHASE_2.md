# Phase 2 — Strategic geography

Phase 2 turns the physical substrate from Phase 1 into an evolving strategic system.

## Delivered

### Infrastructure

- every international corridor has a base capacity, condition and infrastructure level
- land corridors begin as roads and become rail corridors at level 3+
- sea corridors are shipping lanes
- infrastructure condition degrades with time and utilization
- autonomous governments spend treasury on repair and capacity upgrades
- higher infrastructure levels increase route capacity and reduce trade logistics cost
- route upgrades survive geography rebuilds when the country pair still exists

### Chokepoints and blockades

- deterministic maritime chokepoints are identified from the generated sea network
- stronger wartime states with port access can blockade a weaker opponent's sea corridor
- chokepoints are preferred blockade targets
- blockaded routes expose zero commercial capacity
- blockade pressure feeds back into national logistics and military supply
- blockades are cleared with peace

### Military logistics and fronts

- each war tracks a physical front cell
- each side has a 0–100 supply score derived from food, energy, treasury, infrastructure, blockades and land/maritime access
- battlefield power is multiplied by supply quality
- low supply increases readiness loss and contributes to exhaustion
- wars accumulate bounded battlefield momentum

### Territorial conquest

- a sustained battlefield advantage can capture one non-capital border/coastal region
- capitals are protected from Phase 2 regional capture
- countries cannot be reduced below a four-region territorial floor
- captured non-capital cities change sovereign ownership with their cell
- after every capture, adjacency and the international route graph are rebuilt from the new borders
- surviving corridors retain their infrastructure investment
- geography-derived production is recalculated after territorial change
- territorial changes remain in force after peace

### Cities and migration

- city population and industry change annually
- stability, port access and infrastructure support urban growth
- active war suppresses city growth and can cause decline
- people migrate from unstable/war-torn states toward more stable reachable states
- migration requires an open transport corridor
- migration preserves total national population across the world and updates country resource needs

## Architectural rule

Territory, routes, infrastructure, blockades, city ownership and war fronts all live in authoritative simulation state. The SVG map renders that state; it does not maintain a parallel visual-only model.

## Automated invariants

Phase 2 tests require:

- infrastructure level remains between 1 and 5
- route condition remains between 35% and 100%
- route capacity remains finite and positive
- blockaded routes expose zero trade capacity
- at least one maritime chokepoint exists
- governments can spend treasury to upgrade infrastructure
- conquest cannot capture a capital
- conquest changes exactly one region and rebuilds symmetric borders
- all land routes correspond to current land adjacency
- annual migration moves population through a real corridor without creating or destroying national population
- active wars maintain bounded supply and a physical front

The standalone 100-seed × 500-year stress gate additionally checks route capacity, infrastructure bounds, blockade ownership, city/cell sovereignty, territorial floors and rebuilt-border consistency across 50,000 simulated years.
