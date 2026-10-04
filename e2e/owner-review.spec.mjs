import { test, expect } from "@playwright/test";

const routes = ["dashboard", "data", "settings", "imports", "assistant", "reports", "profit"];
async function signIn(page, request, testInfo) {
  const locale = testInfo.project.name.split("-")[0];
  const response = await request.post("http://127.0.0.1:4000/api/auth/register", {
    data: {
      name: "Owner — مالك المطعم — 餐厅所有者",
      email: `review-${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      password: "Browser-review-password-2026",
      organizationName: "Organization with a deliberately long name — مؤسسة المطاعم والفروع — 餐饮连锁管理公司",
      restaurantName: "Restaurant with a deliberately long name — مطعم المذاق — 广州餐厅",
      branchName: "Branch with a deliberately long name — الفرع الرئيسي — 广州中心分店",
      branchCode: "REVIEW",
      language: locale
    }
  });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.addInitScript(
    ({ session, locale }) => {
      localStorage.setItem("token", session.token);
      localStorage.setItem("me", JSON.stringify(session));
      localStorage.setItem("locale", locale);
    },
    { session, locale }
  );
  return locale;
}
async function checkLayout(page, locale) {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(size.scroll, "Page must not scroll horizontally").toBeLessThanOrEqual(size.width + 1);
}

test("owner pages render across language and viewport matrix", async ({ page, request }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const locale = await signIn(page, request, testInfo);
  for (const route of routes) {
    await test.step(route, async () => {
      await page.goto(`/app/${route}`);
      await expect(page.locator(".app-topbar h1")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await checkLayout(page, locale);
      await page.screenshot({ path: testInfo.outputPath(`${route}.png`), fullPage: true });
    });
  }
  expect(errors).toEqual([]);
});

test("keyboard drawer isolation, locale switch and resize cleanup", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.use.viewport.width >= 1024, "Desktop sidebar replaces mobile drawer");
  await signIn(page, request, testInfo);
  await page.goto("/app/settings");
  const opener = page.locator(".app-topbar__menu");
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator(".app-shell__content")).toHaveAttribute("inert", "");
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBeTruthy();
  const language = dialog.locator(".language-switcher select");
  await language.focus();
  await language.selectOption("zh");
  await expect(language).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("drawer-zh.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.locator(".app-shell__content").evaluate((node) => node.inert)).toBeFalsy();
  await opener.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("settings tabs follow locale keyboard direction", async ({ page, request }, testInfo) => {
  const locale = await signIn(page, request, testInfo);
  await page.goto("/app/settings");
  const tabs = page.getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press(locale === "ar" ? "ArrowLeft" : "ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs.first()).toBeFocused();
});

test("login fits narrow and landscape layouts", async ({ page }, testInfo) => {
  const locale = testInfo.project.name.split("-")[0];
  await page.addInitScript((locale) => localStorage.setItem("locale", locale), locale);
  await page.goto("/login");
  await expect(page.locator("input[type=email]")).toBeVisible();
  await checkLayout(page, locale);
  await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
  await page.setViewportSize({ width: 844, height: 390 });
  await checkLayout(page, locale);
  await page.screenshot({ path: testInfo.outputPath("login-landscape.png"), fullPage: true });
});
