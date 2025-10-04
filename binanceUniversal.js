const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');
const { getLedgerBalance, parseLedgerNumber } = require('./ledgerUtils');
const { deleteCacheFile, checkAuthentication, waitForManualLogin } = require('./binanceAuthUtils');

const storageStatePath = 'cache/binanceStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger';
const timeoutForLogin = 240000;

const assetConfigs = {
  spot: {
    name: 'Spot',
    ledgerCommand: `ledger -f ${ledgerFilePath} balance "Assets:cryptocurrency:Binance:Spot"`,
    sidebarText: 'Spot',
    pageUrl: 'https://www.binance.com/en/my/wallet/account/main',
    valueSelector: 'div.headline4.text-t-primary',
    buttonSelector: 'div.subtitle3',
    buttonText: /^BNB$/,
    extractValue: async (page, valueSelector) => {
      await page.waitForSelector(valueSelector);
      return await page.$eval(valueSelector, el => el.textContent.trim());
    }
  },
  funding: {
    name: 'Funding',
    ledgerCommand: `ledger -f ${ledgerFilePath} balance "Assets:cryptocurrency:Binance:Funding"`,
    sidebarText: 'Funding',
    pageUrl: 'https://www.binance.com/en/my/wallet/funding',
    valueSelector: '#convert-input-From',
    buttonSelector: '.pc-asset-list > div:has(.subtitle3:has-text("BNB")) >> #funding-action-convert',
    buttonText: null,
    extractValue: async (page, valueSelector) => {
      // Wait for a specific input's live value to become > 0
      const locator = page.locator(valueSelector);
      const timeout = 15000;
      const pollInterval = 200;
      const start = Date.now();
      let positive = null;
      while (Date.now() - start < timeout) {
        try {
          const value = await locator.inputValue();
          const num = Number(value.replace(/,/g, ''));
          if (Number.isFinite(num) && num > 0) {
            positive = value;
            break;
          }
        } catch (err) {}
        await page.waitForTimeout(pollInterval);
      }
      if (!positive) throw new Error('Timed out waiting for specific input value > 0');
      return positive;
    }
  }
};

async function promptAssetType() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('Check which asset? (spot/funding): ', answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

(async () => {
  const assetType = process.argv[2] && assetConfigs[process.argv[2]] ? process.argv[2] : await promptAssetType();
  if (!assetConfigs[assetType]) {
    console.error('Invalid asset type. Use "spot" or "funding".');
    process.exit(1);
  }
  const config = assetConfigs[assetType];
  const browser = await chromium.launch({ headless: false });
  let context;
  try {
    if (fs.existsSync(storageStatePath)) {
      context = await browser.newContext({ storageState: storageStatePath });
      console.log('Loaded saved session from', storageStatePath);
    } else {
      context = await browser.newContext();
    }
    const page = await context.newPage();
    await page.goto(config.pageUrl);
    let isAuthenticated = await checkAuthentication(page);
    if (!isAuthenticated) {
      console.log('Not authenticated. Deleting cache and requiring manual login...');
      deleteCacheFile(storageStatePath);
      await browser.close();
      const newBrowser = await chromium.launch({ headless: false });
      context = await newBrowser.newContext();
      const newPage = await context.newPage();
      await newPage.goto(config.pageUrl);
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
      await validateBNB(newPage, config);
      await newBrowser.close();
      return;
    } else {
      if (!fs.existsSync(storageStatePath)) {
        await context.storageState({ path: storageStatePath });
        console.log('Session saved to', storageStatePath);
      }
    }
    await validateBNB(page, config);
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();

async function validateBNB(page, config) {
  try {
    // Use sidebar to switch asset if needed
    const sidebarLink = await page.locator('.sidebar-menu-item-text', { hasText: config.sidebarText }).first();
    if (await sidebarLink.count() > 0) {
      await sidebarLink.click();
      await page.waitForTimeout(1000);
    }
    // Click BNB button if needed
    if (config.buttonSelector) {
      const button = page.locator(config.buttonSelector);
      if (await button.count() > 0) {
        await button.first().click();
        await page.waitForTimeout(1000);
      }
    }
    // Extract value
    const valueBNB = await config.extractValue(page, config.valueSelector);
    if (!valueBNB || valueBNB.length === 0) {
      console.error('No BNB found on the page; cannot validate.');
      return process.exit(2);
    }
    const ledgerBNB = await getLedgerBalance(config.ledgerCommand);
    const webBNB = parseLedgerNumber(valueBNB);
    console.log(`Found BNB on Binance (${config.name}): ${webBNB}`);
    console.log(`Expected BNB from ledger: ${ledgerBNB}`);
    if (webBNB === ledgerBNB) {
      console.log('Validation successful: BNB match.');
    } else {
      console.error('Validation failed: BNB do not match.');
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error during BNB validation for ${config.name}:`, error);
    process.exit(2);
  }
}
