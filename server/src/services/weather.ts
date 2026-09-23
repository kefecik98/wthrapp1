// Forecast data shape + event matching. Provider-neutral: the weather
// provider adapters in ./providers convert their own API responses into
// ForecastMinute, and everything downstream (cache, alert engine,
// GET /weather) only ever sees that shape.
// See weather-app-spec.md §6.5 for the thresholds.

/**
 * One minute of forecast, in our own format.
 *
 * This is also a wire contract: GET /weather sends these objects to the app
 * unchanged, and shipped app builds read `values.precipitationType` codes
 * and `precipitationIntensity` directly. Adapters must fill every field with
 * exactly these units and codes; changing the shape breaks installed apps.
 * (Field names happen to match Tomorrow.io's, which was the first provider.)
 */
export interface ForecastMinute {
  time: string; // ISO timestamp
  values: {
    precipitationIntensity: number; // mm/hr
    precipitationType: number; // 0=none 1=rain 2=snow 3=freezing rain 4=ice pellets (hail)
    precipitationProbability: number; // 0-100
    windSpeed: number; // m/s
    thunderstormProbability?: number; // 0-100 (not every provider has it)
  };
}

export type WeatherEventType = "rain" | "snow" | "hail" | "thunder" | "wind";

export interface WeatherEvent {
  type: WeatherEventType;
  minutesAway: number;
  startTime: string; // ISO timestamp
}

// Subset of UserPreferences the matcher needs.
export interface PreferenceThresholds {
  alertRain: boolean;
  alertSnow: boolean;
  alertHail: boolean;
  alertThunder: boolean;
  alertWind: boolean;
  minRainIntensity: string; // 'light' | 'moderate' | 'heavy'
}

// Rain intensity thresholds in mm/hr.
const RAIN_INTENSITY: Record<string, number> = {
  light: 0.25,
  moderate: 2.5,
  heavy: 7.6,
};

// 13.9 m/s ≈ 31 mph: the lower bound of the US NWS Wind Advisory, and the
// wind speed at which outdoor trades (roofing, crane, scaffold) typically
// stop work. Promote to a per-user preference if product wants it tunable.
const WIND_ALERT_MS = 13.9;

function intensityThreshold(level: string): number {
  return RAIN_INTENSITY[level] ?? RAIN_INTENSITY.light;
}

/**
 * Find the first upcoming minute that matches one of the user's enabled
 * event types. Returns null when nothing relevant is forecast.
 */
export function findNextEvent(
  minutes: ForecastMinute[],
  prefs: PreferenceThresholds,
): WeatherEvent | null {
  for (const minute of minutes) {
    const v = minute.values;
    const minutesAway = Math.round(
      (new Date(minute.time).getTime() - Date.now()) / 60000,
    );
    if (minutesAway < 0) continue; // skip timestamps already in the past

    if (
      prefs.alertRain &&
      v.precipitationType === 1 &&
      v.precipitationIntensity >= intensityThreshold(prefs.minRainIntensity)
    ) {
      return { type: "rain", minutesAway, startTime: minute.time };
    }

    if (prefs.alertSnow && v.precipitationType === 2) {
      return { type: "snow", minutesAway, startTime: minute.time };
    }

    if (prefs.alertHail && v.precipitationType === 4) {
      return { type: "hail", minutesAway, startTime: minute.time };
    }

    if (
      prefs.alertThunder &&
      (v.thunderstormProbability ?? 0) > 70
    ) {
      return { type: "thunder", minutesAway, startTime: minute.time };
    }

    if (prefs.alertWind && v.windSpeed >= WIND_ALERT_MS) {
      return { type: "wind", minutesAway, startTime: minute.time };
    }
  }
  return null;
}
