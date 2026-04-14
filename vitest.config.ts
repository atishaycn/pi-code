import * as path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@t3tools\/contracts$/,
        replacement: path.resolve(import.meta.dirname, "./packages/contracts/src/index.ts"),
      },
    ],
  },
  test: {
    exclude: [...configDefaults.exclude, "**/*.browser.test.ts", "**/*.browser.test.tsx"],
  },
});
