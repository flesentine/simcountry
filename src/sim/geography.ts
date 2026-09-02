import type {
  City,
  Country,
  Geography,
  ResourceLedger,
  Terrain,
  TradeRoute,
  WorldCell,
  WorldState,
} from "../model/types";
import { createRng } from "./rng";

export const MAP_WIDTH = 32;
export const MAP_HEIGHT = 18;

const ANCHORS = [
  [0.13, 0.27], [0.31, 0.22], [0.19, 0.60], [0.39, 0.58],
  [0.59, 0.25], [0.78, 0.29], [0.62, 0.64], [0.84, 0.61],
] as const;
const CITY_SUFFIXES = ["Bay", "Cross", "Reach", "Point", "Vale", "Gate", "Harbor", "Heights"] as const;

const round = (value: number) => Math.round(value * 100) / 100;
const cellId = (x: number, y: number) => `${x}:${y}`;
const pairKey = (a: string, b: string) => [a, b].sort().join("|");
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const fract = (value: number) => value - Math.floor(value);

function neighborCoordinates(x: number, y: number) {
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const;
}

function cellNoise(seed: number, x: number, y: number, salt: number) {
  return fract(Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + salt * 37.719 + seed * 0.011) * 43758.5453);
}

function terrainAndDeposits(seed: number, x: number, y: number, elevation: number) {
  const moisture = cellNoise(seed, x, y, 11);
  const geology = cellNoise(seed, x, y, 29);
  const hydrocarbons = cellNoise(seed, x, y, 47);
  const terrain: Terrain = elevation > 0.82 ? "mountains"
    : elevation > 0.66 ? "hills"
      : moisture > 0.68 ? "forest"
        : moisture < 0.23 ? "desert"
          : "plains";

  const foodBase = terrain === "plains" ? 1.25 : terrain === "forest" ? 0.88 : terrain === "hills" ? 0.62 : terrain === "desert" ? 0.32 : 0.22;
  const metalsBase = terrain === "mountains" ? 1.5 : terrain === "hills" ? 1.05 : 0.38;
  const energyBase = terrain === "desert" ? 0.8 : terrain === "plains" ? 0.55 : 0.45;
  const goodsBase = terrain === "plains" ? 0.34 : terrain === "hills" ? 0.26 : 0.18;

  return {
    terrain,
    deposits: {
      food: round(foodBase * (0.65 + moisture * 0.7)),
      energy: round(energyBase * (0.45 + hydrocarbons * 1.15)),
      metals: round(metalsBase * (0.5 + geology)),
      goods: round(goodsBase * (0.7 + moisture * 0.35)),
    } satisfies ResourceLedger,
  };
}

function buildLand(seed: number): WorldCell[] {
  const rng = createRng(seed + 411);
  const continents = [
    { x: 0.28 + (rng.next() - 0.5) * 0.04, y: 0.43, rx: 0.31, ry: 0.40 },
    { x: 0.70 + (rng.next() - 0.5) * 0.04, y: 0.46, rx: 0.29, ry: 0.39 },
    { x: 0.51, y: 0.73, rx: 0.20, ry: 0.19 },
  ];
  const cells: WorldCell[] = [];

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const nx = (x + 0.5) / MAP_WIDTH;
      const ny = (y + 0.5) / MAP_HEIGHT;
      const shape = Math.min(...continents.map((continent) =>
        ((nx - continent.x) / continent.rx) ** 2 + ((ny - continent.y) / continent.ry) ** 2));
      const edgeNoise = (cellNoise(seed, x, y, 3) - 0.5) * 0.34;
      const land = shape + edgeNoise < 1;
      const elevation = land ? Math.min(1, 0.28 + (1 - Math.min(shape, 1)) * 0.47 + cellNoise(seed, x, y, 7) * 0.36) : 0;
      const physical = terrainAndDeposits(seed, x, y, elevation);
      cells.push({
        id: cellId(x, y), x, y, land, coastal: false, ownerId: null,
        terrain: physical.terrain,
        elevation: round(elevation),
        deposits: land ? physical.deposits : { food: 0, energy: 0, metals: 0, goods: 0 },
      });
    }
  }
  return cells;
}

function chooseCountrySeeds(cells: WorldCell[], countries: Country[]) {
  const land = cells.filter((cell) => cell.land);
  const used = new Set<string>();
  return countries.map((country, index) => {
    const anchor = ANCHORS[index % ANCHORS.length]!;
    const target = { x: anchor[0] * (MAP_WIDTH - 1), y: anchor[1] * (MAP_HEIGHT - 1) };
    const selected = land
      .filter((cell) => !used.has(cell.id))
      .sort((a, b) => distance(a, target) - distance(b, target))[0] ?? land[index]!;
    used.add(selected.id);
    return { countryId: country.id, cell: selected };
  });
}

function assignTerritory(seed: number, cells: WorldCell[], seeds: ReturnType<typeof chooseCountrySeeds>) {
  for (const cell of cells) {
    if (!cell.land) continue;
    let owner = seeds[0]!;
    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < seeds.length; index++) {
      const candidate = seeds[index]!;
      const jitter = (cellNoise(seed, cell.x, cell.y, index + 71) - 0.5) * 2.2;
      const score = distance(cell, candidate.cell) + jitter;
      if (score < best) {
        best = score;
        owner = candidate;
      }
    }
    cell.ownerId = owner.countryId;
  }
  for (const seedCell of seeds) seedCell.cell.ownerId = seedCell.countryId;
}

function markCoasts(cells: WorldCell[]) {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  for (const cell of cells) {
    if (!cell.land) continue;
    cell.coastal = neighborCoordinates(cell.x, cell.y).some(([x, y]) => {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return true;
      return !byId.get(cellId(x, y))?.land;
    });
  }
}

function buildAdjacency(cells: WorldCell[], countries: Country[]) {
  const adjacencySets = new Map(countries.map((country) => [country.id, new Set<string>()]));
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  for (const cell of cells) {
    if (!cell.land || !cell.ownerId) continue;
    for (const [x, y] of neighborCoordinates(cell.x, cell.y)) {
      const other = byId.get(cellId(x, y));
      if (!other?.ownerId || other.ownerId === cell.ownerId) continue;
      adjacencySets.get(cell.ownerId)?.add(other.ownerId);
      adjacencySets.get(other.ownerId)?.add(cell.ownerId);
    }
  }
  return Object.fromEntries(countries.map((country) => [country.id, [...(adjacencySets.get(country.id) ?? [])].sort()]));
}

function buildCities(seed: number, cells: WorldCell[], countries: Country[], seeds: ReturnType<typeof chooseCountrySeeds>): City[] {
  const rng = createRng(seed + 919);
  const cities: City[] = [];
  for (let index = 0; index < countries.length; index++) {
    const country = countries[index]!;
    const owned = cells.filter((cell) => cell.ownerId === country.id);
    const capitalCell = seeds[index]!.cell;
    cities.push({
      id: `${country.id}-capital`, name: `${country.name} City`, countryId: country.id,
      cellId: capitalCell.id, x: capitalCell.x, y: capitalCell.y,
      population: round(Math.max(2, country.population * (0.14 + rng.next() * 0.08))),
      capital: true, port: capitalCell.coastal, industry: round(1.5 + rng.next() * 2.4),
    });

    if (owned.length > 1) {
      const coastal = owned.filter((cell) => cell.coastal && cell.id !== capitalCell.id);
      const pool = coastal.length ? coastal : owned.filter((cell) => cell.id !== capitalCell.id);
      const second = [...pool].sort((a, b) => distance(b, capitalCell) - distance(a, capitalCell))[0]!;
      cities.push({
        id: `${country.id}-trade`, name: `${country.name} ${CITY_SUFFIXES[index % CITY_SUFFIXES.length]}`,
        countryId: country.id, cellId: second.id, x: second.x, y: second.y,
        population: round(Math.max(1.5, country.population * (0.07 + rng.next() * 0.06))),
        capital: false, port: second.coastal, industry: round(1.2 + rng.next() * 2.8),
      });
    }

    if (country.population > 65 && owned.length > 8) {
      const existing = cities.filter((city) => city.countryId === country.id);
      const third = [...owned]
        .filter((cell) => !existing.some((city) => city.cellId === cell.id))
        .sort((a, b) => {
          const aNearest = Math.min(...existing.map((city) => distance(a, city)));
          const bNearest = Math.min(...existing.map((city) => distance(b, city)));
          return bNearest - aNearest;
        })[0];
      if (third) cities.push({
        id: `${country.id}-regional`, name: `${country.name} ${CITY_SUFFIXES[(index + 3) % CITY_SUFFIXES.length]}`,
        countryId: country.id, cellId: third.id, x: third.x, y: third.y,
        population: round(Math.max(1.2, country.population * (0.045 + rng.next() * 0.04))),
        capital: false, port: third.coastal, industry: round(1 + rng.next() * 2.2),
      });
    }
  }
  return cities;
}

function nearestCity(cities: City[], countryId: string, target: City) {
  return cities.filter((city) => city.countryId === countryId).sort((a, b) => distance(a, target) - distance(b, target))[0]!;
}

export function recalculateRouteCapacity(route: TradeRoute) {
  const levelMultiplier = 1 + Math.max(0, route.level - 1) * 0.28;
  const nominalCapacity = round(Math.max(2, route.baseCapacity * levelMultiplier * Math.max(0.35, route.condition / 100)));
  route.capacity = Math.max(route.usedThisWeek, nominalCapacity);
  return route.capacity;
}

function createRoute(input: Omit<TradeRoute, "baseCapacity" | "capacity" | "usedThisWeek" | "infrastructure" | "level" | "condition" | "chokepoint" | "blockedBy"> & { baseCapacity: number }): TradeRoute {
  const route: TradeRoute = {
    ...input,
    baseCapacity: round(input.baseCapacity),
    capacity: round(input.baseCapacity),
    usedThisWeek: 0,
    infrastructure: input.mode === "sea" ? "shipping_lane" : "road",
    level: 1,
    condition: 100,
    chokepoint: false,
    blockedBy: null,
  };
  recalculateRouteCapacity(route);
  return route;
}

function buildRoutes(countries: Country[], adjacency: Record<string, string[]>, cities: City[]): TradeRoute[] {
  const routes: TradeRoute[] = [];
  const landPairs = new Set<string>();

  for (const country of countries) {
    for (const neighborId of adjacency[country.id] ?? []) {
      const key = pairKey(country.id, neighborId);
      if (landPairs.has(key)) continue;
      landPairs.add(key);
      const aCapital = cities.find((city) => city.countryId === country.id && city.capital);
      const bCapital = cities.find((city) => city.countryId === neighborId && city.capital);
      if (!aCapital || !bCapital) continue;
      const aHub = nearestCity(cities, country.id, bCapital);
      const bHub = nearestCity(cities, neighborId, aCapital);
      const routeDistance = Math.max(1, distance(aHub, bHub));
      routes.push(createRoute({
        id: `land:${key}`, a: country.id, b: neighborId, mode: "land",
        fromCityId: aHub.id, toCityId: bHub.id, distance: round(routeDistance),
        baseCapacity: 11 + (aHub.population + bHub.population) * 0.42 + 12 / routeDistance,
      }));
    }
  }

  const portsByCountry = new Map(countries.map((country) => [country.id, cities.filter((city) => city.countryId === country.id && city.port)]));
  for (let i = 0; i < countries.length; i++) {
    for (let j = i + 1; j < countries.length; j++) {
      const a = countries[i]!;
      const b = countries[j]!;
      const aPorts = portsByCountry.get(a.id) ?? [];
      const bPorts = portsByCountry.get(b.id) ?? [];
      if (!aPorts.length || !bPorts.length) continue;
      const pairs = aPorts.flatMap((aPort) => bPorts.map((bPort) => ({ aPort, bPort, d: distance(aPort, bPort) })));
      const best = pairs.sort((x, y) => x.d - y.d)[0]!;
      if (best.d > MAP_WIDTH * 0.82) continue;
      const key = pairKey(a.id, b.id);
      routes.push(createRoute({
        id: `sea:${key}`, a: a.id, b: b.id, mode: "sea",
        fromCityId: best.aPort.id, toCityId: best.bPort.id, distance: round(Math.max(1, best.d)),
        baseCapacity: 17 + (best.aPort.population + best.bPort.population) * 0.55,
      }));
    }
  }

  const seaRoutes = routes.filter((route) => route.mode === "sea").sort((a, b) => a.distance - b.distance);
  const chokepoints = Math.min(seaRoutes.length, Math.max(2, Math.ceil(seaRoutes.length * 0.2)));
  for (const route of seaRoutes.slice(0, chokepoints)) route.chokepoint = true;
  return routes;
}

export function generateGeography(countries: Country[], seed: number): Geography {
  const cells = buildLand(seed);
  const seeds = chooseCountrySeeds(cells, countries);
  assignTerritory(seed, cells, seeds);
  markCoasts(cells);
  const adjacency = buildAdjacency(cells, countries);
  const cities = buildCities(seed, cells, countries, seeds);
  const routes = buildRoutes(countries, adjacency, cities);
  return { width: MAP_WIDTH, height: MAP_HEIGHT, cells, adjacency, cities, routes };
}

export function refreshGeography(world: WorldState) {
  for (const city of world.geography.cities) {
    if (city.capital) continue;
    const cell = world.geography.cells.find((candidate) => candidate.id === city.cellId);
    if (cell?.ownerId) city.countryId = cell.ownerId;
  }

  world.geography.adjacency = buildAdjacency(world.geography.cells, world.countries);
  const oldRoutes = new Map(world.geography.routes.map((route) => [route.id, route]));
  const rebuilt = buildRoutes(world.countries, world.geography.adjacency, world.geography.cities);
  for (const route of rebuilt) {
    const old = oldRoutes.get(route.id);
    if (!old) continue;
    route.level = old.level;
    route.condition = old.condition;
    route.infrastructure = route.mode === "land" && old.level >= 3 ? "rail" : route.mode === "sea" ? "shipping_lane" : "road";
    route.blockedBy = old.blockedBy;
    route.chokepoint = route.chokepoint || old.chokepoint;
    recalculateRouteCapacity(route);
  }
  world.geography.routes = rebuilt;
}

export function deriveProduction(geography: Geography, countryId: string): ResourceLedger {
  const cells = geography.cells.filter((cell) => cell.ownerId === countryId);
  const cities = geography.cities.filter((city) => city.countryId === countryId);
  const potential = cells.reduce<ResourceLedger>((sum, cell) => ({
    food: sum.food + cell.deposits.food,
    energy: sum.energy + cell.deposits.energy,
    metals: sum.metals + cell.deposits.metals,
    goods: sum.goods + cell.deposits.goods,
  }), { food: 0, energy: 0, metals: 0, goods: 0 });
  const industry = cities.reduce((sum, city) => sum + city.industry, 0);
  return {
    food: round(3.2 + potential.food * 0.25),
    energy: round(2.8 + potential.energy * 0.24),
    metals: round(2.4 + potential.metals * 0.22),
    goods: round(2.2 + potential.goods * 0.16 + industry * 1.15),
  };
}

export function resetRouteUsage(world: WorldState) {
  for (const route of world.geography.routes) {
    route.usedThisWeek = 0;
    recalculateRouteCapacity(route);
  }
}

export function routeRemainingCapacity(route: TradeRoute) {
  if (route.blockedBy) return 0;
  return Math.max(0, route.capacity - route.usedThisWeek);
}

export function getTradeRoutes(world: WorldState, a: string, b: string) {
  return world.geography.routes.filter((route) =>
    (route.a === a && route.b === b) || (route.a === b && route.b === a));
}

export function getBestTradeRoute(world: WorldState, a: string, b: string): TradeRoute | null {
  const routes = getTradeRoutes(world, a, b)
    .filter((route) => !route.blockedBy && routeRemainingCapacity(route) >= 2)
    .sort((x, y) => {
      const xQuality = Math.max(0.3, x.level * x.condition / 100);
      const yQuality = Math.max(0.3, y.level * y.condition / 100);
      const xCost = x.distance * (x.mode === "sea" ? 0.85 : 1) / xQuality;
      const yCost = y.distance * (y.mode === "sea" ? 0.85 : 1) / yQuality;
      return xCost - yCost;
    });
  return routes[0] ?? null;
}

export function findFrontCell(world: WorldState, attackerId: string, defenderId: string) {
  const cells = world.geography.cells;
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const capitalCells = new Set(world.geography.cities.filter((city) => city.capital).map((city) => city.cellId));

  if ((world.geography.adjacency[attackerId] ?? []).includes(defenderId)) {
    let bestDefenderFront: WorldCell | null = null;
    let bestAttackerFront: WorldCell | null = null;
    for (const cell of cells) {
      if (cell.ownerId !== defenderId && cell.ownerId !== attackerId) continue;
      const touchesEnemy = neighborCoordinates(cell.x, cell.y).some(([x, y]) => {
        const other = byId.get(cellId(x, y));
        return cell.ownerId === defenderId ? other?.ownerId === attackerId : other?.ownerId === defenderId;
      });
      if (!touchesEnemy) continue;
      if (cell.ownerId === defenderId && !capitalCells.has(cell.id)) {
        if (!bestDefenderFront || cell.elevation < bestDefenderFront.elevation || (cell.elevation === bestDefenderFront.elevation && cell.id < bestDefenderFront.id)) bestDefenderFront = cell;
      } else if (cell.ownerId === attackerId) {
        if (!bestAttackerFront || cell.elevation < bestAttackerFront.elevation || (cell.elevation === bestAttackerFront.elevation && cell.id < bestAttackerFront.id)) bestAttackerFront = cell;
      }
    }
    return bestDefenderFront ?? bestAttackerFront;
  }

  const attackerPorts = world.geography.cities.filter((city) => city.countryId === attackerId && city.port);
  if (!attackerPorts.length) return null;
  let bestCoastal: WorldCell | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    if (cell.ownerId !== defenderId || !cell.coastal || capitalCells.has(cell.id)) continue;
    const d = Math.min(...attackerPorts.map((port) => distance(cell, port)));
    if (d < bestDistance) {
      bestDistance = d;
      bestCoastal = cell;
    }
  }
  return bestCoastal;
}

export function hasStrategicAccess(world: WorldState, a: string, b: string) {
  if ((world.geography.adjacency[a] ?? []).includes(b)) return true;
  if (!getTradeRoutes(world, a, b).some((route) => route.mode === "sea")) return false;
  const capitalCells = new Set(world.geography.cities.filter((city) => city.capital).map((city) => city.cellId));
  const hasPort = world.geography.cities.some((city) => city.countryId === a && city.port);
  return hasPort && world.geography.cells.some((cell) => cell.ownerId === b && cell.coastal && !capitalCells.has(cell.id));
}

export function captureBorderRegion(world: WorldState, winnerId: string, loserId: string, preferredCellId?: string | null) {
  const loserTerritory = world.geography.cells.filter((cell) => cell.ownerId === loserId);
  if (loserTerritory.length <= 4) return null;
  const capitalCells = new Set(world.geography.cities.filter((city) => city.capital).map((city) => city.cellId));
  let target = preferredCellId ? world.geography.cells.find((cell) => cell.id === preferredCellId && cell.ownerId === loserId && !capitalCells.has(cell.id)) ?? null : null;
  if (!target) target = findFrontCell(world, winnerId, loserId);
  if (!target || target.ownerId !== loserId || capitalCells.has(target.id)) return null;

  target.ownerId = winnerId;
  const capturedCity = world.geography.cities.find((city) => city.cellId === target!.id && !city.capital);
  if (capturedCity) capturedCity.countryId = winnerId;
  refreshGeography(world);
  return { cell: target, city: capturedCity ?? null };
}
