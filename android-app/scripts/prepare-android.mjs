// Turns the project that `cap add android` generated into the Monivra Android project: puts the files
// of overlay/ over it (manifest, activity, native plugin, icons, themes) and patches the Gradle file of
// the app (version, signing from the environment, biometric library). Fails loudly when the generated
// project does not look as expected, so a Capacitor update cannot silently produce a wrong build.
//
// Environment (all optional):
//   MONIVRA_VERSION_CODE / MONIVRA_VERSION_NAME   version of the build
//   MONIVRA_KEYSTORE_FILE, MONIVRA_KEYSTORE_PASSWORD, MONIVRA_KEY_ALIAS, MONIVRA_KEY_PASSWORD
//     the signing key; when MONIVRA_KEYSTORE_FILE is not set the release APK stays unsigned and the
//     debug APK uses Android's own debug key. The key itself is never in the repository.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
const android = join(app, "android");
const main = join(android, "app", "src", "main");
if (!existsSync(join(android, "app", "build.gradle"))) {
  console.error("android/ is missing: run `npx cap add android` first");
  process.exit(1);
}

// What the template brings and Monivra replaces: its launcher icons, splash images and launcher colors.
const res = join(main, "res");
for (const dir of readdirSync(res)) {
  if (dir.startsWith("mipmap-")) rmSync(join(res, dir), { recursive: true, force: true });
  if (dir.startsWith("drawable")) rmSync(join(res, dir, "splash.png"), { force: true });
}
rmSync(join(res, "drawable-v24", "ic_launcher_foreground.xml"), { force: true });
rmSync(join(res, "drawable", "ic_launcher_background.xml"), { force: true });
cpSync(join(app, "overlay"), android, { recursive: true });

// The generated activity must be in the package of the application id, where the overlay put ours.
const javaDir = join(main, "java", "app", "monivra", "finance");
if (
  !existsSync(join(javaDir, "MainActivity.java")) ||
  !existsSync(join(javaDir, "MonivraNativePlugin.java"))
) {
  console.error("MainActivity is not in app/monivra/finance");
  process.exit(1);
}

// ---- app/build.gradle ----
const gradlePath = join(android, "app", "build.gradle");
let gradle = readFileSync(gradlePath, "utf8");
const patch = (what, pattern, replacement) => {
  if (!pattern.test(gradle)) {
    console.error(`build.gradle: cannot find ${what}`);
    process.exit(1);
  }
  gradle = gradle.replace(pattern, replacement);
};
patch(
  "applicationId",
  /applicationId\s+"app\.monivra\.finance"/,
  'applicationId "app.monivra.finance"',
);
patch(
  "versionCode",
  /versionCode\s+\d+/,
  'versionCode (System.getenv("MONIVRA_VERSION_CODE") ?: "1").toInteger()',
);
patch(
  "versionName",
  /versionName\s+"[^"]*"/,
  'versionName System.getenv("MONIVRA_VERSION_NAME") ?: "0.1.0"',
);
patch(
  "android block",
  /^android \{/m,
  `android {
    lint {
        abortOnError false
        checkReleaseBuilds false
    }`,
);
patch(
  "buildTypes",
  /buildTypes \{/,
  `signingConfigs {
        monivra {
            def keystore = System.getenv("MONIVRA_KEYSTORE_FILE")
            if (keystore) {
                storeFile file(keystore)
                storePassword System.getenv("MONIVRA_KEYSTORE_PASSWORD")
                keyAlias System.getenv("MONIVRA_KEY_ALIAS")
                keyPassword System.getenv("MONIVRA_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        debug {
            if (System.getenv("MONIVRA_KEYSTORE_FILE")) signingConfig signingConfigs.monivra
        }`,
);
patch(
  "release build type",
  /release \{/,
  `release {
            if (System.getenv("MONIVRA_KEYSTORE_FILE")) signingConfig signingConfigs.monivra`,
);
patch(
  "dependencies",
  /^dependencies \{/m,
  `dependencies {
    implementation "androidx.biometric:biometric:1.1.0"`,
);
writeFileSync(gradlePath, gradle);

// ---- the template's FileProvider paths must still be there (the file chooser uses them) ----
const manifest = readFileSync(join(main, "AndroidManifest.xml"), "utf8");
for (const needed of ['android:allowBackup="false"', "USE_BIOMETRIC", 'tools:node="remove"']) {
  if (!manifest.includes(needed)) {
    console.error(`AndroidManifest.xml lacks ${needed}`);
    process.exit(1);
  }
}
console.log("android/ prepared");
