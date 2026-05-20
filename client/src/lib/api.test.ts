// Unit tests for the fetch wrapper.
// Verifies the Bearer-attach, 401-refresh-once retry, and signOut on
// refresh failure (see api.ts). Uses global.fetch as the seam; the auth
// store is real (it just talks to the mocked expo-secure-store).

import { useAuthStore } from "../store/auth";
import { ApiError, apiRequest } from "./api";

// Replace global fetch with a per-test mock.
const fetchMock = jest.fn();

beforeAll(() => {
  (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});

beforeEach(async () => {
  fetchMock.mockReset();
  // Reset the auth store to a known empty state.
  await useAuthStore.getState().signOut();
});

function response(
  status: number,
  body: unknown = {},
  ok = status >= 200 && status < 300,
): Response {
  return {
    ok,
    status,
    statusText: `status ${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("apiRequest", () => {
  it("attaches the Bearer access token from the auth store", async () => {
    await useAuthStore.getState().setSession({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
    fetchMock.mockResolvedValueOnce(response(200, { hello: "world" }));

    const body = await apiRequest<{ hello: string }>("/some/path");
    expect(body).toEqual({ hello: "world" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer access-1",
    );
  });

  it("omits the Authorization header when auth:false", async () => {
    await useAuthStore.getState().setSession({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
    fetchMock.mockResolvedValueOnce(response(200, {}));

    await apiRequest("/public", { auth: false });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("returns null for a 204 response", async () => {
    fetchMock.mockResolvedValueOnce(response(204, null));
    const result = await apiRequest<null>("/no-content", { method: "PUT" });
    expect(result).toBeNull();
  });

  it("throws ApiError with the response status on a non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(response(404, { error: "missing" }, false));
    await expect(apiRequest("/missing")).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(response(404, { error: "missing" }, false));
    try {
      await apiRequest("/missing");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(404);
    }
  });

  it("on 401, refreshes once and retries with the new token", async () => {
    await useAuthStore.getState().setSession({
      accessToken: "stale-access",
      refreshToken: "good-refresh",
    });
    // Sequence: 1) original 401, 2) refresh succeeds, 3) retried request OK.
    fetchMock
      .mockResolvedValueOnce(response(401, {}, false))
      .mockResolvedValueOnce(
        response(200, { accessToken: "fresh-access", refreshToken: "fresh-refresh" }),
      )
      .mockResolvedValueOnce(response(200, { data: "after-refresh" }));

    const body = await apiRequest<{ data: string }>("/me");
    expect(body).toEqual({ data: "after-refresh" });

    // The third call uses the fresh access token.
    const retryInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer fresh-access",
    );

    // Auth store now holds the fresh tokens.
    expect(useAuthStore.getState().accessToken).toBe("fresh-access");
    expect(useAuthStore.getState().refreshToken).toBe("fresh-refresh");
  });

  it("on 401 + refresh failure, signs out and throws", async () => {
    await useAuthStore.getState().setSession({
      accessToken: "stale",
      refreshToken: "expired-refresh",
    });
    fetchMock
      .mockResolvedValueOnce(response(401, {}, false))
      .mockResolvedValueOnce(response(401, {}, false)); // refresh also fails

    await expect(apiRequest("/me")).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it("does not attempt refresh when there is no refresh token", async () => {
    fetchMock.mockResolvedValueOnce(response(401, {}, false));
    await expect(apiRequest("/me")).rejects.toBeInstanceOf(ApiError);
    // Only the original request was made — no refresh attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
