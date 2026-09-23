// Dynamic app config. Expo passes in app.json as `config`; everything static
// stays there. This file does two build-time jobs app.json can't:
//
// 1. Firebase config files are gitignored, so EAS builds (which package the
//    project from git) don't have them. They're stored as EAS "file"
//    environment variables instead, and EAS exposes each as a path.
//
// 2. EXPO_PUBLIC_API_URL is inlined into the JS bundle at build time and can't be
// changed after a build ships. A leftover LAN or http:// URL would produce an
// app that installs fine and then fails every request (release builds block
// cleartext HTTP), so any build that isn't a dev client must point at HTTPS.

module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE; // set by `eas build`
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

  if (profile && profile !== 'development' && !apiUrl.startsWith('https://')) {
    throw new Error(
      `EAS build profile "${profile}" needs EXPO_PUBLIC_API_URL to be an ` +
        `https:// URL, got "${apiUrl || '(unset)'}". Set it for this ` +
        'environment with `eas env:create` (see RELEASE.md).',
    );
  }

  // Fall back to the local files app.json already names, for dev builds.
  if (process.env.GOOGLE_SERVICES_JSON) {
    config.android.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  }
  if (process.env.GOOGLE_SERVICE_INFO_PLIST) {
    config.ios.googleServicesFile = process.env.GOOGLE_SERVICE_INFO_PLIST;
  }

  return config;
};
