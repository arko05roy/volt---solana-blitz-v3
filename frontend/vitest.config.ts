import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    server: {
      deps: {
        // Inline these so vitest transforms them (respects the alias above)
        inline: ["@coral-xyz/anchor", "@magicblock-labs/soar-sdk"],
      },
    },
    environmentOptions: {
      // jsdom needs crypto for @solana/web3.js PDA derivation
    },
    // @ts-expect-error -- vitest v3 API, still functional at runtime
    environmentMatchGlobs: [
      ["tests/hooks/**", "node"],
      ["tests/soar/**", "node"],
      ["tests/api/**", "node"],
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force CJS version of anchor — ESM dist has broken .js extension imports in Node 24
      "@coral-xyz/anchor": path.resolve(__dirname, "node_modules/@coral-xyz/anchor/dist/cjs/index.js"),
      "@magicblock-labs/soar-sdk": path.resolve(__dirname, "node_modules/@magicblock-labs/soar-sdk/lib/index.js"),
    },
  },
});
