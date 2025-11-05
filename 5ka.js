const { chromium } = require('playwright');
const config = require('./playwright.config');
const fs = require('fs');
const { getLedgerBalance } = require('./ledgerUtils');
const { deleteCacheFile, checkAuthentication, waitForManualLogin } = require('./5kaAuthUtils');

const storageStatePath = 'cache/5kaStorageState.json';
const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger';
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:bonus:карта лояльности Пятёрочки:8002"`;
const timeoutForLogin = 240000;

// Helper function to check if cache is too old (older than 1 day)
function isCacheTooOld(filePath) {
  if (!fs.existsSync(filePath)) return true;
  const stats = fs.statSync(filePath);
  const ageInMs = Date.now() - stats.mtimeMs;
  const oneDayInMs = 24 * 60 * 60 * 1000;
  return ageInMs > oneDayInMs;
}

(async () => {
  const browser = await chromium.launch({ ...config, headless: false });
  let context;

  try {
    // Delete cache if it's too old to prevent cookie accumulation issues
    if (isCacheTooOld(storageStatePath)) {
      console.log('Cache is older than 1 day. Deleting to prevent cookie accumulation...');
      deleteCacheFile(storageStatePath);
    }
    
    if (fs.existsSync(storageStatePath)) {
      context = await browser.newContext({ storageState: storageStatePath });
      console.log('Loaded saved session from', storageStatePath);
    } else {
      context = await browser.newContext();
    }

    const page = await context.newPage();
    
    // Enable network logging to debug the 400 error
    page.on('request', request => {
      if (request.url().includes('5ka.ru')) {
        const headers = request.headers();
        const cookieHeader = headers['cookie'] || '';
        console.log(`[REQUEST] ${request.method()} ${request.url()}`);
        console.log(`[COOKIE LENGTH] ${cookieHeader.length} characters`);
        if (cookieHeader.length > 4000) {
          console.warn(`[WARNING] Cookie header is very large: ${cookieHeader.length} chars`);
        }
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('5ka.ru') && response.status() === 400) {
        console.error(`[400 ERROR] ${response.url()}`);
        console.error(`[STATUS] ${response.status()} ${response.statusText()}`);
      }
    });
    
    await page.goto('https://5ka.ru/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    
    // Check if we got the 400 error page
    const pageContent = await page.content();
    if (pageContent.includes('400 Bad Request') || pageContent.includes('Cookie Too Large') || pageContent.includes('Request Header Or Cookie Too Large')) {
      console.log('Detected "Cookie Too Large" error page.');
      console.log('This appears to be a server-side issue, not related to cached cookies.');
      console.error('The 5ka.ru server is rejecting requests. Please try again later or contact support.');
      await browser.close();
      process.exit(2);
    }
    
    let isAuthenticated = await checkAuthentication(page);
    
    if (!isAuthenticated) {
      console.log('Not authenticated. Deleting cache and requiring manual login...');
      deleteCacheFile(storageStatePath);
      
      const loginCompleted = await waitForManualLogin(page, timeoutForLogin);
      if (!loginCompleted) {
        console.error('Manual login timeout. Exiting.');
        await browser.close();
        process.exit(3);
      }
      
      isAuthenticated = await checkAuthentication(page);
      if (!isAuthenticated) {
        console.error('Failed to authenticate even after manual login. Exiting.');
        await browser.close();
        process.exit(3);
      }
      
      await context.storageState({ path: storageStatePath });
      console.log('New session saved to', storageStatePath);
    } else {
      if (!fs.existsSync(storageStatePath)) {
        await context.storageState({ path: storageStatePath });
        console.log('Session saved to', storageStatePath);
      }
    }
    
    await validateLoyaltyPoints(page);
  } catch (error) {
    console.error('Error occurred:', error);
    process.exit(2);
  } finally {
    await browser.close();
  }
})();

async function validateLoyaltyPoints(page) {
  const loyaltyPointsElementsSelector = '[data-qa="loyalty-points-value"]';
  await page.waitForSelector(loyaltyPointsElementsSelector, { timeout: 20000 });

  const loyaltyPointsElements = await page.$$eval(loyaltyPointsElementsSelector, elements => 
    elements.map(el => el.textContent.trim())
  );

  if (!loyaltyPointsElements || loyaltyPointsElements.length === 0) {
    console.error('No loyalty points found on the page; cannot validate.');
    process.exit(2);
  }

  const webLoyaltyPoints = parseInt(loyaltyPointsElements[0], 10);
  const ledgerLoyaltyPoints = await getLedgerBalance(ledgerCommand);
  
  console.log(`Found loyalty points on 5ka: ${webLoyaltyPoints}`);
  console.log(`Expected loyalty points from ledger: ${ledgerLoyaltyPoints}`);

  if (webLoyaltyPoints === ledgerLoyaltyPoints) {
    console.log('Validation successful: loyalty points match.');
  } else {
    console.error('Validation failed: loyalty points do not match.');
    process.exit(1);
  }
}
