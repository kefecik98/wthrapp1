// Integration test for the alert engine's one-cycle behaviour.
//
// What this verifies (spec §6.3):
// - Only subscribed users with notifications on, a fresh location, and an
//   FCM token are considered.
// - Users in the same ~0.1° grid cell share one Tomorrow.io forecast call.
// - findNextEvent matches against each user's enabled events + lead time.
// - The `alert_log` UNIQUE (user_id, event_type, event_start_at) constraint
//   prevents a repeat alert when the cycle runs again with the same forecast.
// - sendPush is called with the right payload on success.

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock the network-bound pieces. Keep findNextEvent real — its pure
// behaviour is already covered by services/weather.test.ts, but the engine
// composes it and we want the composition exercised here.
vi.mock("../services/weather", async () => {
  const real = await vi.importActual<typeof import("../services/weather")>(
    "../services/weather",
  );
  return { ...real, fetchMinutely: vi.fn() };
});
vi.mock("../services/push", () => ({
  sendPush: vi.fn(),
}));

import { prisma } from "../db";
import { runAlertCycle } from "./alertEngine";
import { fetchMinutely, TomorrowMinute } from "../services/weather";
import { clearForecastCache } from "../services/forecastCache";
import { sendPush } from "../services/push";
import { resetDb } from "../test/helpers";

const mockFetch = vi.mocked(fetchMinutely);
const mockSend = vi.mocked(sendPush);

beforeAll(async () => {
  // Ensure Prisma is connected before tests start touching the DB.
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  // The forecast cache is module-level and outlives a single cycle by design,
  // so each test starts from an empty one.
  clearForecastCache();
  mockFetch.mockReset();
  mockSend.mockReset();
  mockSend.mockResolvedValue(true);
});

interface SeedUser {
  email: string;
  lat: number;
  lng: number;
  /** Defaults to "active". Use "none" to create no subscription row at all. */
  status?: "active" | "trial" | "expired" | "cancelled" | "none";
  fcmToken?: string | null;
  notificationsOn?: boolean;
  /** Minutes ago for `updated_at` on user_locations. */
  locationAgeMin?: number;
}

async function seedUser(u: SeedUser) {
  const user = await prisma.user.create({
    data: {
      email: u.email,
      passwordHash: "x",
      fcmToken: u.fcmToken === undefined ? "fcm-" + u.email : u.fcmToken,
      preferences: {
        create: { notificationsOn: u.notificationsOn ?? true },
      },
      subscription:
        u.status === "none"
          ? undefined
          : { create: { status: u.status ?? "active", plan: "monthly" } },
    },
  });
  await prisma.userLocation.create({
    data: {
      userId: user.id,
      lat: u.lat,
      lng: u.lng,
      updatedAt: new Date(Date.now() - (u.locationAgeMin ?? 0) * 60_000),
    },
  });
  return user;
}

/** Build a forecast where rain starts `offsetMin` minutes from now. */
function rainForecast(offsetMin: number): TomorrowMinute[] {
  return [
    {
      time: new Date(Date.now() + offsetMin * 60_000).toISOString(),
      values: {
        precipitationIntensity: 2.0,
        precipitationType: 1, // rain
        precipitationProbability: 90,
        windSpeed: 1,
      },
    },
  ];
}

describe("runAlertCycle", () => {
  it("clusters users in the same ~0.1° cell into one Tomorrow.io call", async () => {
    // Two users ~0.01° apart -> same cell. One user far away -> different cell.
    await seedUser({ email: "a@example.com", lat: 40.71, lng: -74.01 });
    await seedUser({ email: "b@example.com", lat: 40.72, lng: -74.02 });
    await seedUser({ email: "c@example.com", lat: 41.50, lng: -75.00 });

    mockFetch.mockResolvedValue(rainForecast(5));

    await runAlertCycle();

    // 2 unique cells, so 2 forecast calls (not 3).
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("skips users without a subscription, fresh location, or FCM token", async () => {
    await seedUser({
      email: "expired@example.com",
      lat: 40.71,
      lng: -74.01,
      status: "expired",
    });
    await seedUser({
      email: "no-push@example.com",
      lat: 40.71,
      lng: -74.01,
      fcmToken: null,
    });
    await seedUser({
      email: "muted@example.com",
      lat: 40.71,
      lng: -74.01,
      notificationsOn: false,
    });
    await seedUser({
      email: "stale@example.com",
      lat: 40.71,
      lng: -74.01,
      locationAgeMin: 60, // beyond LOCATION_STALE_MINUTES=30 default
    });

    mockFetch.mockResolvedValue(rainForecast(5));

    await runAlertCycle();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(await prisma.alertLog.count()).toBe(0);
  });

  it("alerts only when the event is within the user's lead time", async () => {
    const inLead = await seedUser({
      email: "in-lead@example.com",
      lat: 40.71,
      lng: -74.01,
    });
    const outOfLead = await seedUser({
      email: "out-of-lead@example.com",
      lat: 40.71,
      lng: -74.01,
    });
    // Tighten the second user's lead time below the forecast distance.
    await prisma.userPreferences.update({
      where: { userId: outOfLead.id },
      data: { alertLeadMin: 3 },
    });

    mockFetch.mockResolvedValue(rainForecast(8));

    await runAlertCycle();

    // The in-lead user (default 10 min lead) gets alerted; the other does not.
    expect(mockSend).toHaveBeenCalledTimes(1);
    const logs = await prisma.alertLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(inLead.id);
    expect(logs[0].eventType).toBe("rain");
  });

  it("sends a push with the right title/data on a match", async () => {
    const user = await seedUser({
      email: "push@example.com",
      lat: 40.71,
      lng: -74.01,
    });
    mockFetch.mockResolvedValue(rainForecast(7));

    await runAlertCycle();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.token).toBe("fcm-push@example.com");
    expect(arg.title).toContain("Rain");
    expect(arg.title).toContain("7");
    expect(arg.data).toEqual({ event_type: "rain", minutes_away: "7" });

    // alert_log row was inserted.
    const logs = await prisma.alertLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(user.id);
  });

  it("dedupes via the alert_log UNIQUE constraint on repeated cycles", async () => {
    await seedUser({ email: "dup@example.com", lat: 40.71, lng: -74.01 });
    // Same forecast for both cycles -> identical event_start_at, so the
    // second cycle's insert should violate the unique constraint and
    // skip the push.
    const forecast = rainForecast(6);
    mockFetch.mockResolvedValue(forecast);

    await runAlertCycle();
    await runAlertCycle();

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(await prisma.alertLog.count()).toBe(1);
  });

  it("continues processing other users when one cell's forecast fetch fails", async () => {
    // Cell A fails; cell B succeeds -> the cell-B user still gets alerted.
    await seedUser({ email: "fail@example.com", lat: 30.0, lng: -90.0 });
    const okUser = await seedUser({
      email: "ok@example.com",
      lat: 40.71,
      lng: -74.01,
    });
    mockFetch.mockImplementation(async (lat: number) => {
      if (lat < 35) throw new Error("upstream 503");
      return rainForecast(5);
    });

    await runAlertCycle();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const logs = await prisma.alertLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(okUser.id);
  });
});

describe("runAlertCycle (free tier)", () => {
  /** A forecast where snow (not rain) starts `offsetMin` minutes from now. */
  function snowForecast(offsetMin: number): TomorrowMinute[] {
    return [
      {
        time: new Date(Date.now() + offsetMin * 60_000).toISOString(),
        values: {
          precipitationIntensity: 1.0,
          precipitationType: 2, // snow
          precipitationProbability: 90,
          windSpeed: 1,
        },
      },
    ];
  }

  it("alerts an unsubscribed user about rain within the hour, ignoring lead time", async () => {
    // Rain is 45 min away — well beyond the default 10-min lead time a paid
    // user would be gated on. The free tier alerts anyway (any rain in window).
    const user = await seedUser({
      email: "free@example.com",
      lat: 40.71,
      lng: -74.01,
      status: "none",
    });
    mockFetch.mockResolvedValue(rainForecast(45));

    await runAlertCycle("free");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.title.toLowerCase()).toContain("hour");
    expect(arg.data).toMatchObject({ event_type: "rain" });
    const logs = await prisma.alertLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(user.id);
  });

  it("is rain-only — snow does not alert on the free tier", async () => {
    await seedUser({
      email: "free-snow@example.com",
      lat: 40.71,
      lng: -74.01,
      status: "none",
    });
    mockFetch.mockResolvedValue(snowForecast(20));

    await runAlertCycle("free");

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not process active/trial users (those belong to the paid tier)", async () => {
    await seedUser({
      email: "active@example.com",
      lat: 40.71,
      lng: -74.01,
      status: "active",
    });
    mockFetch.mockResolvedValue(rainForecast(45));

    await runAlertCycle("free");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("covers expired/cancelled subscribers (they fall back to free)", async () => {
    await seedUser({
      email: "expired@example.com",
      lat: 40.71,
      lng: -74.01,
      status: "expired",
    });
    mockFetch.mockResolvedValue(rainForecast(50));

    await runAlertCycle("free");

    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
