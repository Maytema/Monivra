// Expo configuration. The application id differs from the first application's ids
// (app.monivra.finance, app.monivra.finance.dev), so both can be installed side by side and data moves
// by a data file (export in the old app, import here).
import type { ExpoConfig } from "expo/config";

const versionCode = Number(process.env.MONIVRA_VERSION_CODE ?? "1");

const config: ExpoConfig = {
  name: "Monivra",
  slug: "monivra",
  scheme: "monivra",
  version: "0.2.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#FFFAFE",
  android: {
    package: "app.monivra.finance.next",
    versionCode,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-foreground.png",
      monochromeImage: "./assets/adaptive-monochrome.png",
      backgroundColor: "#FFFFFF",
    },
    // INTERNET is used only to ask exchange rate sources; nothing about the person is sent.
    permissions: ["android.permission.INTERNET"],
    blockedPermissions: ["android.permission.RECORD_AUDIO", "android.permission.SYSTEM_ALERT_WINDOW"],
    allowBackup: false,
  },
  ios: {
    bundleIdentifier: "app.monivra.finance.next",
    supportsTablet: false,
  },
  plugins: [
    "expo-router",
    "expo-sqlite",
    "expo-sharing",
    "expo-localization",
    "expo-status-bar",
    "expo-background-task",
    "expo-secure-store",
    ["expo-local-authentication", { faceIDPermission: "Monivra uses Face ID to unlock the app." }],
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#03CAA1" }],
    [
      "expo-splash-screen",
      { image: "./assets/splash-symbol.png", imageWidth: 160, backgroundColor: "#FFFAFE", dark: { backgroundColor: "#121014" } },
    ],
  ],
  experiments: { typedRoutes: false },
};

export default config;
