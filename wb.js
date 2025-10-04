const { chromium } = require('playwright');
const fs = require('fs');
const { exec } = require('child_process');
const config = require('./playwright.config'); // Import Playwright settings

const storageStatePath = 'wbStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger';
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:электронные кошельки:WB Банк:Основные деньги"`;

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
    if (!fs.existsSync(storageStatePath)) {
      await page.goto(pageUrl);
      console.log("Please log in to Wildberries manually in the opened browser tab.");
      await page.waitForTimeout(60000); // wait for manual login
      await context.storageState({ path: storageStatePath });
      console.log('Session saved to', storageStatePath);
    }
    await page.goto(pageUrl);
    const balanceSelector = 'a.header__balance--bank';
    await page.waitForSelector(balanceSelector, { timeout: 15000 });
    const balanceText = await page.$eval(balanceSelector, el => el.textContent.trim());
    // Extract number from text like "76 ₽"
    const match = balanceText.match(/(\d+)/);
    if (!match) {
      console.error('No balance value found on the page; cannot validate.');
      return process.exit(2);
    }
    const webBalance = parseInt(match[1], 10);
    const ledgerBalance = await getLedgerBalance();
    console.log(`Found balance on Wildberries: ${webBalance}`);
    console.log(`Expected balance from ledger: ${ledgerBalance}`);
    if (webBalance === ledgerBalance) {
      console.log('Validation successful: balance match.');
    } else {
      console.error('Validation failed: balance does not match.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();
