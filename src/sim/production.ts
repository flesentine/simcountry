import { RESOURCE_KEYS, type Country, type Geography, type ResourceLedger } from "../model/types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 100) / 100;

function resourceDensity(geography: Geography, countryId: string): ResourceLedger {
  const cells = geography.cells.filter((cell) => cell.ownerId === countryId);
  const count = Math.max(1, cells.length);
  const cities = geography.cities.filter((city) => city.countryId === countryId);
  const industry = cities.reduce((sum, city) => sum + city.industry, 0);
  const totals = cells.reduce<ResourceLedger>((sum, cell) => ({
    food: sum.food + cell.deposits.food,
    energy: sum.energy + cell.deposits.energy,
    metals: sum.metals + cell.deposits.metals,
    goods: sum.goods + cell.deposits.goods,
  }), { food: 0, energy: 0, metals: 0, goods: 0 });

  return {
    food: totals.food / count,
    energy: totals.energy / count,
    metals: totals.metals / count,
    goods: totals.goods / count + industry / count * 1.8,
  };
}

export function applyGeographicProduction(countries: Country[], geography: Geography) {
  const densities = new Map(countries.map((country) => [country.id, resourceDensity(geography, country.id)]));
  const averages = Object.fromEntries(RESOURCE_KEYS.map((resource) => [
    resource,
    countries.reduce((sum, country) => sum + densities.get(country.id)![resource], 0) / countries.length,
  ])) as ResourceLedger;

  for (const country of countries) {
    const density = densities.get(country.id)!;
    for (const resource of RESOURCE_KEYS) {
      const relativeRichness = density[resource] / Math.max(0.01, averages[resource]);
      const outputFactor = clamp(0.35 + relativeRichness * 0.68, 0.58, 1.55);
      country.production[resource] = round(Math.max(0.35, country.needs[resource] * outputFactor));
    }
  }
}
