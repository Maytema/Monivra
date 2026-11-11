// Checks the direction of dependencies between the layers of src/ and that no file imports itself in a
// cycle. A layer may import only the layers listed for it; the rule is the architecture of
// docs/architecture (domain is pure; data, services and application never import screens).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ALLOWED = {
  domain: ["domain"],
  i18n: ["i18n"],
  data: ["domain", "data"],
  services: ["domain", "services"],
  application: ["domain", "data", "services", "i18n", "application"],
  platform: ["domain", "data", "services", "application", "i18n", "platform"],
  ui: ["domain", "i18n", "application", "platform", "ui"],
  features: ["domain", "i18n", "services", "application", "platform", "ui", "features"],
  app: ["domain", "i18n", "services", "application", "platform", "ui", "features", "app"],
};
const FOREIGN = {
  // Pure layers know no framework.
  domain: /^(react|react-native|expo|@react-navigation|node:)/,
  data: /^(react|react-native|expo-router|@react-navigation)/,
  services: /^(react|react-native|expo|@react-navigation)/,
  application: /^(react|react-native|expo-router|@react-navigation)/,
};

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name)) files.push(path);
  }
})(root);

const problems = [];
const graph = new Map();
for (const file of files) {
  const layer = relative(root, file).split(/[\\/]/)[0];
  const rule = ALLOWED[layer];
  const text = readFileSync(file, "utf8");
  const deps = [];
  for (const match of text.matchAll(/(?:import|export)\s[^"']*?from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g)) {
    const spec = match[1] ?? match[2];
    if (spec.startsWith(".")) {
      const target = resolve(dirname(file), spec);
      const targetLayer = relative(root, target).split(/[\\/]/)[0];
      deps.push(target);
      if (rule && ALLOWED[targetLayer] && !rule.includes(targetLayer))
        problems.push(`${relative(root, file)}: layer "${layer}" must not import layer "${targetLayer}" (${spec})`);
    } else if (FOREIGN[layer]?.test(spec)) problems.push(`${relative(root, file)}: layer "${layer}" must not import "${spec}"`);
  }
  graph.set(resolve(file), deps);
}
// Cycles between files.
const state = new Map();
const stack = [];
function visit(node) {
  if (state.get(node) === 2) return;
  if (state.get(node) === 1) {
    problems.push("import cycle: " + [...stack.slice(stack.indexOf(node)), node].map((f) => relative(root, f)).join(" -> "));
    return;
  }
  state.set(node, 1);
  stack.push(node);
  for (const dep of graph.get(node) ?? []) if (graph.has(dep)) visit(dep);
  stack.pop();
  state.set(node, 2);
}
for (const node of graph.keys()) visit(node);

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s) with the structure of src/`);
  process.exit(1);
}
console.log(`structure of src/ is in order (${files.length} files)`);
