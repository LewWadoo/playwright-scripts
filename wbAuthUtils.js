const fs = require('fs');

function deleteCacheFile(storageStatePath) {
  if (fs.existsSync(storageStatePath)) {
    fs.unlinkSync(storageStatePath);
    console.log('Deleted cache file:', storageStatePath);
  }
}

async function checkAuthentication(page) {
  // Check for balance element (logged in)
  const balanceExists = await page.locator('a.header__balance--bank').count() > 0;
  if (balanceExists) {
    console.log('Balance element detected - user authenticated');
    return true;
  }
  
  // Check for login button (not logged in)
  const loginButtonExists = await page.locator('button:has-text("Войти")').count() > 0;
  if (loginButtonExists) {
    console.log('Login button detected - user not authenticated');
    return false;
  }
  
  // Wait a bit and check again
  await page.waitForTimeout(2000);
  const balanceExistsAfterWait = await page.locator('a.header__balance--bank').count() > 0;
  if (balanceExistsAfterWait) {
    console.log('Balance element detected after wait - user authenticated');
    return true;
  }
  
  console.log('Authentication status unclear - assuming not authenticated');
  return false;
}

async function waitForManualLogin(page, maxWaitTimeMs = 240000) {
  console.log("Please log in to Wildberries manually in the opened browser tab.");
  
  // Set zoom level to 50% for better visibility on small screens
  await page.evaluate(() => {
    document.body.style.zoom = '0.5';
  });
  
  // Click the login link if it exists to make it clearer what to do
  try {
    // Wait for the page to load first
    await page.waitForTimeout(2000);
    
    const loginLink = page.locator('a.navbar-pc__link.j-main-login');
    const loginLinkCount = await loginLink.count();
    console.log(`Found ${loginLinkCount} login link(s)`);
    
    if (loginLinkCount > 0) {
      console.log('Clicking login link to open login page...');
      await loginLink.first().click({ timeout: 5000 });
      await page.waitForTimeout(2000); // Wait for navigation
      console.log('Login link clicked successfully');
    } else {
      console.warn('Login link not found on page');
    }
  } catch (error) {
    console.warn('Could not click login link:', error.message);
  }
  
  console.log("Waiting for login completion (checking for balance element)...");
  const startTime = Date.now();
  const checkInterval = 2000;
  while (Date.now() - startTime < maxWaitTimeMs) {
    try {
      const balanceExists = await page.locator('a.header__balance--bank').count() > 0;
      if (balanceExists) {
        console.log('Login detected! Balance element appeared.');
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
