// Server-data hooks for the in-app weather display and preferences screen.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAuthStore } from "../store/auth";

export interface WeatherResponse {
  location: { lat: number; lng: number };
  updatedAt: string;
  minutely: { time: string; values: Record<string, number> }[];
}

export interface Preferences {
  alertLeadMin: number;
  alertRain: boolean;
  alertSnow: boolean;
  alertHail: boolean;
  alertThunder: boolean;
  alertWind: boolean;
  minRainIntensity: "light" | "moderate" | "heavy";
  notificationsOn: boolean;
}

export function useWeather() {
  const authed = useAuthStore((s) => s.accessToken !== null);
  return useQuery({
    queryKey: ["weather"],
    queryFn: () => apiRequest<WeatherResponse>("/weather"),
    enabled: authed,
  });
}

export function usePreferences() {
  const authed = useAuthStore((s) => s.accessToken !== null);
  return useQuery({
    queryKey: ["preferences"],
    queryFn: () => apiRequest<Preferences>("/preferences"),
    enabled: authed,
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Preferences>) =>
      apiRequest<Preferences>("/preferences", { method: "PUT", body: patch }),
    onSuccess: (data) => qc.setQueryData(["preferences"], data),
  });
}
