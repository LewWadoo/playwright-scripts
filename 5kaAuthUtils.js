const fs = require('fs');

function deleteCacheFile(storageStatePath) {
  if (fs.existsSync(storageStatePath)) {
    fs.unlinkSync(storageStatePath);
    console.log('Deleted cache file:', storageStatePath);
  }
}

async function checkAuthentication(page) {
  try {
    // Wait for page to be stable after any redirects
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
    
    // Check for loyalty points element (logged in)
    const loyaltyPointsExists = await page.locator('[data-qa="loyalty-points-value"]').count() > 0;
    if (loyaltyPointsExists) {
      console.log('Loyalty points detected - user authenticated');
      return true;
    }
    
    // Check for login button (not logged in)
    const loginButtonExists = await page.locator('a[href*="auth/realms"], button:has-text("Войти")').count() > 0;
    if (loginButtonExists) {
      console.log('Login button detected - user not authenticated');
      return false;
    }
    
    // Wait a bit and check again
    await page.waitForTimeout(2000);
    const loyaltyPointsExistsAfterWait = await page.locator('[data-qa="loyalty-points-value"]').count() > 0;
    if (loyaltyPointsExistsAfterWait) {
      console.log('Loyalty points detected after wait - user authenticated');
      return true;
    }
    
    console.log('Authentication status unclear - assuming not authenticated');
    return false;
  } catch (error) {
    console.log('Error checking authentication:', error.message);
    return false;
  }
}

async function waitForManualLogin(page, maxWaitTimeMs = 240000) {
  console.log("Please log in to 5ka manually in the opened browser tab.");
  console.log("Waiting for login completion (checking for loyalty points)...");
  const startTime = Date.now();
  const checkInterval = 2000;
  
  while (Date.now() - startTime < maxWaitTimeMs) {
    try {
      const loyaltyPointsExists = await page.locator('[data-qa="loyalty-points-value"]').count() > 0;
      if (loyaltyPointsExists) {
        console.log('Login detected! Loyalty points appeared.');
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
