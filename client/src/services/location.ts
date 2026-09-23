// Background location reporting (spec §6.2).
// Foreground: periodic GPS. Background: significant-change updates.
// Each fix is snapped to the location grid *on the phone* and only the cell
// centre is pushed to PUT /location — the exact position never leaves the
// device (see src/lib/grid.ts).
//
// The task runs outside React, so it reads the access token directly from
// secure storage rather than from the Zustand store.

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { config } from "../lib/config";
import { snapToGrid, type GridPoint } from "../lib/grid";
import { loadTokens } from "../lib/tokenStore";

export const LOCATION_TASK = "wa-location-task";

/**
 * The only form in which a location is ever sent to the server: the centre
 * of the grid cell the fix falls in. Every PUT /location body must come from
 * here.
 */
export function toReportedLocation(
  coords: Pick<Location.LocationObjectCoords, "latitude" | "longitude">,
): GridPoint {
  return snapToGrid(coords.latitude, coords.longitude);
}

// Defined at module load so the OS can resume it when the app is killed.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const fix = locations[0];
  if (!fix) return;

  const tokens = await loadTokens();
  if (!tokens) return; // not signed in — nothing to report

  try {
    await fetch(`${config.apiBaseUrl}/location`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.accessToken}`,
      },
      body: JSON.stringify(toReportedLocation(fix.coords)),
    });
  } catch {
    // Best-effort: the next fix will retry.
  }
});

/**
 * True when background location is already granted, so the in-app
 * disclosure (components/location-disclosure.tsx) can be skipped — Play only
 * requires it before the permission *request*, and re-showing it to someone
 * who already agreed is just friction.
 */
export async function hasBackgroundLocationPermission(): Promise<boolean> {
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.status === "granted";
}

/**
 * Request permissions and start background location updates.
 * Callers must show the location disclosure first unless
 * hasBackgroundLocationPermission() is already true.
 * Returns false if the user denied the required permission.
 */
export async function startLocationUpdates(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return false;

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return false;

  const already =
    await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (already) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // ~3 min foreground cadence; OS batches in background.
    timeInterval: 180_000,
    distanceInterval: 500, // ~500 m significant-change threshold
    showsBackgroundLocationIndicator: false,
    pausesUpdatesAutomatically: true,
  });
  return true;
}

export async function stopLocationUpdates(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
