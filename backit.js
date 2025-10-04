const { chromium } = require('playwright');
const config = require('./playwright.config'); // Import Playwright settings
const fs = require('fs');
const { exec } = require('child_process');
const yaml = require('js-yaml');

const storageStatePath = 'cache/backitStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger';
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:cashback:backit:confirmed"`;

// Load configuration from YAML file
function loadConfig() {
  try {
    const fileContents = fs.readFileSync('./application.yml', 'utf8');
    return yaml.load(fileContents);
  } catch (error) {
    console.error('Error loading application.yml:', error.message);
    return {};
  }
}

const appConfig = loadConfig();

function getLedgerBalance() {
  return new Promise((resolve, reject) => {
    exec(ledgerCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing ledger command: ${stderr || error.message}`);
        reject(error);
        return;
      }
      // Match a number with optional decimal
      const m = stdout.match(/([+-]?\d+(?:\.\d+)?)/);
      if (m) {
        const num = parseFloat(m[1]);
        if (Number.isFinite(num)) {
          resolve(num);
          return;
        }
      }
      console.error('No valid number found in ledger output.');
      reject(new Error('No valid number found'));
    });
  });
}

async function checkAuthentication(page) {
  try {
    // Check if we're on the auth page (not authenticated)
    const currentUrl = page.url();
    if (currentUrl.includes('/app-auth/')) {
      console.log('On authentication page - user not authenticated');
      return false;
    }

    // Check if we're already logged in by looking for the user card
    const userCardExists = await page.locator('.mu-user-card__name').count() > 0;
    if (userCardExists) {
      const emailElement = await page.$('.mu-user-card__name');
      const email = await emailElement.textContent();
      console.log(`Already authenticated as: ${email.trim()}`);
      return true;
    }

    // Check if login button exists (not logged in)
    const loginButtonExists = await page.locator('.mu-auth__login-btn').count() > 0;
    if (loginButtonExists) {
      console.log('Login button found - user not authenticated');
      return false;
    }

    // Wait a bit more and try again
    await page.waitForTimeout(3000);
    const userCardExistsAfterWait = await page.locator('.mu-user-card__name').count() > 0;
    if (userCardExistsAfterWait) {
      const emailElement = await page.$('.mu-user-card__name');
      const email = await emailElement.textContent();
      console.log(`Authenticated as: ${email.trim()}`);
      return true;
    }

    console.log('Authentication status unclear - assuming not authenticated');
    return false;
  } catch (error) {
    console.log('Authentication check failed:', error.message);
    return false;
  }
}

function deleteCacheFile() {
  if (fs.existsSync(storageStatePath)) {
    fs.unlinkSync(storageStatePath);
    console.log('Deleted cache file:', storageStatePath);
  }
}

async function handleLoginModal(page) {
  try {
    const currentUrl = page.url();
    
    // Check if we're already on the auth page
    if (currentUrl.includes('/app-auth/')) {
      console.log('On direct authentication page, filling credentials...');
    } else {
      console.log('Attempting to open login modal...');
      
      // Click the login button if it exists
      const loginButton = await page.locator('.mu-auth__login-btn').first();
      if (await loginButton.count() > 0) {
        await loginButton.click();
        console.log('Clicked login button');
        
        // Wait for the modal to appear
        await page.waitForSelector('.auth-form', { timeout: 10000 });
        console.log('Login modal opened');
      }
    }
    
    // Check if login form exists (either on auth page or in modal)
    const formExists = await page.locator('.auth-form').count() > 0;
    if (formExists) {
      const email = appConfig.BACKIT_EMAIL;
      const password = appConfig.BACKIT_PASSWORD;
      
      if (!email || !password) {
        console.error('BACKIT_EMAIL or BACKIT_PASSWORD not configured in application.yml');
        return false;
      }
      
      console.log('Auto-filling login credentials...');
      
      // Fill in email/login field
      const emailInput = page.locator('input[placeholder*="эл.почту"], input[placeholder*="логин"]').first();
      await emailInput.fill(email);
      
      // Fill in password field  
      const passwordInput = page.locator('input[type="password"]').first();
      await passwordInput.fill(password);
      
      console.log('Credentials filled, clicking login button...');
      
      // Click the login button ("Войти")
      const loginSubmitButton = page.locator('button:has-text("Войти")').first();
      await loginSubmitButton.click();
      
      // Wait for successful login - either redirect to mycashback page or user card appears
      console.log('Waiting for authentication to complete...');
      
      try {
        // Wait for either the user card to appear or redirect to mycashback page
        await Promise.race([
          page.waitForSelector('.mu-user-card__name', { timeout: 15000 }),
          page.waitForURL('**/mycashback', { timeout: 15000 })
        ]);
        
        // Check if we successfully authenticated
        const finalUrl = page.url();
        console.log('Current URL after login:', finalUrl);
        
        if (finalUrl.includes('/mycashback')) {
          console.log('Successfully redirected to mycashback page');
          // Wait a bit for the page to fully load after redirect
          await page.waitForTimeout(2000);
          
          // Check for user card on the cashback page
          try {
            await page.waitForSelector('.mu-user-card__name', { timeout: 10000 });
            const emailElement = await page.$('.mu-user-card__name');
            const userEmail = await emailElement.textContent();
            console.log(`Successfully authenticated as: ${userEmail.trim()}`);
            return true;
          } catch (userCardError) {
            console.log('Redirected to mycashback but user card not found, assuming authenticated');
            return true; // Still consider it authenticated since we're on the right page
          }
        } else {
          console.log('Authentication may have succeeded but not redirected yet');
          return true;
        }
        
      } catch (timeoutError) {
        console.log('Authentication timeout or failed:', timeoutError.message);
        return false;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error during automatic login:', error.message);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ ...config, headless: false });
  let context;
  try {
    if (fs.existsSync(storageStatePath)) {
      context = await browser.newContext({ storageState: storageStatePath });
      console.log('Loaded saved session from', storageStatePath);
    } else {
      context = await browser.newContext();
    }
    const page = await context.newPage();
    const pageUrl = 'https://backit.me/ru/cashback/mycashback';
    
    // Navigate to the page and check authentication
    await page.goto(pageUrl);
    const isAuthenticated = await checkAuthentication(page);
    
    if (!isAuthenticated) {
      console.log('Not authenticated. Attempting automatic login...');
      
      // Try to handle login
      const loginSuccessful = await handleLoginModal(page);
      
      if (!loginSuccessful) {
        console.log('Automatic login failed. Deleting cache and retrying...');
        deleteCacheFile();
        await browser.close();
        
        // Restart with fresh context
        const newBrowser = await chromium.launch({ ...config, headless: false });
        context = await newBrowser.newContext();
        const newPage = await context.newPage();
        
        await newPage.goto(pageUrl);
        
        // Try login again with fresh context
        const secondLoginAttempt = await handleLoginModal(newPage);
        
        if (!secondLoginAttempt) {
          console.error('Failed to authenticate after fresh restart. Exiting.');
          await newBrowser.close();
          process.exit(3);
        }
        
        // Save session and proceed with balance check on new page
        await context.storageState({ path: storageStatePath });
        console.log('New session saved to', storageStatePath);
        
        // Proceed with balance check directly (no reload needed)
        await performBalanceCheck(newPage);
        await newBrowser.close();
        return;
      } else {
        // Login was successful, save the session
        await context.storageState({ path: storageStatePath });
        console.log('Session saved to', storageStatePath);
        // Continue with balance check on current page (no reload needed)
      }
    }
    
    // Perform balance check on the current page
    await performBalanceCheck(page);
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();

async function performBalanceCheck(page) {
  try {
    console.log('Reading cashback balance...');
    const balanceSelector = 'strong.base-balance-card__balance';
    await page.waitForSelector(balanceSelector, { timeout: 30000 });
    const balanceText = await page.$eval(balanceSelector, el => el.textContent.trim());
    // Extract number from text like "122.36₽"
    const match = balanceText.match(/([\d.]+)/);
    if (!match) {
      console.error('No balance value found on the page; cannot validate.');
      process.exit(2);
      return;
    }
    const webBalance = parseFloat(match[1]);
    const ledgerBalance = await getLedgerBalance();
    // Round both to 2 decimals for comparison
    const round = v => Math.round(v * 100) / 100;
    console.log(`Found balance on Backit: ${webBalance}`);
    console.log(`Expected balance from ledger: ${ledgerBalance}`);
    if (round(webBalance) === round(ledgerBalance)) {
      console.log('Validation successful: balance match.');
    } else {
      console.error('Validation failed: balance does not match.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during balance check:', error.message);
    process.exit(2);
  }
}
