const fs = require('fs');

function deleteCacheFile(storageStatePath) {
  if (fs.existsSync(storageStatePath)) {
    fs.unlinkSync(storageStatePath);
    console.log('Deleted cache file:', storageStatePath);
  }
}

async function checkAuthentication(page) {
  // Check for login form (content-card with Log in heading)
  const loginFormExists = await page.locator('.content-card.first-screen-content .card-page-title, .content-card.first-screen-content [role="heading"]').filter({ hasText: /Log in|Вход/i }).count() > 0;
  if (loginFormExists) {
    console.log('Login form detected - user not authenticated');
    return false;
  }
  // Check for top login button
  const loginButtonExists = await page.locator('#toLoginPage').count() > 0;
  if (loginButtonExists) {
    console.log('Top login button detected - user not authenticated');
    return false;
  }
  // Check for dashboard/account icon (logged in)
  const dashboardIconExists = await page.locator('a[href*="/my/dashboard"] .header-account-icon').count() > 0;
  if (dashboardIconExists) {
    console.log('Dashboard/account icon detected - user authenticated');
    return true;
  }
  // Wait a bit and check again
  await page.waitForTimeout(2000);
  const dashboardIconExistsAfterWait = await page.locator('a[href*="/my/dashboard"] .header-account-icon').count() > 0;
  if (dashboardIconExistsAfterWait) {
    console.log('Dashboard/account icon detected after wait - user authenticated');
    return true;
  }
  console.log('Authentication status unclear - assuming not authenticated');
  return false;
}

async function waitForManualLogin(page, maxWaitTimeMs = 240000) {
  console.log("Please log in to Binance manually in the opened browser tab.");
  console.log("Waiting for login completion (checking for dashboard/account icon)...");
  const startTime = Date.now();
  const checkInterval = 2000;
  while (Date.now() - startTime < maxWaitTimeMs) {
    try {
      const dashboardIconExists = await page.locator('a[href*="/my/dashboard"] .header-account-icon').count() > 0;
      if (dashboardIconExists) {
        console.log('Login detected! Dashboard/account icon appeared.');
        return true;
      }
      await page.waitForTimeout(checkInterval);
    } catch (error) {
      await page.waitForTimeout(checkInterval);
    }
  }
  console.log('Login timeout reached. Manual login was not completed in time.');
  return false;
}

module.exports = {
  deleteCacheFile,
  checkAuthentication,
  waitForManualLogin,
};
