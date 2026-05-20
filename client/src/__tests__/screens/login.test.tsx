// Render tests for the login screen.
// The provider modules are too platform-specific to render natively in Node
// (Apple sign-in, Google OAuth flow), so they're mocked — the test just
// verifies the screen wires the right pieces together.

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";

import LoginScreen from "@/app/login";

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// Apple sign-in: never-resolving promise keeps the Apple button hidden in
// the default test AND avoids an "update outside act()" warning that would
// fire when the resolved Promise's then() runs setAppleAvailable.
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(() => new Promise(() => undefined)),
  signInAsync: jest.fn(),
  AppleAuthenticationButton: () => null,
  AppleAuthenticationScope: { EMAIL: "email", FULL_NAME: "name" },
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0 },
}));

// Google OAuth hook returns [request, response, promptAsync].
jest.mock("expo-auth-session/providers/google", () => ({
  useIdTokenAuthRequest: () => [null, null, jest.fn()],
}));

// useAuth hooks — return jest.fn() mutations so we can assert calls. The
// `mock` prefix is jest's allowlist for variables captured by jest.mock
// factories despite their hoisting.
const mockLoginMutate = jest.fn();
const mockRegisterMutate = jest.fn();
const mockSocialMutate = jest.fn();
jest.mock("@/src/hooks/useAuth", () => ({
  useLogin: () => ({ mutate: mockLoginMutate, isPending: false }),
  useRegister: () => ({ mutate: mockRegisterMutate, isPending: false }),
  useSocialSignIn: () => ({ mutate: mockSocialMutate, isPending: false }),
}));

// Default: no Google client IDs configured -> googleConfigured === false.
jest.mock("@/src/lib/config", () => ({
  config: { google: { iosClientId: "", androidClientId: "", webClientId: "" } },
  googleConfigured: false,
}));

// Silence the Alert that fires on form-submit errors.
jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

describe("LoginScreen", () => {
  beforeEach(() => {
    mockLoginMutate.mockReset();
    mockRegisterMutate.mockReset();
    mockSocialMutate.mockReset();
  });

  it('renders email + password fields and a "Sign in" primary button', () => {
    render(<LoginScreen />);
    expect(screen.getByPlaceholderText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    expect(screen.getByText("Sign in")).toBeTruthy();
  });

  it('toggles to register mode when the switch link is tapped', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText(/New here\?/));
    expect(screen.getByText("Create account")).toBeTruthy();
  });

  it("calls useLogin.mutate with the entered credentials", () => {
    render(<LoginScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText("Email"),
      "  Bob@example.com  ",
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Password"),
      "hunter2-long",
    );
    fireEvent.press(screen.getByText("Sign in"));

    expect(mockLoginMutate).toHaveBeenCalledTimes(1);
    const [args] = mockLoginMutate.mock.calls[0];
    // Email is trimmed (lowercase happens on the server).
    expect(args).toEqual({ email: "Bob@example.com", password: "hunter2-long" });
  });

  it("does not call mutate when fields are empty (alerts instead)", () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("Sign in"));
    expect(mockLoginMutate).not.toHaveBeenCalled();
  });
});
