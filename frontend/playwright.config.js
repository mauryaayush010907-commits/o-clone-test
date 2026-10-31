import { defineConfig } from "@playwright/test";

/**
 * E2E tests run against the FULL local stack:
 *   1. docker compose up -d            (redis + mongo)
 *   2. cd backend && npm run dev       (socket.io signaling on :10000)
 *   3. npm run dev                     (vite dev server on :5173, proxies /api + /socket.io)
 *   4. npx playwright install
 *   5. npm run test:e2e
 *
 * NOTE: real video between two browsers is covered by tests/real-video-checklist.md
 * and by the two-tab flow below; headless Chromium can exercise the signaling,
 * matchmaking, text chat, and UI state machine end to end.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173", 
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
