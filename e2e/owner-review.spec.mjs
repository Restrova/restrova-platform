import { test, expect } from "@playwright/test";

const routes = [
  "dashboard",
  "data",
  "settings",
  "imports",
  "assistant",
  "reports",
  "profit",
  "today",
  "branches",
  "team",
  "menu-profitability",
  "sales-comparison",
  "alerts",
  "recommendations",
  "forecasts",
  "integrations",
  "workspace"
];
async function signIn(page, request, testInfo, { populate = false } = {}) {
  const language = testInfo.project.name.split("-")[0];
  const locale = language === "zh" ? "zh-CN" : language;
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
  if (populate) {
    const headers = { Authorization: `Bearer ${session.token}` };
    const overview = await request.get(
      `http://127.0.0.1:4000/api/experience/overview?branchId=${session.branches[0].id}`,
      { headers }
    );
    expect(overview.ok()).toBeTruthy();
    const { date } = await overview.json();
    const saved = await request.post("http://127.0.0.1:4000/api/experience/daily", {
      headers,
      data: {
        branchId: session.branches[0].id,
        date,
        sales: "9999999999.99",
        orders: 9999999,
        costs: "8888888888.88",
        waste: "7777777777.77"
      }
    });
    expect(saved.ok()).toBeTruthy();
  }
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
  const main = page.locator("#main-content");
  if (await main.count()) {
    const size = await main.evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }));
    expect(size.scroll, "Main content must not clip horizontally").toBeLessThanOrEqual(size.width + 1);
  }
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
      if (route === "settings") {
        await expect(page.locator(".settings-facts")).toContainText("CNY");
        await expect(page.locator(".settings-facts")).toContainText("Asia/Shanghai");
      }
      if (route === "branches") {
        const name = page.locator(".management-list-item__title strong").first();
        const width = await name.evaluate((node) => node.getBoundingClientRect().width);
        expect(width, "Long branch names need usable reading width").toBeGreaterThan(100);
      }
      if (route === "forecasts" || route === "sales-comparison") {
        for (const table of await page.locator(".operations-table").all()) {
          expect(await table.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(600);
        }
      }
      if (route === "team") {
        const status = page.locator(".ui-card__header .ui-badge").last();
        expect(await status.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(80);
      }
      if (route === "workspace" && locale === "zh-CN") {
        await expect(page.getByRole("button", { name: "分析我导入的数据", exact: true })).toBeVisible();
      }
      if (route === "imports") {
        await expect(page.locator(".import-page__header h1")).toHaveText(
          locale === "ar" ? "استيراد بيانات المطعم" : locale === "zh-CN" ? "导入餐厅数据" : "Import restaurant data"
        );
      }
      await page.screenshot({
        scale: "css",
        type: "jpeg",
        quality: 85,
        path: testInfo.outputPath(`${route}.jpg`),
        fullPage: true
      });
      const main = page.locator("#main-content");
      const height = await main.evaluate((node) => ({ viewport: node.clientHeight, total: node.scrollHeight }));
      for (
        let offset = height.viewport, frame = 1;
        offset < height.total && frame <= 8;
        offset += height.viewport, frame++
      ) {
        await main.evaluate((node, offset) => {
          node.scrollTop = offset;
        }, offset);
        await page.screenshot({
          scale: "css",
          type: "jpeg",
          quality: 85,
          path: testInfo.outputPath(`${route}-scroll-${frame}.jpg`),
          fullPage: true
        });
      }
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
  await language.selectOption("zh-CN");
  await expect(language).toBeFocused();
  await page.screenshot({
    scale: "css",
    type: "jpeg",
    quality: 85,
    path: testInfo.outputPath("drawer-zh.jpg"),
    fullPage: true
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.locator(".app-shell__content").evaluate((node) => node.inert)).toBeFalsy();
  await opener.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".mobile-drawer")).toHaveCount(0);
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
  const language = testInfo.project.name.split("-")[0];
  const locale = language === "zh" ? "zh-CN" : language;
  await page.addInitScript((locale) => localStorage.setItem("locale", locale), locale);
  await page.goto("/login");
  await expect(page.locator("input[type=email]")).toBeVisible();
  await checkLayout(page, locale);
  await page.screenshot({
    scale: "css",
    type: "jpeg",
    quality: 85,
    path: testInfo.outputPath("login.jpg"),
    fullPage: true
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await checkLayout(page, locale);
  await page.screenshot({
    scale: "css",
    type: "jpeg",
    quality: 85,
    path: testInfo.outputPath("login-landscape.jpg"),
    fullPage: true
  });
});

test("large amounts reflow and API failures remain usable", async ({ page, request }, testInfo) => {
  const locale = await signIn(page, request, testInfo, { populate: true });
  await page.goto("/app/dashboard");
  await expect(page.locator(".simple-kpi")).toHaveCount(3);
  for (const value of await page.locator(".simple-kpi strong").all()) {
    expect(
      await value.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      "Large KPI value must fit without clipping"
    ).toBeTruthy();
  }
  await checkLayout(page, locale);
  await page.screenshot({
    scale: "css",
    type: "jpeg",
    quality: 85,
    path: testInfo.outputPath("large-amounts.jpg"),
    fullPage: true
  });
  await page.setViewportSize({ width: 720, height: 450 });
  await checkLayout(page, locale);
  await page.screenshot({
    scale: "css",
    type: "jpeg",
    quality: 85,
    path: testInfo.outputPath("reflow-720.jpg"),
    fullPage: true
  });
  await page.route("**/api/experience/overview*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Review fixture: unavailable" })
    })
  );
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await checkLayout(page, locale);
  await page.screenshot({
    scale: "css",
    type: "jpeg",
    quality: 85,
    path: testInfo.outputPath("api-failure.jpg"),
    fullPage: true
  });
  await page.unroute("**/api/experience/overview*");
  await page.getByRole("alert").locator("..").getByRole("button").click();
  await expect(page.locator(".simple-kpi")).toHaveCount(3);
});

test("localized staged import validates and confirms real CSV data", async ({ page, request }, testInfo) => {
  const locale = await signIn(page, request, testInfo);
  const copy = {
    ar: {
      upload: "تحليل الملف وتقييمه",
      validation: "نتائج التحقق",
      confirm: "تأكيد الاستيراد",
      complete: "اكتمل الاستيراد"
    },
    en: {
      upload: "Analyze and evaluate file",
      validation: "Validation results",
      confirm: "Confirm import",
      complete: "Import completed"
    },
    "zh-CN": { upload: "分析并评估文件", validation: "验证结果", confirm: "确认导入", complete: "导入完成" }
  }[locale];
  await page.goto("/app/imports");
  await expect(page.getByRole("button", { name: copy.upload })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "branches.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("branch_code,name,city\nREVIEW,Reviewed branch — فرع المراجعة — 审核分店,Guangzhou\n")
  });
  await page.getByRole("button", { name: copy.upload }).click();
  await expect(page.getByRole("heading", { name: copy.validation })).toBeVisible();
  await checkLayout(page, locale);
  await page.getByRole("button", { name: copy.confirm, exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    scale: "css",
    type: "jpeg",
    quality: 85,
    path: testInfo.outputPath("import-confirm.jpg"),
    fullPage: true
  });
  await page.getByRole("button", { name: copy.confirm, exact: true }).click();
  await expect(page.getByRole("heading", { name: copy.complete })).toBeVisible();
  await checkLayout(page, locale);
  await page.screenshot({
    scale: "css",
    type: "jpeg",
    quality: 85,
    path: testInfo.outputPath("import-complete.jpg"),
    fullPage: true
  });
});
