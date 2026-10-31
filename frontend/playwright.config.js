import { defineConfig } from "@playwright/test";

const host = "localhost";
const port = Number(process.env.E2E_PORT || 5173);
const baseURL = process.env.E2E_BASE_URL || `http://${host}:${port}`;

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
    baseURL,
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
      command: `npm run dev -- --host ${host} --port ${port} --strictPort`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
