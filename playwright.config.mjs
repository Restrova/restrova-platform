import { defineConfig } from "@playwright/test";

const widths = [320, 390, 768, 1024, 1440];
export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  maxFailures: 8,
  expect: { timeout: 10000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    ...["ar", "en", "zh"].flatMap((language) =>
      widths.map((width) => ({
        name: `${language}-${width}`,
        use: {
          browserName: "chromium",
          locale: language === "zh" ? "zh-CN" : language,
          viewport: { width, height: width < 768 ? 844 : 900 }
        }
      }))
    ),
    ...["ar", "en", "zh"].map((language) => ({
      name: `${language}-webkit-touch`,
      use: {
        browserName: "webkit",
        locale: language === "zh" ? "zh-CN" : language,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3
      }
    }))
  ],
  webServer: [
    { command: "node e2e/server.mjs", url: "http://127.0.0.1:4000/api/health", reuseExistingServer: false },
    {
      command: "pnpm --filter web exec vite --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false
    }
  ]
});
