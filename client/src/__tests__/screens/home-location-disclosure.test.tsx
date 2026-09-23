// Tests for the background-location prominent disclosure on the home screen.
// Play policy: the OS background-location prompt must only ever follow an
// explicit accept on our own disclosure. These tests pin that ordering.

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import HomeScreen from "@/app/(tabs)/index";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-location", () => ({
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 1, longitude: 2, accuracy: 5 },
  }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/src/services/push", () => ({ registerForPush: jest.fn() }));
jest.mock("@/src/lib/api", () => ({ apiRequest: jest.fn() }));
jest.mock("@/src/hooks/useWeather", () => ({
  useWeather: () => ({ isLoading: false, isError: true, data: undefined }),
}));
jest.mock("@/src/hooks/useSubscription", () => ({
  useSubscription: () => ({ data: { isActive: false } }),
}));
jest.mock("@/src/hooks/useAuth", () => ({
  useSignOut: () => jest.fn(),
  useDeleteAccount: () => ({ mutate: jest.fn(), isPending: false }),
}));

const mockHasPermission = jest.fn();
const mockStart = jest.fn();
jest.mock("@/src/services/location", () => ({
  hasBackgroundLocationPermission: () => mockHasPermission(),
  startLocationUpdates: () => mockStart(),
}));

const DISCLOSURE_TITLE = "Use your location in the background?";

describe("HomeScreen — location disclosure", () => {
  beforeEach(() => {
    mockHasPermission.mockReset();
    mockStart.mockReset().mockResolvedValue(true);
  });

  it("shows the disclosure before requesting permission", async () => {
    mockHasPermission.mockResolvedValue(false);
    render(<HomeScreen />);

    fireEvent.press(screen.getByText("Enable location alerts"));

    expect(await screen.findByText(DISCLOSURE_TITLE)).toBeTruthy();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("requests permission only after the user taps Continue", async () => {
    mockHasPermission.mockResolvedValue(false);
    render(<HomeScreen />);

    fireEvent.press(screen.getByText("Enable location alerts"));
    fireEvent.press(await screen.findByText("Continue"));

    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
  });

  it("never requests permission when the user declines", async () => {
    mockHasPermission.mockResolvedValue(false);
    render(<HomeScreen />);

    fireEvent.press(screen.getByText("Enable location alerts"));
    fireEvent.press(await screen.findByText("Not now"));

    await waitFor(() =>
      expect(screen.queryByText(DISCLOSURE_TITLE)).toBeNull(),
    );
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("skips the disclosure when permission was already granted", async () => {
    mockHasPermission.mockResolvedValue(true);
    render(<HomeScreen />);

    fireEvent.press(screen.getByText("Enable location alerts"));

    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(DISCLOSURE_TITLE)).toBeNull();
  });
});
