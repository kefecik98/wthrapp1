// Render tests for the forecast screen (push deep-link target).
//
// We mock the data hooks and router params so the component can render
// without a real network or navigation tree. The goal is regression
// detection — catch broken imports, removed hooks, or null-handling bugs.

import { render, screen } from "@testing-library/react-native";
import React from "react";

import ForecastScreen from "@/app/forecast";
import { useWeather } from "@/src/hooks/useWeather";
import { useLocalSearchParams } from "expo-router";

// expo-router: mock both useLocalSearchParams and the imperative router.
jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
  router: { back: jest.fn(), push: jest.fn() },
}));

// useWeather is mocked so we can drive different query states from tests.
jest.mock("@/src/hooks/useWeather", () => ({
  useWeather: jest.fn(),
}));

const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockUseWeather = useWeather as jest.Mock;

describe("ForecastScreen", () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({});
    mockUseWeather.mockReturnValue({
      isLoading: false,
      isError: false,
      data: undefined,
    });
  });

  it('renders a generic "Weather incoming" title when no event param', () => {
    render(<ForecastScreen />);
    expect(screen.getByText(/Weather incoming/)).toBeTruthy();
  });

  it("renders the right label + minutes for a rain push", () => {
    mockUseLocalSearchParams.mockReturnValue({
      event_type: "rain",
      minutes_away: "7",
    });
    render(<ForecastScreen />);
    expect(screen.getByText("Rain incoming")).toBeTruthy();
    expect(screen.getByText(/Expected in about 7 minutes/)).toBeTruthy();
  });

  it('singularises "minute" when minutes_away === 1', () => {
    mockUseLocalSearchParams.mockReturnValue({
      event_type: "hail",
      minutes_away: "1",
    });
    render(<ForecastScreen />);
    expect(screen.getByText(/Expected in about 1 minute\b/)).toBeTruthy();
  });

  it("shows a loading state while the forecast is fetching", () => {
    mockUseWeather.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    });
    render(<ForecastScreen />);
    expect(screen.getByText(/Loading/)).toBeTruthy();
  });

  it("shows an error message when the forecast fails", () => {
    mockUseWeather.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    });
    render(<ForecastScreen />);
    expect(screen.getByText(/Forecast unavailable/)).toBeTruthy();
  });
});
