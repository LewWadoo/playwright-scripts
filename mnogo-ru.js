const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/yandex-browser",
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.mnogo.ru/bonusbutton/f64ad9a67e82b0912fed4caf2288fddc.html');
  await page.fill('input[name="fullnumber"]', '10295623');
  await page.click('input.results_page-form_btn[type="submit"]');
  // Wait for navigation or confirmation as needed
  await page.waitForTimeout(5000);
  await browser.close();
})();
