const { chromium } = require('playwright');
const fs = require('fs');
const { exec } = require('child_process');
const config = require('./playwright.config'); // Import Playwright settings
const { deleteCacheFile, checkAuthentication, waitForManualLogin } = require('./dixyAuthUtils');

const storageStatePath = 'cache/dixyStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger'; // Adjust the path if necessary
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:bonus:Дикси:Клуб Друзей"`;
const timeoutForLogin = 240000;

function getLoyaltyPointsFromLedger() {
  return new Promise((resolve, reject) => {
    exec(ledgerCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing ledger command: ${stderr || error.message}`);
        reject(error);
        return;
      }

      // Match a number with optional decimal (dot or comma). Replace comma with dot for parsing.
      const m = stdout.match(/([+-]?\d+(?:[.,]\d+)?)/);
      if (m) {
        const raw = m[1].replace(',', '.');
        const num = parseFloat(raw);
        if (Number.isFinite(num)) {
          // Truncate toward zero to get the integer part (151 from 151.78)
          resolve(Math.trunc(num));
          return;
        }
      }

      console.error('No valid number found in ledger output.');
      reject(new Error('No valid number found'));
    });
  });
}

(async () => {
  const browser = await chromium.launch({ ...config, headless: false });
  let context;

  try {
    // Check if the storage state file exists to reuse login session
    if (fs.existsSync(storageStatePath)) {
      context = await browser.newContext({ storageState: storageStatePath });
      console.log('Loaded saved session from', storageStatePath);
    } else {
      context = await browser.newContext();
    }

    const page = await context.newPage();
    
    // Go to the personal page to check balance
    await page.goto('https://dixy.ru/personal/', { timeout: 60000 });
    
    // Set zoom level to 50% for better visibility on small screens
    await page.evaluate(() => {
      document.body.style.zoom = '0.5';
    });

    let isAuthenticated = await checkAuthentication(page);
    if (!isAuthenticated) {
      console.log('Not authenticated. Deleting cache and requiring manual login...');
      deleteCacheFile(storageStatePath);
      await browser.close();
      
      const newBrowser = await chromium.launch({ ...config, headless: false });
      context = await newBrowser.newContext();
      const newPage = await context.newPage();
      await newPage.goto('https://dixy.ru/personal/', { timeout: 60000 });
      
      const loginCompleted = await waitForManualLogin(newPage, timeoutForLogin);
      if (!loginCompleted) {
        console.error('Manual login timeout. Exiting.');
        await newBrowser.close();
        process.exit(3);
      }
      
      isAuthenticated = await checkAuthentication(newPage);
      if (!isAuthenticated) {
        console.error('Failed to authenticate even after manual login. Exiting.');
        await newBrowser.close();
        process.exit(3);
      }
      
      await context.storageState({ path: storageStatePath });
      console.log('New session saved to', storageStatePath);
      await validateLoyaltyPoints(newPage);
      await newBrowser.close();
      return;
    } else {
      if (!fs.existsSync(storageStatePath)) {
        await context.storageState({ path: storageStatePath });
        console.log('Session saved to', storageStatePath);
      }
    }

    await validateLoyaltyPoints(page);
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close(); // Ensure the browser closes in any case
  }
})();

async function validateLoyaltyPoints(page) {
  try {
    // New selector for balance on /personal/ page
    const balanceSelector = '.counts__num.num-js';
    await page.waitForSelector(balanceSelector, { timeout: 15000 }); // Wait for the element to appear

    // Extract loyalty points from the page
    const balanceText = await page.$eval(balanceSelector, el => el.textContent.trim());

    if (!balanceText || balanceText.length === 0) {
      console.error('No loyalty points found on the page; cannot validate.');
      process.exit(2);
    }

    const webLoyaltyPoints = parseInt(balanceText, 10);

    // Dynamically retrieve loyalty points from the ledger
    const ledgerLoyaltyPoints = await getLoyaltyPointsFromLedger();
    
    console.log(`Found loyalty points on Dixy: ${webLoyaltyPoints}`);
    console.log(`Expected loyalty points from ledger: ${ledgerLoyaltyPoints}`);

    // Compare the points
    if (webLoyaltyPoints === ledgerLoyaltyPoints) {
      console.log('✓ Validation successful: loyalty points match.');
    } else {
      console.error('✗ Validation failed: loyalty points do not match.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during loyalty points validation:', error);
    process.exit(2);
  }
}
