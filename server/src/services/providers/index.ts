// Provider registry: maps each WEATHER_PROVIDER value to its adapter.
// Typed against WeatherProviderName, so adding a name to config without an
// adapter here (or vice versa) is a compile error.

import { config, WeatherProviderName } from "../../config";
import { tomorrowProvider } from "./tomorrow";
import type { WeatherProvider } from "./types";

const PROVIDERS: Record<WeatherProviderName, WeatherProvider> = {
  tomorrow: tomorrowProvider,
};

/** The live provider, as chosen by WEATHER_PROVIDER. */
export function weatherProvider(): WeatherProvider {
  return PROVIDERS[config.weather.provider];
}

export type { WeatherProvider } from "./types";
