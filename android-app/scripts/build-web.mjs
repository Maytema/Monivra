// Copies the web application into www/, the folder the Android shell packs into the APK. The web
// application is not changed or bundled: the files are the ones the website serves, so the APK runs
// the same code, from the device, without the network. Only what the application loads is copied
// (not tests, docs, the screen catalogue or the browser's service worker, which the APK does not use).
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const out = resolve(here, "..", "www");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const name of ["index.html", "css", "js", "assets"]) {
  cpSync(join(root, name), join(out, name), { recursive: true });
}

// The shell starts the application through its own entry, which asks the system for the data first.
const indexPath = join(out, "index.html");
const original = readFileSync(indexPath, "utf8");
const entry = 'src="js/app/main.js"';
if (!original.includes(entry)) {
  console.error("index.html does not load js/app/main.js");
  process.exit(1);
}
writeFileSync(indexPath, original.replace(entry, 'src="js/app/main-native.js"'));

// Everything the page loads must be in the copy: check the files index.html names.
const html = readFileSync(join(out, "index.html"), "utf8");
const wanted = [...html.matchAll(/(?:href|src)="([^"#?]+)"/g)].map((m) => m[1]);
const missing = wanted.filter((file) => !existsSync(join(out, file)));
if (missing.length) {
  console.error("Missing in www:", missing.join(", "));
  process.exit(1);
}

let files = 0;
let bytes = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else {
      files++;
      bytes += statSync(path).size;
    }
  }
};
walk(out);
console.log(`www ready: ${files} files, ${(bytes / 1024).toFixed(0)} KiB`);

// The shipped app must hold no sample-data generator that could replace a person's data.
for (const file of readdirSync(join(out, "js"), { recursive: true })) {
  const full = join(out, "js", String(file));
  if (statSync(full).isFile() && /createSampleData|sample-data|Replace with sample data/.test(readFileSync(full, "utf8"))) {
    console.error(`${file} contains the sample-data feature`);
    process.exit(1);
  }
}
