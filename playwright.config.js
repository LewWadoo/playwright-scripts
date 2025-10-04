// Playwright global configuration file
// See: https://playwright.dev/docs/test-configuration#global-configuration

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  timeout: 60000, // 1 minute for each test (if using @playwright/test)
  use: {
    navigationTimeout: 60000, // 1 minute for navigation
    actionTimeout: 60000,     // 1 minute for actions (click, fill, etc)
  },
};

module.exports = config;
