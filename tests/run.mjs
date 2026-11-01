// Runs the in-page checks in a headless browser: node tests/run.mjs
import { chromium } from "playwright";
import { serveApp } from "./server.mjs";

const { server, address } = await serveApp();
const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.goto(`${address}/index.html`);
const results = await page.evaluate(async () => (await import("/tests/index.js")).runChecks());
await browser.close();
server.close();

const failed = results.filter((result) => !result.pass);
for (const { name, error } of failed) console.error(`FAIL ${name}: ${error}`);
for (const message of pageErrors) console.error(`PAGE ERROR ${message}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length || pageErrors.length ? 1 : 0);
