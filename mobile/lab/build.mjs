import { build } from "/opt/npm-tools/node_modules/esbuild/lib/main.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const R = (f) => join(here, f);
// The sources to build: the ones next to the lab, or SRC=<path to another src>.
const SRC = process.env.SRC ?? join(here, "../src");
const own = { "react-native": "rn-stub.jsx", "react-native-pager-view": "pagerview-stub.jsx", "@shopify/flash-list": "flash-stub.jsx", "expo-router": "router-stub.js", "react-native-reanimated": "reanimated-stub.jsx" };
const keep = new Set(["react", "react-dom", "react/jsx-runtime", "react-dom/client", "scheduler"]);
// The names every stubbed package is asked for, found in the sources: each becomes a harmless export.
import { readdirSync, readFileSync, statSync } from "node:fs";
const wanted = new Map();
const scan = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) scan(p);
    else if (/\.tsx?$/.test(f)) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?(?:\*\s+as\s+(\w+))?\s*from\s*"([^".][^"]*)"/g)) {
        const set = wanted.get(m[4]) ?? wanted.set(m[4], new Set()).get(m[4]);
        for (const n of (m[2] ?? "").split(",")) { const name = n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]; if (name && !/^type\s/.test(n.trim())) set.add(name); }
      }
    }
  }
};
scan(SRC);
const stubFor = (pkg) => `const make = () => new Proxy(function () { return make(); }, { get: (t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => "" : make()), apply: () => make(), construct: () => make() });
${[...(wanted.get(pkg) ?? [])].filter((n) => /^[A-Za-z_$][\w$]*$/.test(n)).map((n) => `export const ${n} = make();`).join("\n")}
export default make();`;
const plugin = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      if (a.kind === "entry-point") return null;
      if (a.path.startsWith("@src/")) return { path: join(SRC, a.path.slice(5)) };
      if (a.path.startsWith(".") || a.path.startsWith("/")) {
        if (/platform\/app-store\.ts$/.test(a.path)) return { path: R("store-stub.js") };
        return null;
      }
      if (own[a.path]) return { path: R(own[a.path]) };
      if (keep.has(a.path)) return null;
      return { path: a.path, namespace: "stub" };
    });
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubFor(a.path), loader: "js" }));
  },
};
await build({
  entryPoints: [R("entry.jsx")], bundle: true, outfile: R("out/app.js"), format: "iife", platform: "browser", jsx: "automatic", logLevel: "warning",
  loader: { ".ts": "ts", ".tsx": "tsx", ".json": "json" }, define: { "process.env.EXPO_PUBLIC_PERF": '"1"', "process.env.NODE_ENV": '"production"', __DEV__: "false" },
  plugins: [plugin], nodePaths: ["/opt/npm-tools/node_modules"],
});
console.log("built");
