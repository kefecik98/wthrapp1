// Render tests for the paywall screen.
// Mocks react-query's useQuery + useQueryClient and the RC purchases
// service so the screen can render against canned data.

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Linking } from "react-native";

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
  config: {
    legal: {
      privacyUrl: "https://api.test/legal/privacy",
      termsUrl: "https://api.test/legal/terms",
    },
  },
}));

// Subscription status is its own hook (it also calls useQuery, which is
// stubbed above for offerings), so control it separately.
const mockSubscription = jest.fn();
jest.mock("@/src/hooks/useSubscription", () => ({
  useSubscription: () => mockSubscription(),
}));

describe("PaywallScreen", () => {
  beforeEach(() => {
    mockQueryFn.mockReset();
    mockSubscription.mockReturnValue({ data: undefined });
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
          product: {
            title: "Monthly",
            priceString: "$4.99",
            subscriptionPeriod: "P1M",
            introPrice: null,
          },
        },
        {
          identifier: "annual",
          product: {
            title: "Annual",
            priceString: "$39.99",
            subscriptionPeriod: "P1Y",
            introPrice: {
              price: 0,
              priceString: "$0.00",
              cycles: 1,
              period: "P7D",
              periodUnit: "DAY",
              periodNumberOfUnits: 7,
            },
          },
        },
      ],
    });
    render(<PaywallScreen />);
    expect(screen.getByText("Monthly")).toBeTruthy();
    expect(screen.getByText("Annual")).toBeTruthy();
    // Store policy: price must be shown *per billing period*, with any trial.
    expect(screen.getByText("$4.99 / month")).toBeTruthy();
    expect(screen.getByText("$39.99 / year")).toBeTruthy();
    expect(
      screen.getByText("7-day free trial, then $39.99 / year"),
    ).toBeTruthy();
  });

  it("states how renewal and cancellation work", () => {
    mockQueryFn.mockReturnValue({ isLoading: false, data: [] });
    render(<PaywallScreen />);
    expect(screen.getByText(/renew automatically/)).toBeTruthy();
  });

  it("links to the Terms of Use and Privacy Policy", () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    mockQueryFn.mockReturnValue({ isLoading: false, data: [] });
    render(<PaywallScreen />);

    fireEvent.press(screen.getByText("Terms of Use"));
    expect(open).toHaveBeenLastCalledWith("https://api.test/legal/terms");

    fireEvent.press(screen.getByText("Privacy Policy"));
    expect(open).toHaveBeenLastCalledWith("https://api.test/legal/privacy");
  });

  it("offers the store's manage page only to active subscribers", () => {
    mockQueryFn.mockReturnValue({ isLoading: false, data: [] });
    render(<PaywallScreen />);
    expect(screen.queryByText("Manage or cancel subscription")).toBeNull();

    mockSubscription.mockReturnValue({
      data: {
        isActive: true,
        info: { managementURL: "https://play.google.com/store/account/subscriptions" },
      },
    });
    render(<PaywallScreen />);
    expect(screen.getByText("Manage or cancel subscription")).toBeTruthy();
  });

  it("renders restore and dismiss links", () => {
    mockQueryFn.mockReturnValue({ isLoading: false, data: [] });
    render(<PaywallScreen />);
    expect(screen.getByText("Restore purchases")).toBeTruthy();
    expect(screen.getByText("Not now")).toBeTruthy();
  });
});
