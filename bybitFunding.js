const { chromium } = require('playwright');
const fs = require('fs');
const { exec } = require('child_process');
const config = require('./playwright.config'); // Import Playwright settings

const storageStatePath = 'cache/bybitStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger'; // Adjust the path if necessary
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:cryptocurrency:Bybit:Funding"`;
const timeoutForLogin = 240000; // for manual login

// Parse all coins and values from ledger output
function getLedgerBalances() {
  return new Promise((resolve, reject) => {
    exec(ledgerCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing ledger command: ${stderr || error.message}`);
        reject(error);
        return;
      }
      // Each line: value symbol
      const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
      const balances = {};
      for (const line of lines) {
        // Match: value symbol (ignore trailing account info)
        const m = line.match(/^([+-]?\d+(?:[.,]\d+)?)\s+(\w+)/);
        if (m) {
          let value = m[1].replace(',', '.');
          value = parseFloat(value);
          const symbol = m[2];
          if (Number.isFinite(value)) {
            balances[symbol] = value;
          }
        }
      }
      resolve(balances);
    });
  });
}


// Simple number parser: assumes same format for ledger and Bybit
function parseNumber(str) {
  str = String(str).replace(/[^\d.\-+]/g, '');
  return Number(str);
}

async function checkAuthentication(page) {
  try {
    // Check if login/register elements are present (indicating logged out)
    const loginElementExists = await page.locator('#HEADER-LOGIN, .header-login').count() > 0;
    const registerElementExists = await page.locator('#HEADER-REGISTER, .header-register').count() > 0;
    
    if (loginElementExists || registerElementExists) {
      console.log('Login/Register buttons found - user not authenticated');
      return false;
    }

    // Additional check for the header status container
    const headerStatusExists = await page.locator('#HEADER-RIGHT-LOGIN-REGISTER, .header-status').count() > 0;
    if (headerStatusExists) {
      console.log('Header login/register section found - user not authenticated');
      return false;
    }

    // Check for user info element (indicating logged in)
    const userInfoExists = await page.locator('#USER-INFO-DRAWER, .user-drawer-wrapper__header').count() > 0;
    if (userInfoExists) {
      console.log('User info element found - user authenticated');
      return true;
    }

    // Wait a bit and check for user-specific content indicating logged in state
    await page.waitForTimeout(3000);
    
    // Check again for user info element after waiting
    const userInfoExistsAfterWait = await page.locator('#USER-INFO-DRAWER, .user-drawer-wrapper__header').count() > 0;
    if (userInfoExistsAfterWait) {
      console.log('User authenticated - user info element visible after wait');
      return true;
    }

    // Check if we can see the assets page content (indicating logged in)
    const assetsContentExists = await page.locator('.virtual__grid-row, [class*="asset"], [class*="balance"]').count() > 0;
    if (assetsContentExists) {
      console.log('User authenticated - assets content visible');
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

async function waitForManualLogin(page, maxWaitTimeMs = 240000) {
  console.log("Please log in to Bybit manually in the opened browser tab.");
  console.log("Waiting for login completion (checking for user info element)...");
  
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds
  
  while (Date.now() - startTime < maxWaitTimeMs) {
    try {
      // Check for user info element
      const userInfoExists = await page.locator('#USER-INFO-DRAWER, .user-drawer-wrapper__header').count() > 0;
      if (userInfoExists) {
        console.log('Login detected! User info element appeared.');
        return true;
      }
      
      // Also check if login elements disappeared (another indicator)
      const loginElementExists = await page.locator('#HEADER-LOGIN, .header-login').count() > 0;
      const registerElementExists = await page.locator('#HEADER-REGISTER, .header-register').count() > 0;
      
      if (!loginElementExists && !registerElementExists) {
        // Wait a bit more to see if user info element appears
        await page.waitForTimeout(3000);
        const userInfoExistsAfterWait = await page.locator('#USER-INFO-DRAWER, .user-drawer-wrapper__header').count() > 0;
        if (userInfoExistsAfterWait) {
          console.log('Login detected! Login elements disappeared and user info appeared.');
          return true;
        }
      }
      
      // Wait before next check
      await page.waitForTimeout(checkInterval);
      
    } catch (error) {
      console.log('Error during login check:', error.message);
      await page.waitForTimeout(checkInterval);
    }
  }
  
  console.log('Login timeout reached. Manual login was not completed in time.');
  return false;
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
    const pageUrl = 'https://www.bybit.com/user/assets/home/fiat';
    
    // Navigate to the page and check authentication
    await page.goto(pageUrl);
    const isAuthenticated = await checkAuthentication(page);
    
    if (!isAuthenticated) {
      console.log('Not authenticated. Deleting cache and requiring manual login...');
      deleteCacheFile();
      await browser.close();
      
      // Restart with fresh context
      const newBrowser = await chromium.launch({ ...config, headless: false });
      context = await newBrowser.newContext();
      const newPage = await context.newPage();
      
      await newPage.goto(pageUrl);
      
      // Wait for manual login with active monitoring
      const loginCompleted = await waitForManualLogin(newPage, timeoutForLogin);
      
      if (!loginCompleted) {
        console.error('Manual login timeout. Exiting.');
        await newBrowser.close();
        process.exit(3);
      }
      
      // Verify authentication after manual login
      const isAuthenticatedAfterLogin = await checkAuthentication(newPage);
      if (!isAuthenticatedAfterLogin) {
        console.error('Failed to authenticate even after manual login. Exiting.');
        await newBrowser.close();
        process.exit(3);
      }
      
      await context.storageState({ path: storageStatePath });
      console.log('New session saved to', storageStatePath);
      
      // Proceed with balance check on the new page
      await performBalanceValidation(newPage);
      await newBrowser.close();
      return;
    } else {
      // Already authenticated, save session if it wasn't cached before
      if (!fs.existsSync(storageStatePath)) {
        await context.storageState({ path: storageStatePath });
        console.log('Session saved to', storageStatePath);
      }
    }

    // Proceed with balance validation
    await performBalanceValidation(page);
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();

async function performBalanceValidation(page) {
  try {
    // Get all ledger balances
    const ledgerBalances = await getLedgerBalances();
    console.log('Ledger balances:', ledgerBalances);

    let allMatch = true;
    for (const [symbol, ledgerValueRaw] of Object.entries(ledgerBalances)) {
      // Round ledger value to 4 decimal places
      const ledgerValue = Math.round(ledgerValueRaw * 10000) / 10000;
      console.log(`Checking ${symbol}...`);
      // Find the row for this coin
      const row = page.locator('div.virtual__grid-row', { hasText: symbol }).first();
      try {
        await row.waitFor({ state: 'visible', timeout: 5000 });
      } catch (err) {
        console.error(`Row for ${symbol} not found on Bybit.`);
        allMatch = false;
        continue;
      }
      let raw = await row.locator('.virtual__grid-columns.column2').textContent();
      if (!raw) {
        console.error(`No value found for ${symbol} on Bybit.`);
        allMatch = false;
        continue;
      }
      raw = raw.replace(/\u00A0/g, '').replace(/\s+/g, '').trim();
      const bybitValue = parseNumber(raw);
      console.log(`Bybit value for ${symbol}:`, bybitValue, 'Ledger:', ledgerValue);
      if (bybitValue === ledgerValue) {
        console.log(`Validation successful for ${symbol}: value match.`);
      } else {
        console.error(`Validation failed for ${symbol}: values do not match.`);
        allMatch = false;
      }
    }
    if (!allMatch) {
      process.exit(1);
    } else {
      console.log('All coins validated successfully.');
    }
  } catch (error) {
    console.error('Error during balance validation:', error.message);
    process.exit(2);
  }
}
