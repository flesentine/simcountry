# Phase 0.1 — Long-horizon stabilization

Phase 0.1 hardens the Phase 0 geopolitical kernel before geography is added.

## Problems found in Chromium and stress review

The initial kernel was deterministic and numerically stable, but long runs converged toward a degenerate world: readiness fell to zero, armies collapsed to the hard minimum, bilateral tension approached 100, countries could resume the same war almost immediately after peace, the commerce policy had no behavioral effect, and the event ledger discarded history after 300 entries.

## Stabilization changes

- Peace settlements now create explicit truces lasting at least two years.
- Countries under a truce cannot declare war on each other until it expires.
- Countries still participate in at most one active war at a time.
- Military strength now has a persistent capacity and rebuilds gradually in peacetime when the state can afford recruitment.
- Readiness now converges toward a policy-dependent peacetime target instead of decaying forever.
- Low readiness and severe instability reduce war appetite.
- Diplomatic tension now mean-reverts toward a structural target based on expansionism, diplomacy, trade, and recent truce state instead of accumulating toward 100 forever.
- Trust also drifts toward a relationship-specific equilibrium.
- Commerce now changes inventory targets, import urgency, seller reserves, purchase size, and partner scoring.
- Excess treasury reserves are gradually absorbed by public investment so the toy economy does not accumulate unbounded cash over centuries.
- The authoritative event ledger is no longer capped. The UI still renders only the latest 40 events for performance and readability.

## Automated invariants

The normal regression suite checks:

- deterministic replay for identical seeds;
- no country participating in multiple simultaneous wars;
- no active war overlapping an enforceable truce;
- peacetime military and readiness recovery;
- commerce changing trade behavior;
- preservation of the oldest historical event beyond the old 300-event limit.

CI also runs a dedicated stress test across **100 seeds × 500 simulated years**. It checks finite state, readiness/stability bounds, military-capacity bounds, fiscal bounds, truce enforcement, single-war participation, aggregate readiness viability, aggregate diplomatic tension, and resistance to universal military-floor collapse.

## Exit criterion

Phase 0.1 is ready when the regression suite, build, 100-seed stress gate, and Chromium desktop/mobile interaction pass are all green on the same commit.
