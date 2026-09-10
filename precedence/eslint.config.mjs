import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // `vercel build` writes a compiled copy of the whole app here, minified vendor chunks and
    // Next's own launcher shims included. Linting a build artefact reports thousands of problems
    // about code nobody wrote, which is enough noise to hide a real one.
    ".vercel/**",
  ]),
  {
    rules: {
      // The codebase already marks a deliberately-unused parameter with a leading underscore —
      // interface implementations and test doubles are full of them. Without this the convention
      // produces a warning per occurrence, and thirty warnings nobody can act on is how a real
      // one gets missed.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
