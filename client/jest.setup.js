// Global jest setup. Stubs Expo native modules that don't exist in Node so
// importing app code from a test doesn't blow up. Per-test mocking of return
// values is still done inside individual `*.test.ts(x)` files.

// expo-secure-store — backed by the OS keychain on device; here it's an
// in-memory Map that resets between tests via jest.clearAllMocks().
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    setItemAsync: jest.fn(async (k, v) => {
      store.set(k, v);
    }),
    getItemAsync: jest.fn(async (k) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k) => {
      store.delete(k);
    }),
    __resetStore: () => store.clear(),
  };
});
