import "./style.css";
import "./map.css";
import { RESOURCE_KEYS, type Country, type WorldEvent, type WorldState } from "./model/types";
import { credibilitySummaryFor, getCredibility } from "./sim/diplomacy";
import { negotiationSummaryFor } from "./sim/negotiation";
import { treatySummaryFor } from "./sim/treaties";
import { createInitialWorld, getActiveTruce, tickWeek } from "./sim/world";

const app = document.querySelector<HTMLDivElement>("#app") ?? (() => { throw new Error("Missing #app"); })();

let world: WorldState = createInitialWorld(1978);
let running = false;
let speed = 1;
let selectedId = world.countries[0]!.id;
let timer: number | null = null;
let speedControlActive = false;
let pointerControlActive = false;

const CELL = 20;
const fmt = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits });
const yearLabel = () => `Year ${Math.floor(world.week / 52) + 1} · Week ${(world.week % 52) + 1}`;
const weekLabel = (week: number) => `Y${Math.floor(week / 52) + 1} · W${(week % 52) + 1}`;
const atWar = (country: Country) => world.wars.some((war) => war.a === country.id || war.b === country.id);
const countryById = (id: string) => world.countries.find((country) => country.id === id);
const cityById = (id: string) => world.geography.cities.find((city) => city.id === id);
const systemLabel = (system: string) => system.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function eventIcon(event: WorldEvent) {
  return ({ trade: "↔", war: "⚔", peace: "◌", economy: "▥", politics: "◆", diplomacy: "◇", world: "◎" } as const)[event.kind];
}

function renderMap(selected: Country) {
  const geography = world.geography;
  const selectedCities = geography.cities.filter((city) => city.countryId === selected.id);
  const neighbors = (geography.adjacency[selected.id] ?? []).map((id) => countryById(id)?.name ?? id);
  const routes = geography.routes.filter((route) => route.a === selected.id || route.b === selected.id);
  const territory = geography.cells.filter((cell) => cell.ownerId === selected.id);
  const ports = selectedCities.filter((city) => city.port);
  const selectedWar = world.wars.find((war) => war.a === selected.id || war.b === selected.id);

  const routeLines = geography.routes.map((route) => {
    const from = cityById(route.fromCityId);
    const to = cityById(route.toCityId);
    if (!from || !to) return "";
    const active = route.a === selected.id || route.b === selected.id;
    const closed = Boolean(route.blockedBy);
    return `<line class="map-route ${route.mode} level-${route.level} ${route.chokepoint ? "chokepoint" : ""} ${closed ? "blocked" : ""} ${active ? "active" : ""}" x1="${(from.x + 0.5) * CELL}" y1="${(from.y + 0.5) * CELL}" x2="${(to.x + 0.5) * CELL}" y2="${(to.y + 0.5) * CELL}"><title>${route.infrastructure} level ${route.level} · ${fmt(route.condition)}% condition · ${fmt(route.distance, 1)} distance · ${fmt(route.usedThisWeek, 1)}/${fmt(route.capacity, 1)} used${route.chokepoint ? " · strategic chokepoint" : ""}${route.blockedBy ? ` · BLOCKADED by ${countryById(route.blockedBy)?.name ?? route.blockedBy}` : ""}</title></line>`;
  }).join("");

  const fronts = world.wars.map((war) => {
    if (!war.frontCellId) return "";
    const cell = geography.cells.find((candidate) => candidate.id === war.frontCellId);
    if (!cell) return "";
    const involved = war.a === selected.id || war.b === selected.id;
    return `<g class="war-front ${involved ? "active" : ""}" transform="translate(${(cell.x + 0.5) * CELL} ${(cell.y + 0.5) * CELL})"><circle r="7"></circle><path d="M-5,-5 L5,5 M5,-5 L-5,5"></path><title>${countryById(war.a)?.name}–${countryById(war.b)?.name} front · momentum ${fmt(war.momentum, 1)} · supply ${Math.round(war.supplyA)}/${Math.round(war.supplyB)}</title></g>`;
  }).join("");

  return `
    <section class="panel map-panel" aria-label="Generated world geography">
      <div class="panel-heading">
        <div><span class="dot" style="background:${selected.color}"></span><h2>Strategic world</h2></div>
        <span>${geography.width}×${geography.height} · ${geography.routes.length} corridors</span>
      </div>
      <div class="map-layout">
        <div class="map-stage">
          <svg class="world-map" viewBox="0 0 ${geography.width * CELL} ${geography.height * CELL}" role="img" aria-label="SimCountry generated territory map">
            <rect class="map-ocean" width="100%" height="100%"></rect>
            ${geography.cells.filter((cell) => cell.land && cell.ownerId).map((cell) => {
              const owner = countryById(cell.ownerId!);
              return `<rect class="map-cell terrain-${cell.terrain} ${cell.ownerId === selected.id ? "selected-territory" : ""}" data-country="${cell.ownerId}" x="${cell.x * CELL}" y="${cell.y * CELL}" width="${CELL}" height="${CELL}" style="--cell-country:${owner?.color ?? "#777"}"><title>${owner?.name ?? cell.ownerId} · ${cell.terrain}${cell.coastal ? " · coast" : ""}\nfood ${cell.deposits.food} · energy ${cell.deposits.energy} · metals ${cell.deposits.metals}</title></rect>`;
            }).join("")}
            <g class="route-layer">${routeLines}</g>
            ${geography.cities.map((city) => {
              const owner = countryById(city.countryId);
              const selectedCity = city.countryId === selected.id;
              return `<circle class="map-city ${city.capital ? "capital" : ""} ${city.port ? "port" : ""} ${selectedCity ? "selected-city" : ""}" data-country="${city.countryId}" cx="${(city.x + 0.5) * CELL}" cy="${(city.y + 0.5) * CELL}" r="${city.capital ? 5.2 : 3.8}" style="--city-country:${owner?.color ?? "#fff"}"><title>${city.name}${city.capital ? " · capital" : ""}${city.port ? " · port" : ""} · ${fmt(city.population, 1)}M urban population · industry ${fmt(city.industry, 1)}</title></circle>`;
            }).join("")}
            <g class="front-layer">${fronts}</g>
          </svg>
          <div class="map-legend"><span>■ territory</span><span>● city</span><span>◎ port</span><span>— road/rail</span><span>┄ sea lane</span><span>◆ chokepoint</span><span>× front</span></div>
        </div>
        <aside class="map-inspector">
          <div class="map-country-title"><i style="background:${selected.color}"></i><div><strong>${selected.name}</strong><span>${territory.length} land regions</span></div></div>
          <dl>
            <div><dt>Cities</dt><dd>${selectedCities.length}</dd></div>
            <div><dt>Ports</dt><dd>${ports.length}</dd></div>
            <div><dt>Neighbors</dt><dd>${neighbors.length}</dd></div>
            <div><dt>Routes</dt><dd>${routes.length}</dd></div>
          </dl>
          ${selectedWar ? `
            <div class="war-card">
              <strong>ACTIVE FRONT</strong>
              <span>${countryById(selectedWar.a)?.name} vs ${countryById(selectedWar.b)?.name}</span>
              <small>region ${selectedWar.frontCellId ?? "offshore"} · momentum ${fmt(selectedWar.momentum, 1)}</small>
              <small>supply ${countryById(selectedWar.a)?.name}: ${Math.round(selectedWar.supplyA)} · ${countryById(selectedWar.b)?.name}: ${Math.round(selectedWar.supplyB)}</small>
              <small>captured regions ${selectedWar.capturedA} / ${selectedWar.capturedB} · blockades ${selectedWar.blockadeRouteIds.length}</small>
            </div>` : ""}
          <h4>Urban network</h4>
          <div class="map-list">${selectedCities.map((city) => `<span><b>${city.name}</b><small>${city.capital ? "capital · " : ""}${city.port ? "port · " : ""}${fmt(city.population, 1)}M · industry ${fmt(city.industry, 1)}</small></span>`).join("")}</div>
          <h4>Land frontiers</h4>
          <p>${neighbors.length ? neighbors.join(" · ") : "No direct land borders"}</p>
          <h4>Strategic transport</h4>
          <div class="map-list">${routes.slice(0, 10).map((route) => {
            const otherId = route.a === selected.id ? route.b : route.a;
            const blocked = route.blockedBy ? ` · BLOCKADED by ${countryById(route.blockedBy)?.name ?? route.blockedBy}` : "";
            return `<span class="${route.blockedBy ? "route-blocked" : ""}"><b>${route.infrastructure} L${route.level} → ${countryById(otherId)?.name ?? otherId}${route.chokepoint ? " ◆" : ""}</b><small>${fmt(route.condition)}% condition · ${fmt(route.usedThisWeek, 1)}/${fmt(route.capacity, 1)} capacity${blocked}</small></span>`;
          }).join("") || "<p>No international route</p>"}</div>
        </aside>
      </div>
    </section>`;
}

function renderGovernment(selected: Country) {
  const government = selected.government;
  const agenda = government.agenda;
  return `
    <h3>Government</h3>
    <div class="profile-grid">
      <span>System <b>${systemLabel(government.system)}</b></span>
      <span>${government.leader.title} <b>${government.leader.name}</b></span>
      <span>Legitimacy <b>${fmt(government.legitimacy)}%</b></span>
      <span>Cohesion <b>${fmt(government.cohesion)}%</b></span>
      <span>Dissent <b>${fmt(government.dissent)}%</b></span>
      <span>Leader competence <b>${government.leader.competence}</b></span>
    </div>
    <h3>Cabinet agenda</h3>
    <div class="profile-grid">
      <span>Tax effort <b>${fmt(agenda.taxEffort)}</b></span>
      <span>Civil spending <b>${fmt(agenda.civilSpending)}</b></span>
      <span>Trade openness <b>${fmt(agenda.tradeOpenness)}</b></span>
      <span>Diplomatic engagement <b>${fmt(agenda.diplomaticEngagement)}</b></span>
      <span>Defense posture <b>${fmt(agenda.defensePosture)}</b></span>
      <span>Infrastructure <b>${fmt(agenda.infrastructure)}</b></span>
      <span>Internal security <b>${fmt(agenda.internalSecurity)}</b></span>
    </div>
    <h3>Delegated objectives</h3>
    <div class="relations">
      ${government.objectives.map((objective) => `<div><span>${objective.label}</span><small>${objective.assignedTo} · priority ${fmt(objective.priority)} · ${objective.status}</small><i class="relation-bar"><u style="width:${objective.progress}%"></u></i></div>`).join("")}
    </div>
    <h3>Cabinet</h3>
    <div class="relations">
      ${Object.values(government.ministries).map((ministry) => `<div><span>${ministry.name}</span><small>${ministry.minister} · competence ${ministry.competence} · influence ${ministry.influence} · loyalty ${ministry.loyalty}</small><i class="relation-bar"><u style="width:${ministry.competence}%"></u></i></div>`).join("")}
    </div>`;
}

function renderTreaties(selected: Country) {
  const treaties = world.treaties.filter((treaty) => treaty.parties.includes(selected.id));
  const summary = treatySummaryFor(selected, world);
  return `
    <h3>Treaty commitments</h3>
    <div class="profile-grid">
      <span>Total <b>${summary.total}</b></span>
      <span>Active <b>${summary.active}</b></span>
      <span>Pending <b>${summary.pending}</b></span>
      <span>Open obligations <b>${summary.obligations}</b></span>
    </div>
    <div class="relations treaty-list">
      ${treaties.length ? treaties.slice().reverse().slice(0, 8).map((treaty) => {
        const counterpartId = treaty.parties.find((id) => id !== selected.id) ?? selected.id;
        const activeObligations = treaty.obligations.filter((obligation) => obligation.status === "active");
        const clauses = treaty.clauses.map((clause) => systemLabel(clause.kind)).join(" · ");
        const timing = treaty.expiryWeek === null ? "open-ended" : `expires ${weekLabel(treaty.expiryWeek)}`;
        const withdrawalNotice = treaty.withdrawalRequestedBy && treaty.withdrawalEffectiveWeek !== null
          ? ` · withdrawal notice by ${countryById(treaty.withdrawalRequestedBy)?.name ?? treaty.withdrawalRequestedBy} · ends ${weekLabel(treaty.withdrawalEffectiveWeek)}`
          : "";
        return `<div><span>${escapeHtml(treaty.title)}</span><small>${countryById(counterpartId)?.name ?? counterpartId} · ${treaty.status}${withdrawalNotice} · ${timing}</small><small>${clauses}${activeObligations.length ? ` · ${activeObligations.length} payment obligation${activeObligations.length === 1 ? "" : "s"}` : ""}</small></div>`;
      }).join("") : "<p>No treaty commitments yet.</p>"}
    </div>`;
}

function renderNegotiations(selected: Country) {
  const summary = negotiationSummaryFor(selected, world);
  const negotiations = world.negotiations.filter((negotiation) => negotiation.parties.includes(selected.id)).slice().reverse().slice(0, 8);
  return `
    <h3>Diplomatic negotiations</h3>
    <div class="profile-grid">
      <span>Total talks <b>${summary.total}</b></span>
      <span>Open <b>${summary.open}</b></span>
      <span>Agreements <b>${summary.accepted}</b></span>
      <span>Bandwidth <b>${summary.open}/${summary.bandwidth}</b></span>
    </div>
    <div class="relations negotiation-list">
      ${negotiations.length ? negotiations.map((negotiation) => {
        const counterpartId = negotiation.parties.find((id) => id !== selected.id) ?? selected.id;
        const current = negotiation.currentProposalId ? world.proposals.find((proposal) => proposal.id === negotiation.currentProposalId) : undefined;
        const selectedEvaluation = current?.evaluations.filter((evaluation) => evaluation.countryId === selected.id).at(-1);
        const direction = current ? `${countryById(current.proposerId)?.name ?? current.proposerId} → ${countryById(current.recipientId)?.name ?? current.recipientId}` : "closed";
        const displayedDecision = selectedEvaluation?.decision === "counter" && current?.status === "rejected" ? "counter attempt" : selectedEvaluation?.decision;
        const score = selectedEvaluation ? ` · cabinet ${displayedDecision} ${fmt(selectedEvaluation.totalScore, 1)}/${fmt(selectedEvaluation.threshold, 1)}` : "";
        const roundText = current ? `round ${current.round}/${negotiation.maxRounds}` : `${negotiation.proposalIds.length} round${negotiation.proposalIds.length === 1 ? "" : "s"}`;
        return `<div><span>${systemLabel(negotiation.motive)} with ${countryById(counterpartId)?.name ?? counterpartId}</span><small>${negotiation.status} · ${roundText} · ${direction}${score}</small><small>${escapeHtml(current?.draft.title ?? negotiation.terminalReason ?? "Negotiation closed")}</small></div>`;
      }).join("") : "<p>No diplomatic talks yet.</p>"}
    </div>`;
}

function renderDiplomaticMemory(selected: Country) {
  const summary = credibilitySummaryFor(selected, world);
  return `
    <h3>Diplomatic credibility & memory</h3>
    <div class="profile-grid">
      <span>Reputation <b>${fmt(summary.reputation, 1)}</b></span>
      <span>Breaches <b>${summary.breaches}</b></span>
      <span>Honored commitments <b>${summary.honored}</b></span>
      <span>Memories <b>${world.diplomaticMemories.filter((memory) => memory.subjectId === selected.id || memory.counterpartId === selected.id).length}</b></span>
    </div>
    <div class="relations diplomatic-memory-list">
      ${summary.memories.length ? summary.memories.map(({ memory, salience }) => {
        const counterpart = countryById(memory.counterpartId)?.name ?? memory.counterpartId;
        const subject = countryById(memory.subjectId)?.name ?? memory.subjectId;
        const heading = memory.subjectId === selected.id
          ? `${systemLabel(memory.category)} with ${counterpart}`
          : `${subject}: ${systemLabel(memory.category)}`;
        return `<div><span>${heading}</span><small>${weekLabel(memory.week)} · salience ${fmt(salience, 1)}</small><small>${escapeHtml(memory.description)}</small></div>`;
      }).join("") : "<p>No durable diplomatic memories yet.</p>"}
    </div>`;
}

function render() {
  const selected = world.countries.find((country) => country.id === selectedId) ?? world.countries[0]!;
  const avgLegitimacy = world.countries.reduce((sum, country) => sum + country.government.legitimacy, 0) / world.countries.length;
  const activeTreaties = world.treaties.filter((treaty) => treaty.status === "active").length;
  const openNegotiations = world.negotiations.filter((negotiation) => negotiation.status === "open").length;
  app.innerHTML = `
    <header class="topbar">
      <div>
        <div class="eyebrow">AUTONOMOUS WORLD LAB</div>
        <h1>SimCountry</h1>
        <p id="dateLabel">${yearLabel()}</p>
      </div>
      <div class="controls" aria-label="Simulation controls">
        <button id="runButton" class="primary">${running ? "Pause" : "Run"}</button>
        <button id="stepButton">Step week</button>
        <label>Speed
          <select id="speedSelect">
            <option value="1" ${speed === 1 ? "selected" : ""}>1×</option>
            <option value="10" ${speed === 10 ? "selected" : ""}>10×</option>
            <option value="50" ${speed === 50 ? "selected" : ""}>50×</option>
            <option value="200" ${speed === 200 ? "selected" : ""}>200×</option>
          </select>
        </label>
        <button id="resetButton">Reset</button>
      </div>
    </header>

    <main>
      <section class="summary" aria-label="World summary">
        <div><strong>${fmt(world.countries.reduce((sum, c) => sum + c.population, 0))}M</strong><span>population</span></div>
        <div><strong>${world.wars.length}</strong><span>active wars</span></div>
        <div><strong>${activeTreaties} / ${openNegotiations}</strong><span>treaties / open talks</span></div>
        <div><strong>${fmt(avgLegitimacy)}%</strong><span>avg legitimacy</span></div>
      </section>

      ${renderMap(selected)}

      <section class="world-grid" aria-label="Countries">
        ${world.countries.map((country) => `
          <button class="country ${country.id === selected.id ? "selected" : ""} ${atWar(country) ? "at-war" : ""}" data-country="${country.id}" style="--country:${country.color}">
            <span class="country-name"><i></i>${country.name}${atWar(country) ? " <em>WAR</em>" : ""}</span>
            <span class="country-stat"><b>${fmt(country.population)}M</b> people</span>
            <span class="country-stat"><b>$${fmt(country.treasury, 1)}B</b> treasury</span>
            <span class="country-stat"><b>${fmt(country.government.legitimacy)}%</b> legitimacy</span>
            <span class="meters">
              <span><small>stability</small><i><u style="width:${country.stability}%"></u></i></span>
              <span><small>cohesion</small><i><u style="width:${country.government.cohesion}%"></u></i></span>
            </span>
          </button>
        `).join("")}
      </section>

      <div class="lower-grid">
        <section class="panel detail">
          <div class="panel-heading"><div><span class="dot" style="background:${selected.color}"></span><h2>${selected.name}</h2></div><span>${atWar(selected) ? "AT WAR" : "SOVEREIGN"}</span></div>
          <div class="resource-grid">
            ${RESOURCE_KEYS.map((resource) => `<div><span>${resource}</span><strong>${fmt(selected.resources[resource], 1)}</strong><small>+${fmt(selected.production[resource], 1)}/wk · need ${fmt(selected.needs[resource], 1)}</small></div>`).join("")}
          </div>
          <h3>State profile</h3>
          <div class="profile-grid">
            <span>Military <b>${fmt(selected.military, 1)} / ${fmt(selected.militaryCapacity)}</b></span>
            <span>Risk <b>${selected.policy.risk}</b></span>
            <span>Expansionism <b>${selected.policy.expansionism}</b></span>
            <span>Commerce <b>${selected.policy.commerce}</b></span>
            <span>Diplomacy <b>${selected.policy.diplomacy}</b></span>
            <span>Stability <b>${fmt(selected.stability)}%</b></span>
          </div>
          ${renderGovernment(selected)}
          ${renderTreaties(selected)}
          ${renderNegotiations(selected)}
          ${renderDiplomaticMemory(selected)}
          <h3>Foreign relations</h3>
          <div class="relations">
            ${world.countries.filter((c) => c.id !== selected.id).map((other) => {
              const r = selected.relations[other.id]!;
              const truce = getActiveTruce(world, selected.id, other.id);
              const access = world.geography.adjacency[selected.id]?.includes(other.id) ? "land" : world.geography.routes.some((route) => route.mode === "sea" && ((route.a === selected.id && route.b === other.id) || (route.b === selected.id && route.a === other.id))) ? "sea" : "none";
              return `<div><span>${other.name}</span><small>${access} access · trust ${fmt(r.trust)} · credibility ${fmt(getCredibility(world, selected.id, other.id))} · tension ${fmt(r.tension)}${truce ? ` · truce to ${weekLabel(truce.endWeek)}` : ""}</small><i class="relation-bar"><u style="width:${r.trust}%"></u></i></div>`;
            }).join("")}
          </div>
        </section>

        <section class="panel history">
          <div class="panel-heading"><h2>World history</h2><span>${world.events.length} total · latest 40</span></div>
          <div class="event-list" aria-live="polite">
            ${world.events.slice(0, 40).map((event) => `
              <article class="event ${event.kind}"><i>${eventIcon(event)}</i><div><small>${weekLabel(event.week)}</small><p>${escapeHtml(event.text)}</p></div></article>
            `).join("")}
          </div>
        </section>
      </div>
    </main>
  `;

  app.querySelector<HTMLButtonElement>("#runButton")?.addEventListener("click", () => {
    running = !running;
    syncTimer();
    render();
  });
  app.querySelector<HTMLButtonElement>("#stepButton")?.addEventListener("click", () => {
    tickWeek(world);
    render();
  });
  app.querySelector<HTMLButtonElement>("#resetButton")?.addEventListener("click", () => {
    running = false;
    world = createInitialWorld(1978);
    selectedId = world.countries[0]!.id;
    syncTimer();
    render();
  });
  const speedSelect = app.querySelector<HTMLSelectElement>("#speedSelect");
  speedSelect?.addEventListener("pointerdown", () => {
    speedControlActive = true;
  });
  speedSelect?.addEventListener("focus", () => {
    speedControlActive = true;
  });
  speedSelect?.addEventListener("blur", () => {
    speedControlActive = false;
  });
  speedSelect?.addEventListener("change", (event) => {
    speed = Number((event.target as HTMLSelectElement).value);
    speedControlActive = false;
    syncTimer();
  });
  app.querySelectorAll<HTMLElement>("[data-country]").forEach((element) => {
    element.addEventListener("click", () => {
      selectedId = element.dataset.country ?? selectedId;
      render();
    });
  });
}


// At accelerated speeds the app re-renders every 120ms. Keep the current
// interactive node alive for the duration of a pointer press so a normal
// human-length click cannot begin on one button and end on its replacement.
app.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  pointerControlActive = Boolean(target?.closest("button, select"));
});
window.addEventListener("pointerup", () => {
  pointerControlActive = false;
});
window.addEventListener("pointercancel", () => {
  pointerControlActive = false;
});

function syncTimer() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (!running) return;
  timer = window.setInterval(() => {
    if (speedControlActive) return;
    const steps = speed === 1 ? 1 : Math.max(1, Math.floor(speed / 5));
    for (let i = 0; i < steps; i++) tickWeek(world);
    if (!pointerControlActive) render();
  }, speed === 1 ? 650 : 120);
}

render();