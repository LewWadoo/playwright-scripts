const { chromium } = require('playwright');
const fs = require('fs');
const { exec } = require('child_process');
const config = require('./playwright.config'); // Import Playwright settings
const { deleteCacheFile, checkAuthentication, waitForManualLogin } = require('./wbAuthUtils');

const storageStatePath = 'cache/wbStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger';
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:электронные кошельки:WB Банк:Основные деньги"`;
const timeoutForLogin = 240000;

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
    const pageUrl = 'https://www.wildberries.ru/';
    await page.goto(pageUrl);
    
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
      await newPage.goto(pageUrl);
      
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
      await validateBalance(newPage);
      await newBrowser.close();
      return;
    } else {
      if (!fs.existsSync(storageStatePath)) {
        await context.storageState({ path: storageStatePath });
        console.log('Session saved to', storageStatePath);
      }
    }
    
    await validateBalance(page);
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();

async function validateBalance(page) {
  try {
    const balanceSelector = 'a.header__balance--bank';
    await page.waitForSelector(balanceSelector, { timeout: 15000 });
    const balanceText = await page.$eval(balanceSelector, el => el.textContent.trim());
    // Extract number from text like "76 ₽"
    const match = balanceText.match(/(\d+)/);
    if (!match) {
      console.error('No balance value found on the page; cannot validate.');
      process.exit(2);
    }
    const webBalance = parseInt(match[1], 10);
    const ledgerBalance = await getLedgerBalance();
    console.log(`Found balance on Wildberries: ${webBalance}`);
    console.log(`Expected balance from ledger: ${ledgerBalance}`);
    if (webBalance === ledgerBalance) {
      console.log('✓ Validation successful: balance match.');
    } else {
      console.error('✗ Validation failed: balance does not match.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during balance validation:', error);
    process.exit(2);
  }
}
