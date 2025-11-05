const fs = require('fs');

function deleteCacheFile(storageStatePath) {
  if (fs.existsSync(storageStatePath)) {
    fs.unlinkSync(storageStatePath);
    console.log('Deleted cache file:', storageStatePath);
  }
}

async function checkAuthentication(page) {
  // Check if profile text is visible (logged in)
  const profileText = page.locator('[data-testid="testid-auth-profile-text"]');
  const profileTextCount = await profileText.count();
  
  if (profileTextCount > 0) {
    const isVisible = await profileText.isVisible();
    if (isVisible) {
      console.log('Profile text is visible - user authenticated');
      return true;
    }
  }
  
  // Check if login text is visible (not logged in)
  const loginText = page.locator('[data-testid="testid-auth-login-text"]');
  const loginTextCount = await loginText.count();
  
  if (loginTextCount > 0) {
    const isVisible = await loginText.isVisible();
    if (isVisible) {
      console.log('Login text is visible - user not authenticated');
      return false;
    }
  }
  
  // Wait a bit and check again
  await page.waitForTimeout(2000);
  
  const profileTextAfterWait = await page.locator('[data-testid="testid-auth-profile-text"]').count();
  if (profileTextAfterWait > 0) {
    const isVisibleAfterWait = await page.locator('[data-testid="testid-auth-profile-text"]').isVisible();
    if (isVisibleAfterWait) {
      console.log('Profile text is visible after wait - user authenticated');
      return true;
    }
  }
  
  console.log('Authentication status unclear - assuming not authenticated');
  return false;
}

async function waitForManualLogin(page, maxWaitTimeMs = 240000) {
  console.log("Please log in to Dixy manually in the opened browser tab.");
  
  // Set zoom level to 50% for better visibility on small screens
  await page.evaluate(() => {
    document.body.style.zoom = '0.5';
  });
  
  // Click the login button if login text is visible
  try {
    // Wait for the page to load first
    await page.waitForTimeout(2000);
    
    const loginButton = page.locator('[data-testid="testid-auth-login-button"]');
    const loginButtonCount = await loginButton.count();
    console.log(`Found ${loginButtonCount} login button(s)`);
    
    if (loginButtonCount > 0) {
      // Check if login text is visible (means not logged in)
      const loginText = page.locator('[data-testid="testid-auth-login-text"]');
      const isLoginTextVisible = await loginText.isVisible().catch(() => false);
      
      if (isLoginTextVisible) {
        console.log('Clicking login button to open login form...');
        await loginButton.first().click({ timeout: 5000 });
        await page.waitForTimeout(2000); // Wait for form to appear
        console.log('Login button clicked successfully');
      }
    } else {
      console.warn('Login button not found on page');
    }
  } catch (error) {
    console.warn('Could not click login button:', error.message);
  }
  
  console.log("Waiting for login completion (checking for profile text to become visible)...");
  const startTime = Date.now();
  const checkInterval = 2000;
  while (Date.now() - startTime < maxWaitTimeMs) {
    try {
      // Check if profile text is visible (indicates successful login)
      const profileText = page.locator('[data-testid="testid-auth-profile-text"]');
      const isVisible = await profileText.isVisible().catch(() => false);
      
      if (isVisible) {
        console.log('Login detected! Profile text is now visible.');
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
