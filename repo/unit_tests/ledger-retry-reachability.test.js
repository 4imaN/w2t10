const fs = require('fs');
const path = require('path');

describe('Ledger Retry Reachability', () => {
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'services', 'ledger.service.js'), 'utf-8'
  );

  test('entries are created with pending status, not posted', () => {
    // The create call should use status: pending
    expect(serviceFile).toContain("status: 'pending'");
    // And it should NOT directly create as posted
    const createBlock = serviceFile.match(/LedgerEntry\.create\(\{[\s\S]*?\}\)/);
    expect(createBlock[0]).toContain("'pending'");
    expect(createBlock[0]).not.toContain("'posted'");
  });

  test('attemptPosting function exists and can set status to posted or failed', () => {
    expect(serviceFile).toContain('async function attemptPosting');
    expect(serviceFile).toContain("entry.status = 'posted'");
    expect(serviceFile).toContain("entry.status = 'failed'");
  });

  test('recordPayment calls attemptPosting after creation', () => {
    expect(serviceFile).toContain('await attemptPosting(entry)');
  });

  test('retryFailedEntries calls attemptPosting', () => {
    const retryBlock = serviceFile.split('retryFailedEntries')[1];
    expect(retryBlock).toContain('attemptPosting');
  });

  test('posting validates receipt uniqueness per day', () => {
    expect(serviceFile).toContain('receipt_number: entry.receipt_number');
    expect(serviceFile).toContain('ledger_date: entry.ledger_date');
    expect(serviceFile).toContain('Duplicate receipt number');
  });
});
