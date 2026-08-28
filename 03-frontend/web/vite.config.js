import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:4000" },
    // Allow the sandbox preview proxy host (added for remote preview, not required locally)
    allowedHosts: [".e2b.app"]
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/tests/setup.js"
  }
});
