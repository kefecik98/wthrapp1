// Tests for free/paid gating on the preferences screen.
//
// The server alert engine ignores a free user's event-type, intensity and
// lead-time preferences, so the screen must not present those as editable.
// These tests pin that: free sees locked rows that route to the paywall,
// paid sees live controls.

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Switch } from "react-native";
import { router } from "expo-router";

import PreferencesScreen from "@/app/(tabs)/preferences";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

// The community slider is a native component; a simple stub keeps the
// render tree inspectable without pulling in native code.
jest.mock("@react-native-community/slider", () => "Slider");

// `mock`-prefixed so jest.mock factories may reference them (hoisting rule).
const mockPrefs = {
  alertLeadMin: 20,
  alertRain: true,
  alertSnow: false,
  alertHail: false,
  alertThunder: false,
  alertWind: false,
  minRainIntensity: "light" as const,
  notificationsOn: true,
};

const mockMutate = jest.fn();
jest.mock("@/src/hooks/useWeather", () => ({
  usePreferences: () => ({ isLoading: false, isError: false, data: mockPrefs }),
  useUpdatePreferences: () => ({ mutate: mockMutate }),
}));

// Flipped per-test to switch tiers.
let mockIsActive = false;
jest.mock("@/src/hooks/useSubscription", () => ({
  useSubscription: () => ({ data: { isActive: mockIsActive } }),
}));

beforeEach(() => {
  mockMutate.mockReset();
  (router.push as jest.Mock).mockReset();
});

describe("PreferencesScreen — free tier", () => {
  beforeEach(() => {
    mockIsActive = false;
  });

  it("shows the free-plan banner", () => {
    render(<PreferencesScreen />);
    expect(screen.getByText("You're on the free plan")).toBeTruthy();
    expect(screen.getByText("See Premium")).toBeTruthy();
  });

  it("shows rain as included and the other event types as locked", () => {
    render(<PreferencesScreen />);
    expect(screen.getByText("Rain")).toBeTruthy();
    expect(screen.getByText("Included")).toBeTruthy();
    // Snow, hail, thunder, wind + lead time + intensity = 6 locked rows.
    expect(screen.getAllByText("🔒 Premium")).toHaveLength(6);
  });

  it("hides the lead-time slider and rain-intensity chips", () => {
    render(<PreferencesScreen />);
    expect(screen.queryByText("20 min")).toBeNull();
    expect(screen.queryByText("moderate")).toBeNull();
    expect(screen.getByText("Within the hour")).toBeTruthy();
    expect(screen.getByText("Any rain")).toBeTruthy();
  });

  it("routes a locked row to the paywall instead of saving", () => {
    render(<PreferencesScreen />);
    fireEvent.press(screen.getByText("Snow"));
    expect(router.push).toHaveBeenCalledWith("/paywall");
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("keeps the master notifications switch editable", () => {
    render(<PreferencesScreen />);
    const master = screen.UNSAFE_getAllByType(Switch);
    // Exactly one switch on the free screen: "All notifications".
    expect(master).toHaveLength(1);
    fireEvent(master[0], "valueChange", false);
    expect(mockMutate).toHaveBeenCalledWith({ notificationsOn: false });
  });
});

describe("PreferencesScreen — paid tier", () => {
  beforeEach(() => {
    mockIsActive = true;
  });

  it("shows no upsell or locked rows", () => {
    render(<PreferencesScreen />);
    expect(screen.queryByText("You're on the free plan")).toBeNull();
    expect(screen.queryByText("🔒 Premium")).toBeNull();
  });

  it("shows every event toggle as a live switch", () => {
    render(<PreferencesScreen />);
    for (const label of ["Rain", "Snow", "Hail", "Thunderstorm", "High wind"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Five event toggles + the master notifications switch.
    const switches = screen.UNSAFE_getAllByType(Switch);
    expect(switches).toHaveLength(6);
  });

  it("saves an event toggle change", () => {
    render(<PreferencesScreen />);
    const switches = screen.UNSAFE_getAllByType(Switch);
    // Index 1 is Snow (order follows EVENT_TOGGLES).
    fireEvent(switches[1], "valueChange", true);
    expect(mockMutate).toHaveBeenCalledWith({ alertSnow: true });
  });

  it("shows the lead-time value and intensity chips", () => {
    render(<PreferencesScreen />);
    expect(screen.getByText(`${mockPrefs.alertLeadMin} min`)).toBeTruthy();
    expect(screen.getByText("moderate")).toBeTruthy();
    expect(screen.getByText("heavy")).toBeTruthy();
  });
});
