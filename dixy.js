const { chromium } = require('playwright');
const fs = require('fs');
const { exec } = require('child_process');
const config = require('./playwright.config'); // Import Playwright settings

const storageStatePath = 'cache/dixyStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger'; // Adjust the path if necessary
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:bonus:Дикси:Клуб Друзей"`;

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

    // If no session, navigate to dixy
    if (!fs.existsSync(storageStatePath)) {
      await page.goto('https://dixy.ru', { timeout: 60000 });

      console.log("Please log in to dixy manually in the opened browser tab.");
      await page.waitForTimeout(60000); // wait for manual login

      // Save storage state to file after login
      await context.storageState({ path: storageStatePath });
      console.log('Session saved to', storageStatePath);
    }

    // Go to the main page to fetch loyalty points
    await page.goto('https://dixy.ru/personal/cashbacks/', { timeout: 60000 });
    const loyaltyPointsElementsSelector = '.clcaret-balance__count > span';
    await page.waitForSelector(loyaltyPointsElementsSelector); // Wait for the element to appear

    // Extract loyalty points from the page
    const loyaltyPointsElements = await page.$$eval(loyaltyPointsElementsSelector, elements => 
      elements.map(el => el.textContent.trim())
    );

    if (!loyaltyPointsElements || loyaltyPointsElements.length === 0) {
      console.error('No loyalty points found on the page; cannot validate.');
      return process.exit(2);
    }

    const webLoyaltyPoints = parseInt(loyaltyPointsElements[0], 10);

    // Dynamically retrieve loyalty points from the ledger
    const ledgerLoyaltyPoints = await getLoyaltyPointsFromLedger();
    
    console.log(`Found loyalty points on dixy: ${webLoyaltyPoints}`);
    console.log(`Expected loyalty points from ledger: ${ledgerLoyaltyPoints}`);

    // Compare the points

    if (webLoyaltyPoints === ledgerLoyaltyPoints) {
      console.log('Validation successful: loyalty points match.');
    } else {
      console.error('Validation failed: loyalty points do not match.');
      process.exit(1);
    }

  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close(); // Ensure the browser closes in any case
  }
})();
