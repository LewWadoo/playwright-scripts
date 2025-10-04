const { chromium } = require('playwright');
const fs = require('fs');
const { getLedgerBalance, parseLedgerNumber } = require('./ledgerUtils');
const { deleteCacheFile, checkAuthentication, waitForManualLogin } = require('./binanceAuthUtils');

const storageStatePath = 'cache/binanceStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger';
const timeoutForLogin = 240000;

const assetConfigs = [
  {
    name: 'Spot',
    ledgerCommand: `ledger -f ${ledgerFilePath} balance "Assets:cryptocurrency:Binance:Spot"`,
    sidebarText: 'Spot',
    pageUrl: 'https://www.binance.com/en/my/wallet/account/main',
    valueSelector: 'div.headline4.text-t-primary',
    buttonSelector: 'div.subtitle3',
    buttonText: /^BNB$/,
    pageCaption: 'Spot',
    extractValue: async (page, valueSelector) => {
      // Wait for the Spot page caption
      await page.waitForSelector('div.headline6', { timeout: 20000 });
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('div.headline6')).some(el => el.textContent.trim() === 'Spot'),
        { timeout: 20000 }
      );
      // Wait for the Spot sidebar link to be active
      const sidebarActive = page.locator('.sidebar-menu-item-text.text-active', { hasText: 'Spot' });
      await sidebarActive.waitFor({ state: 'visible', timeout: 15000 });
      const buttonBNB = page.locator('div.subtitle3', { hasText: /^BNB$/ }).first();
      if (await buttonBNB.count() > 0 && await buttonBNB.isVisible()) {
        await buttonBNB.click();
        await page.waitForTimeout(1000);
      } else {
        // Fallback: use the search panel to search for BNB
        console.warn('BNB button not found or not visible on the Spot page. Using search panel fallback.');
        // Click the Spot caption, then tab to focus the search input
        const spotCaption = page.locator('div', { hasText: /^Spot$/ }).first();
        if (await spotCaption.count() > 0 && await spotCaption.isVisible()) {
          await spotCaption.click();
          await page.keyboard.press('Tab');
          await page.waitForTimeout(200); // Give time for focus
        }
        // Instead of fill, type 'BNB' using keyboard
        await page.keyboard.type('BNB');
        await page.waitForTimeout(1000);
        // Try clicking the BNB row/button again
        const bnbRow = page.locator('div.subtitle3', { hasText: /^BNB$/ }).first();
        let found = false;
        for (let i = 0; i < 10; ++i) { // wait up to 5 seconds
          if (await bnbRow.count() > 0 && await bnbRow.isVisible()) {
            await bnbRow.click();
            await page.waitForTimeout(1000);
            found = true;
            break;
          }
          await page.waitForTimeout(500);
        }
        if (!found) {
          console.error('BNB row/button not found even after searching.');
          throw new Error('BNB row/button not found after search');
        }
      }
      // Try to get the value, with retries
      let valueBNB = null;
      const start = Date.now();
      const timeout = 30000;
      while (Date.now() - start < timeout) {
        try {
          await page.waitForSelector(valueSelector, { timeout: 2000 });
          valueBNB = await page.$eval(valueSelector, el => el.textContent.trim());
          if (valueBNB && valueBNB.length > 0) break;
        } catch (e) {}
        await page.waitForTimeout(1000);
      }
      if (!valueBNB || valueBNB.length === 0) {
        // Debug: print all headline4.text-t-primary elements
        const allVals = await page.$$eval('div.headline4.text-t-primary', els => els.map(e => e.textContent.trim()));
        console.error('No BNB found on the Spot page; cannot validate. Found headline4.text-t-primary:', allVals);
        throw new Error('No BNB found on the Spot page');
      }
      return valueBNB;
    }
  },
  {
    name: 'Funding',
    ledgerCommand: `ledger -f ${ledgerFilePath} balance "Assets:cryptocurrency:Binance:Funding"`,
    sidebarText: 'Funding',
    pageUrl: 'https://www.binance.com/en/my/wallet/funding',
    valueSelector: '#convert-input-From',
    buttonSelector: '.pc-asset-list > div:has(.subtitle3:has-text("BNB")) >> #funding-action-convert',
    buttonText: null,
    pageCaption: 'Funding',
    extractValue: async (page, valueSelector) => {
      // Wait for the Funding page caption
      await page.waitForSelector('div.headline6, .pc\\:headline6', { timeout: 20000 });
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('div.headline6, .pc\\:headline6')).some(el => el.textContent.trim() === 'Funding'),
        { timeout: 20000 }
      );
      // Focus the search panel and type BNB
      const fundingCaption = page.locator('div', { hasText: /^Funding$/ }).first();
      if (await fundingCaption.count() > 0 && await fundingCaption.isVisible()) {
        await fundingCaption.click();
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);
      }
      await page.keyboard.type('BNB');
      await page.waitForTimeout(1000);
      // Find the BNB row and click the Convert button inside it
      for (let i = 0; i < 10; ++i) {
        const bnbRow = page.locator('#btn-CoinItem-handleClick-BNB').first();
        if (await bnbRow.count() > 0 && await bnbRow.isVisible()) {
          const row = bnbRow.locator('..').locator('..').first();
          const convertBtn = row.locator('#funding-action-convert');
          if (await convertBtn.count() > 0 && await convertBtn.isVisible()) {
            await convertBtn.click();
            await page.waitForTimeout(1000);
            break;
          }
        }
        await page.waitForTimeout(500);
      }
      // Wait for the modal input value to become > 0
      const locator = page.locator('#convert-input-From');
      const timeout = 30000;
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
      if (!positive) throw new Error('Timed out waiting for modal input value > 0');
      return positive;
    }
  }
];

(async () => {
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
    // Start with Spot page
    await page.goto(assetConfigs[0].pageUrl);
    let isAuthenticated = await checkAuthentication(page);
    if (!isAuthenticated) {
      console.log('Not authenticated. Deleting cache and requiring manual login...');
      deleteCacheFile(storageStatePath);
      await browser.close();
      const newBrowser = await chromium.launch({ headless: false });
      context = await newBrowser.newContext();
      const newPage = await context.newPage();
      await newPage.goto(assetConfigs[0].pageUrl);
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
      await validateAllAssets(newPage);
      await newBrowser.close();
      return;
    } else {
      if (!fs.existsSync(storageStatePath)) {
        await context.storageState({ path: storageStatePath });
        console.log('Session saved to', storageStatePath);
      }
    }
    await validateAllAssets(page);
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();

async function validateAllAssets(page) {
  for (const config of assetConfigs) {
    try {
      // If the BNB side modal is open, close it before switching assets
      const modalCloseBtn = page.locator('#spot-history-sidebar-modal-close > svg');
      if (await modalCloseBtn.count() > 0 && await modalCloseBtn.isVisible()) {
        await modalCloseBtn.click();
        await page.waitForTimeout(500);
      }
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
        console.error(`No BNB found on the page for ${config.name}; cannot validate.`);
        process.exit(2);
      }
      const ledgerBNB = await getLedgerBalance(config.ledgerCommand);
      const webBNB = parseLedgerNumber(valueBNB);
      console.log(`Found BNB on Binance (${config.name}): ${webBNB}`);
      console.log(`Expected BNB from ledger: ${ledgerBNB}`);
      if (webBNB === ledgerBNB) {
        console.log(`Validation successful: BNB match for ${config.name}.`);
      } else {
        console.error(`Validation failed: BNB do not match for ${config.name}.`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error during BNB validation for ${config.name}:`, error);
      process.exit(2);
    }
  }
}
