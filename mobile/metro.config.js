// Metro: the defaults of Expo, and in the speed-check build (EXPO_PUBLIC_PERF=1, the emulator leg of CI) the names of functions are kept, so that
// the profile of the engine (platform/perf.ts, toggleProfile) can be read. The builds for phones are minified as before.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
if (process.env.EXPO_PUBLIC_PERF === "1") {
  config.transformer = { ...config.transformer, minifierConfig: { ...config.transformer.minifierConfig, keep_fnames: true, mangle: { keep_fnames: true } } };
}
module.exports = config;
