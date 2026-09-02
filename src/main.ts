import "./style.css";
import { RESOURCE_KEYS, type Country, type WorldEvent, type WorldState } from "./model/types";
import { createInitialWorld, tickWeek } from "./sim/world";

const app = document.querySelector<HTMLDivElement>("#app") ?? (() => { throw new Error("Missing #app"); })();

let world: WorldState = createInitialWorld(1978);
let running = false;
let speed = 1;
let selectedId = world.countries[0]!.id;
let timer: number | null = null;

const fmt = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits });
const yearLabel = () => `Year ${Math.floor(world.week / 52) + 1} · Week ${(world.week % 52) + 1}`;
const atWar = (country: Country) => world.wars.some((war) => war.a === country.id || war.b === country.id);

function eventIcon(event: WorldEvent) {
  return ({ trade: "↔", war: "⚔", peace: "◌", economy: "▥", politics: "◆", world: "◎" } as const)[event.kind];
}

function render() {
  const selected = world.countries.find((country) => country.id === selectedId) ?? world.countries[0]!;
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
        <div><strong>$${fmt(world.countries.reduce((sum, c) => sum + c.treasury, 0), 1)}B</strong><span>treasuries</span></div>
        <div><strong>${fmt(world.countries.reduce((sum, c) => sum + c.military, 0), 1)}</strong><span>military index</span></div>
      </section>

      <section class="world-grid" aria-label="Countries">
        ${world.countries.map((country) => `
          <button class="country ${country.id === selected.id ? "selected" : ""} ${atWar(country) ? "at-war" : ""}" data-country="${country.id}" style="--country:${country.color}">
            <span class="country-name"><i></i>${country.name}${atWar(country) ? " <em>WAR</em>" : ""}</span>
            <span class="country-stat"><b>${fmt(country.population)}M</b> people</span>
            <span class="country-stat"><b>$${fmt(country.treasury, 1)}B</b> treasury</span>
            <span class="meters">
              <span><small>stability</small><i><u style="width:${country.stability}%"></u></i></span>
              <span><small>readiness</small><i><u style="width:${country.readiness}%"></u></i></span>
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
            <span>Military <b>${fmt(selected.military, 1)}</b></span>
            <span>Risk <b>${selected.policy.risk}</b></span>
            <span>Expansionism <b>${selected.policy.expansionism}</b></span>
            <span>Commerce <b>${selected.policy.commerce}</b></span>
            <span>Diplomacy <b>${selected.policy.diplomacy}</b></span>
            <span>Stability <b>${fmt(selected.stability)}%</b></span>
          </div>
          <h3>Foreign relations</h3>
          <div class="relations">
            ${world.countries.filter((c) => c.id !== selected.id).map((other) => {
              const r = selected.relations[other.id]!;
              return `<div><span>${other.name}</span><small>trust ${fmt(r.trust)} · tension ${fmt(r.tension)}</small><i class="relation-bar"><u style="width:${r.trust}%"></u></i></div>`;
            }).join("")}
          </div>
        </section>

        <section class="panel history">
          <div class="panel-heading"><h2>World history</h2><span>${world.events.length} events</span></div>
          <div class="event-list" aria-live="polite">
            ${world.events.slice(0, 40).map((event) => `
              <article class="event ${event.kind}"><i>${eventIcon(event)}</i><div><small>Y${Math.floor(event.week / 52) + 1} · W${(event.week % 52) + 1}</small><p>${event.text}</p></div></article>
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
  app.querySelector<HTMLSelectElement>("#speedSelect")?.addEventListener("change", (event) => {
    speed = Number((event.target as HTMLSelectElement).value);
    syncTimer();
  });
  app.querySelectorAll<HTMLButtonElement>("[data-country]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.country ?? selectedId;
      render();
    });
  });
}

function syncTimer() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (!running) return;
  timer = window.setInterval(() => {
    const steps = speed === 1 ? 1 : Math.max(1, Math.floor(speed / 5));
    for (let i = 0; i < steps; i++) tickWeek(world);
    render();
  }, speed === 1 ? 650 : 120);
}

render();
