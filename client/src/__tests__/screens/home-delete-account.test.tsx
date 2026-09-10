// Tests for the "Delete account" flow on the home screen.
// The home screen pulls in weather, subscription, location and push services;
// all are mocked so the test can focus on the delete confirmation + mutation.

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";

import HomeScreen from "@/app/(tabs)/index";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-location", () => ({ getCurrentPositionAsync: jest.fn() }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/src/services/push", () => ({ registerForPush: jest.fn() }));
jest.mock("@/src/services/location", () => ({ startLocationUpdates: jest.fn() }));
jest.mock("@/src/lib/api", () => ({ apiRequest: jest.fn() }));
jest.mock("@/src/hooks/useWeather", () => ({
  useWeather: () => ({ isLoading: false, isError: true, data: undefined }),
}));
jest.mock("@/src/hooks/useSubscription", () => ({
  useSubscription: () => ({ data: { isActive: false } }),
}));

// useAuth: expose jest.fn() mutations so we can assert the delete is fired.
const mockDeleteMutate = jest.fn();
const mockSignOut = jest.fn();
jest.mock("@/src/hooks/useAuth", () => ({
  useSignOut: () => mockSignOut,
  useDeleteAccount: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

describe("HomeScreen — delete account", () => {
  beforeEach(() => {
    mockDeleteMutate.mockReset();
    jest.spyOn(Alert, "alert").mockReset();
  });

  it("renders the Delete account button", () => {
    render(<HomeScreen />);
    expect(screen.getByText("Delete account")).toBeTruthy();
  });

  it("asks for confirmation before deleting", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    render(<HomeScreen />);

    fireEvent.press(screen.getByText("Delete account"));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe("Delete account?");
    // Nothing deleted until the user confirms in the dialog.
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("fires the delete mutation when the user confirms", () => {
    // Auto-press the destructive "Delete" button in the confirm dialog.
    jest.spyOn(Alert, "alert").mockImplementation((_title, _msg, buttons) => {
      const del = buttons?.find((b) => b.style === "destructive");
      del?.onPress?.();
    });
    render(<HomeScreen />);

    fireEvent.press(screen.getByText("Delete account"));

    expect(mockDeleteMutate).toHaveBeenCalledTimes(1);
  });
});
