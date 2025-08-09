const fs = require('fs');
const yaml = require('js-yaml');
const { chromium } = require('playwright');

// Load configuration from application.yml
let config;
try {
  config = yaml.load(fs.readFileSync('application.yml', 'utf8'));
} catch (e) {
  console.error("Error reading configuration: ", e);
  process.exit(1);
}

const MNOGO_RU_NUMBER = config.MNOGO_RU_NUMBER;
const PATH_TO_YANDEX_BROWSER = config.PATH_TO_YANDEX_BROWSER;

(async () => {
  const browser = await chromium.launch({
    executablePath: PATH_TO_YANDEX_BROWSER,
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.mnogo.ru/bonusbutton/f64ad9a67e82b0912fed4caf2288fddc.html');
  await page.fill('input[name="fullnumber"]', MNOGO_RU_NUMBER);
  await page.click('input.results_page-form_btn[type="submit"]');
  // Wait for navigation or confirmation as needed
  await page.waitForTimeout(5000);
  await browser.close();
})();
