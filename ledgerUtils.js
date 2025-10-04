const { exec } = require('child_process');
const fs = require('fs');

function parseLedgerNumber(str) {
  str = String(str).replace(/[\s,]+/g, '').replace(/[^\d.\-+]/g, '');
  return Number(str);
}

function getLedgerBalance(ledgerCommand) {
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

module.exports = {
  parseLedgerNumber,
  getLedgerBalance,
  getLedgerBalances,
};
