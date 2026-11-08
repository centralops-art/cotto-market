const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Xcode's "Upload Debug Symbols to Sentry" Run Script build phase (added by
// @sentry/react-native/expo) doesn't inherit EAS's build-profile env vars the
// way the Android Gradle task does -- it fails with MODULE_NOT_FOUND trying
// to resolve @sentry/cli in this pnpm monorepo (same underlying pnpm/Sentry
// path-resolution issue as the Android build, just not caught by the
// SENTRY_DISABLE_AUTO_UPLOAD env var there). Xcode script phases source
// .xcode.env at the top of every run, so appending the var there is the
// documented way to actually reach them. Harmless for a beta build: this
// only skips uploading debug symbols/source maps to Sentry's dashboard for
// nicer stack traces, not whether Sentry.init() captures crashes at runtime.
module.exports = function withDisableSentryAutoUpload(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const xcodeEnvPath = path.join(config.modRequest.platformProjectRoot, ".xcode.env");
      if (fs.existsSync(xcodeEnvPath)) {
        const contents = fs.readFileSync(xcodeEnvPath, "utf8");
        if (!contents.includes("SENTRY_DISABLE_AUTO_UPLOAD")) {
          fs.appendFileSync(xcodeEnvPath, "\nexport SENTRY_DISABLE_AUTO_UPLOAD=true\n");
        }
      }
      return config;
    },
  ]);
};
