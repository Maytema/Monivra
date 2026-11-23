// Expo configuration. The application id differs from the first application's ids
// (app.monivra.finance, app.monivra.finance.dev), so both can be installed side by side and data moves
// by a data file (export in the old app, import here).
import type { ExpoConfig } from "expo/config";

// The version is written once, in package.json.
const { version } = require("./package.json") as { version: string };
const versionCode = Number(process.env.MONIVRA_VERSION_CODE ?? "1");

const config: ExpoConfig = {
  name: "Monivra",
  slug: "monivra",
  scheme: "monivra",
  version,
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
    // WorkManager (background posting) creates its Room database by reflection; keep what it needs
    // when the release build is shrunk (without this the app stopped at start: WorkDatabase_Impl.<init>).
    [
      "expo-build-properties",
      {
        android: {
          // R8 shrinks and obfuscates the code and the resources of the release build.
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          // What is reached by reflection or from native code, which R8 cannot see: WorkManager's Room database (the app
          // stopped at start without it: WorkDatabase_Impl.<init>), Reanimated and worklets (native code calls their Java
          // classes by name), expo-sqlite, expo-notifications, expo-task-manager and expo-background-task (modules found by
          // name and tasks started by WorkManager), the JNI helpers and Hermes.
          extraProguardRules: [
            "-keep class * extends androidx.room.RoomDatabase { <init>(); }",
            "-keep class androidx.work.impl.WorkDatabase_Impl { *; }",
            "-keep class androidx.work.** { *; }",
            "-keep class com.swmansion.reanimated.** { *; }",
            "-keep class com.swmansion.worklets.** { *; }",
            "-keep class com.facebook.jni.** { *; }",
            "-keep class com.facebook.hermes.** { *; }",
            "-keep class expo.modules.sqlite.** { *; }",
            "-keep class expo.modules.notifications.** { *; }",
            "-keep class expo.modules.taskManager.** { *; }",
            "-keep class expo.modules.backgroundtask.** { *; }",
            "-keep class expo.modules.interfaces.taskManager.** { *; }",
            "-dontwarn com.swmansion.**",
          ].join("\n"),
        },
      },
    ],
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
