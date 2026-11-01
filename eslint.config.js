const browserGlobals = Object.fromEntries(
  [
    "window", "document", "navigator", "localStorage", "sessionStorage", "location", "history",
    "console", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
    "cancelAnimationFrame", "matchMedia", "getComputedStyle", "performance", "URL", "Blob",
    "File", "FileReader", "Image", "Intl", "CSS", "createImageBitmap", "structuredClone",
    "AbortController", "crypto", "Event", "CustomEvent", "MutationObserver", "ResizeObserver",
    "IntersectionObserver", "Element", "HTMLElement", "Node", "DOMParser", "TextEncoder",
    "TextDecoder", "btoa", "atob", "fetch", "innerWidth", "innerHeight", "alert",
  ].map((name) => [name, "readonly"]),
);

export default [
  {
    files: ["js/**/*.js", "tests/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: browserGlobals },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "after-used", caughtErrors: "none" }],
      "no-redeclare": "error",
      "no-dupe-keys": "error",
      "no-duplicate-imports": "error",
      "no-unreachable": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-shadow-restricted-names": "error",
      "no-self-assign": "error",
      "no-prototype-builtins": "error",
      "no-useless-escape": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
    },
  },
];
