// Render tests for the paywall screen.
// Mocks react-query's useQuery + useQueryClient and the RC purchases
// service so the screen can render against canned data.

import { render, screen } from "@testing-library/react-native";
import React from "react";

import PaywallScreen from "@/app/paywall";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

// react-query: keep useQueryClient real-ish (invalidateQueries used in
// callbacks the smoke test doesn't trigger) but stub useQuery for state control.
const mockQueryFn = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockQueryFn(...args),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("@/src/services/purchases", () => ({
  getOfferingPackages: jest.fn(),
  purchase: jest.fn(),
  purchasesReady: jest.fn().mockReturnValue(true),
  restore: jest.fn(),
}));

jest.mock("@/src/lib/config", () => ({
  revenueCatConfigured: true,
}));

describe("PaywallScreen", () => {
  beforeEach(() => {
    mockQueryFn.mockReset();
  });

  it("shows the title even while offerings load", () => {
    mockQueryFn.mockReturnValue({ isLoading: true, data: undefined });
    render(<PaywallScreen />);
    expect(screen.getByText("WeatherAlert Premium")).toBeTruthy();
    // ActivityIndicator has no text — assert via testID-less query is hard,
    // so just confirm the title + no plan rows.
    expect(screen.queryByText(/per month/i)).toBeNull();
  });

  it("renders each offering package", () => {
    mockQueryFn.mockReturnValue({
      isLoading: false,
      data: [
        {
          identifier: "monthly",
          product: { title: "Monthly", priceString: "$4.99" },
        },
        {
          identifier: "annual",
          product: { title: "Annual", priceString: "$39.99" },
        },
      ],
    });
    render(<PaywallScreen />);
    expect(screen.getByText("Monthly")).toBeTruthy();
    expect(screen.getByText("$4.99")).toBeTruthy();
    expect(screen.getByText("Annual")).toBeTruthy();
    expect(screen.getByText("$39.99")).toBeTruthy();
  });

  it("renders restore and dismiss links", () => {
    mockQueryFn.mockReturnValue({ isLoading: false, data: [] });
    render(<PaywallScreen />);
    expect(screen.getByText("Restore purchases")).toBeTruthy();
    expect(screen.getByText("Not now")).toBeTruthy();
  });
});
