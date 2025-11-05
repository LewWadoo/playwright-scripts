const { exec } = require('child_process');
const { Spot } = require('@binance/connector');

const ledgerFilePath = '~/src/lewwadoo/ledger/ledger-2022.ledger';

const assetConfigs = [
  {
    name: 'Spot',
    ledgerCommand: `ledger -f ${ledgerFilePath} balance "Assets:cryptocurrency:Binance:Spot"`,
    accountType: 'SPOT',
  },
  {
    name: 'Funding',
    ledgerCommand: `ledger -f ${ledgerFilePath} balance "Assets:cryptocurrency:Binance:Funding"`,
    accountType: 'FUNDING',
  }
];

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
function getLedgerBalances(ledgerCommand) {
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

// Get all coin information from Binance API using different endpoints
async function getAllCoins(client) {
  try {
    const balances = {
      SPOT: {},
      FUNDING: {}
    };
    
    // Get SPOT balances using account snapshot
    const spotSnapshot = await client.accountSnapshot('SPOT');
    if (spotSnapshot.data && spotSnapshot.data.snapshotVos && spotSnapshot.data.snapshotVos.length > 0) {
      const latestSpot = spotSnapshot.data.snapshotVos[0];
      if (latestSpot.data && latestSpot.data.balances) {
        for (const balance of latestSpot.data.balances) {
          const free = parseFloat(balance.free || 0);
          const locked = parseFloat(balance.locked || 0);
          const total = free + locked;
          if (total > 0) {
            balances.SPOT[balance.asset] = total;
          }
        }
      }
    }
    
    // Get FUNDING balances using funding wallet endpoint
    try {
      const fundingAssets = await client.fundingWallet();
      if (fundingAssets.data && Array.isArray(fundingAssets.data)) {
        for (const asset of fundingAssets.data) {
          const free = parseFloat(asset.free || 0);
          const locked = parseFloat(asset.locked || 0);
          const total = free + locked;
          if (total > 0) {
            balances.FUNDING[asset.asset] = total;
          }
        }
      }
    } catch (fundingError) {
      console.warn('Could not fetch funding wallet (may not be available):', fundingError.message);
    }
    
    return balances;
  } catch (error) {
    console.error('Error fetching coin information:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Compare two numbers with tolerance for floating point precision
function numbersMatch(a, b, tolerance = 0.0001) {
  return Math.abs(a - b) < tolerance;
}

(async () => {
  try {
    // Get API credentials from pass
    console.log('Retrieving API credentials from pass...');
    const apiKey = await getPassValue('Homebanking/Трейдинг/Биржи/Binance/lewwadoo@gmail.com/API-Key');
    const apiSecret = await getPassValue('Homebanking/Трейдинг/Биржи/Binance/lewwadoo@gmail.com/Secret-Key');
    
    if (!apiKey || !apiSecret) {
      console.error('Failed to retrieve API credentials from pass');
      process.exit(2);
    }
    
    // Initialize Binance API client
    const client = new Spot(apiKey, apiSecret);
    
    // Get all coins information
    console.log('Fetching all coins information from Binance...');
    const balancesByType = await getAllCoins(client);
    
    console.log('Binance balances by type:', balancesByType);
    
    // Validate each account type
    let allMatch = true;
    for (const config of assetConfigs) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Validating ${config.name}...`);
      
      // Get Binance balances for this account type
      const binanceBalances = balancesByType[config.accountType] || {};
      console.log(`Binance balances for ${config.name}:`, binanceBalances);
      
      // Get ledger balances
      const ledgerBalances = await getLedgerBalances(config.ledgerCommand);
      console.log(`Ledger balances for ${config.name}:`, ledgerBalances);
      
      if (Object.keys(ledgerBalances).length === 0) {
        console.log(`No coins to validate in ledger for ${config.name}.`);
        continue;
      }
      
      // Validate each coin
      for (const [symbol, ledgerValue] of Object.entries(ledgerBalances)) {
        console.log(`\nChecking ${symbol}...`);
        
        const binanceValue = binanceBalances[symbol] || 0;
        
        console.log(`Binance ${config.name} balance for ${symbol}: ${binanceValue}`);
        console.log(`Ledger balance for ${symbol}: ${ledgerValue}`);
        
        if (numbersMatch(binanceValue, ledgerValue)) {
          console.log(`✓ Validation successful for ${symbol}: balances match`);
        } else {
          console.error(`✗ Validation failed for ${symbol}: balances do not match (diff: ${Math.abs(binanceValue - ledgerValue)})`);
          allMatch = false;
        }
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
