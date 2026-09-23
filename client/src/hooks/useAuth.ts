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

// Social sign-in. The provider identity token is verified server-side.
// SERVER WORK REQUIRED (not yet implemented): POST /auth/apple and
// POST /auth/google must verify the token with Apple/Google, find-or-create
// the user, and return a JWT pair. users.password_hash must also become
// nullable for social-only accounts. Until then these calls return 404 and
// the UI surfaces a clear message. Tracked in client/CONTEXT.md.
export function useSocialSignIn() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (args: { provider: "apple" | "google"; idToken: string }) =>
      apiRequest<TokenPair>(`/auth/${args.provider}`, {
        method: "POST",
        auth: false,
        body: { idToken: args.idToken },
      }),
    onSuccess: (tokens) => setSession(tokens),
  });
}

export function useSignOut() {
  return useAuthStore((s) => s.signOut);
}

// Permanently delete the signed-in user's account (DELETE /account). The
// server removes the user row and cascades to all their data; we then clear
// the local session so the app returns to the login flow. Required by the
// app stores (Apple 5.1.1(v) / Google Play Data Deletion).
export function useDeleteAccount() {
  const signOut = useAuthStore((s) => s.signOut);
  return useMutation({
    mutationFn: () => apiRequest<null>("/account", { method: "DELETE" }),
    onSuccess: () => signOut(),
  });
}
