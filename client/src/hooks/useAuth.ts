// Auth mutations (register / login / sign-out) backed by React Query.

import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAuthStore } from "../store/auth";

interface Credentials {
  email: string;
  password: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function useCredentialMutation(path: "/auth/register" | "/auth/login") {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (creds: Credentials) =>
      apiRequest<TokenPair>(path, {
        method: "POST",
        auth: false,
        body: creds,
      }),
    onSuccess: (tokens) => setSession(tokens),
  });
}

export const useRegister = () => useCredentialMutation("/auth/register");
export const useLogin = () => useCredentialMutation("/auth/login");

export function useSignOut() {
  return useAuthStore((s) => s.signOut);
}
