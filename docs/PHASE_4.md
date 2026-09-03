# Phase 4 — Treaties, Negotiation and Diplomatic Memory

Phase 4 is deliberately split into checkpoints. The current checkpoint, Phase 4.0, builds the treaty execution kernel before autonomous negotiation is allowed to create agreements.

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

Phase 4.0 execution is bilateral. The `parties` field is stored as a pair-compatible array so later phases can evolve the representation without making Phase 4.0 multilateral.

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

This separation is intentional. Permissions, restrictions and recurring obligations have different enforcement and failure semantics.

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

Obligations track:
- total amount
- amount paid
- remaining balance
- installment size
- interval
- next due week
- missed payments
- status
- reason-coded failure

Payments may be partial down to the existing national debt floor. Three missed scheduled payments produce a material breach and a treaty-violation record.

Lawful withdrawal or treaty expiry terminates the treaty's continuing permissions and restrictions, but it does **not** erase financial debt already created by an activated loan or reparations clause. Accrued obligations continue to reconcile until fulfilled, defaulted or later handled by a future settlement mechanic. This prevents withdrawal from functioning as debt cancellation.

### Trade enforcement

The existing trade engine now consults active treaty state before selecting and executing a transaction.

Treaties can:
- block a bilateral/resource trade through sanctions
- add an import tariff
- apply a preferential discount
- cap weekly trade volume through a quota

Quota use is authoritative state and resets at the beginning of each simulation week.

### Non-aggression enforcement

Autonomous war selection excludes pairs covered by an active non-aggression clause. Phase 4.0 treats that restriction as hard enforcement. Deliberate treaty-breaking behavior after activation belongs to Phase 4.2, where violation choice and diplomatic consequences will become explicit.

A future-dated non-aggression commitment does not constrain either party before its effective week. If one party starts a war in that interval and the war is still active when the treaty should enter force, the treaty fails activation and records the attacker as having breached the pending commitment.

### Conflict rules

Phase 4.0 rejects contradictory overlapping treaty scopes rather than silently choosing one. Sanctions conflict with simultaneous trade permissions/restrictions over the same bilateral resource scope. Tariffs and preferential access conflict only in the same direction; reciprocal terms may coexist. Quotas may coexist with compatible tariff/preference terms but duplicate quotas in the same direction/resource conflict.

Violated, expired, fulfilled and withdrawn treaties no longer reserve a policy scope for future agreements.

### UI

Country inspectors now include treaty commitments, counterpart, lifecycle state, term timing, clause summary and open payment obligations. The world summary includes the count of active treaties.

### Phase 4.0 verification contract

Regression tests cover:
- deterministic empty initial treaty state
- atomic validation failure
- loan escrow and future activation
- activation-time rollback and non-aggression breach recording
- treasury conservation through repayment
- debt survival after lawful withdrawal
- sanctions, tariffs, preferences and quotas
- reciprocal directional trade terms
- partner-selection enforcement
- non-aggression enforcement in autonomous simulation
- lawful withdrawal
- expiry
- payment default and reason-coded violation
- replacement of policy scope after a violated treaty
- financial schedules that would outlive treaty expiry

The 100-seed × 500-year stress gate creates a real commerce/credit/non-aggression treaty fixture in every world and additionally checks:
- unique treaty and clause IDs
- valid parties
- no treaty stuck pending after its effective date
- no active treaty beyond expiry/withdrawal
- weekly quota bounds
- obligation reconciliation
- valid escrow balances
- non-aggression/war incompatibility
- bounded treaty count
- repayment completion

## Deferred to Phase 4.1

- problem-driven diplomatic proposal generation
- ministry/leader utility breakdowns
- cabinet authorization
- proposals and counterproposals
- negotiation rounds and expiry
- bilateral diplomatic bandwidth and cooldowns

## Deferred to Phase 4.2

- deliberate treaty violations after activation
- treaty credibility/reliability
- diplomatic memory and category-specific decay
- violation severity and consequences
- renewal behavior
- richer treaty/negotiation history UI

The architectural rule remains unchanged: future diplomatic agents may propose and evaluate treaty packages, but only the deterministic engine may validate, activate and execute them.
