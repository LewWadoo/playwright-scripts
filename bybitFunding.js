const { exec } = require('child_process');
const { RestClientV5 } = require('bybit-api');

const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger';
const ledgerCommand = `ledger -f ${ledgerFilePath} balance "Assets:cryptocurrency:Bybit:Funding"`;

// Get API credentials from pass
function getPassValue(passPath) {
  return new Promise((resolve, reject) => {
    exec(`pass show "${passPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error retrieving from pass: ${stderr || error.message}`);
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

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

// Get balance for a specific coin from Bybit API
async function getBybitBalance(client, coin) {
  try {
    const response = await client.getCoinBalance({
      accountType: 'FUND',
      coin: coin,
    });
    
    if (response.retCode !== 0) {
      console.error(`Bybit API error for ${coin}:`, response.retMsg, `(retCode: ${response.retCode})`);
      return null;
    }
    
    const balance = response.result?.balance;
    if (!balance || !balance.walletBalance) {
      return 0;
    }
    
    return parseFloat(balance.walletBalance);
  } catch (error) {
    console.error(`Error fetching Bybit balance for ${coin}:`, error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

// Compare two numbers with tolerance for floating point precision
// Use tolerance of 0.0001 (4 decimal places) which is reasonable for crypto balances
function numbersMatch(a, b, tolerance = 0.0001) {
  return Math.abs(a - b) < tolerance;
}

(async () => {
  try {
    // Get API credentials from pass
    console.log('Retrieving API credentials from pass...');
    const apiKey = await getPassValue('Homebanking/Трейдинг/Биржи/Bybit/lewwadoo@gmail.com/API-Key');
    const apiSecret = await getPassValue('Homebanking/Трейдинг/Биржи/Bybit/lewwadoo@gmail.com/API-Secret');
    
    if (!apiKey || !apiSecret) {
      console.error('Failed to retrieve API credentials from pass');
      process.exit(2);
    }
    
    // Initialize Bybit API client
    const client = new RestClientV5({
      key: apiKey,
      secret: apiSecret,
    });
    
    // Get ledger balances
    console.log('Fetching ledger balances...');
    const ledgerBalances = await getLedgerBalances();
    console.log('Ledger balances:', ledgerBalances);
    
    if (Object.keys(ledgerBalances).length === 0) {
      console.log('No coins to validate in ledger.');
      return;
    }
    
    // Validate each coin
    let allMatch = true;
    for (const [symbol, ledgerValueRaw] of Object.entries(ledgerBalances)) {
      console.log(`\nChecking ${symbol}...`);
      
      const bybitValue = await getBybitBalance(client, symbol);
      
      if (bybitValue === null) {
        console.error(`Failed to fetch balance for ${symbol} from Bybit API`);
        allMatch = false;
        continue;
      }
      
      console.log(`Bybit Funding balance for ${symbol}: ${bybitValue}`);
      console.log(`Ledger balance for ${symbol}: ${ledgerValueRaw}`);
      
      if (numbersMatch(bybitValue, ledgerValueRaw)) {
        console.log(`✓ Validation successful for ${symbol}: balances match`);
      } else {
        console.error(`✗ Validation failed for ${symbol}: balances do not match (diff: ${Math.abs(bybitValue - ledgerValueRaw)})`);
        allMatch = false;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    if (!allMatch) {
      console.error('✗ Validation failed: some balances do not match');
      process.exit(1);
    } else {
      console.log('✓ All coins validated successfully');
    }
  } catch (error) {
    console.error('Error occurred:', error.message);
    process.exit(2);
  }
})();
