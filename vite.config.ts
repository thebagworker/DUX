import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Buffer/process polyfills required by @solana/web3.js + wallet adapters
    nodePolyfills({ globals: { Buffer: true, process: true } }),
  ],
  server: { port: 5173 },
});
