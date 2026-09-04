# Phase 4 — Treaties, Negotiation and Diplomatic Memory

Phase 4 is deliberately split into checkpoints. Phase 4.0 supplies the authoritative treaty execution kernel. Phase 4.1 adds autonomous negotiation and government authorization without giving proposal-generating code direct authority over world state. Phase 4.2 will add deliberate breaches, credibility and diplomatic memory.

## Phase 4.0 — Treaty Engine

The simulation engine remains authoritative. A treaty is structured state, not narration. No treaty clause can mutate the world until the complete treaty validates successfully.

### Treaty lifecycle

Treaties support:
- signing at the current world week
- immediate or future effective dates
- optional expiry dates
- lawful withdrawal notice periods
- pending, active, fulfilled, violated, expired and withdrawn states
- explicit terminal reasons
- unique treaty and clause IDs

Phase 4 execution remains bilateral. The `parties` field is stored as a pair-compatible array so later phases can evolve the representation without making the current engine multilateral.

### Clause classes

Every clause is explicitly one of three classes:

**Permission**
- preferential trade access

**Restriction**
- tariffs
- trade quotas
- sanctions
- non-aggression

**Obligation**
- loans
- reparations

Permissions, restrictions and recurring obligations deliberately have different enforcement and failure semantics.

### Atomic registration and activation

Treaty registration validates the entire package before any authoritative world mutation. Validation checks:
- two distinct existing parties
- valid effective/expiry/withdrawal timing
- clause parties and numeric bounds
- financial schedule feasibility
- loan funding capacity
- contradictory clauses inside one package
- overlapping conflicting clauses in existing non-terminal treaties
- immediate non-aggression conflicts with an active war

If registration validation fails:
- no treaty is added
- the treaty ID counter does not move
- no treasury is moved into escrow
- no clause becomes active

Future-effective treaties receive a second activation-time integrity check. If a pending non-aggression treaty reaches its effective week after one party has already begun a war against the other, activation fails atomically: loan escrow is refunded, the treaty and non-aggression clause are marked violated, the war's attacker is recorded as the violator, the counterpart is recorded as the injured party, and a `non_aggression_breach` enters the persistent treaty-violation ledger.

### Financial escrow and obligations

Loan principal is placed into treaty treasury escrow at signing. This guarantees that a future-effective loan cannot promise funds that disappear before activation.

When the treaty enters force:
- escrowed loan principal transfers to the debtor
- a scheduled repayment obligation is created
- reparations clauses create the same generic payment-obligation type

Obligations track total amount, paid amount, remaining balance, installment size, interval, next due week, missed payments, status and reason-coded failure.

Payments may be partial down to the existing national debt floor. Three missed scheduled payments produce a material breach and a treaty-violation record.

Lawful withdrawal or treaty expiry terminates continuing permissions and restrictions, but it does **not** erase financial debt already created by an activated loan or reparations clause. Accrued obligations continue to reconcile until fulfilled, defaulted or later handled by a future settlement mechanic. A later debt default does not retroactively rewrite an already-lawful withdrawal/expiry terminal reason.

### Trade and non-aggression enforcement

The trade engine consults active treaty state before partner selection and transaction execution. Treaties can block bilateral/resource trade through sanctions, add import tariffs, apply preferential discounts and cap weekly trade volume through quotas. Quota use is authoritative and resets each simulation week.

Autonomous war selection excludes pairs covered by an active non-aggression clause. A future-dated non-aggression commitment does not constrain either party before its effective week; if war is active at activation, the treaty fails activation and records the attacker as the breaching party.

Deliberate post-activation treaty-breaking remains Phase 4.2 behavior.

### Conflict rules

Contradictory overlapping treaty scopes are rejected rather than silently resolved. Sanctions conflict with simultaneous trade permissions/restrictions over the same bilateral resource scope. Tariffs and preferential access conflict only in the same direction; reciprocal terms may coexist. Quotas may coexist with compatible tariff/preference terms but duplicate quotas in the same direction/resource conflict.

Violated, expired, fulfilled and withdrawn treaties no longer reserve policy scope for future agreements.

Transit rights remain deferred. The current world has direct bilateral routes but no honest multi-country army/trade path model, so adding a transit clause now would be decorative rather than enforceable.

### Operational indexing

Phase 4.1 creates substantial historical treaty volume. The treaty engine therefore maintains a **derived, non-serialized operational cache** for pending/active treaties and surviving payment obligations. Complete treaty history remains authoritative in `WorldState`; loading or cloning a world rebuilds the cache from that truth. Operational queries no longer become slower merely because centuries of terminal treaty history exist.

## Phase 4.1 — Negotiation & Government Authorization

### First-class negotiation state

`WorldState` now serializes:
- negotiations
- proposals
- negotiation/proposal ID counters
- proposal rounds and response chains
- structured motives
- cabinet evaluations
- accepted treaty linkage
- terminal reason and pair cooldown timing

A negotiation has exactly two parties in Phase 4.1. It may be open, accepted, rejected, expired or cancelled. Each negotiation can carry at most three proposal rounds.

### Structured motives

The current motive vocabulary is:
- `trade_access`
- `security`
- `financing`
- `sanctions_relief`
- `reparations`

Autonomous generation currently uses the first three because the deterministic engine has enough state to create meaningful offers for them:
- resource-complementary trade preferences when one side can meaningfully supply what the other lacks; reciprocal concessions are added only when both directions have a real comparative supply advantage
- non-aggression accords when security incentives justify them
- development credit when one state has financing need and a trusted counterpart has fiscal capacity

`sanctions_relief` and `reparations` are retained as structured motive classes for future settlement/violation contexts. Phase 4.1 does not fabricate them without a real triggering condition.

### Untrusted proposal boundary

Anything that may eventually originate outside trusted simulation code must cross `treaty-input.ts` before reaching the treaty kernel.

The runtime boundary:
- accepts `unknown`, not a trusted TypeScript object
- requires plain objects
- rejects unsupported top-level and clause keys
- bounds title length and clause count
- validates numeric/integer fields
- whitelists resources and clause kinds
- rejects malformed party references and unsupported clauses
- constructs a fresh defensive copy
- then runs the authoritative Phase 4.0 contextual validator

Future LLM/agent JSON therefore cannot directly call `registerTreaty()` with unchecked state.

### Government authorization policy

Every proposal is evaluated separately by:
- Finance Ministry
- Trade Ministry
- Foreign Affairs
- Defense Ministry
- Interior Ministry
- the national leader

The deterministic evaluator derives policy-domain utilities for economy, trade, diplomacy, defense and stability from the actual clause roles facing that country.

Ministries weight those domains differently and are further weighted by their influence and competence. The leader evaluates the same package through leader policy positions, authority, pragmatism and nationalism. The proposal stores all six score components, weights and rationales rather than only a single unexplained number.

Government cohesion, dissent and legitimacy produce a dynamic approval threshold.

A cabinet response is:
- **approve** when weighted utility clears the threshold with margin
- **counter** when utility is close enough to justify another round and rounds remain
- **reject** otherwise

The proposer must also authorize its own opening package; negotiation logic cannot send a proposal its own government would reject.

### Counteroffers

Counterproposals are deterministic modifications of the current structured treaty draft rather than free-form text.

Current examples:
- preferential-trade counters reduce the requested preference magnitude
- creditor counters can reduce loan principal/exposure
- security counters can shorten term length

A counter becomes a new proposal with:
- incremented round
- reversed proposer/recipient roles
- `responseToProposalId`
- a fresh government evaluation

The maximum is three rounds. Accepted proposals enter the world only by calling the existing authoritative `registerTreaty()` path. If world conditions change before signature and the treaty no longer validates, the negotiation fails rather than bypassing the engine.

### Timing, cooldowns and bandwidth

Proposal responses require at least one simulation week. Negotiated treaties use a short future effective delay so a package remains valid through counter rounds and does not become retroactively effective before signature.

Pair cooldowns prevent immediate repeat bargaining after both success and failure. Each country also has diplomatic bandwidth derived from its diplomatic-engagement agenda and Foreign Ministry competence, capped at three simultaneous talks.

Autonomous openings are evaluated quarterly and are additionally paced to at most **two new negotiations world-wide per quarterly cycle**. This prevents diplomatic spam while still allowing parallel diplomacy and keeps the historical ledger readable over centuries.

Operational negotiation queries use a bounded recent window justified by the fixed eight-country, three-bandwidth and cooldown limits. Full negotiation/proposal history remains serialized and is never truncated.

### War interaction

War and negotiation remain separate authoritative systems. A pair cannot open normal Phase 4.1 talks while already at war. If war starts during an open negotiation, the current proposal is rejected and the negotiation is cancelled. Peace-settlement/reparations bargaining belongs to later diplomatic work rather than pretending ordinary peacetime negotiation can continue through war.

### UI

Country inspectors now show:
- total/open/accepted talks
- used versus available diplomatic bandwidth
- motive
- counterpart
- round
- proposal direction
- current treaty-draft title
- the selected government's latest cabinet decision and utility/threshold

The world summary shows active treaties and currently open talks. Diplomacy events narrate openings, counters, approvals, rejections, expiry and war interruption from actual engine events only.

### Phase 4.1 verification contract

Regression coverage includes:
- deterministic empty initial negotiation state
- strict runtime input rejection and defensive copying
- six-part leader/ministry utility breakdown
- autonomous negotiation initiation
- diplomatic-bandwidth bounds
- delayed response and real treaty signature
- counterproposal creation and response linkage

The 100-seed × 500-year stress gate keeps the Phase 4.0 treaty fixture and additionally checks:
- bounded active treaty state while retaining historical treaties
- unique treaty/negotiation/proposal IDs
- valid negotiation parties and proposal chains
- no stale open proposal beyond expiry
- maximum three rounds
- no duplicate simultaneous talks for one bilateral pair
- per-country diplomatic bandwidth
- accepted negotiations link to real treaties
- finite/bounded cabinet scores with all six institutional components
- bounded historical growth implied by the two-openings-per-quarter policy
- autonomous diplomacy occurs across the seed population
- autonomous agreements and counteroffers actually occur rather than existing only as unreachable code

## Phase 4.2 — Diplomatic Memory & Violations

Deferred to Phase 4.2:
- deliberate treaty violations after activation
- credibility/reliability distinct from current relationship trust
- historical diplomatic memory
- category-specific memory decay
- violation severity and consequences
- renewal/withdrawal decisions informed by credibility
- richer treaty/negotiation history UI

The architectural rule remains unchanged: diplomatic agents may propose, prioritize and negotiate, but only the deterministic simulation engine may validate, activate and execute authoritative treaty state.