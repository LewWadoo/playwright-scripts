const { chromium } = require('playwright');
const config = require('./playwright.config'); // Import Playwright settings
const fs = require('fs');
const { exec } = require('child_process');

const storageStatePath = 'cache/5kaStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger'; // Adjust the path if necessary
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:bonus:карта лояльности Пятёрочки:8002"`;

function getLoyaltyPointsFromLedger() {
  return new Promise((resolve, reject) => {
    exec(ledgerCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing ledger command: ${stderr}`);
        reject(error);
        return;
      }

      // Parse the output to extract points
      const match = stdout.match(/(\d+)\s+\S+\s+Assets:bonus:карта\s+лояльности\s+Пятёрочки:8002/);
      if (match) {
        resolve(parseInt(match[1], 10)); // Resolve the first matched number
      } else {
        console.error('No valid loyalty points found in ledger output.');
        reject(new Error('No valid loyalty points found'));
      }
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

    // If no session, navigate to 5ka
    if (!fs.existsSync(storageStatePath)) {
      await page.goto('https://id.x5.ru/auth/realms/ssox5id/protocol/openid-connect/auth?client_id=tc5_site&scope=openid%20offline_access&response_type=code&redirect_uri=https%3A%2F%2F5ka.ru%2Fapi%2Fauth%2Fcallback%2Fkeycloak&response_mode=query&state=D2xzX3BOjQhTYPaz5HiQytSraxib0i7zL1w3iPgNanI&code_challenge=OK9HDEilKFdMvrRqlie6TOiN8TLB4Ch5GeSApLOLXoM&code_challenge_method=S256');

      console.log("Please log in to 5ka manually in the opened browser tab.");
      await page.waitForTimeout(60000); // wait for manual login (might involve CAPTCHA)

      // Save storage state to file after login
      await context.storageState({ path: storageStatePath });
      console.log('Session saved to', storageStatePath);
    }

    // Go to the main page to fetch loyalty points
    await page.goto('https://5ka.ru/');
    const loyaltyPointsElementsSelector = '[data-qa="loyalty-points-value"]';
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
    
    console.log(`Found loyalty points on 5ka: ${webLoyaltyPoints}`);
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
