# Phase 3 — Governments and Delegation

Phase 3 turns each country from a single policy vector into a governed state with internal institutions.

## Authoritative design

The simulation engine remains authoritative. Leaders and ministries do not mutate world state directly. They produce a bounded cabinet agenda and delegated objectives; existing economy, trade, infrastructure, diplomacy and war rules consume those outputs.

## Government state

Each country now has:
- a deterministic government system
- a named leader with competence, authority and personality traits
- Finance, Trade, Foreign Affairs, Defense and Interior ministries
- minister competence, influence, loyalty and policy positions
- legitimacy, cabinet cohesion and policy dissent
- a seven-axis cabinet agenda
- three delegated objectives with measurable progress

## Quarterly cabinet cycle

Every 13 weeks, cabinet bargaining recalculates the government agenda from the leader and ministries. Institutional influence and competence affect how much each position matters. High disagreement reduces cohesion. Fiscal stress, war and domestic instability can reduce cohesion and legitimacy.

The cabinet agenda gradually shifts the country's effective risk, expansionism, commerce and diplomacy policies rather than replacing them instantly.

## Behavioral coupling

Government decisions affect:
- tax collection and civil spending
- defense spending, rebuilding and readiness
- import urgency and trade-partner selection
- infrastructure investment probability and execution cost
- military logistics and blockade capability
- migration attractiveness through legitimacy
- war appetite through cabinet defense support and cohesion

## Delegation

Governments continuously maintain three high-priority objectives selected from:
- build fiscal reserves
- expand reliable trade
- lower external tension
- raise military readiness
- upgrade strategic corridors
- strengthen domestic stability

Each objective is assigned to the ministry best suited to execute it and receives progress from real world state. Objectives are regenerated when achieved or when the annual agenda refresh occurs.

## Scope boundary

Phase 3 deliberately does not yet implement elections, legislatures, coups, parties, mass political movements, civil wars or constitutional change. Those belong to the later internal-politics phase. Phase 3 provides the institutional substrate they will act on.

## Verification

Phase 3 adds deterministic government tests, cabinet-bargaining tests, fiscal behavior tests, trade-agenda tests, cabinet-supported war appetite tests, and long-run government invariants. The existing 100-seed × 500-year stress gate is extended to legitimacy, cohesion, dissent, ministry state, agendas and delegated objectives.
