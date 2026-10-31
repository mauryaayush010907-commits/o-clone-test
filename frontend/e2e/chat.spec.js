/**
 * Browser end-to-end tests (two real browser contexts acting as two strangers).
 * Run with: npm run test:e2e   (see playwright.config.js for the stack recipe)
 */
import { test, expect } from "@playwright/test";

test.describe("Drift E2E", () => {
  test("homepage shows live stats and working navigation", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Meet New People/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Start Video Chat/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Start Text Chat/i }).first()).toBeVisible();
    // live counter comes from /api/stats (real backend numbers)
    await expect(page.getByText(/people online/i)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /Start Text Chat/i }).first().click();
    await expect(page).toHaveURL(/\/text/);
    await ctx.close();
  });

  test("text chat exposes advanced filters before starting a chat", async ({ page }) => {
    await page.goto("/text");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Enter Drift/i }).click();

    const filtersButton = page.getByRole("button", { name: /Open advanced filters/i });
    await expect(filtersButton).toBeVisible();
    await filtersButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Advanced filters" })).toBeVisible();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Male" }).first().click();
    await dialog.getByRole("button", { name: "Apply filters" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/country and gender/i);
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Select country" }).click();
    await dialog.getByRole("option", { name: "India" }).click();
    await dialog.getByRole("button", { name: "Female" }).last().click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("drift-prefs-v1")));
    expect(prefs).toMatchObject({ myCountry: "in", myGender: "female", gender: "male" });
    await expect(filtersButton).toHaveCount(0);

    await page.evaluate(() => localStorage.setItem("drift-prefs-v1", JSON.stringify({
      countries: ["in"],
      languages: ["en"],
      gender: "male",
      myCountry: "in",
      myGender: "female",
    })));
    await page.reload();
    await expect(page.getByRole("button", { name: "Open advanced filters", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open advanced filters \(.* active\)/i })).toHaveCount(0);
  });

  test("advanced filters have a separate row above the chat panel", async ({ page }) => {
    for (const mode of ["text", "video"]) {
      await page.goto(`/${mode}`);

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const button = page.getByRole("button", { name: /Open advanced filters/i });
        await expect(button).toBeVisible();
        const layout = await button.evaluate((element) => {
          const buttonBox = element.getBoundingClientRect();
          const panel = element.parentElement.nextElementSibling;
          const panelBox = panel.getBoundingClientRect();
          return {
            position: getComputedStyle(element).position,
            buttonBottom: buttonBox.bottom,
            panelTop: panelBox.top,
            panelContainsButton: panel.contains(element),
          };
        });
        expect(layout.position).toBe("static");
        expect(layout.buttonBottom).toBeLessThanOrEqual(layout.panelTop);
        expect(layout.panelContainsButton).toBe(false);
      }
    }
  });

  test("two text-mode strangers match and exchange messages", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    for (const page of [a, b]) {
      await page.goto("/text");
      // accept the 18+ age gate
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: /Enter Drift/i }).click();
      await page.getByRole("button", { name: /Start text chat/i }).click();
    }

    // both end up in the "connected" state
    await expect(a.getByText("Connected with a stranger", { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(b.getByText("Connected with a stranger", { exact: false })).toBeVisible({ timeout: 15000 });

    // Whitespace is trimmed for delivery, but the exact draft must still clear.
    await a.locator("textarea").fill("  e2e hello from A  ");
    await expect(b.locator(".typing-dot")).toHaveCount(3);
    await a.getByRole("button", { name: "Send message" }).click();
    await expect(a.locator(".anim-msg").filter({ hasText: "e2e hello from A" })).toHaveCount(1, { timeout: 10000 });
    await expect(b.locator(".anim-msg").filter({ hasText: "e2e hello from A" })).toHaveCount(1, { timeout: 10000 });
    await expect(a.locator("textarea")).toHaveValue("");
    await expect(b.locator(".typing-dot")).toHaveCount(0);

    await a.locator("textarea").fill("draft that will be deleted");
    await expect(b.locator(".typing-dot")).toHaveCount(3);
    await a.locator("textarea").fill("");
    await expect(b.locator(".typing-dot")).toHaveCount(0);

    // B and A both see B's reply exactly once.
    await b.locator("textarea").fill("e2e reply from B");
    await expect(a.locator(".typing-dot")).toHaveCount(3);
    await b.locator("textarea").press("Enter");
    await expect(b.locator(".anim-msg").filter({ hasText: "e2e reply from B" })).toHaveCount(1, { timeout: 10000 });
    await expect(a.locator(".anim-msg").filter({ hasText: "e2e reply from B" })).toHaveCount(1, { timeout: 10000 });
    await expect(b.locator("textarea")).toHaveValue("");
    await expect(a.locator(".typing-dot")).toHaveCount(0);

    // A clicks Next → B sees the end notification, A re-enters the queue
    await a.getByRole("button", { name: /Next stranger/i }).click();
    await expect(b.getByRole("heading", { name: /You ended the conversation|The stranger left/i })).toBeVisible({ timeout: 10000 });
    await expect(a.getByText(/Looking for a text partner/i)).toBeVisible({ timeout: 10000 });

    await ctxA.close();
    await ctxB.close();
  });

  test("two video-mode strangers establish bidirectional video", async ({ browser }) => {
    const ctxA = await browser.newContext({ permissions: ["camera", "microphone"] });
    const ctxB = await browser.newContext({ permissions: ["camera", "microphone"] });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    for (const page of [a, b]) {
      await page.goto("/video");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: /Enter Drift/i }).click();
      await page.getByRole("button", { name: /Start video chat/i }).click();
    }

    await expect(a.getByText("Live", { exact: true })).toBeVisible({ timeout: 25000 });
    await expect(b.getByText("Live", { exact: true })).toBeVisible({ timeout: 25000 });
    for (const page of [a, b]) {
      await expect.poll(async () => page.locator("video").first().evaluate((video) =>
        video.srcObject?.getVideoTracks().some((track) => track.readyState === "live") || false
      ), { timeout: 20000 }).toBe(true);
    }

    await ctxA.close();
    await ctxB.close();
  });

  test("private room host connects and creates a room without socket errors", async ({ page }) => {
    const socketErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /websocket connection/i.test(message.text())) {
        socketErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => socketErrors.push(error.message));

    await page.goto("/private");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Enter Drift/i }).click();
    await page.getByRole("textbox", { name: /Pick a username/i }).fill("roomhost");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("heading", { name: "Create Private Room" }).click();
    await expect(page.getByText("Your room is live")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/^[A-Z]{2}\d{6}$/).first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(socketErrors).toEqual([]);
  });

  test("private room sends chat messages between host and guest and connects peer video", async ({ browser }) => {
    const hostContext = await browser.newContext({ permissions: ["camera", "microphone"] });
    const guestContext = await browser.newContext({ permissions: ["camera", "microphone"] });
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await host.goto("/private");
    await host.getByRole("checkbox").check();
    await host.getByRole("button", { name: /Enter Drift/i }).click();
    await host.getByRole("textbox", { name: /Pick a username/i }).fill("roomhosttest");
    await host.getByRole("button", { name: "Save" }).click();
    await expect(host.getByText("Live", { exact: true })).toBeVisible({ timeout: 10000 });
    await host.getByRole("heading", { name: "Create Private Room" }).click();
    await expect(host.getByText("Your room is live")).toBeVisible();
    const code = await host.locator("header").getByText(/^[A-Z]{2}\d{6}$/).innerText();
    await host.getByRole("button", { name: "Enter room" }).click();
    await expect(host.getByRole("heading", { name: "Room chat" })).toBeVisible();

    await guest.goto("/private");
    await guest.getByRole("checkbox").check();
    await guest.getByRole("button", { name: /Enter Drift/i }).click();
    await guest.getByRole("textbox", { name: /Pick a username/i }).fill("roomguesttest");
    await guest.getByRole("button", { name: "Save" }).click();
    await expect(guest.getByText("Live", { exact: true })).toBeVisible({ timeout: 10000 });
    await guest.getByRole("textbox", { name: /Enter room code/i }).fill(code);
    await guest.getByRole("button", { name: "Request to join" }).click();

    const pendingRequest = host.locator("section").filter({ has: host.getByRole("heading", { name: "Join requests" }) })
      .locator("li").filter({ hasText: "roomguesttest" });
    await expect(pendingRequest).toBeVisible({ timeout: 10000 });
    await pendingRequest.getByRole("button", { name: "Accept" }).click();
    await expect(guest.getByRole("heading", { name: "Room chat" })).toBeVisible({ timeout: 10000 });

    const guestChat = guest.getByPlaceholder("Send a message…");
    await guestChat.fill("hello from the guest");
    await guestChat.press("Enter");
    await expect(host.getByText("hello from the guest")).toBeVisible({ timeout: 10000 });
    await expect(guest.getByText("hello from the guest")).toBeVisible({ timeout: 10000 });

    const hostChat = host.getByPlaceholder("Send a message…");
    await hostChat.fill("hello from the host");
    await hostChat.press("Enter");
    await expect(guest.getByText("hello from the host")).toBeVisible({ timeout: 10000 });

    await expect.poll(async () => guest.locator("video").nth(1).evaluate((video) =>
      video.srcObject?.getVideoTracks().some((track) => track.readyState === "live") || false
    ), { timeout: 20000 }).toBe(true);
    await expect.poll(async () => host.locator("video").nth(1).evaluate((video) =>
      video.srcObject?.getVideoTracks().some((track) => track.readyState === "live") || false
    ), { timeout: 20000 }).toBe(true);

    await host.getByRole("button", { name: "Remove roomguesttest from room" }).click();
    await expect(guest.getByText("You were removed from the room")).toBeVisible({ timeout: 10000 });

    await guestContext.close();
    await hostContext.close();
  });

  test("video page: start → queued state, and stop cleans up", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/video");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Enter Drift/i }).click();
    await page.getByRole("button", { name: /Start video chat/i }).click();
    // fake media devices are enabled in the launch args
    await expect(page.getByText(/Looking for someone/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /Cancel/i }).first().click();
    await expect(page.getByRole("button", { name: /Start video chat/i })).toBeVisible({ timeout: 10000 });
    await ctx.close();
  });

  test("video chat keeps the composer visible when the message history overflows", async ({ page }) => {
    await page.goto("/video");

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const before = await page.evaluate(() => document.documentElement.scrollHeight);
      const layout = await page.locator("aside").evaluate((panel) => {
        const history = panel.querySelector(".nice-scroll");
        const composer = panel.querySelector(".shrink-0.border-t");
        for (let i = 0; i < 300; i++) {
          const message = document.createElement("div");
          message.textContent = `Long conversation message ${i}`;
          message.style.minHeight = "36px";
          history.append(message);
        }
        const historyBox = history.getBoundingClientRect();
        const composerBox = composer.getBoundingClientRect();
        const panelBox = panel.getBoundingClientRect();
        return {
          historyClientHeight: history.clientHeight,
          historyScrollHeight: history.scrollHeight,
          composerTop: composerBox.top,
          composerBottom: composerBox.bottom,
          panelBottom: panelBox.bottom,
          documentHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          historyBottom: historyBox.bottom,
        };
      });

      expect(layout.historyScrollHeight).toBeGreaterThan(layout.historyClientHeight);
      expect(layout.composerTop).toBeGreaterThan(layout.historyBottom - 1);
      expect(layout.composerBottom).toBeLessThanOrEqual(layout.panelBottom);
      expect(layout.documentHeight).toBe(before);
      expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewportHeight);
    }
  });

  test("text chat keeps the composer at the panel bottom when the message history overflows", async ({ page }) => {
    await page.goto("/text");

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.locator("main > div").evaluate((panel) => {
        const history = panel.querySelector(".nice-scroll");
        const composer = panel.querySelector(".shrink-0.border-t");
        const controls = panel.lastElementChild;
        const initialComposerTop = composer.getBoundingClientRect().top;

        for (let i = 0; i < 300; i++) {
          const message = document.createElement("div");
          message.textContent = `Long text chat message ${i}`;
          message.style.minHeight = "36px";
          history.append(message);
        }

        const composerBox = composer.getBoundingClientRect();
        const controlsBox = controls.getBoundingClientRect();
        const panelBox = panel.getBoundingClientRect();
        return {
          historyClientHeight: history.clientHeight,
          historyScrollHeight: history.scrollHeight,
          initialComposerTop,
          composerTop: composerBox.top,
          composerBottom: composerBox.bottom,
          controlsTop: controlsBox.top,
          panelBottom: panelBox.bottom,
          documentHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
        };
      });

      expect(layout.historyScrollHeight).toBeGreaterThan(layout.historyClientHeight);
      expect(layout.composerTop).toBeCloseTo(layout.initialComposerTop, 0);
      expect(layout.composerBottom).toBeLessThanOrEqual(layout.controlsTop);
      expect(layout.panelBottom).toBeLessThanOrEqual(layout.viewportHeight);
      expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewportHeight);
    }
  });

  test("legal pages render and 404 works", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    for (const [path, heading] of [
      ["/privacy", "Privacy Policy"],
      ["/terms", "Terms of Service"],
      ["/guidelines", "Community Guidelines"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await page.goto("/definitely-not-a-page");
    await expect(page.getByText("404")).toBeVisible();
    await ctx.close();
  });
});
