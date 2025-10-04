const { chromium } = require('playwright');
const config = require('./playwright.config'); // Import Playwright settings
const { exec } = require('child_process');

const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger';
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:cryptocurrency:Phantom"`;
const solanaUrl = 'https://explorer.solana.com/address/EvKsVjhg2LpSK6atVtaNMX5yD5cqiiC8VzyHojECwwKd';

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
  const page = await browser.newPage();
  await page.goto(solanaUrl);

  // Wait for the Balance (SOL) row to appear
  const row = page.locator('tr', { hasText: 'Balance (SOL)' });
  await row.waitFor({ state: 'visible', timeout: 10000 });

  // Extract the value from the font-monospace span
  const valueText = await row.locator('span.font-monospace').textContent();
  const solanaBalance = parseFloat(valueText);
  console.log('Solana Explorer Balance (SOL):', solanaBalance);

  // Get ledger balance
  const ledgerBalance = await getLedgerBalance();

  // Round both to decimalPlaces decimals for comparison
  const decimalPlaces = 5;

  const round = v => Math.round(v * 10**decimalPlaces) / 10**decimalPlaces;
  const roundedSolana = round(solanaBalance);
  const roundedLedger = round(ledgerBalance);
  console.log(`Rounded Explorer=${roundedSolana}, Rounded Ledger=${roundedLedger}`);
  if (roundedSolana === roundedLedger) {
    console.log('Validation successful: values match.');
  } else {
    console.error('Validation failed: values do not match.');
    process.exit(1);
  }
  await browser.close();
})();
